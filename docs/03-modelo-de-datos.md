# 03 — Modelo de datos

Una sola base Postgres (Supabase). **Toda tabla de negocio lleva `school_id`** y tiene política RLS que lo compara con el de la sesión. Las tablas globales (rúbrica) no llevan `school_id` y son de solo lectura.

Este documento refleja las specs [00](../specs/00-auth-y-tenancy.md) a [07](../specs/07-planes-y-suscripciones.md) y, para lo marcado *(Fase 2)*, la [08](../specs/08-contenido-redes.md) y la sección 12 de la [03](../specs/03-videos.md).

## Entidades

### Plataforma
- `school` (id, nombre, slug, logo_url, color_principal, telefono_contacto, whatsapp, email_contacto, direccion, horarios, estado: `activa | suspendida`, suspendida_en)
  - `slug`: único, 3–30 caracteres (minúsculas, números, guiones), fijo tras el alta, con palabras reservadas.
  - `suspendida_en` marca el inicio de los 90 días de conservación de datos.
- `subscription` (id, school_id único, precio_mensual_ars, tope_arqueros, tope_minutos_video, prueba_hasta, cubierto_hasta, suspendida_manual) — condiciones a medida por escuela, sin catálogo de planes (spec 07).
  - El estado `prueba | al_dia | vencida | suspendida` se **calcula por fechas** (gracia de 10 días tras `cubierto_hasta`); solo se guarda la suspensión manual.
- `subscription_payment` (id, school_id, fecha_pago, monto_ars, meses_cubiertos, nota, registrado_por, cubierto_antes, cubierto_despues, anulado) — cada pago suma sus meses a `cubierto_hasta`.
- `subscription_change` (id, school_id, campo, valor_anterior, valor_nuevo, nota, hecho_por, hecho_en) — historial de condiciones.
- `platform_alert` (id, tipo, school_id, creada_en, resuelta_en, descartada, avisada_en) — alertas del operador: pruebas por terminar o sin cerrar, vencimientos, gracia terminada, topes de arqueros (90% / superado) y de video (80% / 100%).
  - Solo el operador accede a `subscription*` y `platform_alert`.

### Usuarios e invitaciones
- `profile` (user_id, school_id, rol: `school_admin | coach | platform_admin`, nombre, activo)
  - Una cuenta pertenece a una sola escuela. Una escuela puede tener varios admins.
- `invitation` (id, school_id, email, rol, token_hash, vence_en, usada_en) — vence a los 7 días; token de un solo uso.

### Estructura
- `group` (id, school_id, nombre, horario opcional, archivado) — organizativo, no restringe acceso
- `goalkeeper_group` (goalkeeper_id, group_id, school_id) — un arquero puede estar en varios grupos

### Arqueros y familias
- `goalkeeper` (id, school_id, nombre, apellido, fecha_nacimiento, fecha_ingreso, pie_habil, nivel: `inicial | intermedio | avanzado`, club_actual, categoria, objetivo, foto_url, estado: `activo | inactivo | egresado`, emergencia_nombre, emergencia_telefono, emergencia_parentesco, inicio_cuotas, exento, nota_exento)
- `goalkeeper_measurement` (id, school_id, goalkeeper_id, fecha, altura_cm, peso_kg, registrada_por)
- `guardian` (id, school_id, nombre, apellido, telefono, email opcional, codigo_acceso, pin_hash, pin_cambiado, pin_intentos_fallidos, bloqueado_hasta, primer_ingreso_completado)
- `goalkeeper_guardian` (goalkeeper_id, guardian_id, school_id, parentesco: `madre | padre | tutor | abuelo | otro | el_mismo`)
  - Todo arquero tiene al menos un tutor; un arquero mayor de 18 años puede ser su propio tutor (`el_mismo`).
