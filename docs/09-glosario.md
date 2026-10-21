# 09 — Glosario español–inglés

Los nombres de código, tablas y columnas van **en inglés**; la interfaz y los textos, **en español (es-AR)**. Este glosario traduce los nombres usados en las specs y en el [modelo de datos](03-modelo-de-datos.md).

## Tablas
| Español | Tabla |
|---|---|
| escuela | `school` |
| suscripción | `subscription` |
| pago de la suscripción | `subscription_payment` |
| cambio de condiciones | `subscription_change` |
| alerta del operador | `platform_alert` |
| perfil de staff | `profile` |
| invitación | `invitation` |
| grupo | `group` (en SQL: `groups`, porque `group` es palabra reservada) |
| arquero | `goalkeeper` |
| arquero–grupo | `goalkeeper_group` |
| medida física | `goalkeeper_measurement` |
| tutor | `guardian` |
| arquero–tutor | `goalkeeper_guardian` |
| consentimiento | `consent` |
| sesión de tutor | `guardian_session` |
| novedades vistas | `guardian_seen` |
| versión de la rúbrica | `rubric_version` |
| categoría de la rúbrica | `rubric_category` |
| evaluación | `evaluation` |
| puntaje de la evaluación | `evaluation_score` |
| revisión de evaluación | `evaluation_revision` |
| video de respaldo | `evaluation_video` |
| nota | `note` |
| video | `video` |
| comentario de video | `video_comment` |
| anotación de video (Fase 2) | `video_annotation` |
| comparación de videos (Fase 2) | `video_comparison` |
| pieza para redes (Fase 2) | `social_post` |
| archivo de la pieza (Fase 2) | `social_post_asset` |
| sesión de asistencia | `attendance_session` |
| marca de asistencia | `attendance_entry` |
| revisión de asistencia | `attendance_revision` |
| cuota | `fee` |
| revisión de cuota | `fee_revision` |
| registro de envíos | `notification_log` |
| aviso al admin | `admin_alert` |
| auditoría | `audit_log` |

## Roles
`platform_admin` (operador), `school_admin` (admin de escuela), `coach` (profesor), `guardian` (tutor/familia).

## Columnas frecuentes
| Español | Inglés |
|---|---|
| nombre (persona) / apellido | `first_name` / `last_name` |
| nombre (escuela, grupo) | `name` |
| fecha_nacimiento | `birth_date` |
| fecha_ingreso | `joined_on` |
| pie_habil | `preferred_foot` |
| nivel (inicial, intermedio, avanzado) | `level` (`beginner`, `intermediate`, `advanced`) |
| club_actual | `current_club` |
| categoria | `category` |
| objetivo | `goal` |
| foto_url | `photo_url` |
| estado | `status` |
| activo / inactivo / egresado | `active` / `inactive` / `graduated` |
| emergencia_nombre / _telefono / _parentesco | `emergency_name` / `emergency_phone` / `emergency_relationship` |
| inicio_cuotas | `fees_start_on` |
| exento / nota_exento | `fee_exempt` / `fee_exempt_note` |
| altura_cm / peso_kg | `height_cm` / `weight_kg` |
| fecha | `date` |
| telefono | `phone` |
| codigo_acceso | `access_code` |
| pin_cambiado | `pin_changed` |
| pin_intentos_fallidos | `pin_failed_attempts` |
| bloqueado_hasta | `locked_until` |
| primer_ingreso_completado | `first_login_completed` |
| parentesco | `relationship` (`mother`, `father`, `guardian`, `grandparent`, `other`, `self`) |
| otorgado_en / retirado_en | `granted_at` / `revoked_at` |
| expira_en / revocada | `expires_at` / `revoked` |
| visto_en / seccion | `seen_at` / `section` |
| horario / horarios | `schedule` / `hours` |
| archivado | `archived` |
| autor_id | `author_id` |
| creada_por / registrada_por | `created_by` / `recorded_by` |
| editado_por / editado_en | `edited_by` / `edited_at` |
| nota (texto) / comentario | `note` / `comment` |
| texto | `body` |
| motivo | `reason` |
| visible_familia | `visible_to_family` |

## Evaluaciones
| Español | Inglés |
|---|---|
| tipo: ingreso / periódica | `type`: `entry` / `periodic` |
| estado: borrador / publicada | `status`: `draft` / `published` |
| publicada_en | `published_at` |
| puntaje | `score` |
| guía baja / media / alta | `guide_low` / `guide_mid` / `guide_high` |

