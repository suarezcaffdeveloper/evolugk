-- Hito 5: asistencia (spec 05): sesiones por grupo y fecha, marcas por arquero, registro de
-- cambios y avisos al admin. Los nombres siguen docs/09-glosario.md.
--
-- Reglas de seguridad (igual que en los hitos anteriores):
--  * RLS activada en todas las tablas; el staff de la escuela solo LEE. Toda escritura pasa por
--    el servidor con la clave secreta.
--  * La familia no tiene cuenta de Supabase Auth: el servidor consulta con la clave secreta,
--    filtrando por tutor vinculado, y nunca devuelve el motivo de una justificación (RN de la
--    spec 05, sección 10). Estas tablas no tienen ninguna política para tutores.
--  * Cada tabla hija lleva school_id y una clave foránea compuesta (id, school_id).

-- ───────────────────────────── attendance_session ─────────────────────────────
create table public.attendance_session (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.school (id) on delete cascade,
  group_id uuid not null,
  date date not null,
  status text not null default 'open' check (status in ('open', 'suspended')),
  suspension_reason text check (suspension_reason is null or char_length(btrim(suspension_reason)) between 1 and 200),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, school_id),
  -- RF-02: una sola sesión por grupo y fecha.
  unique (group_id, date),
  foreign key (group_id, school_id) references public.groups (id, school_id) on delete cascade,
  -- RF-04: cualquier fecha no futura.
  constraint attendance_session_not_future check (date <= current_date),
  -- RF-12: una sesión suspendida lleva su motivo; una abierta no.
  constraint attendance_session_suspension check ((status = 'suspended') = (suspension_reason is not null))
);

create index attendance_session_lookup_idx on public.attendance_session (school_id, date desc);

create trigger attendance_session_set_updated_at
  before update on public.attendance_session
  for each row execute function app.set_updated_at();

-- ───────────────────────────── attendance_entry ─────────────────────────────
create table public.attendance_entry (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.school (id) on delete cascade,
  session_id uuid not null,
  goalkeeper_id uuid not null,
  status text not null default 'unmarked'
    check (status in ('unmarked', 'present', 'absent', 'excused')),
  -- RF-09 y RN-05: un invitado figura solo en esta sesión y no se agrega al grupo.
  is_guest boolean not null default false,
  -- Motivo de una ausencia justificada: interno del staff (RF-10).
  reason text check (reason is null or char_length(btrim(reason)) between 1 and 200),
  -- Hora en que se hizo la marca (la del celular, acotada a la hora del servidor): desempata
  -- cuando dos dispositivos modifican lo mismo sin conexión (RF-29).
  marked_at timestamptz,
  marked_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, goalkeeper_id),
  foreign key (session_id, school_id)
    references public.attendance_session (id, school_id) on delete cascade,
  foreign key (goalkeeper_id, school_id)
    references public.goalkeeper (id, school_id) on delete cascade,
  constraint attendance_entry_reason_only_excused check (reason is null or status = 'excused')
);

create index attendance_entry_goalkeeper_idx on public.attendance_entry (school_id, goalkeeper_id);
create index attendance_entry_session_idx on public.attendance_entry (session_id);

create trigger attendance_entry_set_updated_at
  before update on public.attendance_entry
  for each row execute function app.set_updated_at();

-- RN-04 y CA-08: un arquero inactivo no se agrega a una sesión nueva (su historial se conserva).
-- RN-02: una sesión suspendida no admite marcas.
create or replace function app.check_attendance_entry()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and not exists (
    select 1 from public.goalkeeper g
    where g.id = new.goalkeeper_id and g.school_id = new.school_id and g.status = 'active'
  ) then
    raise exception 'goalkeeper_not_active' using errcode = '23514';
  end if;

  if (tg_op = 'INSERT' or new.status is distinct from old.status)
     and new.status <> 'unmarked'
     and exists (
       select 1 from public.attendance_session s
       where s.id = new.session_id and s.status = 'suspended'
     ) then
    raise exception 'session_suspended' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger attendance_entry_checks
  before insert or update on public.attendance_entry
  for each row execute function app.check_attendance_entry();

-- ───────────────────────────── attendance_revision ─────────────────────────────
-- Cada cambio de una marca (RF-14): quién, cuándo, valor anterior y nuevo. Un cambio hecho sin
-- conexión que perdió contra uno más reciente también queda registrado, como descartado (RF-29).
create table public.attendance_revision (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.school (id) on delete cascade,
  entry_id uuid not null,
  edited_by uuid references auth.users (id) on delete set null,
  edited_at timestamptz not null default now(),
  -- Hora de la marca en el dispositivo que la hizo.
  client_marked_at timestamptz,
  old_value text not null,
  new_value text not null,
  discarded boolean not null default false,
  foreign key (entry_id) references public.attendance_entry (id) on delete cascade
);

create index attendance_revision_entry_idx on public.attendance_revision (entry_id, edited_at desc);
create index attendance_revision_school_idx on public.attendance_revision (school_id);

-- ───────────────────────────── admin_alert ─────────────────────────────
-- Avisos internos para el admin (spec 05, RF-24 y RF-25): hoy, tres ausencias seguidas sin
-- justificar. Se genera una vez por racha y queda hasta que el arquero vuelve a asistir o el
-- admin la descarta.
create table public.admin_alert (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.school (id) on delete cascade,
  type text not null check (type in ('absence_streak')),
  goalkeeper_id uuid not null,
  streak_length integer check (streak_length is null or streak_length >= 1),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null,
  resolution text check (resolution is null or resolution in ('attended', 'dismissed')),
  foreign key (goalkeeper_id, school_id)
    references public.goalkeeper (id, school_id) on delete cascade,
  constraint admin_alert_resolution check ((resolved_at is null) = (resolution is null))
);

-- Un solo aviso abierto por arquero y tipo: no se repite mientras dure la racha.
create unique index admin_alert_one_open
  on public.admin_alert (goalkeeper_id, type)
  where resolved_at is null;

create index admin_alert_school_idx on public.admin_alert (school_id, created_at desc);

-- ───────────────────────────── privilegios y RLS ─────────────────────────────
revoke all on table
  public.attendance_session, public.attendance_entry, public.attendance_revision,
  public.admin_alert
  from anon, authenticated;

grant select on table
  public.attendance_session, public.attendance_entry, public.attendance_revision,
  public.admin_alert
  to authenticated;

alter table public.attendance_session enable row level security;
alter table public.attendance_entry enable row level security;
alter table public.attendance_revision enable row level security;
alter table public.admin_alert enable row level security;

-- El staff (admin y profesores) ve la asistencia de su escuela (spec 05, sección 3).
create policy attendance_session_select on public.attendance_session
  for select to authenticated
  using (school_id = (select app.current_school_id()));

create policy attendance_entry_select on public.attendance_entry
  for select to authenticated
  using (school_id = (select app.current_school_id()));

create policy attendance_revision_select on public.attendance_revision
  for select to authenticated
  using (school_id = (select app.current_school_id()));

-- Los avisos son del admin: los profesores no los ven.
create policy admin_alert_select on public.admin_alert
  for select to authenticated
  using (school_id = (select app.current_school_id()) and (select app.is_school_admin()));
