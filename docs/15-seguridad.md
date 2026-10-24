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
4. **Política de contenido (CSP)**, ver la sección siguiente.
5. **Privilegios** (migración `20261027090000`): `invitation.token_hash` deja de ser legible con la sesión del staff (privilegio por columna; el servidor lo sigue leyendo), y las funciones de trigger del esquema `app` pierden el `EXECUTE` a PUBLIC (más un `default privileges` para las nuevas). Verificado en la base real con `supabase/audit/*.sql` y con `src/test/privileges.db.test.ts`.

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

## Política de contenido (CSP)
Cabecera `Content-Security-Policy` en todas las rutas (`next.config.ts`).

| Directiva | Valor | Por qué |
|---|---|---|
| `default-src` | `'self'` | Todo lo no listado solo puede venir de la propia app |
| `script-src` | `'self' 'unsafe-inline'` | **Decisión:** sin nonces (ver abajo) |
| `style-src` | `'self' 'unsafe-inline'` | Atributos `style` de React y etiquetas `<style>` que inyecta el reproductor de Mux |
| `img-src` | `'self' data: blob: https://image.mux.com` | Miniaturas del reproductor |
| `connect-src` | `'self' https://*.mux.com` | Reproducción (`stream.mux.com`) y subida directa (`direct-uploads-*.mux.com`) |
| `media-src` | `'self' blob: https://stream.mux.com https://image.mux.com` | Video y guion gráfico de las vistas previas |
| `worker-src` | `'self' blob:` | Service worker y el worker del reproductor |
| `font-src` | `'self'` | Las fuentes son propias |
| `object-src` | `'none'` | Sin plugins |
| `base-uri`, `form-action` | `'self'` | Evitan redirigir formularios o rutas relativas a otro sitio |
| `frame-ancestors` | `'none'` | Nadie incrusta la app (clickjacking) |

**Por qué `'unsafe-inline'` en scripts.** La guía de esta versión de Next dice que los nonces son incompatibles con Partial Prerendering, y el proyecto usa `cacheComponents`: habría que renderizar todas las páginas en cada pedido y se perdería el shell estático que se optimizó en el hito de rendimiento. Se acepta `'unsafe-inline'` y se compensa cerrando todo lo demás: la política sigue bloqueando scripts de otros orígenes, `eval`, plugins, formularios hacia afuera, base y la incrustación. **Qué no cubre:** si alguien lograra inyectar HTML en una pantalla, un script en línea se ejecutaría. Por eso el resto de los controles (escape de React, validación de entradas) sigue siendo la primera defensa. Alternativas evaluadas y descartadas por ahora: nonces con `proxy.ts` (pierde lo estático, riesgo con `cacheComponents`) y SRI experimental (la guía no aclara que cubra los scripts en línea, que son los 421 avisos de la primera medición).

**Cómo se armó.** Primero en modo solo-reporte con una política estricta, recorriendo 33 pantallas por rol (521 avisos: scripts en línea, `style` en línea y `eval`, y ninguno de origen). Después, con la política definitiva activa y un video sembrado con identificador falso, el reproductor reveló tres cosas que el resto de las pantallas no mostraban:
- `<style>` inyectados por el reproductor (428 avisos) → `style-src 'unsafe-inline'`.
- El guion gráfico viene de `image.mux.com` por `media-src` → se agregó.
- **Chromecast:** el reproductor carga `www.gstatic.com/cv/js/sender/v1/cast_sender.js`. **No se permite a propósito:** no hay opción para apagarlo y no se justifica abrir un script de Google en una plataforma con videos de menores. El script queda bloqueado (única violación que se ve en las páginas de video), el botón de transmitir no aparece y el reproductor sigue funcionando.
- **`eval`:** zod 4 sondea `new Function("")`; se evitó con `z.config({ jitless: true })` (`lib/zod-config.ts`). Sin `unsafe-eval` en producción (en desarrollo sí, para el recarga en caliente).

**Pruebas.** `e2e/csp.spec.ts`: la cabecera tiene las directivas clave y no tiene `unsafe-eval` ni comodines, y el ingreso, el panel (lista, alta, ficha, asistencia, subir video) y la privacidad no generan ninguna violación. Si se agrega un origen nuevo (por ejemplo un servicio de errores), el test falla antes de que el navegador lo bloquee en producción.

**Sin verificar:** la reproducción y la subida con un **video real de Mux** (se probó con un identificador falso: la CSP se evalúa igual, pero no se vio un video reproducirse) y el comportamiento en un celular real. Si Mux cambiara el dominio de las URLs de subida fuera de `*.mux.com`, las subidas fallarían: hoy usa `direct-uploads-oci-us-phoenix-1-vop1.mux.com`.

## Pendiente
| # | Tema | Gravedad | Detalle |
|---|---|---|---|
| 1 | Límite de intentos del login del staff | A revisar | Confirmar la configuración de Auth en el proyecto de producción |
| 2 | `new Date()` al renderizar la invitación | Baja | En el build de producción, la página `/{slug}/invitacion/{token}` registra en el servidor «encountered the unstable value `new Date()` while prerendering» (viene del valor por defecto de `lookupInvitation`). **No se ve en pantalla:** con un token válido la página renderiza completa. Conviene pasar la fecha desde un componente dinámico para evitar el error y que Next pueda armar la parte estática |
| 3 | `APP_URL` obligatoria en producción | Para el lanzamiento | Sin ella, publicar una evaluación falla con un error del servidor (a propósito: evita mails con links a `localhost`). Definirla en Vercel con la dirección pública, y para correr los e2e contra el build: `APP_URL=http://localhost:3000 E2E_PROD=1 pnpm test:e2e` |
