-- Convención de RLS para todas las tablas del proyecto:
--  * UNA sola política por tabla y acción (evita evaluar varias políticas en cada consulta).
--  * Las funciones de identidad se envuelven en (select ...) para que Postgres las evalúe
--    una vez por consulta y no una vez por fila.
-- El comportamiento no cambia; solo se unifican las políticas creadas en identity_and_rls.

-- school: el operador ve todas; el staff ve la suya.
drop policy school_select_operator on public.school;
drop policy school_select_own on public.school;
create policy school_select on public.school
  for select to authenticated
  using (
    (select app.is_platform_admin())
    or id = (select app.current_school_id())
  );

-- profile: cada persona ve el suyo, el staff ve a su escuela y el operador ve todos.
drop policy profile_select_self on public.profile;
drop policy profile_select_same_school on public.profile;
drop policy profile_select_operator on public.profile;
create policy profile_select on public.profile
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select app.is_platform_admin())
    or (school_id is not null and school_id = (select app.current_school_id()))
  );

-- invitation: administradores de la escuela y operador.
drop policy invitation_select_school_admin on public.invitation;
drop policy invitation_select_operator on public.invitation;
create policy invitation_select on public.invitation
  for select to authenticated
  using (
    (select app.is_platform_admin())
    or (
      school_id = (select app.current_school_id())
      and (select app.is_school_admin())
    )
  );

-- subscription: solo el operador.
drop policy subscription_select_operator on public.subscription;
create policy subscription_select on public.subscription
  for select to authenticated
  using ((select app.is_platform_admin()));

-- audit_log: el operador ve todo; el admin ve el de su escuela.
drop policy audit_log_select_operator on public.audit_log;
drop policy audit_log_select_school_admin on public.audit_log;
create policy audit_log_select on public.audit_log
  for select to authenticated
  using (
    (select app.is_platform_admin())
    or (
      school_id is not null
      and school_id = (select app.current_school_id())
      and (select app.is_school_admin())
    )
  );
