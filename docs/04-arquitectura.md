# 04 — Arquitectura

Refleja las specs [00](../specs/00-auth-y-tenancy.md) a [06](../specs/06-pagos-y-avisos.md).

## Stack
- **Frontend/Backend:** Next.js (App Router), TypeScript, Server Actions y Route Handlers.
- **Datos:** Supabase (Postgres, Auth, RLS, Storage para fotos y logos).
- **Video:** Mux (recomendado), detrás de una interfaz `VideoProvider` (`createUpload`, `getPlaybackUrl`, `delete`, `usage`). Cloudflare Stream queda como alternativa. La elección final se confirma al construir el módulo.
- **Mail:** proveedor transaccional (p. ej. Resend).
- **Deploy:** Vercel. Tareas programadas con Vercel Cron.
- **PWA:** manifest, instalación en el celular y service worker. La **toma de asistencia funciona sin conexión** (ver más abajo); el resto de la app requiere conexión.
- **Tema:** modo claro por defecto, con modo oscuro opcional elegido por el usuario y recordado en el dispositivo.

## Multi-tenancy
- Una BDD, `school_id` en todas las tablas de negocio.
- El `school_id` y el rol viajan como claims de la sesión. Las políticas RLS los leen.
- Ruta por escuela `/{slug}`. El slug es único, de 3 a 30 caracteres, fijo tras el alta y con palabras reservadas (la lista está en `src/lib/slug.ts` y en la base, y una prueba verifica que coincidan).
- **Resolución del tenant:** se hace en el layout `app/[slug]/layout.tsx`, no en el proxy (el antiguo middleware): consulta `get_school_branding` con la clave secreta y cachea el resultado con `use cache` (etiqueta `school-branding:{slug}`, vida de 60 s como respaldo). Al suspender, reactivar o editar la marca de una escuela, el panel del operador invalida la etiqueta con `updateTag` y el cambio es inmediato.
- Slug inválido, inexistente o de una escuela suspendida: misma pantalla neutra. Por el streaming de `cacheComponents` responde con estado 200 y `noindex`, no con 404; es indistinguible a propósito (spec 00, RF-02). El 404 real queda para rutas que no existen.
- **El login y las acciones de servidor no usan esta caché:** deben verificar en vivo que la escuela esté activa (la caché solo sirve para mostrar la marca).
- Una escuela suspendida no muestra datos a nadie; conserva todo 90 días.
- Marca (logo y un color principal) como variables CSS por escuela, con validación de contraste en modo claro y oscuro.

## Autenticación
- **Operador de la plataforma:** Supabase Auth con email, contraseña y verificación en dos pasos.
- **Staff (admin, profesor):** Supabase Auth con email y contraseña (mínimo 8 caracteres), sesión de 30 días, recuperación por mail. Alta por invitación por mail (vence a los 7 días, token de un solo uso). Una cuenta pertenece a una sola escuela.
- **Familia:** flujo propio. Código de acceso por tutor + PIN de 6 dígitos (link mágico fuera del MVP). Emite una sesión (token firmado) con `guardian_id` y `school_id`, de 30 días, revocable y válida en varios dispositivos. PIN hasheado; 5 intentos fallidos bloquean 15 minutos; se rechazan PIN repetidos o en secuencia. Primer ingreso: cambio de PIN obligatorio y consentimiento.
- Detalle en [specs/00-auth-y-tenancy.md](../specs/00-auth-y-tenancy.md).
- **Sesión (staff y operador):** cookies de Supabase gestionadas con `@supabase/ssr`, **httpOnly** y de 30 días que se renuevan con el uso: el `proxy` (`src/proxy.ts`) valida y renueva el token en cada pedido. Toda la autenticación ocurre en el servidor (acciones de servidor); el navegador no lee la sesión.
- **Ingreso del staff** (`/{slug}/login`): todas las fallas (contraseña, mail inexistente, cuenta de otra escuela, desactivada, escuela suspendida) devuelven el mismo mensaje y no dejan sesión. La escuela se consulta en vivo, sin la caché de la marca.
- **Operador** (`/operator/login`): después de la contraseña exige verificación en dos pasos (TOTP). Sin el segundo paso (nivel aal2) la base de datos no lo reconoce como operador (`app.is_platform_admin()` exige aal2), aunque conozca la contraseña. La inscripción de la app de autenticación se crea solo cuando la persona toca el botón (no al renderizar, porque cada render crearía y descartaría inscripciones).
- **Guardas** (`src/server/auth/guards.ts`): las páginas protegidas verifican en vivo persona, perfil activo y escuela; sin sesión redirigen al ingreso sin mostrar contenido privado. Por el streaming de `cacheComponents`, la redirección viaja en el HTML con estado 200.

