# 01 — Arqueros y fichas

- **Estado:** Aprobada
- **Depende de:** [00 — Auth y tenancy](00-auth-y-tenancy.md)
- **Habilita:** evaluaciones, videos, portal de familia, asistencia, pagos

## 1. Objetivo
Definir cómo se registra y mantiene la información de cada arquero (ficha, medidas, tutores, grupos, estado y consentimiento), que es la base sobre la que se apoyan el progreso, los videos y el portal de familia.

## 2. Alcance
**Entra:**
- Alta, edición y consulta de arqueros y su ficha.
- Historial de medidas (altura y peso).
- Tutores y su vínculo con los arqueros.
- Contacto de emergencia.
- Grupos (organizativos) y su pertenencia.
- Estados del arquero: activo, inactivo, egresado.
- Consentimiento de la familia para fotos y videos.
- Importación masiva desde Excel/CSV.
- Listado, búsqueda y filtros.
- Eliminación definitiva de un arquero.

**No entra (MVP):**
- Datos médicos (solo contacto de emergencia).
- DNI.
- Evaluaciones, videos y asistencia (specs propias).
- Cuotas y pagos (spec propia).
- Foto de perfil sin consentimiento.

## 3. Actores
| Actor | Qué hace en esta spec |
|---|---|
| Admin de escuela | Alta, edición, estados, tutores, grupos, importación, eliminación definitiva |
| Profesor | Ver todos los arqueros; registrar altura y peso |
| Tutor | Dar o retirar el consentimiento desde el portal; ver la ficha de sus arqueros |

## 4. Requisitos funcionales

### Ficha del arquero
- **RF-01** Datos básicos: nombre, apellido, fecha de nacimiento, fecha de ingreso (obligatorios).
- **RF-02** Datos físicos: altura, peso, pie hábil.
- **RF-03** Datos deportivos: club actual, categoría, nivel, objetivo.
- **RF-04** El nivel es una lista fija: inicial, intermedio, avanzado.
- **RF-05** La edad se calcula a partir de la fecha de nacimiento.
- **RF-06** Contacto de emergencia con campos propios: nombre, teléfono, parentesco. Visible solo para el staff.
- **RF-07** Foto de perfil, sujeta al consentimiento (ver RF-28 y RF-30). Sin foto o sin consentimiento se muestra un avatar con iniciales.
- **RF-08** Solo el admin da de alta y edita los datos de la ficha. El profesor solo puede registrar medidas (RF-10).

### Medidas
- **RF-09** Cada medición de altura y peso se guarda con su fecha; se conserva el historial y se muestra su evolución.
- **RF-10** Admin y profesores pueden registrar medidas.
- **RF-11** La ficha muestra la última medida como valor actual.

### Tutores
- **RF-12** Un tutor tiene nombre, apellido y teléfono obligatorios; el mail es opcional.
- **RF-13** Un arquero tiene uno o más tutores; un tutor puede estar vinculado a varios arqueros (hermanos).
- **RF-14** Cada vínculo tiene un parentesco, de una lista fija: madre, padre, tutor/a, abuelo/a, otro. Si el arquero es su propio tutor, se registra como "él mismo".
- **RF-14b** Categoría y club actual son texto libre.
- **RF-15** Un arquero mayor de 18 años puede ser su propio tutor, con código y PIN propios.
- **RF-16** Todo arquero debe tener al menos un tutor.
- **RF-17** La generación del código y PIN de cada tutor se resuelve según [00-auth-y-tenancy](00-auth-y-tenancy.md).

### Grupos
- **RF-18** El admin crea grupos con nombre libre y horario opcional.
- **RF-19** Un arquero puede estar en varios grupos.
- **RF-20** Los grupos son organizativos: no restringen qué ve cada profesor.
- **RF-21** Un grupo con arqueros no se borra, se **archiva**: deja de ofrecerse para nuevas asignaciones y conserva el historial de asistencia.

### Estados
- **RF-22** Estados: **activo**, **inactivo** (pausa) y **egresado**. El historial se conserva en todos.
- **RF-23** El admin cambia el estado de un arquero en cualquier momento, y puede reactivarlo.
- **RF-24** Un arquero inactivo no cuenta para el tope de arqueros de la suscripción ni genera cuotas (specs 06 y 07).
- **RF-25** Un arquero egresado conserva el acceso de lectura de su familia al historial.

