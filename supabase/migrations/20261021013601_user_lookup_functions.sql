-- Funciones para consultar cuentas (auth.users) desde el servidor. Solo las puede ejecutar el
-- rol de servicio (la clave secreta): no están expuestas a internet.
--
--  * find_user_id_by_email: evita invitar a un mail que ya tiene cuenta (una cuenta pertenece
--    a una sola escuela, spec 00 RF-12) sin recorrer todos los usuarios.
--  * get_user_emails: muestra los mails del equipo de una escuela (profile no los guarda).

create or replace function public.find_user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id
  from auth.users u
  where lower(u.email) = lower(btrim(p_email))
  limit 1
$$;

create or replace function public.get_user_emails(p_ids uuid[])
returns table (user_id uuid, email text)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.email::text
  from auth.users u
  where u.id = any (p_ids)
$$;

revoke all on function public.find_user_id_by_email(text) from public, anon, authenticated;
revoke all on function public.get_user_emails(uuid[]) from public, anon, authenticated;
grant execute on function public.find_user_id_by_email(text) to service_role;
grant execute on function public.get_user_emails(uuid[]) to service_role;
