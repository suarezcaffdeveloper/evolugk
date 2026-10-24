-- Auditoría de privilegios por columna (hito 7). Solo lectura.
-- Correr: pnpm db db query --linked -f supabase/audit/column-audit.sql
-- Esperado: guardian sin pin_hash ni pin_failed_attempts; ninguna tabla con columnas de secretos.

select table_name, grantee, string_agg(column_name||':'||privilege_type, ',' order by column_name) cols
from information_schema.column_privileges
where table_schema='public' and grantee in ('anon','authenticated') and table_name in ('guardian','guardian_session','guardian_seen','profile','invitation','subscription','school')
group by 1,2 order by 1;
