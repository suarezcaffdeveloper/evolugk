# 05 — Asistencia

- **Estado:** Aprobada
- **Depende de:** [00 — Auth y tenancy](00-auth-y-tenancy.md), [01 — Arqueros y fichas](01-arqueros-y-fichas.md)
- **Alimenta:** [04 — Portal de familia](04-portal-familia.md)

## 1. Objetivo
Permitir tomar lista en segundos desde el celular, en la cancha, y mostrar a la escuela y a la familia la asistencia de cada arquero con un cálculo justo y claro.

## 2. Alcance
**Entra:**
- Sesiones de entrenamiento por grupo y fecha.
- Lista con estados: presente, ausente, ausente justificado.
- Invitados (arqueros de otros grupos) en una sesión.
- Sesiones suspendidas.
- Carga y corrección de fechas pasadas con registro de cambios.
- Porcentaje de asistencia y calendario por arquero.
- Informes para el admin: historial por arquero, resumen por grupo y mes, baja asistencia.
- Aviso al admin por 3 ausencias seguidas sin justificar.

**No entra (MVP):**
- Días y horarios fijos de grupo con generación automática de sesiones.
- Estado "tarde".
- Control de asistencia por QR o geolocalización.
- Aviso a la familia por ausencias.
- Exportación a Excel/CSV.
- Asistencia de profesores.

## 3. Actores
| Actor | Qué hace |
|---|---|
| Profesor | Toma y corrige la asistencia de cualquier grupo; ve el historial por arquero |
| Admin | Lo mismo, además de ver los informes y borrar sesiones |
| Tutor | Ve la asistencia de sus arqueros en el portal |

## 4. Requisitos funcionales

### Sesiones
- **RF-01** Para tomar lista, el profesor elige un grupo y una fecha (hoy por defecto); eso crea la sesión.
- **RF-02** Solo puede haber una sesión por grupo y fecha.
- **RF-03** La lista de la sesión se arma con los miembros activos del grupo en ese momento; si un arquero cambia de grupo después, las sesiones pasadas no se modifican.
- **RF-04** Se puede tomar lista de cualquier fecha no futura.
- **RF-05** Solo se listan arqueros activos; los grupos archivados no se ofrecen para nuevas sesiones.

### Marcado
- **RF-06** Cada arquero aparece sin marcar; el profesor marca presente, ausente o ausente justificado.
- **RF-07** Hay un botón "todos presentes" que marca a los que están sin marcar.
- **RF-08** Se puede guardar con arqueros sin marcar; quedan resaltados para completar luego y no cuentan para el porcentaje.
- **RF-09** El profesor puede agregar a la sesión a cualquier arquero activo de la escuela (invitado); esa asistencia cuenta en su historial igual que las demás.
- **RF-10** Para una ausencia justificada se puede cargar un motivo corto, visible solo para el staff.
- **RF-11** La lista debe poder completarse con un toque por arquero y guardarse en pocos segundos desde el celular.

### Suspensión
- **RF-12** Una sesión puede marcarse como **suspendida** con un motivo corto (lluvia, feriado, etc.); no cuenta para nadie.

### Corrección
- **RF-13** Profesores y admins pueden corregir la asistencia de cualquier sesión pasada.
- **RF-14** Cada cambio queda registrado (quién, cuándo, valor anterior y nuevo).
- **RF-15** Solo el admin puede borrar una sesión.

### Cálculo y vistas
- **RF-16** Porcentaje de asistencia de un arquero = presentes ÷ sesiones en las que estaba en la lista, **sin contar** las ausencias justificadas, las sesiones suspendidas ni los arqueros sin marcar. Ventana de los últimos 90 días.
- **RF-17** Calendario mensual por arquero con presentes, ausentes, justificadas y suspendidas.
- **RF-18** El profesor y el admin ven el historial de asistencia de cada arquero en su ficha.
- **RF-19** La familia ve el porcentaje y el calendario (spec 04); en el calendario ve "justificada" sin el motivo.
- **RF-20** No se muestra asistencia nueva para arqueros inactivos o egresados.

### Informes (admin)
- **RF-21** Historial de asistencia por arquero.
- **RF-22** Resumen por grupo y mes: cantidad de entrenamientos y asistencia promedio.
- **RF-23** Lista de arqueros con baja asistencia: menos de 70% en los últimos 90 días.
- **RF-23b** Los informes de resumen por grupo y mes y de baja asistencia los ven el admin y los profesores.

### Avisos
- **RF-24** Tras 3 ausencias consecutivas sin justificar, se avisa al admin dentro del sistema. No se envían mails.
- **RF-25** El aviso se genera una vez por racha y queda hasta que el arquero vuelve a asistir o el admin lo descarta.

### Sin conexión
- **RF-26** El profesor puede tomar lista sin conexión: la marca se guarda en el celular y se sincroniza sola al volver la conexión.
- **RF-27** Para tomar lista sin conexión, el grupo y sus miembros deben haberse cargado antes en el dispositivo (se precargan al abrir la sección de asistencia con conexión).
- **RF-28** La pantalla muestra claramente qué listas están "pendientes de sincronizar" y cuándo se sincronizaron.
- **RF-29** Si dos dispositivos modifican la misma sesión sin conexión, prevalece el último cambio por hora de marca; ambos quedan registrados en la revisión.
- **RF-30** Las demás funciones de asistencia (informes, avisos, corrección de sesiones antiguas) requieren conexión.

