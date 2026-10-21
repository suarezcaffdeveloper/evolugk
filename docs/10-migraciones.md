# 10 — Migraciones y base de datos

Decisiones tomadas para el hito 1 en adelante.

## Cómo cambia la base de datos
- Todo cambio (tablas, índices, funciones, políticas RLS) es un **archivo SQL** en `supabase/migrations/`, creado con `pnpm db migration new <nombre>`.
- Nada se modifica a mano en el panel de Supabase. Lo que no está en una migración no existe.
- Las migraciones se revisan como el resto del código: van en la rama del hito y se unen a `main` con revisión.
- Los nombres de tablas y columnas siguen el [glosario](09-glosario.md) (en inglés).

## Entornos
| Entorno | Proyecto | Cómo se aplican las migraciones |
|---|---|---|
| Desarrollo | `udticdfguwfckqrrzdfb` | `pnpm db db push`, ejecutado en la sesión de desarrollo |
| Producción | (a crear) | **Manualmente**, cuando se decide un release. Nunca automático |

## Credenciales (no pasan por el chat)
Las credenciales viven en `supabase/.secrets.local`, ignorado por git. El script `scripts/supabase-cli.mjs` las lee y ejecuta el CLI.

1. Copiar `supabase/secrets.example` a `supabase/.secrets.local`.
2. Completar `SUPABASE_ACCESS_TOKEN` (token personal de la cuenta) y `SUPABASE_DB_PASSWORD` (contraseña de la base del proyecto).
3. Vincular el proyecto una sola vez: `pnpm db link`.

Comandos habituales:

| Comando | Qué hace |
|---|---|
| `pnpm db link` | Vincula el proyecto de desarrollo |
| `pnpm db migration new <nombre>` | Crea una migración vacía |
| `pnpm db db push` | Aplica las migraciones pendientes al proyecto vinculado |
| `pnpm db migration list` | Muestra qué migraciones están aplicadas |
| `pnpm db db diff` | Compara la base con las migraciones |

## Seguridad por escuela (RLS)
- Toda tabla de negocio lleva `school_id` y tiene RLS activada, sin excepciones.
- La identidad se resuelve con funciones SQL (`SECURITY DEFINER`, `STABLE`) que consultan la tabla `profile` **en cada consulta**, por `auth.uid()` y solo si el perfil está activo. Así, desactivar a un profesor corta el acceso al instante (spec 00, CA-06), sin esperar a que expire el token.
- Las funciones de identidad devuelven `school_id` y rol; las políticas las usan y nunca confían en datos que envíe el cliente.
- Se requiere una prueba de aislamiento automática por cada tabla con `school_id` (ver [plan de construcción](08-plan-de-construccion.md)).
- El rol de servicio (`service_role` / clave secreta) solo se usa desde el servidor.
- Los clientes (`authenticated`) tienen **solo lectura**. Toda escritura pasa por el servidor con la clave secreta, después de verificar permisos en el código.
- **Convención de políticas:** una sola política por tabla y acción, con las funciones de identidad envueltas en `(select ...)` para que se evalúen una vez por consulta. Lo controla el chequeo de rendimiento de Supabase.
- `get_school_branding(slug)` (marca para el login) solo la puede ejecutar el servidor; no está expuesta a internet.

## Primer operador de la plataforma
La cuenta del operador (rol `platform_admin`, sin escuela) se crea con un script interactivo que corrés vos en tu propia terminal, desde la raíz del repositorio:

```
pnpm operator:create
```

- Pide mail, nombre, apellido y contraseña (mínimo 12 caracteres; no se muestra al escribirla) y la repite para confirmarla.
- Muestra el proyecto de Supabase donde va a escribir y pide confirmación (`SI`) antes de crear nada.
- Usa la clave secreta de `apps/web/.env.local`. Se niega a correr si no es una terminal real, para que la contraseña nunca pase por un chat.
- Si falla el alta del perfil, deshace la cuenta para no dejar un usuario huérfano.
- Para producción: poner temporalmente en `.env.local` la URL y clave del proyecto de producción, correrlo y restaurar los valores de desarrollo.
- Al ingresar por primera vez al panel del operador se activa la verificación en dos pasos.

## Pruebas de base de datos
- `pnpm test:db` corre las pruebas de aislamiento y de reglas contra el proyecto de **desarrollo**. `pnpm test` corre solo las unitarias (no necesitan red ni claves).
- Se niegan a correr si `NEXT_PUBLIC_SUPABASE_URL` no es el proyecto de desarrollo. Crean escuelas y usuarios con prefijo `test-iso-` / `isolation-test-` y los borran al terminar; si una corrida se corta, la siguiente limpia los restos.
- Toda tabla nueva con `school_id` agrega sus pruebas de aislamiento en `apps/web/src/test/`.
- Revisión automática de Supabase: `pnpm db db advisors --linked --type security` y `--type performance`. Deben dar "No issues found".
- Para verificar que las pruebas detectan fugas se puede romper una política a propósito con `pnpm db db query --linked "<sql>"`, comprobar que fallan y restaurarla.

## Configuración de autenticación
`supabase/config.toml` documenta las decisiones de las specs. Para el proyecto en la nube hay que reflejarlas en el panel o con `pnpm db config push`:
- Sin registro libre (`enable_signup = false`): solo se entra por invitación.
- Contraseña mínima de 8 caracteres.
- Verificación en dos pasos (TOTP) habilitada, para el operador.
- La duración de sesión de 30 días del staff se controla desde la aplicación; los temporizadores de sesión de Supabase pueden requerir un plan pago.

## Estado de la configuración en la nube
- Para ver qué difiere entre `supabase/config.toml` y el proyecto: `pnpm db config diff`. Para aplicarlo: `pnpm db config push` (pide confirmación por cada recurso).
- Los cambios de configuración tardan unos segundos en aplicarse en Supabase: después de un `config push`, esperar ~20 segundos antes de verificar.
- **No aplicar `config push` sin revisar el diff**: el archivo debe coincidir con la nube en todo lo que no se quiere cambiar (pool de conexiones, OTP, confirmación de mails), porque `push` escribe todo lo que el archivo declara.
- Ya aplicados al proyecto de desarrollo: sin registro libre (`[auth] enable_signup = false`), contraseña mínima de 8 y URL de redirección `http://localhost:3000`. Una prueba (`auth-config.db.test.ts`) verifica que sigan así.
- **Cuidado:** `[auth.email] enable_signup` NO es "cerrar los registros": es el interruptor del proveedor de mail completo. En `false` nadie puede ingresar con mail y contraseña. Debe quedar en `true`; los registros se cierran solo con `[auth] enable_signup = false`.
- Pendiente en el panel de Supabase (no es de `config.toml`): proteger contra contraseñas filtradas (HaveIBeenPwned; el aviso de seguridad lo marca y puede requerir plan Pro) y reemplazar la "Site URL" (hoy `localhost`) por la dirección real antes del lanzamiento.

## Pendientes a confirmar
- Que la verificación en dos pasos (TOTP) esté disponible en el plan del proyecto de Supabase (la configuración local indica que podría requerir plan Pro).
- Crear el proyecto de producción antes del lanzamiento.

## Pruebas end-to-end en paralelo
`pnpm test:e2e` reutiliza el servidor que ya esté en el puerto 3000. Para correr los e2e de otra rama o carpeta sin reutilizar ese servidor, definí `E2E_PORT` (por ejemplo `E2E_PORT=3100 pnpm test:e2e`): Playwright levanta su propio servidor en ese puerto.