### Consentimiento
- **RF-26** El tutor acepta el consentimiento de imagen y video él mismo, la primera vez que ingresa al portal. El texto es estándar de la plataforma, igual para todas las escuelas, y la escuela no lo modifica.
- **RF-27** Basta con que lo dé cualquiera de los tutores del arquero; se registra quién lo dio y cuándo.
- **RF-28** Mientras no exista consentimiento vigente, el profesor **no puede subir** fotos ni videos de ese arquero. La ficha muestra "consentimiento pendiente".
- **RF-29** El tutor puede retirar el consentimiento desde el portal.
- **RF-30** Al retirarlo, fotos y videos existentes se **ocultan de inmediato** y quedan a decisión del admin si se borran. La foto de perfil vuelve al avatar con iniciales.
- **RF-30b** Al retirarse el consentimiento, se avisa a los admins de la escuela por mail y dentro del sistema.
- **RF-31** Se conserva el historial de consentimientos otorgados y retirados.
- **RF-31b** *(Fase 2)* Existe un segundo consentimiento, **independiente y opcional**, de uso de imagen en redes sociales de la escuela (`uso_redes`). El tutor lo acepta o lo rechaza aparte, con su propio texto, y no condiciona el uso de la plataforma. Lo da el tutor, nunca el staff. Se usa en las piezas para redes de la [spec 08](08-contenido-redes.md).
- **RF-31c** *(Fase 2)* El tutor puede retirar el consentimiento de redes en cualquier momento. Las piezas ya generadas que usen al arquero se ocultan y se avisa al admin; lo ya publicado en redes por la escuela queda a cargo de la escuela, que debe retirarlo.
- **RF-31d** *(Fase 2)* El consentimiento de redes no reemplaza al de imagen y video: para generar una pieza hacen falta ambos vigentes.

### Listado y búsqueda
- **RF-32** Listado de arqueros con búsqueda por nombre y filtros por grupo, estado y nivel. Por defecto muestra los activos.
- **RF-33** El listado indica el estado del consentimiento (pendiente / vigente / retirado).

### Alta y duplicados
- **RF-34** Al dar de alta un arquero, si ya existe uno con el mismo nombre, apellido y fecha de nacimiento, se avisa y el admin decide si continuar.

### Importación masiva
- **RF-35** El admin descarga una plantilla Excel/CSV y la sube completa.
- **RF-36** Cada fila trae al arquero y a su tutor (nombre, apellido, teléfono).
- **RF-37** Tutores con el mismo teléfono se unifican en un solo tutor vinculado a varios arqueros.
- **RF-38** Se importan las filas válidas y se descarga un reporte con las filas fallidas y el motivo de cada una.
- **RF-39** La importación permite exceder el tope de arqueros de la suscripción; los avisos y el seguimiento los define la [spec 07](07-planes-y-suscripciones.md).

### Eliminación definitiva
- **RF-40** Solo el admin puede eliminar definitivamente a un arquero, con confirmación explícita.
- **RF-41** La eliminación borra la ficha, medidas, evaluaciones, notas y **todos sus videos**, incluidos los del proveedor externo.
- **RF-42** Queda un registro de auditoría de quién eliminó y cuándo, sin conservar datos personales del arquero.

## 5. Reglas de negocio
- **RN-01** Un arquero pertenece a una sola escuela.
- **RN-02** Un tutor pertenece a una sola escuela (ver spec 00).
- **RN-03** El consentimiento es por arquero; vale para fotos, videos y foto de perfil. El uso en redes sociales (Fase 2) requiere un consentimiento aparte (RF-31b).
- **RN-04** El consentimiento no se puede dar por el staff en nombre del tutor.
- **RN-05** Un arquero activo debe tener fecha de ingreso; es el punto de partida para comparar su progreso.
- **RN-06** El último admin activo no puede eliminarse a sí mismo; el borrado de un arquero no afecta a los tutores que tengan otros hijos.

## 6. Datos involucrados
Ver [docs/03-modelo-de-datos.md](../docs/03-modelo-de-datos.md). Cambios a registrar en el modelo:
- `goalkeeper`: agregar `club_actual`, `categoria`, `objetivo`, `estado` (`activo | inactivo | egresado`), contacto de emergencia (`emergencia_nombre`, `emergencia_telefono`, `emergencia_parentesco`); quitar `altura_cm` y `peso_kg` como valores únicos.
- Nueva `goalkeeper_measurement` (id, school_id, goalkeeper_id, fecha, altura_cm, peso_kg, registrada_por).
- `group`: agregar `archivado`.
- `consent`: ya existe; agregar la regla de "vigente" (otorgado y no retirado). En Fase 2 se suma el tipo `uso_redes`.