- `consent` (id, school_id, goalkeeper_id, guardian_id, tipo: `imagen_video` | `uso_redes` *(Fase 2)*, otorgado_en, retirado_en)
  - Consentimiento **vigente** = otorgado y no retirado. Basta uno de los tutores del arquero. Se conserva el historial.
  - `uso_redes` es independiente y opcional; para generar una pieza de redes hacen falta ambos tipos vigentes.
- `guardian_session` (id, school_id, guardian_id, expira_en, revocada)
- `guardian_seen` (guardian_id, goalkeeper_id, school_id, seccion, visto_en) — novedades "nuevo" del portal (últimos 30 días)

### Progreso
- `rubric_version` (id, version, vigente_desde) — global
- `rubric_category` (id, rubric_version_id, clave, nombre, orden, guia_bajo, guia_medio, guia_alto) — **global, fija**
  - Categorías: atajada, juego aéreo, juego con los pies, posicionamiento, reflejos, comunicación, físico/coordinación, mentalidad.
- `evaluation` (id, school_id, goalkeeper_id, autor_id, rubric_version_id, fecha, tipo: `ingreso | periodica`, comentario, estado: `borrador | publicada`, publicada_en)
  - A lo sumo una evaluación `ingreso` por arquero. Fecha no futura.
  - `notified_at`: se completa al mandar el mail de publicación; republicar no vuelve a avisar. Solo se evalúa a arqueros activos (disparador en la base). Un puntaje omitido simplemente no tiene fila.
- `evaluation_score` (evaluation_id, category_id, puntaje 1–10 opcional, comentario opcional, school_id)
- `evaluation_revision` (id, school_id, evaluation_id, editado_por, editado_en, detalle)
- `evaluation_video` (evaluation_id, video_id, school_id)
- `note` (id, school_id, goalkeeper_id, autor_id, texto, visible_familia, creada_en)
- `guardian_seen` (guardian_id, goalkeeper_id, school_id, tipo: `evaluation | note | video`, ref_id, visto_en) — indicador "nuevo" del portal; solo servidor.

### Videos
- `video` (id, school_id, goalkeeper_id, autor_id, proveedor, proveedor_asset_id, titulo, tema, duracion_seg, estado_proceso: `subiendo | procesando | listo | error`, estado_publicacion: `borrador | publicado`, subido_en, publicado_en)
  - `tema`: una categoría de la rúbrica u `otro`.
  - Minutos usados por escuela = suma de `duracion_seg` de sus videos no eliminados.
- `video_comment` (id, school_id, video_id, autor_id, segundo opcional, texto)
  - Un comentario dictado por voz (Fase 2) se guarda igual que uno escrito: solo el texto. El audio no se conserva.
- `video_annotation` *(Fase 2)* (id, school_id, video_id, autor_id, segundo, comentario_id opcional, trazos) — dibujo vectorial sobre un cuadro del video; `trazos` guarda puntos en coordenadas relativas (0 a 1), color y grosor. Máximo 20 por video. Hereda estado y visibilidad del video.
- `video_comparison` *(Fase 2)* (id, school_id, goalkeeper_id, autor_id, video_a_id, video_b_id, titulo opcional, nota opcional, estado_publicacion: `borrador | publicado`, publicado_en) — ambos videos del mismo arquero; solo se publica si ambos están publicados.

### Contenido para redes *(Fase 2)*
- `social_post` (id, school_id, goalkeeper_id opcional, tipo: `exercise_clip | progress | before_after | family_view | how_it_works`, origen_tipo, origen_id, texto, estado: `sugerida | aprobada | descartada | publicada`, generada_en, vence_en, aprobada_por)
  - Pieza sugerida para Instagram. Solo `school_admin` la ve. Se genera solo con consentimiento de imagen y video y de redes vigentes (spec 08).
- `social_post_asset` (id, school_id, social_post_id, formato: `vertical | feed`, tipo_archivo: `image | video`, ruta) — archivo generado, privado, con URL firmada.

