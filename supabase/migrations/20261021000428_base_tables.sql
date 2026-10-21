-- Hito 1: tablas base (specs 00 y 07).
-- Los nombres siguen docs/09-glosario.md. Las políticas de seguridad están en la
-- migración siguiente (identity_and_rls).

-- Schema para funciones auxiliares. No está expuesto por la API de Supabase.
create schema if not exists app;

create or replace function app.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ───────────────────────────── school ─────────────────────────────
create table public.school (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  slug text not null,
  logo_url text,
  primary_color text check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  contact_phone text,
  whatsapp text,
  contact_email text,
  address text,
  hours text,
  status text not null default 'active' check (status in ('active', 'suspended')),
  suspended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 3 a 30 caracteres: minúsculas, números y guiones; sin guion al inicio ni al final.
  constraint school_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$'),
  -- Palabras que chocan con rutas de la aplicación.
  constraint school_slug_reserved check (
    slug <> all (array[
      'admin', 'api', 'login', 'app', 'operator', 'operador', 'proto', 'auth', 'static',
      'assets', 'public', 'www', 'portal', 'staff', 'support', 'soporte', 'help', 'ayuda',
      'privacy', 'privacidad', 'terms', 'terminos', 'health', 'status', 'docs'
    ])
  ),
  constraint school_suspension_consistency check ((status = 'suspended') = (suspended_at is not null))
);

create unique index school_slug_key on public.school (slug);

create trigger school_set_updated_at
  before update on public.school
  for each row execute function app.set_updated_at();

-- ───────────────────────────── profile ─────────────────────────────
-- Un perfil por cuenta de Supabase Auth: una cuenta pertenece a una sola escuela (spec 00, RF-12).
-- El operador de la plataforma es el único rol sin escuela.
create table public.profile (
  user_id uuid primary key references auth.users (id) on delete cascade,
  school_id uuid references public.school (id) on delete cascade,
  role text not null check (role in ('platform_admin', 'school_admin', 'coach')),
  first_name text not null check (char_length(btrim(first_name)) > 0),
  last_name text not null check (char_length(btrim(last_name)) > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_role_school check (
    (role = 'platform_admin' and school_id is null)
    or (role <> 'platform_admin' and school_id is not null)
  )
);

create index profile_school_idx on public.profile (school_id) where school_id is not null;
create index profile_school_role_active_idx on public.profile (school_id, role) where active;

create trigger profile_set_updated_at
  before update on public.profile
  for each row execute function app.set_updated_at();

-- Una escuela no puede quedarse sin ningún administrador activo (spec 00, casos borde).
create or replace function app.protect_last_school_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.role = 'school_admin'
     and old.active
     and (
       tg_op = 'DELETE'
       or new.active is distinct from true
       or new.role is distinct from 'school_admin'
       or new.school_id is distinct from old.school_id
     )
     -- Si la escuela ya no existe (borrado en cascada), no hay nada que proteger.
     and exists (select 1 from public.school s where s.id = old.school_id)
     and not exists (
       select 1
       from public.profile p
       where p.school_id = old.school_id
         and p.role = 'school_admin'
         and p.active
         and p.user_id <> old.user_id
     )
  then
    raise exception 'No se puede quitar al último administrador activo de la escuela';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger profile_protect_last_school_admin
  before update or delete on public.profile
  for each row execute function app.protect_last_school_admin();

-- ───────────────────────────── invitation ─────────────────────────────
-- Invitaciones de staff por mail (spec 00, RF-06 y RF-10). Se guarda solo el hash del token.
create table public.invitation (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.school (id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role text not null check (role in ('school_admin', 'coach')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint invitation_not_used_and_revoked check (not (used_at is not null and revoked_at is not null))
);

-- Solo una invitación abierta por escuela y mail; al reenviar se revoca la anterior.
create unique index invitation_one_open_per_email
  on public.invitation (school_id, email)
  where used_at is null and revoked_at is null;

create index invitation_school_idx on public.invitation (school_id);

-- ───────────────────────────── subscription ─────────────────────────────
-- Condiciones a medida de cada escuela (spec 07). Pagos, historial de cambios y
-- alertas se agregan en el hito 6. El estado se calcula por fechas.
create table public.subscription (
  school_id uuid primary key references public.school (id) on delete cascade,
  monthly_price_ars numeric(12, 2) not null check (monthly_price_ars >= 0),
  goalkeeper_limit integer not null check (goalkeeper_limit > 0),
  video_minutes_limit integer not null check (video_minutes_limit >= 0),
  trial_until date,
  covered_until date not null,
  manually_suspended boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger subscription_set_updated_at
  before update on public.subscription
  for each row execute function app.set_updated_at();

-- ───────────────────────────── audit_log ─────────────────────────────
-- school_id no tiene clave foránea: el historial de auditoría sobrevive al borrado de la escuela.
create table public.audit_log (
  id bigint generated always as identity primary key,
  school_id uuid,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_school_created_idx on public.audit_log (school_id, created_at desc);
