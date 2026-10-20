# 04 — Portal de familia

- **Estado:** Aprobada
- **Depende de:** [00 — Auth y tenancy](00-auth-y-tenancy.md), [01 — Arqueros y fichas](01-arqueros-y-fichas.md), [02 — Evaluaciones](02-evaluaciones.md), [03 — Videos](03-videos.md)
- **Se completa con:** specs de asistencia y de pagos (fuentes de los datos que el portal muestra)

## 1. Objetivo
Dar a cada tutor un espacio simple, con la marca de la escuela, donde ver la evolución de su arquero, sus videos, su asistencia y el estado de su cuota, sin crear cuenta ni recordar contraseñas.

## 2. Alcance
**Entra:**
- Ingreso con código y PIN, y asistente de primer ingreso (PIN y consentimiento).
- Inicio con resumen del arquero.
- Selector de arquero para tutores con varios hijos.
- Evolución: radar, comparativo ingreso vs. hoy, línea de tiempo por categoría, historial con evaluaciones y notas.
- Videos con comentarios.
- Asistencia (porcentaje y calendario).
- Cuota (estado del mes e historial de pagos).
- Datos de contacto de la escuela.
- Mis datos (mail y teléfono), cambio de PIN, cerrar sesión.
- Privacidad: retiro del consentimiento, política de privacidad y términos.
- Marca de la escuela (logo, nombre, un color principal).
- Instalación como PWA.
- Indicador de novedades.

**No entra (MVP):**
- Mensajes o comentarios de la familia.
- Descarga de videos o informes.
- Línea de tiempo con fotos e hitos.
- Pago online de cuotas.
- Link mágico.
- Notificaciones push.
- Varios idiomas.

## 3. Actores
| Actor | Descripción |
|---|---|
| Tutor | Familiar del arquero con código y PIN. Es el usuario del portal. |
| Arquero mayor de edad | Es su propio tutor (spec 01) y usa el portal igual. |
| Admin | Configura la marca y los datos de contacto de la escuela. |

## 4. Requisitos funcionales

### Ingreso y sesión
- **RF-01** El tutor ingresa en `/{slug}` con su código y PIN (spec 00); la pantalla de ingreso usa la marca de la escuela.
- **RF-02** La sesión dura 30 días y se puede usar en varios dispositivos a la vez.
- **RF-03** El tutor puede cerrar sesión en el dispositivo actual o en todos.
- **RF-04** Si la escuela está suspendida, se muestra un mensaje neutro ("El servicio no está disponible, contactá a la escuela") sin datos del arquero.
- **RF-05** Si la sesión vence o fue revocada, se vuelve al ingreso sin perder el arquero elegido.

### Primer ingreso
- **RF-06** En el primer ingreso se pide, en este orden, **cambiar el PIN** (obligatorio) y **aceptar el consentimiento** de imagen y video.
- **RF-07** El texto del consentimiento es el estándar de la plataforma, con enlaces a la política de privacidad y los términos.
- **RF-08** Si el tutor no acepta el consentimiento, puede usar el portal pero no se le muestran videos ni fotos; el consentimiento queda como aviso visible para aceptarlo cuando quiera.

### Selector de arquero
- **RF-09** Un tutor con varios arqueros ve un selector fijo en la parte superior que cambia de arquero desde cualquier pantalla.
- **RF-10** Se recuerda el último arquero elegido entre sesiones.
- **RF-11** Con un solo arquero no se muestra el selector.

### Inicio
- **RF-12** Muestra para el arquero elegido: radar actual, último video publicado, estado de la cuota del mes y resumen de asistencia, con acceso a cada sección.
- **RF-13** Si falta algún dato (sin evaluaciones, sin videos), se muestra un estado vacío claro.

### Evolución
- **RF-14** Radar de estado actual con la evaluación publicada más reciente.
- **RF-15** Comparativo ingreso vs. hoy y línea de tiempo por categoría, que aparecen desde la segunda evaluación publicada (spec 02).
- **RF-16** Historial cronológico que mezcla evaluaciones publicadas y notas marcadas como visibles; cada evaluación muestra puntajes, comentarios y videos de respaldo publicados.
- **RF-17** Las categorías sin evaluar se muestran como tales, sin inventar valores.
- **RF-18** Se ven las medidas (altura y peso) con su evolución.