## 7. Flujos

**F1 — Alta manual:** admin completa la ficha → se avisa si hay duplicado → carga tutor(es) → el arquero queda con consentimiento pendiente → admin genera código y PIN del tutor.

**F2 — Primer ingreso del tutor:** el tutor entra con código y PIN → ve el texto de consentimiento → acepta → queda registrado y se habilita la carga de fotos y videos.

**F3 — Importación:** admin descarga plantilla → completa → sube → se procesan filas → se muestra resumen y reporte de errores.

**F4 — Retiro del consentimiento:** tutor retira desde el portal → contenido del arquero se oculta → se avisa al admin → el admin decide el borrado.

**F5 — Egreso:** admin cambia el estado a egresado → el arquero sale de listas de asistencia y cuotas → la familia sigue viendo el historial.

**F6 — Eliminación definitiva:** admin elige eliminar → confirma → se borran los datos y los videos → queda auditoría.

## 8. Criterios de aceptación
- **CA-01** Dado un arquero con consentimiento pendiente, cuando un profesor intenta subir un video, entonces se bloquea con un mensaje claro.
- **CA-02** Dado un arquero con dos tutores, cuando uno acepta el consentimiento, entonces queda vigente sin esperar al otro.
- **CA-03** Dado un consentimiento retirado, cuando la familia abre el portal, entonces no ve videos ni foto de ese arquero.
- **CA-04** Dado un alta con mismo nombre, apellido y fecha de nacimiento que un arquero existente, entonces se muestra un aviso y se permite continuar.
- **CA-05** Dado un archivo de importación con 100 filas, de las cuales 5 tienen errores, entonces se importan 95 y se descarga un reporte con las 5 fallidas.
- **CA-06** Dado dos filas de importación con el mismo teléfono de tutor, entonces se crea un solo tutor vinculado a ambos arqueros.
- **CA-07** Dado un arquero mayor de 18 años, cuando se lo da de alta como su propio tutor, entonces puede generar acceso y dar su consentimiento.
- **CA-08** Dado un profesor, cuando intenta editar datos personales de un arquero, entonces se le deniega; sí puede registrar altura y peso.
- **CA-09** Dado un grupo con arqueros, cuando el admin lo archiva, entonces se conserva su historial y no se ofrece para nuevas asignaciones.
- **CA-10** Dado un arquero eliminado, cuando se consulta el proveedor de video, entonces ya no existen sus videos.
- **CA-11** Dado un arquero inactivo, entonces no aparece en la lista de asistencia ni suma al tope de arqueros de la suscripción.

## 9. Casos borde
- Arquero sin ningún tutor: no se puede dar de alta.
- Tutor que retira el consentimiento y lo vuelve a dar: el contenido ocultado se vuelve a mostrar solo si el admin no lo borró.
- Importación con tutores de mismo teléfono pero nombres distintos: se unifican por teléfono y se avisa en el reporte.
- Fecha de nacimiento futura o fecha de ingreso anterior al nacimiento: se rechaza.
- Edad límite: un arquero que cumple 18 no cambia solo de tutor; el admin debe cargar su acceso propio.
- Importación que supera el tope de arqueros de la suscripción: se importa igual y se muestra un aviso (spec 07).
- Eliminación definitiva con falla en el proveedor de video: la operación se reintenta y se informa al admin; no se da por terminada hasta borrar los videos.
- Archivo de importación con codificación o formato incorrecto: se rechaza con mensaje claro.

## 10. Seguridad y privacidad
- Los datos de la ficha son de un menor: acceso solo dentro de la escuela, según las políticas RLS de la spec 00.
- El contacto de emergencia solo lo ve el staff, nunca la familia por el portal.
- La familia ve todos los datos de la ficha de sus arqueros (incluidos objetivo, club y medidas) excepto el contacto de emergencia.
- El consentimiento y su retiro quedan auditados.
- La eliminación definitiva queda auditada sin conservar datos personales.

## 11. Preguntas abiertas
1. ¿Hay un tamaño máximo para el archivo de importación (por ejemplo, 500 filas)? Pendiente de definir.
2. El texto legal del consentimiento debe redactarse y revisarse con un profesional antes de lanzar (tarea, no decisión de producto). Lo mismo vale para el texto del consentimiento de redes (Fase 2).
