# 03 — Videos

- **Estado:** Aprobada
- **Depende de:** [00 — Auth y tenancy](00-auth-y-tenancy.md), [01 — Arqueros y fichas](01-arqueros-y-fichas.md), [02 — Evaluaciones](02-evaluaciones.md)
- **Habilita:** portal de familia

## 1. Objetivo
Permitir que los profesores suban clips cortos de cada arquero desde el celular, los comenten con precisión y los muestren a la familia de forma privada, controlando el costo de almacenamiento por escuela.

## 2. Alcance
**Entra:**
- Subida desde cámara o galería, en segundo plano, con reintentos.
- Videos de hasta 3 minutos, hasta 1080p.
- Clasificación por tema.
- Estado borrador/publicado.
- Comentarios del staff con marca de tiempo.
- Videos de respaldo vinculados a evaluaciones.
- Reproducción privada dentro del portal (sin descarga).
- Control de cuota de minutos por escuela.
- Aviso por mail a la familia al publicar.
- Edición y borrado.

**No entra (MVP):**
- Videos de más de un arquero.
- Comentarios o respuestas de la familia.
- Descarga por parte de la familia.
- Archivado o borrado automático por antigüedad.
- Comparador de videos lado a lado.
- Edición de video (recorte, cámara lenta, dibujos sobre el video).
- Subida diferida sin conexión.

## 3. Actores
| Actor | Qué hace |
|---|---|
| Profesor | Sube, edita, comenta y publica videos de cualquier arquero activo |
| Admin | Lo mismo, además de borrar videos y ver el uso de minutos de su suscripción |
| Tutor | Ve los videos publicados de sus arqueros |
| Operador | Ve el uso por escuela y puede modificar su tope ([spec 07](07-planes-y-suscripciones.md)) |

## 4. Requisitos funcionales

### Subida
- **RF-01** El profesor puede grabar con la cámara o elegir un video de la galería.
- **RF-02** Duración máxima de 3 minutos por clip; se valida al elegir el video y se vuelve a validar en el servidor tras procesarlo.
- **RF-03** Solo se puede subir a arqueros activos con consentimiento vigente (spec 01); si no, se bloquea con un mensaje claro.
- **RF-04** La subida se hace directamente al proveedor de video, no a través de la aplicación.
- **RF-05** La subida continúa en segundo plano, con reintentos automáticos y estado visible (subiendo, procesando, listo, con error). El profesor no debe esperar en pantalla.
- **RF-06** Datos obligatorios: arquero y tema. Título opcional; si falta, se genera con la fecha y el tema.
- **RF-07** El tema es una categoría de la rúbrica (atajada, juego aéreo, juego con los pies, posicionamiento, reflejos, comunicación, físico/coordinación, mentalidad) u "otro".
- **RF-08** Un video pertenece a un solo arquero.
- **RF-09** Se guarda y reproduce hasta 1080p.

### Estado y publicación
- **RF-10** Un video nuevo queda en **borrador**, visible solo para el staff.
- **RF-11** Un video solo puede publicarse cuando terminó de procesarse.
- **RF-12** Al publicarlo, la familia puede verlo.
- **RF-13** Al publicar se manda un mail a los tutores con mail cargado; si se publican varios seguidos, se agrupan en un solo mail dentro de una ventana de 30 minutos.
- **RF-14** Un video publicado puede volver a borrador.

### Comentarios
- **RF-15** El staff puede agregar comentarios con marca de tiempo (segundo del video); un comentario también puede ser general (sin marca).
- **RF-16** Solo el staff comenta; la familia los lee cuando el video está publicado, con el nombre del profesor autor visible.
- **RF-16b** La familia también ve el nombre del profesor que subió el video.
- **RF-17** El autor puede editar y borrar sus propios comentarios; el admin puede editar o borrar cualquiera.
- **RF-18** Al tocar un comentario con marca, el reproductor salta a ese momento.

### Vínculo con evaluaciones
- **RF-19** Un video puede adjuntarse a una evaluación; una evaluación puede tener varios videos.
- **RF-20** El video adjunto sigue siendo independiente: aparece en la sección de videos y dentro de la evaluación, y se publica por separado.
- **RF-21** La familia ve un video dentro de una evaluación solo si el video y la evaluación están publicados.

### Reproducción
- **RF-22** El video se reproduce solo dentro del portal, con una URL firmada de 1 hora (renovada automáticamente mientras la sesión sea válida) emitida después de verificar la sesión, el vínculo del tutor con el arquero, el consentimiento y la publicación.
- **RF-23** No hay botón de descarga para la familia.
- **RF-24** No existen links públicos.
- **RF-25** El staff ve todos los videos de su escuela.

### Edición y borrado
- **RF-26** El autor y cualquier admin pueden editar el título, el tema y el estado; solo el admin puede borrar un video.
- **RF-27** Al borrar un video se elimina también del proveedor, se liberan sus minutos de la cuota y se desvincula de las evaluaciones.

### Cuota de minutos
- **RF-28** Cada escuela tiene un tope de minutos de video, definido por el operador en las condiciones de su suscripción ([spec 07](07-planes-y-suscripciones.md)).
- **RF-29** Los minutos usados son la suma de la duración de todos los videos de la escuela, incluidos los borradores.
- **RF-30** Al llegar al 80% se avisa al admin; al llegar al 100% se bloquean las nuevas subidas. Los videos ya subidos se siguen viendo.
- **RF-31** El admin ve el consumo de minutos y puede liberar espacio borrando videos.

### Consentimiento
- **RF-32** Si se retira el consentimiento de un arquero, todos sus videos se ocultan de inmediato (spec 01) y dejan de reproducirse para la familia. El admin decide si se borran.

