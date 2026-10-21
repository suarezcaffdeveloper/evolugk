# 12 — Videos y Mux

- **Estado:** Hito 4 (implementado)
- **Specs:** [03 — Videos](../specs/03-videos.md) y la parte de videos de [04 — Portal de familia](../specs/04-portal-familia.md)

## Cómo está armado
- La aplicación habla con una interfaz propia, `VideoProvider` (`apps/web/src/server/video/provider.ts`). Mux es la primera implementación (`mux-provider.ts`); cambiar de proveedor no toca el resto.
- **Subida directa:** el celular sube el archivo a Mux (en partes de 5 MB, con reintentos y pausa sin conexión) sin pasar por la aplicación. La subida vive en el marco del panel (`UploadProvider`), así el profesor puede navegar y seguir trabajando; la bandeja de abajo muestra "subiendo → procesando → listo / con error".
- **Estado del video:** lo actualizan los avisos (webhooks) de Mux y, si no llegan (por ejemplo en desarrollo), la propia aplicación consulta a Mux al abrir el video y cada pocos segundos mientras la bandeja está abierta. Ambos caminos usan la misma lógica idempotente.
- **Reproducción:** todos los videos son privados (política `signed`). El navegador pide un token de 1 hora a `/{slug}/video-token/{id}`, que verifica en **cada pedido** la sesión, el vínculo del tutor con el arquero, el consentimiento vigente y la publicación. El token se renueva solo antes de vencer. No hay links públicos ni descarga, y la analítica del reproductor está desactivada.
- **Proveedor y datos personales:** Mux recibe solo el archivo y el UUID del video (`passthrough`). Los identificadores de Mux no se pueden leer desde internet (ni siquiera por el staff): solo los usa el servidor.

## Variables de entorno (solo servidor, `apps/web/.env.local`)
| Variable | Para qué | De dónde sale |
|---|---|---|
| `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET` | API de Mux (crear subidas, borrar archivos) | Settings → API Access Tokens (permisos Mux Video: lectura y escritura) |
| `MUX_WEBHOOK_SECRET` | Verificar los avisos de Mux | Settings → Webhooks → *Signing Secret* |
| `MUX_SIGNING_KEY_ID`, `MUX_SIGNING_PRIVATE_KEY` | Firmar la reproducción (token de 1 hora) | Settings → Signing Keys → *Generate new key*. **Es distinto del token de la API.** La clave privada se muestra una sola vez; se pega tal cual (base64) |
| `MUX_TEST_ASSETS` | `true` solo en cuentas gratuitas: los videos son de prueba (marca de agua, 10 segundos, se borran a las 24 h) | — |
| `CRON_SECRET` | Protege la tarea de mantenimiento | Cualquier valor largo y aleatorio |

## Avisos (webhooks)
- URL: `https://<tu dominio>/api/webhooks/mux`. Eventos: `video.upload.asset_created`, `video.asset.ready`, `video.asset.errored` (y opcionalmente `video.upload.errored`, `video.upload.cancelled`).
- Un aviso sin firma válida y reciente recibe 401 y no cambia nada.
- En desarrollo, Mux no alcanza `localhost`. No hace falta un túnel: la consulta directa mantiene el estado al día. Si se quiere probar el webhook real, usar un túnel (por ejemplo `cloudflared` o `ngrok`) y apuntar el webhook a esa dirección.

## Tarea de mantenimiento
`GET /api/cron/video-maintenance` con `Authorization: Bearer <CRON_SECRET>`:
1. Reintenta los borrados pendientes en Mux (`video_provider_cleanup`).
2. Manda los mails de "video publicado" cuya ventana de 30 minutos ya pasó, **agrupando** los videos del mismo arquero.

Hasta que exista el programador diario del hito 6 hay que llamarla cada ~5 minutos (por ejemplo con Vercel Cron, que requiere plan que permita esa frecuencia). Los reintentos de borrado también se aprovechan en cada aviso de Mux y al refrescar el estado de las subidas.

## Decisiones tomadas
- **Borrado en el proveedor:** al borrar un video desaparece de la aplicación y de la cuota, y su archivo se borra en Mux. Si Mux falla, el borrado queda en una cola con reintentos (nunca queda un archivo huérfano sin registro). Es una variante de lo que pedía la spec ("el video no figura como borrado hasta confirmarlo"): se prefirió liberar la cuota y ocultarlo al instante.
- **Cuota:** suma la duración de todos los videos de la escuela, borradores incluidos; los que tienen error no cuentan. Al 80% se avisa en el panel del admin; al 100% se bloquean las nuevas subidas. El operador cambia el tope desde el detalle de la escuela y se aplica de inmediato.
- **Subida interrumpida:** una subida que lleva más de 30 minutos sin avanzar se muestra con error; el autor (o el admin) puede volver a subirla o descartarla.
- **Fuera de este hito (Fase 2):** dictado por voz, dibujo sobre el video y comparación de clips.