Categorías de la rúbrica (`key`): `save_technique` (atajada), `aerial_play` (juego aéreo), `footwork` (juego con los pies), `positioning` (posicionamiento), `reflexes` (reflejos), `communication` (comunicación), `physical_coordination` (físico/coordinación), `mindset` (mentalidad).

## Videos
| Español | Inglés |
|---|---|
| titulo / tema | `title` / `topic` |
| duracion_seg | `duration_sec` |
| estado_proceso: subiendo / procesando / listo / error | `processing_status`: `uploading` / `processing` / `ready` / `error` |
| estado_publicacion: borrador / publicado | `publication_status`: `draft` / `published` |
| subido_en / publicado_en | `uploaded_at` / `published_at` |
| segundo | `second` |
| proveedor / proveedor_asset_id | `provider` / `provider_asset_id` |
| trazos (de una anotación) | `strokes` |
| comentario_id | `comment_id` |
| video_a_id / video_b_id | `video_a_id` / `video_b_id` |
| titulo / nota (de la comparación) | `title` / `note` |

## Contenido para redes (Fase 2)
| Español | Inglés |
|---|---|
| consentimiento de imagen y video / de uso en redes | `consent.type`: `media` / `social` (en las specs: `imagen_video` / `uso_redes`) |
| tipo de pieza: clip de ejercicio / progreso / antes y después / cómo lo ve la familia / cómo funciona | `exercise_clip` / `progress` / `before_after` / `family_view` / `how_it_works` |
| estado: sugerida / aprobada / descartada / publicada | `status`: `suggested` / `approved` / `discarded` / `published` |
| formato: vertical / feed | `format`: `vertical` / `feed` |
| tipo de archivo | `file_type`: `image` / `video` |
| origen_tipo / origen_id | `source_type` / `source_id` |
| vence_en / generada_en / aprobada_por | `expires_at` / `generated_at` / `approved_by` |

## Asistencia
| Español | Inglés |
|---|---|
| estado de sesión: abierta / suspendida | `status`: `open` / `suspended` |
| motivo_suspension | `suspension_reason` |
| estado de marca: sin_marcar / presente / ausente / justificada | `status`: `unmarked` / `present` / `absent` / `excused` |
| invitado | `is_guest` |
| valor_anterior / valor_nuevo | `old_value` / `new_value` |

## Cuotas
| Español | Inglés |
|---|---|
| numero | `number` |
| fecha_pago (fecha en que corresponde pagar) | `due_on` |
| vence_el (fin de la gracia) | `grace_until` |
| pagada_en | `paid_on` |
| estado guardado: pagada / anulada | `status`: `paid` / `void` |
| estado calculado: pendiente / por vencer / vencida | `upcoming` / `due_soon` / `overdue` |
| automatica | `is_automatic` |

## Suscripciones
| Español | Inglés |
|---|---|
| precio_mensual_ars | `monthly_price_ars` |
| tope_arqueros | `goalkeeper_limit` |
| tope_minutos_video | `video_minutes_limit` |
| prueba_hasta | `trial_until` |
| cubierto_hasta | `covered_until` |
| suspendida_manual | `manually_suspended` |
| estado calculado: prueba / al día / vencida / suspendida | `trial` / `current` / `overdue` / `suspended` |
| monto_ars / meses_cubiertos / fecha_pago / anulado | `amount_ars` / `months_covered` / `paid_on` / `voided` |
| valor_anterior / valor_nuevo | `old_value` / `new_value` |

## Escuela
| Español | Inglés |
|---|---|
| color_principal | `primary_color` |
| telefono_contacto / email_contacto | `contact_phone` / `contact_email` |
| direccion | `address` |
| estado: activa / suspendida | `status`: `active` / `suspended` |
| suspendida_en | `suspended_at` |

## Tipos de aviso (`notification_log`)
`fee_5_days_before`, `fee_due_day`, `fee_grace_ends`, `fee_3_days_after`, `evaluation_published`, `video_published`, `consent_revoked`.

## Reglas de nomenclatura
- Tablas en singular, `snake_case` (excepto `groups`, plural por ser palabra reservada).
- Claves foráneas: `<tabla>_id` (por ejemplo `school_id`, `goalkeeper_id`).
- Fechas: `*_on` para fechas de calendario, `*_at` para fecha y hora.
- Valores de estado en inglés y minúsculas; la interfaz los muestra en español.
