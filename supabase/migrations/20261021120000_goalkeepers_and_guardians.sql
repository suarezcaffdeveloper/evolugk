-- Hito 2: arqueros, grupos, tutores, consentimiento y sesiones de familia (specs 00, 01 y 04).
-- Los nombres siguen docs/09-glosario.md.
--
-- Reglas de seguridad (igual que en el hito 1):
--  * RLS activada en todas las tablas; el staff de la escuela solo LEE. Toda escritura pasa por
--    el servidor con la clave secreta.
--  * La familia no tiene cuenta de Supabase Auth: entra con código y PIN y el servidor consulta
--    con la clave secreta, siempre filtrando por tutor y escuela. Por eso estas tablas no tienen
--    ninguna política para tutores: desde internet, la familia no lee nada directamente.
--  * Cada tabla hija lleva school_id y una clave foránea compuesta (id, school_id): una fila no
--    puede apuntar a un registro de otra escuela, aunque el código de la aplicación falle.

-- ───────────────────────────── groups ─────────────────────────────
-- "group" es palabra reservada en SQL: la tabla se llama groups.
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.school (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  schedule text check (schedule is null or char_length(schedule) <= 200),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, school_id)
);

-- Nombre único entre los grupos vigentes de la escuela (sin distinguir mayúsculas).
create unique index groups_school_name_key
  on public.groups (school_id, lower(btrim(name)))
  where not archived;

create trigger groups_set_updated_at
  before update on public.groups
  for each row execute function app.set_updated_at();

-- ───────────────────────────── goalkeeper ─────────────────────────────
create table public.goalkeeper (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.school (id) on delete cascade,
  first_name text not null check (char_length(btrim(first_name)) between 1 and 80),
  last_name text not null check (char_length(btrim(last_name)) between 1 and 80),
  birth_date date not null,
  joined_on date not null,
  preferred_foot text check (preferred_foot in ('right', 'left', 'both')),
  level text check (level in ('beginner', 'intermediate', 'advanced')),
  current_club text check (current_club is null or char_length(current_club) <= 120),
  category text check (category is null or char_length(category) <= 60),
  goal text check (goal is null or char_length(goal) <= 1000),
  photo_url text,
  status text not null default 'active' check (status in ('active', 'inactive', 'graduated')),
  emergency_name text check (emergency_name is null or char_length(emergency_name) <= 120),
  emergency_phone text check (emergency_phone is null or char_length(emergency_phone) <= 40),
  emergency_relationship text check (
    emergency_relationship is null or char_length(emergency_relationship) <= 60
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, school_id),
  -- Fecha de nacimiento futura o ingreso anterior al nacimiento: se rechaza (spec 01, casos borde).
  constraint goalkeeper_birth_not_future check (birth_date <= current_date),
  constraint goalkeeper_joined_after_birth check (joined_on >= birth_date)
);

create index goalkeeper_school_status_idx on public.goalkeeper (school_id, status);
-- Búsqueda por nombre y detección de duplicados (spec 01, RF-32 y RF-34).
create index goalkeeper_school_name_idx
  on public.goalkeeper (school_id, lower(last_name), lower(first_name), birth_date);

create trigger goalkeeper_set_updated_at
  before update on public.goalkeeper
  for each row execute function app.set_updated_at();

-- ───────────────────────────── goalkeeper_group ─────────────────────────────
create table public.goalkeeper_group (
  goalkeeper_id uuid not null,
  group_id uuid not null,
  school_id uuid not null references public.school (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (goalkeeper_id, group_id),
  foreign key (goalkeeper_id, school_id)
    references public.goalkeeper (id, school_id) on delete cascade,
  foreign key (group_id, school_id) references public.groups (id, school_id) on delete cascade
);

create index goalkeeper_group_group_idx on public.goalkeeper_group (group_id);
create index goalkeeper_group_school_idx on public.goalkeeper_group (school_id);

-- ───────────────────────────── goalkeeper_measurement ─────────────────────────────
-- Historial de altura y peso (spec 01, RF-09 a RF-11). Al menos uno de los dos valores.
create table public.goalkeeper_measurement (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.school (id) on delete cascade,
  goalkeeper_id uuid not null,
  date date not null,
  height_cm numeric(5, 1) check (height_cm is null or height_cm between 30 and 260),
  weight_kg numeric(5, 1) check (weight_kg is null or weight_kg between 5 and 250),
  recorded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (goalkeeper_id, school_id)
    references public.goalkeeper (id, school_id) on delete cascade,
  constraint measurement_has_value check (height_cm is not null or weight_kg is not null)
);

create index goalkeeper_measurement_lookup_idx
  on public.goalkeeper_measurement (school_id, goalkeeper_id, date desc);

-- ───────────────────────────── guardian ─────────────────────────────
-- Tutor con acceso al portal por código + PIN (spec 00, RF-13 a RF-20).
create table public.guardian (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.school (id) on delete cascade,
  first_name text not null check (char_length(btrim(first_name)) between 1 and 80),
  last_name text not null check (char_length(btrim(last_name)) between 1 and 80),
  phone text not null check (char_length(btrim(phone)) between 6 and 40),
  email text check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  -- Código de acceso normalizado (mayúsculas, sin guiones). Único en toda la plataforma (RN-02).
  access_code text not null check (access_code ~ '^[A-Z0-9]{8}$'),
  -- Hash del PIN (nunca en claro, RN-03). Null cuando el acceso está sin PIN vigente.
  pin_hash text,
  pin_changed boolean not null default false,
  pin_failed_attempts integer not null default 0 check (pin_failed_attempts >= 0),
  locked_until timestamptz,
  first_login_completed boolean not null default false,
  -- Acceso revocado por el admin (RF-20): no puede ingresar hasta que se le genere un PIN nuevo.
  access_revoked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, school_id)
);

