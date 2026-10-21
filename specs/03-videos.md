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
- Comparador de videos lado a lado (Fase 2, ver sección 12).
- Dictado por voz de comentarios (Fase 2, ver sección 12).
- Dibujo sobre el video (Fase 2, ver sección 12).
- Edición de video (recorte, cámara lenta).
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
2. Elección del proveedor de voz a texto para el dictado (sección 12): se decide en arquitectura; confirmar precio, soporte de español rioplatense y política de no retención del audio.

## 12. Ampliaciones de Fase 2
Tres funciones sobre el reproductor y los comentarios. No cambian las reglas del MVP: lo que no se menciona acá se mantiene como arriba.

### 12.1 Dictado por voz de comentarios
**Objetivo:** que el profesor dicte en lugar de escribir, más rápido y práctico en la cancha. El resultado es siempre un comentario de texto.

- **RF-35** En el cuadro de comentario hay un botón de micrófono. El profesor mantiene o toca para grabar y vuelve a tocar para terminar.
- **RF-36** Cada dictado dura hasta 60 segundos. Si hace falta más, se dicta en varios comentarios.
- **RF-37** Al terminar, el audio se envía a un servicio de voz a texto (interfaz propia `TranscriptionProvider`, intercambiable, en español rioplatense) y el texto aparece en el cuadro de comentario para que el profesor lo **revise y edite** antes de guardar.
- **RF-38** El comentario dictado conserva la marca de tiempo del video en el momento en que se empezó a dictar, igual que uno escrito (RF-15). El profesor puede cambiarla o dejarlo general.
- **RF-39** El audio **no se guarda**: se descarta apenas se obtiene el texto, o si la transcripción falla. La familia nunca lo escucha; solo lee el texto.
- **RF-40** Si la transcripción falla o no hay conexión, se informa claramente y el profesor puede escribir el comentario a mano. No se pierde lo ya escrito.
- **RF-41** Un comentario dictado se trata exactamente igual que uno escrito: mismos permisos de edición y borrado (RF-17), misma visibilidad para la familia (RF-16).

### 12.2 Dibujo sobre el video
**Objetivo:** que el profesor pause el video y marque algo sobre la imagen (posición de manos, de pies, ángulo del cuerpo) para que el arquero y su familia lo vean.

- **RF-42** El staff puede pausar el video en cualquier momento y activar el modo dibujo sobre ese cuadro.
- **RF-43** Herramientas: lápiz, goma de borrar, elección de color (paleta corta), grosor (fino, medio, grueso), deshacer y borrar todo.
- **RF-44** El dibujo se guarda como **anotación**: trazos vectoriales (puntos, color y grosor) asociados al segundo del video. No modifica el video ni consume minutos de la cuota.
- **RF-45** Los puntos se guardan en coordenadas relativas al cuadro del video (0 a 1), para que la anotación se vea igual en cualquier tamaño de pantalla, vertical u horizontal.
- **RF-46** Una anotación puede quedar sola o asociada a un comentario; en ese caso se muestra al tocar el comentario.
- **RF-47** Al reproducir, al llegar al segundo de una anotación el reproductor se pausa en ese cuadro y la muestra; el usuario sigue con un toque. Las anotaciones aparecen como marcas en la barra de tiempo.
- **RF-48** El autor puede editar y borrar sus anotaciones; el admin puede editar o borrar cualquiera (como en RF-17).
- **RF-49** La familia ve las anotaciones de un video publicado, en solo lectura. No dibuja.
- **RF-50** Máximo 20 anotaciones por video.

### 12.3 Comparación de clips
**Objetivo:** mostrar la evolución poniendo dos clips del mismo arquero lado a lado, por ejemplo el mismo ejercicio hace 3 meses y hoy.

- **RF-51** El staff elige dos videos **del mismo arquero** y los ve lado a lado (en vertical, uno sobre otro, en pantallas angostas). Por defecto el más antiguo queda a la izquierda o arriba.
- **RF-52** Ambos videos deben estar en estado `listo`. El selector permite filtrar por tema para encontrar el mismo ejercicio.
- **RF-53** Reproducción: un control común que reproduce, pausa y mueve los dos a la vez, y la opción de moverlos de forma independiente para alinear el momento de cada clip. Cada clip se muestra con su fecha.
- **RF-54** El profesor puede comparar al vuelo sin guardar nada, o **guardar la comparación** con un título y una nota opcionales.
- **RF-55** Una comparación guardada nace en **borrador**, visible solo para el staff, y se puede **publicar**. Solo puede publicarse si sus dos videos están publicados.
- **RF-56** La familia ve las comparaciones publicadas de sus arqueros, en solo lectura, con la misma reproducción privada del RF-22 para cada clip. Aparece como novedad en el portal.
- **RF-57** No se comparan clips de arqueros distintos.
- **RF-58** Pueden verse en la comparación las anotaciones de cada video (RF-49).
- **RF-59** La comparación no genera mail propio.

