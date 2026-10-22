-- Hito 7: borrado definitivo de una escuela (spec 00, RN-09: suspendida 90 días y después el
-- operador decide). El borrado es manual; esta migración solo da la pieza atómica en la base.
--
-- Qué hace falta resolver:
--  * Los videos viven en el proveedor (Mux). Borrar la fila de la escuela arrastra las filas de
--    `video` en cascada y se perderían los identificadores de los archivos. Por eso los
--    identificadores se pasan a `video_provider_cleanup` (sin clave foránea a la escuela) en la
--    MISMA transacción que el borrado: o pasan las dos cosas o ninguna.
--  * Los pagos que la escuela le hizo a la plataforma son un registro de ingresos del operador:
--    no deben desaparecer con la escuela. Se les quita la cascada.

-- Los pagos sobreviven al borrado de la escuela (spec 07, RF-19: resumen de ingresos).
alter table public.subscription_payment
  drop constraint subscription_payment_school_id_fkey;

comment on column public.subscription_payment.school_id is
  'Escuela que pagó. Sin clave foránea a propósito: el pago sigue contando como ingreso aunque la escuela se borre.';

-- Borra una escuela suspendida y devuelve lo que la aplicación necesita para terminar la
-- limpieza (cuentas de Auth del equipo) y para dejar el resumen en la auditoría.
create or replace function public.delete_school_permanently(p_school_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_users uuid[];
  v_goalkeepers integer;
  v_videos integer;
begin
  select status into v_status from public.school where id = p_school_id for update;
  if not found then
    raise exception 'school_not_found' using errcode = 'P0002';
  end if;
  -- Defensa en profundidad: la aplicación ya lo exige, pero una escuela activa nunca se borra.
  if v_status <> 'suspended' then
    raise exception 'school_not_suspended' using errcode = '23514';
  end if;

  select coalesce(array_agg(user_id), '{}') into v_users
  from public.profile
  where school_id = p_school_id and role <> 'platform_admin';

  select count(*) into v_goalkeepers from public.goalkeeper where school_id = p_school_id;

  insert into public.video_provider_cleanup (school_id, provider, asset_id, upload_id)
  select school_id, provider, provider_asset_id,
         case when provider_asset_id is null then provider_upload_id end
  from public.video
  where school_id = p_school_id
    and (provider_asset_id is not null or provider_upload_id is not null);
  get diagnostics v_videos = row_count;

  delete from public.school where id = p_school_id;

  return jsonb_build_object('users', to_jsonb(v_users), 'goalkeepers', v_goalkeepers, 'videos', v_videos);
end;
$$;

revoke all on function public.delete_school_permanently(uuid) from public, anon, authenticated;
grant execute on function public.delete_school_permanently(uuid) to service_role;
