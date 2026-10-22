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

## Borrado definitivo de una escuela (spec 00, RN-09)
Manual, irreversible y solo para el operador, en `/operator/escuelas/{slug}` (sección "Estado de la escuela").

- **Condiciones:** la escuela está suspendida y pasaron **90 días** desde la suspensión (el día 90 ya se puede; se cuenta en fecha de Argentina), y el operador escribió el identificador de la escuela. Antes de la fecha, la pantalla solo informa desde cuándo se podrá.
- **Qué se borra:** todos los datos de la escuela (arqueros, tutores, evaluaciones, asistencia, cuotas, avisos, suscripción), los archivos de video en el proveedor y las cuentas de Auth de su equipo. La cuenta del operador nunca se toca.
- **Qué se conserva:** los **pagos que la escuela le hizo a la plataforma** (`subscription_payment` perdió la clave foránea a la escuela) para que el resumen de ingresos no cambie, y el registro de auditoría con el resumen del borrado (`school.deleted`: nombre, identificador y cantidades).
- **Orden y tolerancia a fallas** (`server/school-deletion.ts`, función SQL `delete_school_permanently`):
  1. **Una sola transacción** en la base pasa los identificadores de los videos a `video_provider_cleanup` y borra la escuela. O pasan las dos cosas o ninguna: nunca se borran archivos de una escuela que sigue viva, ni se pierden los identificadores.
  2. Después se borran las cuentas de Auth y se intenta limpiar el proveedor. Lo que el proveedor no confirme queda en la cola y lo reintenta la tarea diaria; el operador ve cuántos quedaron pendientes.
- **Permisos:** la función SQL solo la ejecuta `service_role`; la acción exige operador con verificación en dos pasos.
- **Pruebas:** `src/test/school-deletion.db.test.ts` (condiciones y borde de los 90 días, confirmación, qué se borra y qué se conserva, proveedor caído, subida sin terminar, aislamiento entre escuelas, atomicidad y permisos).

## Pendiente
| # | Tema | Gravedad | Detalle |
|---|---|---|---|
| 1 | Política de contenido (CSP) | Media | Falta. Hay que armar la lista de orígenes (Mux, Supabase, fuentes) y probarla en navegador en modo solo-reporte antes de imponerla |
| 2 | `invitation.token_hash` legible por el staff | Baja | Es SHA-256 de 256 bits aleatorios: no se puede revertir. Aun así no hace falta exponerlo; se puede quitar de los privilegios de columna |
| 3 | Funciones trigger con `EXECUTE` a PUBLIC | Baja | Son de tipo invoker y `anon` no tiene acceso al esquema `app`; se pueden revocar por prolijidad |
| 4 | Límite de intentos del login del staff | A revisar | Confirmar la configuración de Auth en el proyecto de producción |