### Listados
- **RF-33** Lista de videos por arquero, ordenada por fecha, con filtro por tema.
- **RF-34** Cada video muestra miniatura, duración, tema, autor, fecha y estado.

## 5. Reglas de negocio
- **RN-01** Un video pertenece a una escuela y a un arquero; no se mueve a otro.
- **RN-02** El proveedor de video es intercambiable; la aplicación habla con una interfaz propia (ver arquitectura).
- **RN-03** Un video con error de procesamiento no cuenta para la cuota y se puede reintentar o descartar. El aviso del error le llega solo al profesor que lo subió, dentro de la app.
- **RN-04** Un video borrado no puede recuperarse.
- **RN-05** Los videos se conservan al pasar el arquero a inactivo o egresado; no se pueden subir nuevos.
- **RN-06** Los videos no se borran automáticamente por antigüedad.
- **RN-07** La eliminación definitiva de un arquero borra todos sus videos del proveedor (spec 01).

## 6. Datos involucrados
Ver [docs/03-modelo-de-datos.md](../docs/03-modelo-de-datos.md):
- `video`: `school_id`, `goalkeeper_id`, `autor_id`, `proveedor`, `proveedor_asset_id`, `titulo`, `tema`, `duracion_seg`, `estado_proceso` (`subiendo | procesando | listo | error`), `estado_publicacion` (`borrador | publicado`), `publicado_en`.
- `video_comment`: `school_id`, `video_id`, `autor_id`, `segundo` (nulo si es general), `texto`.
- `evaluation_video` (evaluation_id, video_id, school_id): vínculo entre evaluaciones y videos.
- Uso de cuota por escuela: se calcula sumando `duracion_seg` de sus videos no eliminados.

## 7. Flujos

**F1 — Subir en cancha:** profesor elige el arquero → graba o elige el clip → tema → "Subir" → vuelve a trabajar → el estado avanza solo hasta "listo".

**F2 — Comentar y publicar:** profesor abre el video listo → agrega comentarios con marca de tiempo → publica → mail a la familia.

**F3 — Respaldo de evaluación:** al evaluar, el profesor adjunta uno o varios videos del arquero.

**F4 — Mirar en familia:** el tutor abre el portal → ve videos publicados → el reproductor carga con URL firmada → toca un comentario y el video salta a ese momento.

**F5 — Cuota:** al 80% aviso al admin → al 100% se bloquean subidas → el admin borra videos o le pide al operador que suba el tope.

**F6 — Consentimiento retirado:** los videos del arquero se ocultan de inmediato → el admin decide si se borran.

## 8. Criterios de aceptación
- **CA-01** Dado un arquero sin consentimiento vigente, cuando el profesor intenta subir, entonces se bloquea.
- **CA-02** Dado un video de más de 3 minutos, entonces se rechaza antes de subirlo; si llegó al servidor, se descarta al procesarlo.
- **CA-03** Dada una subida interrumpida por falta de señal, entonces se reintenta sola y el profesor ve el estado.
- **CA-04** Dado un video en borrador, cuando la familia abre el portal, entonces no lo ve.
- **CA-05** Dado un video publicado, cuando se intenta abrir su URL de reproducción pasado el vencimiento, entonces no reproduce.
- **CA-06** Dado un tutor ajeno al arquero, cuando intenta reproducir un video, entonces recibe acceso denegado.
- **CA-07** Dado un comentario con marca de tiempo, cuando se toca, entonces el reproductor salta a ese segundo.
- **CA-08** Dado un profesor que no es el autor, cuando intenta borrar un video, entonces se le deniega.
- **CA-09** Dada una escuela al 100% de la cuota, cuando un profesor intenta subir, entonces se bloquea con mensaje claro; los videos existentes siguen visibles.
- **CA-10** Dado un video borrado, entonces no existe en el proveedor y sus minutos quedan liberados.
- **CA-11** Dado un video adjunto a una evaluación en borrador, cuando la familia ve el portal, entonces no lo ve dentro de la evaluación.
- **CA-12** Dado un consentimiento retirado, entonces los videos del arquero dejan de reproducirse para la familia al instante.

## 9. Casos borde
- Cierre de la app durante la subida: la subida se retoma o se marca con error y se puede reintentar.
- Proveedor caído o con error de procesamiento: el video queda en error, no cuenta para la cuota y se puede reintentar o descartar.
- Cuota alcanzada mientras otro profesor está subiendo: la subida en curso se acepta; las nuevas se bloquean.
- Video de 4 minutos grabado por error: se detecta al elegirlo.
- Dos admins borran el mismo video a la vez: la segunda operación no falla, queda como ya eliminado.
- Profesor desactivado: sus videos y comentarios se conservan con su nombre.
- Video publicado y luego despublicado: el mail ya enviado no se retira.
- Falla del borrado en el proveedor: se reintenta y el video no figura como borrado hasta confirmarlo.
- Formato de video no soportado por el celular: se informa claramente.

## 10. Seguridad y privacidad
- Son imágenes de menores: privados por defecto, sin links públicos, con URL firmadas de corta duración.
- La autorización se verifica en cada pedido de reproducción, no solo al abrir la página.
- No hay descarga desde la aplicación. No se puede impedir una grabación de pantalla; el consentimiento y la política de la escuela cubren ese riesgo.
- El proveedor recibe solo los videos y un identificador; no recibe datos personales del arquero.
- Las altas, ediciones, publicaciones y borrados quedan auditados.
- Aislamiento por `school_id` en todas las consultas.

## 11. Preguntas abiertas
1. Elección final del proveedor de video: se decide en arquitectura; la spec es independiente del proveedor.