## 5. Reglas de negocio
- **RN-01** Una asistencia pertenece a una escuela, una sesión y un arquero.
- **RN-02** Una sesión suspendida no admite marcar asistencia; si se reactiva, vuelve a abrirse.
- **RN-03** Las ausencias "consecutivas" se cuentan sobre las sesiones en las que el arquero estaba en la lista, en orden de fecha, ignorando suspendidas.
- **RN-04** Un arquero inactivo no se agrega a sesiones nuevas; su historial se conserva.
- **RN-05** Un invitado figura en la sesión solo para ese día y no se agrega al grupo.
- **RN-06** La eliminación definitiva de un arquero borra su asistencia (spec 01).
- **RN-07** Las sesiones sin ningún arquero marcado no cuentan para nada.

## 6. Datos involucrados
Ver [docs/03-modelo-de-datos.md](../docs/03-modelo-de-datos.md):
- `attendance_session` (reemplaza `attendance`): `school_id`, `group_id`, `fecha`, `estado` (`abierta | suspendida`), `motivo_suspension`, `creada_por`. Único por (`group_id`, `fecha`).
- `attendance_entry`: `school_id`, `session_id`, `goalkeeper_id`, `estado` (`sin_marcar | presente | ausente | justificada`), `invitado` (booleano), `motivo` (interno).
- `attendance_revision`: registro de cambios (entry_id, editado_por, editado_en, valor_anterior, valor_nuevo).
- `admin_alert` o equivalente: avisos internos para el admin (tipo, goalkeeper_id, creada_en, resuelta_en).

## 7. Flujos

**F1 — Tomar lista:** profesor abre "Asistencia" → elige grupo (fecha hoy) → ve la lista → marca a cada arquero (o "todos presentes") → guarda.

**F2 — Sumar un invitado:** durante F1, el profesor busca a un arquero de otro grupo → lo agrega → lo marca.

**F3 — Suspender:** el profesor o el admin marca la sesión como suspendida → carga el motivo → se guarda.

**F4 — Corregir:** abre una sesión pasada → cambia el estado de un arquero → se registra el cambio.

**F5 — Ver informe:** el admin abre el resumen por grupo y mes o la lista de baja asistencia.

**F6 — Aviso de faltas:** al guardar una lista, si un arquero llega a 3 ausencias seguidas sin justificar, se genera el aviso al admin.

## 8. Criterios de aceptación
- **CA-01** Dado un grupo con 12 arqueros, cuando el profesor usa "todos presentes" y desmarca a 2, entonces quedan 10 presentes y 2 ausentes.
- **CA-02** Dada una sesión existente para el grupo y la fecha, cuando se intenta crear otra, entonces se abre la existente.
- **CA-03** Dado un arquero invitado, cuando se guarda la sesión, entonces su asistencia aparece en su historial y no cambia su grupo.
- **CA-04** Dado un arquero con 10 sesiones, de las que asistió a 6, faltó a 2 sin justificar y tuvo 2 justificadas, entonces su porcentaje es 6 ÷ 8 = 75%.
- **CA-05** Dada una sesión suspendida, entonces no cuenta en el porcentaje de nadie y se muestra como suspendida en el calendario.
- **CA-06** Dado un arquero con 3 ausencias seguidas sin justificar, entonces el admin recibe un aviso dentro del sistema, una sola vez por racha.
- **CA-07** Dada una ausencia que se corrige a justificada, entonces el cambio queda registrado y el porcentaje se recalcula.
- **CA-08** Dado un arquero inactivo, entonces no aparece en las nuevas listas.
- **CA-09** Dado un arquero que cambió de grupo, entonces las sesiones del grupo anterior conservan su asistencia.
- **CA-10** Dado un tutor, cuando ve el calendario, entonces ve "justificada" sin el motivo.
- **CA-11** Dado un profesor, cuando intenta borrar una sesión, entonces se le deniega.
- **CA-12** Dada una lista con arqueros sin marcar, cuando se guarda, entonces se permite y quedan resaltados para completar.

## 9. Casos borde
- Fecha futura: se rechaza.
- Sesión creada para el grupo equivocado: el admin la borra y crea otra.
- Dos profesores toman lista del mismo grupo al mismo tiempo: la segunda persona abre la sesión existente y no duplica; si ambos editan, gana el último guardado y queda registrado.
- Arquero sin sesiones en los últimos 90 días: se muestra "sin datos", no 0%.
- Todas las ausencias justificadas: el denominador es 0, se muestra "sin datos".
- Grupo vacío: se puede abrir la sesión solo para invitados.
- Se reactiva una sesión suspendida con asistencias previas: se conservan las marcas.
- El arquero se da de baja (egresado) después de tomar lista: las sesiones pasadas conservan su asistencia.
- Mala señal en la cancha: la lista se guarda localmente y se sincroniza al volver la conexión (RF-26 a RF-30).
- La app se cierra o el celular se apaga antes de sincronizar: las marcas locales persisten y se sincronizan al volver a abrir.
- Grupo no precargado y sin conexión: se avisa que no se puede abrir esa lista.
- Sesión creada sin conexión que ya existía en el servidor: se unifica con la existente (RF-02).
- Un arquero se desactiva mientras otro dispositivo tomaba lista sin conexión: se conservan las marcas sincronizadas.

## 10. Seguridad y privacidad
- Aislamiento por `school_id`.
- Los motivos de justificación son internos del staff.
- La familia solo ve la asistencia de sus propios arqueros.
- Las correcciones y borrados quedan auditados.

## 11. Preguntas abiertas
Ninguna pendiente de decisión. Impacto técnico a resolver en arquitectura: la toma de lista sin conexión cambia el supuesto de `docs/04-arquitectura.md` ("offline no es requisito del MVP").
