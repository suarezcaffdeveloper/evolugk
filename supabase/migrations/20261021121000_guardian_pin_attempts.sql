-- Hito 2: conteo atómico de intentos fallidos de PIN (spec 00, RF-18).
--
-- Se hace en una sola sentencia para que intentos simultáneos no puedan saltarse el límite
-- (leer-sumar-escribir desde la aplicación permitiría más de 5 intentos en paralelo).
-- Solo la puede ejecutar el servidor con la clave secreta.

create or replace function public.guardian_register_pin_failure(
  p_guardian_id uuid,
  p_max_attempts integer default 5,
  p_lock_minutes integer default 15
)
returns table (failed_attempts integer, locked_until timestamptz)
language sql
volatile
security definer
set search_path = ''
as $$
  update public.guardian g
  set pin_failed_attempts = case
        when g.pin_failed_attempts + 1 >= p_max_attempts then 0
        else g.pin_failed_attempts + 1
      end,
      locked_until = case
        when g.pin_failed_attempts + 1 >= p_max_attempts
          then now() + make_interval(mins => p_lock_minutes)
        else g.locked_until
      end
  where g.id = p_guardian_id
  returning
    g.pin_failed_attempts as failed_attempts,
    g.locked_until as locked_until
$$;

revoke all on function public.guardian_register_pin_failure(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.guardian_register_pin_failure(uuid, integer, integer)
  to service_role;
