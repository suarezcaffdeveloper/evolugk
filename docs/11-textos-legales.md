# 11 — Textos legales (borrador para revisión profesional)

- **Estado:** Borrador. **No es asesoramiento legal.** Hay que revisarlo y aprobarlo un profesional (abogado/a con experiencia en protección de datos personales en Argentina) antes del lanzamiento.
- **Dónde están:** `apps/web/src/lib/legal-text.ts` (política de privacidad y términos y condiciones) y `apps/web/src/lib/consent-text.ts` (consentimiento de imagen y video).
- **Dónde se ven:** `/privacidad` y `/terminos` (públicas), pie de página de cada escuela, sección *Privacidad* del portal y asistente de primer ingreso (enlaces). El consentimiento se muestra en el asistente y en *Privacidad*.

## 1. Cómo pasarlo a "aprobado"
1. Entregar al profesional los tres textos y este documento.
2. Completar los datos de `LEGAL_OPERATOR` (razón social, CUIT, domicilio, mail de contacto) y la jurisdicción del punto 11 de los términos. Todo lo que está entre corchetes en los textos está pendiente.
3. Aplicar los cambios del profesional en los textos.
4. Subir `LEGAL_VERSION` y `CONSENT_TEXT_VERSION` (cada consentimiento guarda la versión que la persona vio al aceptar) y poner `LEGAL_IS_DRAFT = false`. Una prueba impide quitar la marca de borrador mientras queden corchetes sin completar.

> Los consentimientos que ya se hayan dado con un texto anterior conservan su versión. Si el profesional cambia el alcance del consentimiento, hay que decidir si se pide aceptarlo de nuevo.

## 2. Qué afirman los textos (para verificar contra el producto)
Cada afirmación sale de una spec o del código; si algo deja de ser cierto hay que cambiar el texto.

| Afirmación | Origen |
|---|---|
| Cada escuela es responsable de los datos de sus arqueros y familias; EvoluGK los trata por su cuenta. | Decisión de producto; **confirmar con el profesional** (responsable vs. encargado). |
| Datos del arquero: nombre, apellido, nacimiento, ingreso, altura y peso, pie hábil, nivel, club, categoría, objetivo, grupos, estado; evaluaciones, notas y asistencia; fotos y videos con consentimiento. | Specs 01, 02, 03 y 05. |
| Contacto de emergencia: solo el equipo de la escuela; nunca en el portal. | Spec 01 (RF-06) y spec 04 (RN-03). |
| Datos del tutor: nombre, apellido, teléfono, mail opcional, código de acceso y PIN cifrado (hash scrypt); datos de sesión. | Spec 00 y código (`server/guardian`). |
| Registro de auditoría de acciones sensibles. | Spec 00 y `audit_log`. |
| Sin ventas de datos, publicidad ni perfiles comerciales. Sin cookies de publicidad ni analítica; solo cookie de sesión, cookie del último arquero elegido y preferencia de tema en el dispositivo; registros técnicos de errores. | Spec 04, sección 10; arquitectura. |
| El consentimiento de imagen y video lo da un tutor (basta uno), por arquero; se guarda quién, cuándo y la versión del texto; se retira desde el portal y los videos y fotos se ocultan al instante; la escuela decide el borrado. | Specs 01 y 04; código (`server/guardian/portal.ts`). |
| Uso en redes sociales: consentimiento aparte, independiente y opcional. | Spec 01 (RF-31b), Fase 2. |
| Proveedores: Supabase (base y cuentas), Vercel (aplicación), Mux (video; recibe videos e identificador, no datos personales), Resend (mails). | Arquitectura y plan; **los proveedores pueden cambiar**: actualizar el texto si cambian. |
| Posible almacenamiento fuera de la Argentina y salvaguardas. | **Confirmar regiones reales de cada proveedor** y el mecanismo de transferencia internacional con el profesional. |
| Conservación: mientras la escuela use la plataforma; arquero inactivo o egresado conserva el historial; eliminación definitiva borra ficha, medidas, evaluaciones, notas y videos (incluido el proveedor) y deja auditoría sin datos personales; escuela suspendida: 90 días y luego decide el operador. | Specs 00 (RN-09) y 01 (RF-40 a RF-42). |
| Seguridad: aislamiento por escuela en la base, PIN cifrado, 5 intentos fallidos bloquean 15 minutos, sesión de 30 días revocable, videos privados con URL firmadas de corta duración y sin descarga. | Specs 00, 03 y 04; código. |
| Derechos de acceso, rectificación y supresión según Ley 25.326; acceso gratuito cada 6 meses; denuncia ante la Agencia de Acceso a la Información Pública. | Ley 25.326; **verificar redacción exigida**. |

## 3. Funciones que los textos mencionan y todavía no existen
Los textos describen el producto completo del MVP. Estas cosas están en las specs pero **aún no están construidas**; hay que tenerlas antes del lanzamiento o ajustar el texto:
- Aviso a los admins al retirarse un consentimiento, por mail y dentro del sistema (spec 01, RF-30b).
- Videos con URL firmadas y sin descarga, y su borrado en el proveedor (hito 4).
- Mails de avisos a las familias: evaluación o video publicado, cuotas (hitos 3, 4 y 6).
- Asistencia, evaluaciones y notas (hitos 3 y 5).
- Eliminación definitiva con borrado de videos en el proveedor (la parte de la ficha ya existe; los videos llegan con el hito 4).

## 4. Preguntas para el profesional
1. ¿Es correcto el reparto de roles (la escuela como responsable y EvoluGK como encargado)? ¿Hace falta un contrato o anexo de tratamiento de datos entre EvoluGK y cada escuela?
2. Alcance y forma del consentimiento de imagen y video por parte de tutores y de arqueros mayores de 18. ¿Alcanza el modelo "basta con uno de los tutores"?
3. Registro de la base de datos ante el organismo de control y obligaciones de la escuela y de EvoluGK.
4. Transferencia internacional de datos (proveedores en el exterior): mecanismo y texto necesarios.
5. Edad mínima y situaciones especiales (menores de 13, tutores separados, tutor que retira el consentimiento cuando el otro lo dio).
6. Plazos de conservación (en particular tras el egreso) y qué hacer ante un pedido de supresión de la familia.
7. Cláusulas de responsabilidad, jurisdicción y aplicación de la ley de defensa del consumidor a los términos.
8. Texto del consentimiento de redes sociales (Fase 2, spec 08).
