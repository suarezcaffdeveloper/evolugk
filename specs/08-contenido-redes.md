# 08 — Contenido para redes sociales

- **Estado:** Borrador (Fase 2)
- **Depende de:** [01 — Arqueros y fichas](01-arqueros-y-fichas.md) (consentimiento de redes), [02 — Evaluaciones](02-evaluaciones.md), [03 — Videos](03-videos.md)
- **Habilita:** difusión de la escuela y de la plataforma en Instagram

## 1. Objetivo
Que cada escuela tenga publicaciones de Instagram preparadas automáticamente, con su marca, para mostrar que trabaja con el sistema y enseñar la evolución de sus arqueros: un clip de un ejercicio, el progreso, cómo lo ve la familia. La escuela revisa, descarga y publica a mano.

## 2. Alcance
**Entra:**
- Sugerencias automáticas de piezas (imagen o video corto) con la marca de la escuela.
- Piezas con arqueros reales, solo con consentimiento específico de redes.
- Piezas genéricas sobre cómo funciona el sistema, sin datos de arqueros.
- Texto sugerido para acompañar la publicación (copy y hashtags).
- Revisión, edición mínima, aprobación y descarga por el admin.
- Formatos para publicación en el feed y en historias/reels.

**No entra:**
- Publicación automática en Instagram ni conexión con la API de Meta.
- Otras redes (Facebook, TikTok, X); se pueden reutilizar los mismos archivos a mano.
- Programación de publicaciones ni calendario de contenido.
- Métricas de las publicaciones.
- Edición avanzada de las piezas.
- Piezas elaboradas por el operador para la propia plataforma (material de marketing propio).

## 3. Actores
| Actor | Qué hace |
|---|---|
| Admin | Ve las sugerencias, las edita, aprueba y descarga; elige qué tipos de pieza recibir |
| Profesor | No participa (no ve esta sección) |
| Tutor | Da o retira el consentimiento de redes del arquero ([spec 01](01-arqueros-y-fichas.md)) |
| Operador | Mantiene las plantillas genéricas y ve el uso de generación de piezas |

## 4. Requisitos funcionales

### Sugerencias
- **RF-01** El sistema genera sugerencias de forma automática (en principio una vez por semana) y también a pedido del admin. Quedan en estado `sugerida`.
- **RF-02** Una sugerencia nace de un hecho real de la escuela: un video destacado, una evaluación publicada, una comparación publicada, o un hito de la plataforma. Cada tipo se puede activar o desactivar por escuela.
- **RF-03** El admin recibe un aviso dentro del sistema cuando hay sugerencias nuevas (sin mail adicional).

### Tipos de pieza
- **RF-04** **Clip de ejercicio:** video corto vertical (hasta 30 s) de un arquero haciendo un ejercicio, con el logo y los colores de la escuela y el tema del clip.
- **RF-05** **Progreso:** imagen con el radar de "ingreso vs. hoy" de un arquero y la mejora destacada.
- **RF-06** **Antes y después:** video corto a partir de una comparación publicada ([spec 03](03-videos.md), sección 12.3), con la fecha de cada clip.
- **RF-07** **Cómo lo ve la familia:** imagen o video que muestra el portal con datos de demostración, sin arqueros reales.
- **RF-08** **Cómo funciona:** piezas genéricas sobre el sistema (evaluación, videos, portal, asistencia) con la marca de la escuela y datos de demostración.
- **RF-09** Cada pieza se genera en formato vertical para historias y reels (9:16) y cuando corresponda también en formato de feed (4:5).

### Consentimiento y datos personales
- **RF-10** Una pieza con un arquero real solo se genera si ese arquero tiene **ambos** consentimientos vigentes: imagen y video, y uso en redes ([spec 01](01-arqueros-y-fichas.md), RF-31b). Sin ellos, no se sugiere.
- **RF-11** Por defecto las piezas muestran solo el **nombre de pila** del arquero, sin apellido, club ni datos de contacto. El admin puede ocultar el nombre.
- **RF-12** Las piezas no incluyen datos económicos, asistencia, notas internas ni comentarios del profesor. Los puntajes sí pueden mostrarse como parte del radar.
- **RF-13** Si se retira el consentimiento de redes o de imagen y video, las piezas pendientes del arquero (sugeridas, aprobadas) se ocultan de inmediato y el admin recibe un aviso.

### Revisión y descarga
- **RF-14** El admin puede ver la vista previa, editar el texto sugerido, cambiar el fondo o el color entre las opciones de la marca, **aprobar** o **descartar** cada sugerencia.
- **RF-15** El texto sugerido se genera en español rioplatense, breve, sin promesas de resultados; el admin lo edita como quiera.
- **RF-16** Una pieza aprobada se puede descargar en los formatos disponibles. Las descargas de piezas con arqueros reales quedan auditadas con quién descargó y cuándo.
- **RF-17** Una sugerencia no revisada vence a los 30 días y se descarta sola.
- **RF-18** El admin puede marcar una pieza como `publicada` a mano, solo como registro para no repetir la misma idea.

### Límites
- **RF-19** Cada escuela puede generar hasta un máximo de piezas por mes, definido por el operador para controlar el costo de procesamiento.
- **RF-20** El clip de ejercicio se toma de videos en estado `publicado` de la escuela. La generación usa una copia interna que no se expone ni se descarga desde el portal de familia.

