-- El operador solo cuenta como operador si su sesión pasó la verificación en dos pasos
-- (nivel de aseguramiento "aal2"). Con solo la contraseña (aal1) no ve ni modifica nada,
-- aunque la conozca otra persona (spec 00, RF-06d).
--
-- Su propio perfil sigue siendo legible con aal1 (política profile_select por user_id),
-- para que la aplicación pueda saber que debe pedirle el segundo paso.

create or replace function app.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(app.current_user_role() = 'platform_admin', false)
     and coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
$$;
