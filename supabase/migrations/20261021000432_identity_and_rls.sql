-- Hito 1: identidad y seguridad por escuela (RLS).
--
-- Reglas:
--  * Toda tabla de negocio tiene RLS activada.
--  * La escuela y el rol de quien consulta se resuelven con funciones que consultan
--    la tabla profile EN CADA CONSULTA, no con datos del token: desactivar a un profesor
--    o suspender una escuela corta el acceso al instante (spec 00, CA-06 y RN-09).
--  * Los clientes (rol authenticated) solo pueden LEER. Toda escritura pasa por el
--    servidor con la clave secreta, después de verificar permisos en el código.
--  * El rol anon no tiene acceso a ninguna tabla.

grant usage on schema app to authenticated;

-- ───────────────────────────── identidad ─────────────────────────────

-- Escuela del usuario actual. Es NULL si no hay sesión, si el perfil está inactivo,
-- si es operador o si la escuela está suspendida.
create or replace function app.current_school_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.school_id
  from public.profile p
  join public.school s on s.id = p.school_id
  where p.user_id = (select auth.uid())
    and p.active
    and p.role in ('school_admin', 'coach')
    and s.status = 'active'
$$;

-- Rol efectivo del usuario actual (NULL si no tiene acceso).
create or replace function app.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profile p
  where p.user_id = (select auth.uid())
    and p.active
    and (
      p.role = 'platform_admin'
      or exists (
        select 1 from public.school s where s.id = p.school_id and s.status = 'active'
      )
    )
$$;

create or replace function app.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(app.current_user_role() = 'platform_admin', false)
$$;

create or replace function app.is_school_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(app.current_user_role() = 'school_admin', false)
$$;

revoke all on function app.current_school_id() from public;
revoke all on function app.current_user_role() from public;
revoke all on function app.is_platform_admin() from public;
revoke all on function app.is_school_admin() from public;
grant execute on function app.current_school_id() to authenticated;
grant execute on function app.current_user_role() to authenticated;
grant execute on function app.is_platform_admin() to authenticated;
grant execute on function app.is_school_admin() to authenticated;

-- ───────────────────────────── privilegios ─────────────────────────────
-- Supabase otorga permisos amplios por defecto: se retiran y se concede solo lectura.
revoke all on table
  public.school, public.profile, public.invitation, public.subscription, public.audit_log
  from anon, authenticated;

grant select on table
  public.school, public.profile, public.invitation, public.subscription, public.audit_log
  to authenticated;

-- ───────────────────────────── RLS ─────────────────────────────
alter table public.school enable row level security;
alter table public.profile enable row level security;
alter table public.invitation enable row level security;
alter table public.subscription enable row level security;
alter table public.audit_log enable row level security;

-- school: el operador ve todas; el staff ve la suya.
create policy school_select_operator on public.school
  for select to authenticated
  using (app.is_platform_admin());

create policy school_select_own on public.school
  for select to authenticated
  using (id = app.current_school_id());

-- profile: cada persona ve el suyo (incluso si quedó inactivo, para poder mostrar el motivo),
-- el staff ve a los compañeros de su escuela (nombres de autores) y el operador ve todos.
create policy profile_select_self on public.profile
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy profile_select_same_school on public.profile
  for select to authenticated
  using (school_id is not null and school_id = app.current_school_id());

create policy profile_select_operator on public.profile
  for select to authenticated
  using (app.is_platform_admin());

-- invitation: solo administradores de la escuela y el operador.
create policy invitation_select_school_admin on public.invitation
  for select to authenticated
  using (school_id = app.current_school_id() and app.is_school_admin());

create policy invitation_select_operator on public.invitation
  for select to authenticated
  using (app.is_platform_admin());

-- subscription: solo el operador. El admin de la escuela verá su uso y vencimiento
-- por una función que no expone precio ni pagos (spec 07, RF-32 y RF-33).
create policy subscription_select_operator on public.subscription
  for select to authenticated
  using (app.is_platform_admin());

-- audit_log: el operador ve todo; el admin ve el de su escuela.
create policy audit_log_select_operator on public.audit_log
  for select to authenticated
  using (app.is_platform_admin());

create policy audit_log_select_school_admin on public.audit_log
  for select to authenticated
  using (school_id is not null and school_id = app.current_school_id() and app.is_school_admin());

-- ───────────────────────────── marca pública ─────────────────────────────
-- Datos mínimos para mostrar el login de una escuela antes de iniciar sesión (spec 00, RF-04).
-- No revela nada de escuelas suspendidas ni inexistentes (RF-02): ambas devuelven vacío.
create or replace function public.get_school_branding(p_slug text)
returns table (name text, logo_url text, primary_color text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.name, s.logo_url, s.primary_color
  from public.school s
  where s.slug = lower(btrim(p_slug))
    and s.status = 'active'
$$;

revoke all on function public.get_school_branding(text) from public;
grant execute on function public.get_school_branding(text) to anon, authenticated;