## 5. Reglas de negocio
- **RN-01** No se sugiere una pieza con un arquero sin consentimiento vigente de imagen y video y de uso en redes.
- **RN-02** La familia no ve esta sección ni las piezas.
- **RN-03** Una pieza queda asociada a su escuela, y a un arquero cuando corresponde.
- **RN-04** Una vez descargada una pieza, la plataforma no puede controlar lo que se publique: la responsabilidad del uso en redes es de la escuela, y así lo dice el texto de consentimiento.
- **RN-05** Las piezas de "cómo funciona" y "cómo lo ve la familia" no contienen datos reales de ningún arquero ni de ninguna escuela.
- **RN-06** Si se borra el video o la evaluación de origen, se descarta la pieza que dependía de ellos.
- **RN-07** Un arquero egresado o inactivo no genera sugerencias nuevas; sus piezas existentes se conservan hasta su vencimiento.

## 6. Datos involucrados
Ver [docs/03-modelo-de-datos.md](../docs/03-modelo-de-datos.md):
- `social_post`: `school_id`, `goalkeeper_id` (nulo si es genérica), `tipo` (`exercise_clip | progress | before_after | family_view | how_it_works`), `origen_tipo` y `origen_id` (video, evaluación o comparación), `texto`, `estado` (`sugerida | aprobada | descartada | publicada`), `vence_en`, `generada_en`, `aprobada_por`.
- `social_post_asset`: `school_id`, `social_post_id`, `formato` (`vertical | feed`), `tipo_archivo` (`image | video`), ruta del archivo generado.
- `consent`: nuevo tipo `uso_redes` ([spec 01](01-arqueros-y-fichas.md)).
- Configuración por escuela de tipos de pieza activos y del tope mensual.

## 7. Flujos

**F1 — Revisar sugerencias:** el admin entra a "Redes" → ve las piezas sugeridas → abre una, la mira, edita el texto → aprueba → descarga → la sube a Instagram desde su celular.

**F2 — Generar a pedido:** el admin elige un video o un arquero → "Preparar para Instagram" → el sistema prepara la pieza → la revisa y descarga.

**F3 — Consentimiento retirado:** el tutor retira el consentimiento de redes → las piezas pendientes del arquero se ocultan → se avisa al admin.

**F4 — Activar tipos de pieza:** el admin elige qué tipos quiere recibir.

## 8. Criterios de aceptación
- **CA-01** Dado un arquero con consentimiento de imagen y video pero sin consentimiento de redes, entonces no se generan piezas con él.
- **CA-02** Dada una pieza sugerida de un arquero, cuando el tutor retira el consentimiento de redes, entonces la pieza deja de verse en el listado del admin.
- **CA-03** Dado un profesor, cuando intenta abrir la sección de redes, entonces se le deniega.
- **CA-04** Dado un tutor, cuando abre el portal, entonces no ve ninguna pieza de redes.
- **CA-05** Dada una pieza con un arquero real, cuando se descarga, entonces queda registrada en la auditoría con quién y cuándo.
- **CA-06** Dada una pieza con un arquero, entonces muestra solo su nombre de pila y no incluye apellido, club ni datos personales.
- **CA-07** Dada una sugerencia no revisada durante 30 días, entonces se descarta sola.
- **CA-08** Dada una escuela que alcanzó su tope mensual de piezas, cuando intenta generar otra, entonces se le informa claramente y el tope se renueva el mes siguiente.
- **CA-09** Dada una pieza de "cómo funciona", entonces no contiene datos de ningún arquero real.
- **CA-10** Dado un video de origen que se borra, entonces la pieza que dependía de él se descarta.

## 9. Casos borde
- Escuela sin videos publicados ni evaluaciones: solo recibe piezas genéricas.
- Arquero con dos tutores, uno que dio el consentimiento de redes y otro que lo retiró: vale el estado más reciente.
- Video procesado en un proveedor que no permite generar una copia: la pieza queda marcada con error y puede reintentarse.
- Pieza ya descargada y consentimiento retirado después: se ocultan las pendientes; lo ya publicado en redes lo retira la escuela (spec 01, RF-31c).
- Escuela suspendida: no se generan sugerencias nuevas y las existentes quedan ocultas hasta reactivarla.
- Nombre de pila repetido o muy largo: se recorta para que entre en la pieza.
- Regeneración de la misma pieza: se reemplaza la anterior y no se cuenta dos veces contra el tope.

## 10. Seguridad y privacidad
- Son imágenes de menores en un uso público: es el uso de mayor riesgo del sistema. Por eso el consentimiento es aparte, opcional, informado y revocable.
- Las piezas se guardan privadas, con URL firmadas de corta duración, y solo el admin de la escuela las ve.
- La generación usa una copia interna del video; no se activa la descarga para la familia.
- Las descargas quedan auditadas. No se incluyen datos personales más allá del nombre de pila.
- Aislamiento por `school_id` en todas las consultas.
- El texto del consentimiento de redes debe revisarse con un profesional antes de lanzar.

## 11. Preguntas abiertas
1. Técnica para generar las piezas de video (por ejemplo, un proceso propio con FFmpeg o una función del proveedor de video): se decide en arquitectura; la spec es independiente.
2. Valor del tope mensual de piezas por escuela y costo de procesamiento a estimar.
3. Cuántos tipos de pieza lanzar primero. Se propone empezar por clip de ejercicio, progreso y antes y después.
4. ¿Las piezas genéricas del operador llevan la marca de la plataforma además de la de la escuela? Pendiente de definir.