### Reglas de negocio (Fase 2)
- **RN-08** Las anotaciones, los comentarios dictados y las comparaciones pertenecen a una escuela y a un arquero, igual que el video.
- **RN-09** Ningún audio se conserva. Solo se guarda el texto confirmado por el profesor.
- **RN-10** Si se borra un video, se borran sus anotaciones y las comparaciones guardadas que lo incluyan.
- **RN-11** Si se despublica un video incluido en una comparación publicada, la comparación vuelve a borrador.
- **RN-12** Sin consentimiento vigente (RF-32) se ocultan también las anotaciones y comparaciones del arquero.
- **RN-13** El costo del dictado se mide por minuto de audio procesado; no entra en la cuota de minutos de video.

### Datos involucrados (Fase 2)
Ver [docs/03-modelo-de-datos.md](../docs/03-modelo-de-datos.md):
- `video_annotation`: `school_id`, `video_id`, `autor_id`, `segundo`, `comentario_id` opcional, `trazos` (datos vectoriales).
- `video_comparison`: `school_id`, `goalkeeper_id`, `autor_id`, `video_a_id`, `video_b_id`, `titulo` opcional, `nota` opcional, `estado_publicacion` (`borrador | publicado`), `publicado_en`.
- `video_comment`: sin cambios. Un comentario dictado es un comentario de texto.

### Flujos (Fase 2)
**F7 — Comentar dictando:** el profesor mira el video → toca el micrófono → habla → revisa el texto → guarda.

**F8 — Marcar sobre la imagen:** pausa → activa el dibujo → traza y elige color → guarda la anotación (sola o con un comentario).

**F9 — Mostrar progreso:** el profesor abre "Comparar" desde la ficha → elige dos clips del mismo tema → los ve sincronizados → guarda y publica la comparación → la familia la ve en el portal.

### Criterios de aceptación (Fase 2)
- **CA-13** Dado un comentario dictado, cuando el profesor lo guarda, entonces queda guardado solo el texto y no existe ningún archivo de audio.
- **CA-14** Dada una transcripción que falla, entonces el profesor puede escribir el comentario a mano sin perder lo anterior.
- **CA-15** Dada una anotación en el segundo 12, cuando la familia llega al segundo 12 de un video publicado, entonces el reproductor se pausa y muestra el dibujo.
- **CA-16** Dado un video en borrador con anotaciones, cuando la familia abre el portal, entonces no ve el video ni las anotaciones.
- **CA-17** Dado un intento de comparar clips de arqueros distintos, entonces se rechaza.
- **CA-18** Dada una comparación con un video en borrador, cuando el profesor intenta publicarla, entonces se bloquea con un mensaje claro.
- **CA-19** Dada una comparación publicada, cuando se despublica uno de sus videos, entonces la comparación deja de verse para la familia.
- **CA-20** Dado un consentimiento retirado, entonces la familia deja de ver las anotaciones y comparaciones del arquero al instante.
- **CA-21** Dado un video borrado, entonces se eliminan sus anotaciones y las comparaciones guardadas que lo incluían.

### Casos borde (Fase 2)
- Dictado en un lugar muy ruidoso o con mala transcripción: el profesor corrige el texto antes de guardar.
- Cierre de la app durante un dictado: se descarta el audio; no queda nada a medias.
- Dibujo en un video que luego se despublica: la anotación se conserva, pero se oculta junto con el video.
- Dos clips de duraciones muy distintas: cada uno termina por su cuenta; el control común sigue hasta el final del más largo.
- Celular en horizontal o en vertical: las anotaciones mantienen su posición sobre la imagen.
- Comparación guardada con un video que luego se borra: se elimina la comparación y se avisa al autor.

### Seguridad y privacidad (Fase 2)
- El audio del dictado puede captar voces de menores en la cancha: por eso no se almacena y se envía solo al proveedor de voz a texto contratado, que no debe conservarlo ni usarlo para entrenar modelos. Debe validarse antes de elegir el proveedor.
- La transcripción no incluye datos del arquero hacia el proveedor: se envía solo el audio, sin identificadores.
- Anotaciones y comparaciones heredan el aislamiento por `school_id` y las reglas de consentimiento y publicación del video.
- Altas, ediciones, publicaciones y borrados de anotaciones y comparaciones quedan auditados.
