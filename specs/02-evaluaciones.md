# 02 — Evaluaciones

- **Estado:** Aprobada
- **Depende de:** [00 — Auth y tenancy](00-auth-y-tenancy.md), [01 — Arqueros y fichas](01-arqueros-y-fichas.md)
- **Habilita:** portal de familia, informes de progreso

## 1. Objetivo
Permitir que los profesores evalúen a cada arquero con una rúbrica estándar y registren observaciones entre evaluaciones, y que la escuela y la familia vean la evolución del arquero desde su ingreso. Es el diferencial central del producto.

## 2. Alcance
**Entra:**
- Rúbrica estándar fija de 8 categorías, con guía de puntajes.
- Evaluación de ingreso y evaluaciones periódicas (cada ~3 meses).
- Estado borrador/publicada.
- Notas rápidas.
- Evolución: radar actual, radar ingreso vs. hoy, línea de tiempo por categoría, historial.
- Indicador de "evaluación pendiente".
- Aviso por mail a la familia al publicar.
- Edición con registro de cambios.

**No entra (MVP):**
- Rúbrica configurable por escuela.
- Objetivos y plan individual.
- Informe PDF compartible.
- Evaluación de arqueros inactivos o egresados.
- Registro de partidos y estadísticas de juego.

## 3. Actores
| Actor | Qué hace |
|---|---|
| Profesor | Crea, edita y publica evaluaciones y notas de cualquier arquero activo |
| Admin | Lo mismo que el profesor, además de borrar evaluaciones |
| Tutor | Ve evaluaciones publicadas y notas marcadas como visibles de sus arqueros |

## 4. Requisitos funcionales

### Rúbrica
- **RF-01** La rúbrica es global y fija para todas las escuelas, con estas 8 categorías: atajada, juego aéreo, juego con los pies, posicionamiento, reflejos, comunicación, físico/coordinación, mentalidad.
- **RF-02** Cada categoría se puntúa de 1 a 10.
- **RF-03** Cada categoría trae una guía corta de qué significa un puntaje bajo, medio y alto, visible al evaluar.
- **RF-04** Las escuelas no pueden modificar la rúbrica.
- **RF-04b** La rúbrica está versionada: cada evaluación guarda con qué versión se hizo, y un cambio futuro de categorías no altera las evaluaciones anteriores.
- **RF-04c** Las guías de puntajes las redacta la plataforma (borrador nuestro, validado por una persona del ámbito del arquero) antes del lanzamiento.

### Evaluaciones
- **RF-05** Tipos de evaluación: **de ingreso** (una por arquero) y **periódica** (todas las demás).
- **RF-06** Una evaluación tiene: arquero, autor (profesor), fecha, puntajes, comentario general y comentarios opcionales por categoría.
- **RF-07** Una categoría puede omitirse; queda "sin evaluar", sin inventar un valor.
- **RF-08** Solo se evalúa a arqueros activos.
- **RF-09** Varios profesores pueden evaluar al mismo arquero en el mismo período; son evaluaciones independientes, cada una con su autor y fecha.
- **RF-10** El sistema sugiere crear la evaluación de ingreso al dar de alta a un arquero.
- **RF-10b** El profesor elige la fecha de la evaluación (no futura), lo que permite cargar historial anterior de arqueros que ya estaban en la escuela.

### Estado y publicación
- **RF-11** Una evaluación nueva queda en **borrador**; solo el profesor que la creó y los admins la ven.
- **RF-12** Al **publicarla**, la familia puede verla.
- **RF-13** Al publicar se manda un mail a los tutores del arquero que tengan mail cargado; sin mail no hay aviso.
- **RF-14** Una evaluación publicada puede despublicarse (vuelve a borrador).

### Edición y borrado
- **RF-15** Una evaluación puede editarla quien la cargó y cualquier admin.
- **RF-16** Cada edición queda registrada (quién, cuándo, qué cambió).
- **RF-17** Solo el admin puede borrar una evaluación.

### Notas rápidas
- **RF-18** Nota de texto corto con fecha y autor, sobre un arquero.
- **RF-19** Por defecto es interna; la familia la ve solo si el profesor la marca como visible.
- **RF-20** Las notas no entran en el radar ni en los puntajes.

### Evolución
- **RF-21** Radar de estado actual con los puntajes de la evaluación publicada más reciente.
- **RF-22** Radar comparativo **ingreso vs. hoy**, superpuestos. Si no hay evaluación de ingreso, se muestra solo el estado actual.
- **RF-23** Línea de tiempo por categoría con los puntajes de todas las evaluaciones publicadas.
- **RF-24** Historial cronológico de evaluaciones con puntajes y comentarios.
- **RF-24b** Con una sola evaluación publicada, la familia ve el radar actual y el historial; los gráficos de evolución (comparativo y línea de tiempo) aparecen desde la segunda, con un mensaje que lo explica.
- **RF-25** La familia solo ve evaluaciones publicadas y notas marcadas como visibles; el staff ve además los borradores propios (el admin, todos).

