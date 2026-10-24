-- Hito 7 (revisión de seguridad, docs/15-seguridad.md): dos ajustes de privilegios de bajo riesgo.

-- 1) invitation.token_hash: el staff de la escuela podía leerlo con su sesión. Es el SHA-256 de un
--    token de 256 bits (no se puede revertir), pero no hace falta exponerlo: solo el servidor,
--    con la clave secreta, lo consulta. Se pasa de privilegio de tabla a privilegio por columna.
revoke select on table public.invitation from authenticated;
grant select (id, school_id, email, role, expires_at, used_at, revoked_at, created_by, created_at)
  on public.invitation to authenticated;

-- 2) Funciones de trigger del esquema app: nacen con EXECUTE para PUBLIC. Son de tipo invoker y el
--    esquema no está expuesto, pero no hay motivo para que nadie pueda invocarlas. Un trigger no
--    necesita EXECUTE al dispararse (solo al crearse), así que los triggers siguen funcionando.
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app' and p.prorettype = 'pg_catalog.trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn.signature);
  end loop;
end
$$;

-- Funciones nuevas del esquema app: sin EXECUTE para PUBLIC por defecto. Las que sí deben llamarse
-- (los helpers de identidad del RLS) ya llevan su `grant execute` explícito, como hasta ahora.
alter default privileges in schema app revoke execute on functions from public;