### Videos
- **RF-19** Lista de videos publicados del arquero, por fecha, con filtro por tema.
- **RF-20** Reproductor con comentarios con marca de tiempo; tocar un comentario salta al momento del video. Se muestra el nombre del profesor autor.
- **RF-21** Sin descarga. Si el consentimiento fue retirado o aún no se dio, no se muestran videos.

### Asistencia
- **RF-22** Porcentaje de asistencia del período y calendario del mes con presentes y ausentes.
- **RF-23** Para arqueros inactivos o egresados no se muestra asistencia nueva.

### Cuota
- **RF-24** Estado de la cuota actual (al día, por vencer, vencida) con su fecha de pago y de vencimiento. No se muestran montos (spec 06).
- **RF-25** Historial de cuotas pagadas con su fecha de pago.
- **RF-26** Para arqueros exentos, inactivos o egresados no se muestra la sección de cuota.

### Contacto de la escuela
- **RF-27** Sección con teléfono o WhatsApp, mail, dirección y horarios de la escuela, cargados por el admin.

### Mis datos
- **RF-28** El tutor puede ver y cambiar su mail y su teléfono; el nombre lo cambia la escuela.
- **RF-28b** El tutor ve su propio código de acceso en Mis datos. El PIN nunca se muestra.
- **RF-29** El tutor puede cambiar su PIN (con las reglas de la spec 00).
- **RF-30** Los cambios de datos y de PIN quedan auditados.

### Privacidad
- **RF-31** Sección "Privacidad" con el estado del consentimiento, política de privacidad y términos.
- **RF-32** El tutor puede retirar el consentimiento con confirmación y una explicación clara de que videos y fotos del arquero se ocultarán al instante.
- **RF-33** Si el consentimiento fue retirado, el tutor puede volver a darlo desde la misma sección.

### Arqueros inactivos o egresados
- **RF-34** La familia conserva acceso de lectura a todo el historial (evaluaciones, videos, medidas); no se muestran asistencia ni cuotas nuevas.

### Marca
- **RF-35** El portal muestra el logo, el nombre y un color principal de la escuela.
- **RF-36** El sistema garantiza buen contraste: ajusta o rechaza colores que dejen ilegibles los textos o botones.
- **RF-37** Si la escuela no cargó logo o color, se usa un diseño neutro con el nombre.

### Novedades
- **RF-38** Se marca como "nuevo" lo publicado desde la última visita del tutor (evaluaciones, videos, notas visibles), por arquero y por tutor, limitado a los últimos 30 días.
- **RF-39** El indicador desaparece al abrir el elemento.

### Tema visual
- **RF-39b** El portal se muestra por defecto en **modo claro**, con un diseño cuidado pensado para familias.
- **RF-39c** El usuario puede cambiar a modo oscuro con un control visible; la elección se recuerda en el dispositivo. No sigue automáticamente la preferencia del sistema.
- **RF-39d** El color principal de la escuela se valida en ambos modos (RF-36).
- **RF-39e** Lo mismo aplica a la aplicación del staff (profesores y admin).

### Instalación
- **RF-40** El portal es instalable como PWA, con icono y nombre de la escuela; se sugiere instalarlo después del primer ingreso.

## 5. Reglas de negocio
- **RN-01** El tutor solo ve a los arqueros vinculados a él en su escuela.
- **RN-02** La familia solo ve evaluaciones publicadas, notas marcadas como visibles y videos publicados.
- **RN-03** El contacto de emergencia nunca se muestra en el portal.
- **RN-04** Sin consentimiento vigente no se muestran videos ni fotos del arquero.
- **RN-05** El portal es solo de lectura, salvo los datos propios del tutor, el PIN y el consentimiento.
- **RN-06** Un tutor no ve datos de otros tutores del mismo arquero.
- **RN-07** Una escuela suspendida no muestra datos a ningún tutor.

## 6. Datos involucrados
Ver [docs/03-modelo-de-datos.md](../docs/03-modelo-de-datos.md). El portal lee de: `goalkeeper`, `goalkeeper_measurement`, `evaluation`, `evaluation_score`, `note`, `video`, `video_comment`, `evaluation_video`, `attendance`, `fee`, `payment`, `consent`.
Cambios necesarios:
- `school`: agregar `color_principal`, `telefono_contacto`, `whatsapp`, `email_contacto`, `direccion`, `horarios` (reemplaza `color_secundario`).
- `guardian_seen` (guardian_id, goalkeeper_id, school_id, tipo, referencia_id, visto_en) o una marca de "última visita" por sección, para el indicador de novedades.
- `guardian`: agregar `primer_ingreso_completado`.