### Asistencia
- `attendance_session` (id, school_id, group_id, fecha, estado: `abierta | suspendida`, motivo_suspension, creada_por) — único por (`group_id`, `fecha`)
- `attendance_entry` (id, school_id, session_id, goalkeeper_id, estado: `sin_marcar | presente | ausente | justificada`, invitado, motivo interno)
- `attendance_revision` (id, school_id, entry_id, editado_por, editado_en, valor_anterior, valor_nuevo)

### Cuotas y avisos
- `fee` (id, school_id, goalkeeper_id, serie_inicio, numero, fecha_pago, vence_el, estado guardado: `abierta | pagada | anulada`, pagada_en, automatica, nota, registrada_por) — **sin monto**; pendiente / por vencer / vencida se calculan por fecha (spec 06). `serie_inicio` (`series_start_on`) es el inicio de cuotas con el que se generó: único por (arquero, serie, número).
- `fee_revision` (id, school_id, fee_id, editado_por, editado_en, accion, estado y fecha de pago anteriores y nuevos, nota)
- `notification_log` (id, school_id, tipo: `cuota_5_antes | cuota_dia_pago | cuota_vencimiento | cuota_3_despues | evaluacion_publicada | video_publicado | consentimiento_retirado | ...`, fee_id opcional, destinatario, enviado_en, estado)
- `admin_alert` (id, school_id, tipo: `faltas_seguidas | consentimiento_retirado | ...`, goalkeeper_id, creada_en, resuelta_en)
- `audit_log` (id, school_id, actor, accion, entidad, entidad_id, creado_en)

## RLS (política general)
Para cada tabla con `school_id`:
- `SELECT/INSERT/UPDATE/DELETE` permitidos solo si `school_id = auth.school_id()` (función que lee el claim de la sesión).
- Los `coach` ven todos los arqueros de su escuela; los grupos no restringen acceso. Cargan evaluaciones, notas, videos, medidas y asistencia de cualquier arquero activo. No editan datos personales ni borran.
- `fee`, `fee_revision` y los avisos de cuotas: solo `school_admin`.
- Borradores (evaluaciones, videos, comparaciones): visibles solo para su autor y los admins.
- `social_post` y `social_post_asset`: solo `school_admin`; nunca visibles para la familia ni para el profesor.
- Familia: las lecturas pasan por una vista o función que filtra por tutor vinculado, `estado = publicada/publicado`, `visible_familia = true` en notas y consentimiento vigente para videos y fotos. Nunca devuelven el contacto de emergencia ni notas internas ni motivos de justificación.
- `rubric_*`: lectura para todos, escritura solo por el operador.
- `platform_admin` accede por rol de servicio, nunca desde el cliente.
- `subscription`, `subscription_payment`, `subscription_change` y `platform_alert`: solo rol de servicio (operador). El admin de escuela ve su uso y vencimiento mediante una función que no expone precio ni pagos.

## Índices clave
- `(school_id, goalkeeper_id, fecha)` en evaluaciones, medidas y asistencia.
- `(group_id, fecha)` único en sesiones de asistencia.
- `(school_id, goalkeeper_id, fecha_pago)` en cuotas; único `(goalkeeper_id, numero)`.
- `codigo_acceso` único; `slug` único.

## Notas
- Dar de baja a un arquero = estado `inactivo` o `egresado`; conserva todo el historial.
- **Eliminación definitiva** (solo admin, con confirmación): borra ficha, medidas, evaluaciones, notas, asistencia, cuotas y videos (incluidos los del proveedor externo). Queda auditoría sin datos personales.
- Una escuela suspendida conserva sus datos 90 días; luego el operador decide el borrado. La suspensión y la reactivación son siempre manuales.
- Cuentan para el tope de arqueros los activos (incluidos exentos); no cuentan inactivos ni egresados.
- Se guarda el `proveedor` de video para poder migrar.
- Las fechas de cuotas y avisos se manejan en zona horaria de Argentina.
