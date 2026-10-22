# 15 — Revisión de seguridad

- **Estado:** Hito 7 (en curso)
- **Alcance de esta revisión:** base de datos (RLS, privilegios, funciones), rutas HTTP, acciones del servidor, secretos, cabeceras y borrados.
- **Cómo repetirla:** `pnpm db db query --linked -f supabase/audit/rls-audit.sql` y `supabase/audit/column-audit.sql` (solo lectura, contra el proyecto vinculado).

## Qué se verificó y cómo
| Área | Resultado | Cómo se comprobó |
|---|---|---|
| RLS | Las 35 tablas de `public` la tienen activada | Catálogo de la base real (`relrowsecurity`), no solo las migraciones |
| Privilegios | `anon` sin acceso a nada; `authenticated` solo `SELECT` | `information_schema.role_table_grants` |
| Políticas | 28, todas `SELECT`, todas acotadas por `school_id`; las de cuotas, avisos y alertas, solo para el admin | `pg_policies` |
| Tablas solo de servidor | `guardian_seen`, `guardian_session`, `platform_alert`, `subscription_change`, `subscription_payment`, `video_notice`, `video_provider_cleanup`: RLS sin políticas | Catálogo |
| Columnas sensibles | `guardian.pin_hash` y sus contadores de intentos no se pueden leer desde el cliente | `column_privileges` |
| Funciones `SECURITY DEFINER` | Solo `service_role`, salvo los 4 helpers de identidad (`app.*`) que usa el RLS | `pg_proc.proacl` |
| Secretos | Ninguno en el árbol ni en el historial de git; `.env*` y `supabase/.secrets.*` ignorados | `git log -G`, `git grep` |
| Clave secreta en el navegador | `createServiceClient` solo se importa desde el servidor; los componentes de cliente importan solo tipos | Búsqueda de imports + build |
| Rutas HTTP | Cron: `CRON_SECRET`. Webhook de Mux: firma. Token de video: sesión y vínculo en cada pedido, 404 uniforme. Plantilla: solo admin | Lectura y pedidos reales contra el build |
| Acciones del servidor | Todas las que escriben exigen sesión de staff, de familia u operador; las públicas son login, recuperar clave y aceptar invitación | Revisión de cada `actions.ts` |
| Aislamiento en el servidor | La clave secreta se salta el RLS, así que cada consulta por id filtra por `school_id`; las claves foráneas compuestas `(id, school_id)` refuerzan las escrituras | Revisión de consultas con id del cliente |
| Videos | `playback_policies: ["signed"]`, token de 1 hora; el borrado de un arquero borra también en Mux | `mux-provider.ts` |

## Cambios hechos en esta revisión
1. **Cron:** el secreto se compara en tiempo constante (`server/cron-auth.ts`) en las dos tareas.
2. **`server-only`** en todos los módulos de `src/server` que faltaba, salvo `operator.ts` y `operator-cli.ts` (los usa `create-operator.ts` con Node plano). Si alguien los importa desde un componente de cliente, el build falla.
3. **Cabeceras** en todas las rutas (`next.config.ts`): HSTS, `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy` y `Permissions-Policy`. Verificadas sobre el build.

## Pendiente
| # | Tema | Gravedad | Detalle |
|---|---|---|---|
| 1 | Política de contenido (CSP) | Media | Falta. Hay que armar la lista de orígenes (Mux, Supabase, fuentes) y probarla en navegador en modo solo-reporte antes de imponerla |
| 2 | Borrado definitivo de una escuela | Media | La spec 00 (RN-09) lo deja manual tras 90 días, pero no hay herramienta. Borrar la fila deja huérfanos los videos en Mux y las cuentas de Auth. Hace falta un procedimiento (o comando del operador) que los limpie primero |
| 3 | `invitation.token_hash` legible por el staff | Baja | Es SHA-256 de 256 bits aleatorios: no se puede revertir. Aun así no hace falta exponerlo; se puede quitar de los privilegios de columna |
| 4 | Funciones trigger con `EXECUTE` a PUBLIC | Baja | Son de tipo invoker y `anon` no tiene acceso al esquema `app`; se pueden revocar por prolijidad |
| 5 | Límite de intentos del login del staff | A revisar | Confirmar la configuración de Auth en el proyecto de producción |