## 7. Flujos

**F1 — Primer ingreso:** el tutor entra con código y PIN inicial → cambia el PIN → ve y acepta el consentimiento → llega al inicio → se sugiere instalar.

**F2 — Uso habitual:** abre el portal ya instalado → llega al inicio con el último arquero elegido → ve lo nuevo → entra a Evolución o Videos.

**F3 — Varios hijos:** cambia de arquero con el selector → todas las pantallas se actualizan.

**F4 — Mirar un video:** abre Videos → elige uno → reproduce → toca un comentario → el video salta a ese momento.

**F5 — Retirar el consentimiento:** Privacidad → "Retirar" → lee la explicación → confirma → los videos y fotos del arquero se ocultan al instante.

**F6 — Actualizar contacto:** Mis datos → cambia el mail → recibe los siguientes avisos en el nuevo mail.

## 8. Criterios de aceptación
- **CA-01** Dado un tutor en su primer ingreso, cuando entra, entonces no puede llegar al inicio sin cambiar el PIN.
- **CA-02** Dado un tutor que no aceptó el consentimiento, cuando abre Videos, entonces ve un aviso y ningún video.
- **CA-03** Dado un tutor con dos hijos, cuando elige al segundo, entonces todas las pantallas muestran solo los datos de ese hijo.
- **CA-04** Dado un tutor con sesión vencida, cuando recarga el portal, entonces vuelve al ingreso y conserva el arquero elegido.
- **CA-05** Dada una escuela suspendida, cuando un tutor entra, entonces ve un mensaje neutro sin ningún dato.
- **CA-06** Dado un arquero con una sola evaluación publicada, entonces el portal muestra el radar actual y el historial, y un aviso de que la evolución se verá con la próxima.
- **CA-07** Dado un color principal con poco contraste, entonces el sistema lo ajusta o lo rechaza.
- **CA-08** Dado un arquero egresado, entonces la familia ve el historial pero no ve asistencia ni cuota nuevas.
- **CA-09** Dada una evaluación publicada hoy, cuando el tutor entra, entonces ve la etiqueta "nuevo", que desaparece al abrirla.
- **CA-10** Dado un tutor que retira el consentimiento, entonces ningún video ni foto del arquero se muestra al instante en ningún dispositivo.
- **CA-11** Dado un tutor que cierra sesión en todos los dispositivos, entonces cada dispositivo debe volver a ingresar.
- **CA-12** Dado un tutor, cuando intenta abrir la URL de un arquero que no es suyo, entonces recibe acceso denegado.

## 9. Casos borde
- Tutor con un hijo activo y otro egresado: el selector muestra a ambos, con el estado de cada uno.
- Tutor de arqueros en estados distintos de consentimiento: el consentimiento es por arquero, y el portal lo trata por arquero.
- Tutor que cambia el mail a uno ya usado por otro tutor de la misma escuela: se permite; el mail no es un identificador de acceso.
- Sin evaluaciones, sin videos, sin cuotas: cada sección muestra un estado vacío.
- Instalado como PWA y sesión expirada: vuelve al ingreso desde la app.
- Sin conexión: se muestra un aviso claro; el MVP no funciona sin conexión.
- Dos hermanos con el mismo tutor y distinto consentimiento: el video de uno puede mostrarse y el del otro no.
- Logo muy grande o con fondo transparente: se escala y se muestra sobre un fondo neutro.

## 10. Seguridad y privacidad
- Toda consulta del portal valida el vínculo tutor–arquero y el `school_id` en el servidor.
- Sin links públicos; los videos usan URL firmadas (spec 03).
- Solo se muestra información marcada como visible para la familia.
- Los cambios de datos, de PIN y de consentimiento quedan auditados.
- El portal no usa cookies de seguimiento ni de terceros, ni recolecta analítica de uso en el MVP; solo registros técnicos de errores.
- El código de acceso es visible en Mis datos; el PIN nunca.

## 11. Preguntas abiertas
Ninguna pendiente de decisión. Dependen de las specs de asistencia y de pagos: los datos exactos de calendario, porcentaje y cuotas que consume el portal.