### Pendientes
- **RF-26** Un arquero activo queda "evaluación pendiente" cuando pasaron más de 90 días desde su última evaluación publicada, o si nunca tuvo ninguna.
- **RF-27** El indicador se muestra a staff en la ficha y en el panel; no genera mails.

## 5. Reglas de negocio
- **RN-01** Una evaluación se atribuye a su autor; si el admin la edita, se registra el cambio sin cambiar el autor original.
- **RN-02** Un arquero tiene a lo sumo una evaluación de ingreso.
- **RN-03** El "estado actual" usa la evaluación **publicada** más reciente por fecha.
- **RN-04** Si la última evaluación omite una categoría, el radar muestra "sin evaluar" para ese eje; no arrastra el valor de una evaluación anterior.
- **RN-05** Las evaluaciones y notas de un arquero se conservan al pasar a inactivo o egresado; se retoman si se reactiva.
- **RN-06** Las evaluaciones forman parte del historial del arquero y se eliminan con él en la eliminación definitiva (spec 01).
- **RN-07** Una evaluación no puede tener fecha futura.

## 6. Datos involucrados
Ver [docs/03-modelo-de-datos.md](../docs/03-modelo-de-datos.md):
- `rubric_version` (id, version, vigente_desde) y `rubric_category` (id, rubric_version_id, clave, nombre, orden, `guia_bajo`, `guia_medio`, `guia_alto`). Globales, sin `school_id`.
- `evaluation` guarda `rubric_version_id`.
- `evaluation`: cambiar `tipo` a `ingreso | periodica`; agregar `estado` (`borrador | publicada`) y `publicada_en`.
- `evaluation_score`: puntaje 1–10 (puede faltar) y `comentario` opcional por categoría.
- `evaluation_revision`: registro de cambios (evaluation_id, editado_por, editado_en, detalle).
- `note`: sin cambios (texto, `visible_familia`, autor, fecha).

## 7. Flujos

**F1 — Evaluación en cancha:** profesor abre la ficha → "Nueva evaluación" → puntúa las categorías que observó → comentario → guarda (borrador) → revisa → publica → mail a la familia.

**F2 — Evaluación de ingreso:** al dar de alta al arquero, el sistema sugiere cargarla → mismo flujo, con tipo "de ingreso".

**F3 — Nota rápida:** profesor abre la ficha → "Nueva nota" → escribe → marca si es visible → guarda.

**F4 — Corrección:** profesor o admin edita una evaluación → se guarda la revisión.

**F5 — Seguimiento de pendientes:** el admin ve en el panel qué arqueros tienen evaluación pendiente y los asigna a los profesores por fuera del sistema.

## 8. Criterios de aceptación
- **CA-01** Dada una evaluación en borrador, cuando la familia abre el portal, entonces no la ve.
- **CA-02** Dada una evaluación publicada, cuando el tutor la abre, entonces ve puntajes y comentarios, y recibe mail si tiene mail cargado.
- **CA-03** Dada una evaluación con una categoría omitida, entonces el radar muestra ese eje como "sin evaluar".
- **CA-04** Dado un arquero con evaluación de ingreso y una periódica, entonces el radar comparativo superpone ambas.
- **CA-05** Dado un arquero que ya tiene evaluación de ingreso, cuando se intenta crear otra de ingreso, entonces se rechaza.
- **CA-06** Dado un arquero activo con última evaluación publicada hace más de 90 días, entonces aparece "evaluación pendiente".
- **CA-07** Dada una evaluación editada, entonces queda un registro con quién, cuándo y qué cambió.
- **CA-08** Dado un profesor que no es el autor ni es admin, cuando intenta editarla, entonces se le deniega.
- **CA-09** Dado un arquero inactivo, cuando se intenta crear una evaluación, entonces se bloquea.
- **CA-10** Dada una nota interna, cuando la familia consulta, entonces no aparece.
- **CA-11** Dados dos profesores que evalúan al mismo arquero el mismo mes, entonces se conservan ambas y el radar usa la de fecha más reciente.

## 9. Casos borde
- Arquero sin ninguna evaluación publicada: el portal muestra un estado vacío en lugar de gráficos.
- Todas las categorías omitidas: se rechaza el guardado (al menos una categoría puntuada).
- Evaluación publicada y luego despublicada: el aviso por mail ya enviado no se retira.
- Republicar una evaluación: no reenvía el mail.
- Dos evaluaciones con la misma fecha: gana la creada después.
- Profesor desactivado: sus evaluaciones y notas se conservan con su nombre.
- Borrar al autor de una evaluación: nunca se borra a un usuario; solo se desactiva (spec 00).

## 10. Seguridad y privacidad
- Las evaluaciones son datos de un menor: acceso dentro de la escuela y RLS por `school_id`.
- La familia accede solo a evaluaciones publicadas y notas visibles de sus arqueros.
- Los borradores no son visibles para la familia ni para profesores ajenos.
- Las ediciones y borrados quedan auditados.

## 11. Preguntas abiertas
Ninguna pendiente de decisión. Tarea previa al lanzamiento: redactar y validar las guías de puntajes de las 8 categorías (RF-04c).