## Videos
1. El profesor graba o elige un clip en el celular (máximo 3 minutos, hasta 1080p).
2. El servidor crea una subida directa (URL firmada) al proveedor; el archivo no pasa por Next.js (límite de 4,5 MB en funciones). La subida corre en segundo plano con reintentos.
3. Webhook del proveedor marca el video como `listo`, guarda la duración y valida el máximo de 3 minutos.
4. Reproducción solo con **URL firmada de 1 hora**, renovada mientras la sesión sea válida. Se verifica en cada pedido: sesión, vínculo con el arquero, consentimiento vigente y estado publicado. Sin descarga ni links públicos.
5. Control de cuota: se suman los `duracion_seg` por escuela contra el tope de minutos de su suscripción (spec 07); aviso al admin al 80% y bloqueo de nuevas subidas al 100%. Lo ya subido sigue visible. El operador puede subir el tope y se destraba de inmediato.
6. Borrado (admin o eliminación definitiva de un arquero): se elimina también en el proveedor, con reintentos hasta confirmarlo.
7. Archivado automático por antigüedad: fuera del MVP; el admin borra a mano.

## Asistencia sin conexión
- Al abrir la sección de asistencia con conexión, se **precargan** los grupos y sus miembros en el dispositivo.
- Las marcas se guardan en una cola local (IndexedDB) y se sincronizan solas al volver la conexión; la pantalla muestra las listas "pendientes de sincronizar".
- Conflictos: prevalece el último cambio por hora de marca y ambos quedan en `attendance_revision`.
- Informes, avisos y corrección de sesiones antiguas requieren conexión.

## Avisos y tareas programadas
Cron diario a las **9:00 (hora de Argentina)**:
- Genera las cuotas que están a 10 días de su fecha de pago.
- Envía los cuatro avisos por cuota (5 días antes, día de pago, último día de la gracia, 3 días después del vencimiento) a los tutores con mail, sin duplicar mails compartidos.
- Registra cada envío en `notification_log` (idempotente: un aviso por cuota y tipo).
- Detecta rachas de 3 ausencias seguidas sin justificar y crea el aviso interno para el admin.
- Recalcula las alertas del operador (pruebas por terminar o sin cerrar, vencimientos a 7 días, vencidas, gracia terminada, topes de arqueros y de video) y le manda un mail resumen **solo si hay novedades**.

Otros mails (no cron):
- Evaluación publicada y video publicado → tutores con mail; los videos publicados seguidos se agrupan en una ventana de 30 minutos.
- Consentimiento retirado → admins de la escuela, por mail y dentro del sistema.

Los estados de las cuotas se **calculan por fecha**; no dependen de que el cron corra. Si el cron falla un día, al siguiente envía lo pendiente sin duplicar.

## Seguridad y privacidad
- RLS en todas las tablas; pruebas automáticas de aislamiento entre escuelas.
- Sin links públicos de video; URL firmadas que expiran.
- Consentimiento de imagen **por arquero**, dado por el tutor en el portal; sin consentimiento vigente no se suben ni se muestran fotos ni videos.
- Registro de auditoría de acciones sensibles: escuelas, invitaciones, accesos, consentimiento, cuotas, evaluaciones, asistencia y eliminaciones.
- Sin analítica de uso en el portal en el MVP; solo registros técnicos de errores.
- Secretos solo en variables de entorno del servidor.
- Contacto de emergencia, notas internas y motivos de justificación nunca llegan a la familia.

## Módulos del código
`auth`, `tenancy`, `schools`, `subscriptions` (condiciones, pagos y alertas del operador), `invitations`, `groups`, `goalkeepers`, `consent`, `evaluations`, `videos`, `attendance` (con sincronización sin conexión), `fees`, `portal` (familia), `notifications`, `alerts`, `reports` (cobranza y asistencia), `platform-admin`.

## Riesgos
- Fuga entre escuelas por RLS mal escrita → pruebas dedicadas.
- Costo de video creciente → tope de minutos por escuela, clips de hasta 3 minutos, borrado manual por el admin.
- Uso real del profesor en cancha con mala señal → subida de video con reintentos y estado visible; asistencia sin conexión.
- Complejidad de la sincronización sin conexión (conflictos, dispositivo que no abre la app) → alcance acotado a la toma de asistencia y pruebas específicas.
- Borrado en el proveedor de video que falla → proceso con reintentos; el video no figura eliminado hasta confirmarlo.
- Dependencia del cron diario para avisos → estados por fecha y reenvío de pendientes sin duplicar.
- Textos legales (consentimiento, privacidad, términos) pendientes de redacción y revisión profesional antes del lanzamiento.
