-- Auditoría de seguridad de la base (hito 7): RLS, privilegios, políticas y funciones.
-- Solo lectura. Correr: pnpm db db query --linked -f supabase/audit/rls-audit.sql
-- Esperado: ninguna tabla sin RLS; anon y authenticated solo con SELECT; solo políticas SELECT;
-- funciones SECURITY DEFINER sin EXECUTE para anon/PUBLIC.
select 'T' k, c.relname n, c.relrowsecurity::text a, c.relforcerowsecurity::text b,
  (select string_agg(distinct privilege_type||':'||grantee, ',') from information_schema.role_table_grants g where g.table_schema='public' and g.table_name=c.relname and grantee in ('anon','authenticated')) c
from pg_class c join pg_namespace s on s.oid=c.relnamespace where s.nspname='public' and c.relkind in ('r','p','v')
union all
select 'P', tablename, policyname, cmd||' '||array_to_string(roles,','), left(coalesce(qual,''),120) from pg_policies where schemaname='public'
union all
select 'F', p.proname, p.prosecdef::text, coalesce(array_to_string(p.proacl,','),'(default: PUBLIC execute)'), n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','app') and p.prokind='f'
order by 1,2,3;