create unique index guardian_access_code_key on public.guardian (access_code);
create index guardian_school_phone_idx on public.guardian (school_id, phone);

create trigger guardian_set_updated_at
  before update on public.guardian
  for each row execute function app.set_updated_at();

-- ───────────────────────────── goalkeeper_guardian ─────────────────────────────
create table public.goalkeeper_guardian (
  goalkeeper_id uuid not null,
  guardian_id uuid not null,
  school_id uuid not null references public.school (id) on delete cascade,
  relationship text not null check (
    relationship in ('mother', 'father', 'guardian', 'grandparent', 'other', 'self')
  ),
  created_at timestamptz not null default now(),
  primary key (goalkeeper_id, guardian_id),
  foreign key (goalkeeper_id, school_id)
    references public.goalkeeper (id, school_id) on delete cascade,
  foreign key (guardian_id, school_id) references public.guardian (id, school_id) on delete cascade
);

create index goalkeeper_guardian_guardian_idx on public.goalkeeper_guardian (guardian_id);
create index goalkeeper_guardian_school_idx on public.goalkeeper_guardian (school_id);

-- ───────────────────────────── consent ─────────────────────────────
-- Historial de consentimientos otorgados y retirados (spec 01, RF-26 a RF-31). Es por arquero y
-- lo da un tutor vinculado: basta uno. Vigente = otorgado y no retirado.
create table public.consent (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.school (id) on delete cascade,
  goalkeeper_id uuid not null,
  guardian_id uuid not null,
  type text not null default 'media' check (type in ('media', 'social')),
  -- Versión del texto legal que el tutor vio al aceptar.
  text_version text not null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid,
  foreign key (goalkeeper_id, school_id)
    references public.goalkeeper (id, school_id) on delete cascade,
  foreign key (guardian_id, school_id) references public.guardian (id, school_id) on delete cascade,
  constraint consent_revoked_after_granted check (revoked_at is null or revoked_at >= granted_at)
);

-- Un solo consentimiento vigente por arquero y tipo.
create unique index consent_one_current
  on public.consent (goalkeeper_id, type)
  where revoked_at is null;

create index consent_school_goalkeeper_idx on public.consent (school_id, goalkeeper_id);

-- ───────────────────────────── guardian_session ─────────────────────────────
-- Sesiones de la familia (30 días, varios dispositivos). Se guarda solo el hash del token.
create table public.guardian_session (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.school (id) on delete cascade,
  guardian_id uuid not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked boolean not null default false,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  foreign key (guardian_id, school_id) references public.guardian (id, school_id) on delete cascade
);

create index guardian_session_guardian_idx on public.guardian_session (guardian_id);
create index guardian_session_school_idx on public.guardian_session (school_id);

-- ───────────────────────────── privilegios y RLS ─────────────────────────────
revoke all on table
  public.groups, public.goalkeeper, public.goalkeeper_group, public.goalkeeper_measurement,
  public.guardian, public.goalkeeper_guardian, public.consent, public.guardian_session
  from anon, authenticated;

grant select on table
  public.groups, public.goalkeeper, public.goalkeeper_group, public.goalkeeper_measurement,
  public.goalkeeper_guardian, public.consent
  to authenticated;

-- guardian: el staff ve los datos del tutor pero NUNCA el hash del PIN, ni los intentos fallidos.
grant select (
  id, school_id, first_name, last_name, phone, email, access_code, pin_changed, locked_until,
  first_login_completed, access_revoked, created_at, updated_at
) on public.guardian to authenticated;

-- guardian_session: sin ningún acceso desde internet (solo el servidor).

alter table public.groups enable row level security;
alter table public.goalkeeper enable row level security;
alter table public.goalkeeper_group enable row level security;
alter table public.goalkeeper_measurement enable row level security;
alter table public.guardian enable row level security;
alter table public.goalkeeper_guardian enable row level security;
alter table public.consent enable row level security;
alter table public.guardian_session enable row level security;

-- Una política por tabla y acción, con las funciones de identidad envueltas en (select ...).
-- El staff (admin y profesores) ve todo lo de su escuela (spec 01, sección 3). El operador de la
-- plataforma no necesita datos de arqueros: no tiene política.
create policy groups_select on public.groups
  for select to authenticated
  using (school_id = (select app.current_school_id()));

create policy goalkeeper_select on public.goalkeeper
  for select to authenticated
  using (school_id = (select app.current_school_id()));

create policy goalkeeper_group_select on public.goalkeeper_group
  for select to authenticated
  using (school_id = (select app.current_school_id()));

create policy goalkeeper_measurement_select on public.goalkeeper_measurement
  for select to authenticated
  using (school_id = (select app.current_school_id()));

create policy guardian_select on public.guardian
  for select to authenticated
  using (school_id = (select app.current_school_id()));

create policy goalkeeper_guardian_select on public.goalkeeper_guardian
  for select to authenticated
  using (school_id = (select app.current_school_id()));

create policy consent_select on public.consent
  for select to authenticated
  using (school_id = (select app.current_school_id()));

-- guardian_session: RLS activada y sin políticas = nadie, salvo la clave secreta.
