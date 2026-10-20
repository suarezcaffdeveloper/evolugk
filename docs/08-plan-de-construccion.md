# 08 — Plan de construcción

- **Estado:** Borrador para revisión
- **Base:** specs [00](../specs/00-auth-y-tenancy.md) a [07](../specs/07-planes-y-suscripciones.md) (aprobadas), [03 — modelo de datos](03-modelo-de-datos.md) y [04 — arquitectura](04-arquitectura.md).

## 1. Decisiones de trabajo
| Tema | Decisión |
|---|---|
| Estrategia | **Hitos** que dejan algo usable de punta a punta |
| Entornos | Supabase en la nube: un proyecto de **desarrollo** y otro de **producción** |
| Pruebas | Obligatorias: aislamiento entre escuelas y reglas de negocio críticas. Flujos principales con pruebas end-to-end |
| Piloto | Una escuela real al terminar el **hito 4** |
| Nombres | Código, tablas y columnas **en inglés**; interfaz y textos en **español (es-AR)**. Ver [glosario](09-glosario.md) |
| Diseño | Sesión de dirección visual **antes del hito 1**, que produce un brief de diseño |
| Git | Repositorio local ahora; rama `main` estable y una rama por hito; se sube a GitHub cuando exista la cuenta |
| Cuentas | Ninguna creada todavía (ver sección 3) |

## 2. Propuestas técnicas (a confirmar)
No fueron decididas en las specs; las propongo para que las confirmes o cambies.

| Tema | Propuesta | Motivo |
|---|---|---|
| Gestor de paquetes | pnpm | Rápido y estable en Windows |
| Estilos y componentes | Tailwind CSS + shadcn/ui | Accesibles, personalizables con la marca de cada escuela |
| Validación | Zod, compartida entre formularios y servidor | Una sola definición de reglas |
| Acceso a datos | Cliente de Supabase + migraciones SQL versionadas + tipos generados | RLS vive en SQL; sin capa extra |
| Gráficos | Una librería ligera de gráficos (radar y líneas) | Los gráficos de evolución son el corazón del portal |
| Pruebas | Vitest (unitarias), pruebas SQL/integración contra la base de desarrollo, Playwright (end-to-end) | Cubre los tres niveles pedidos |
| Integración continua | GitHub Actions: lint, tipos, pruebas | Se activa al subir a GitHub |
| Errores en producción | Un servicio de registro de errores (por ejemplo Sentry) | Spec 04: solo registros técnicos, sin analítica |
| Mail | Resend | Transaccional y simple |
| Video | Mux detrás de `VideoProvider` | Ver [06](06-planes-y-costos.md) |

## 3. Antes de empezar (hito 0)
Tareas previas, algunas tuyas:

1. **Brief de diseño:** sesión de preguntas de dirección visual (estilo, tono, referencias). Produce `docs/DESIGN-BRIEF.md`.
2. **Cuentas** (cuando haga falta, en este orden): GitHub, Supabase (dos proyectos), Vercel. Más adelante Mux, Resend y el dominio.
3. **Repositorio:** inicializar git y dejar `docs/` y `specs/` como primer commit.
4. **Proyecto base:** Next.js con TypeScript, lint, formateo, estructura de carpetas y variables de entorno.
5. **Convenciones:** nombres en inglés, estructura de módulos (ver [04](04-arquitectura.md)), formato de migraciones.

## 4. Definición de "terminado" (para cada hito)
- Cumple los criterios de aceptación (CA) de las specs que cubre.
- Pruebas obligatorias pasando: aislamiento entre escuelas en cada tabla nueva con `school_id`, y las reglas de negocio del hito.
- Flujos principales con prueba end-to-end.
- Migraciones aplicadas en desarrollo, con datos de ejemplo (seed) para probar.
- Textos de interfaz en español (es-AR), sin textos pegados en el código.
- Probado en celular (el profesor) y en modo claro y oscuro.
- Registro de auditoría de las acciones sensibles del hito.
- Documentación actualizada si algo cambió respecto de la spec.
- Revisión tuya antes de unir la rama a `main`.

## 5. Hitos

### Hito 1 — Fundación y acceso del staff
**Specs:** 00 (tenancy, operador y staff) y la parte de 07 que define las condiciones de la suscripción (precio, topes, prueba).
**Entrega:**
- Proyecto, entornos y CI.
- Esquema base: `school`, `profile`, `invitation`, `subscription` (condiciones: precio, topes, prueba), `audit_log`.
- Resolución de escuela por `/{slug}`, marca (logo y color principal con validación de contraste), modo claro y oscuro.
- Panel mínimo del operador: crear escuela (con condiciones y prueba), invitar al primer admin, suspender y reactivar. Operador con verificación en dos pasos.
- Login de staff, invitaciones por mail (7 días), recuperación de contraseña, desactivar profesores, varios admins.
- Marco de RLS y **pruebas de aislamiento automáticas** reutilizables para todas las tablas siguientes.
**Listo cuando:** CA-01, CA-06, CA-07 y CA-08 de la spec 00 pasan (CA-02 se completa en el hito 6, cuando existan las cuotas); un admin invitado entra a `/{slug}`; una escuela suspendida no deja entrar a nadie.
**Tamaño:** grande (es la base de todo).

### Hito 2 — Arqueros, familias y acceso al portal
**Specs:** 01 completa, parte de 00 (familia), parte de 04 (primer ingreso).
**Entrega:**
- `group`, `goalkeeper`, `goalkeeper_group`, `goalkeeper_measurement`, `guardian`, `goalkeeper_guardian`, `consent`, `guardian_session`.
- Altas, ediciones y estados de arqueros; grupos (con archivado); tutores; contacto de emergencia.
- Importación masiva por Excel/CSV con reporte de errores.
- Acceso de familia: código + PIN, cambio de PIN, bloqueo por intentos, reset por el admin, revocar sesiones.
- Portal: ingreso, asistente de primer ingreso (PIN y consentimiento), selector de arquero, "Mis datos", "Privacidad" con retiro del consentimiento.
- Eliminación definitiva de un arquero.
**Listo cuando:** CA-03, CA-04 y CA-05 de la spec 00 y los CA de la spec 01 pasan (menos los que dependen de videos, asistencia y cuotas, que se cierran en sus hitos); un tutor entra, acepta el consentimiento y ve su ficha; RLS de familia probada (solo ve a sus arqueros).
**Tamaño:** grande.

### Hito 3 — Evaluaciones y evolución
**Specs:** 02 completa, parte de 04 (evolución).
**Entrega:**
- `rubric_version`, `rubric_category` (con las 8 categorías y sus guías de puntajes), `evaluation`, `evaluation_score`, `evaluation_revision`, `note`.
- Carga rápida de evaluaciones desde el celular, borrador y publicación, notas, edición con registro.
- Indicador "evaluación pendiente" (más de 90 días).
- Portal: inicio con resumen, radar actual, comparativo ingreso vs. hoy, línea de tiempo por categoría, historial con notas, indicador "nuevo".
- Mail a la familia al publicar.
**Listo cuando:** CA de la spec 02 pasan; el profesor carga una evaluación en menos de un minuto; la familia ve la evolución.
**Dependencia de contenido:** guías de puntajes de la rúbrica (tarea tuya).
**Tamaño:** mediano.

### Hito 4 — Videos
**Specs:** 03 completa, parte de 04 (videos), parte de 07 (tope de minutos).
**Entrega:**
- Interfaz `VideoProvider` y primer proveedor (Mux), subida directa en segundo plano con reintentos, webhooks de procesamiento.
- `video`, `video_comment`, `evaluation_video`.
- Borrador y publicación, comentarios con marca de tiempo, vínculo con evaluaciones, reproducción con URL firmada (1 hora, renovable), sin descarga.
- Cuota de minutos: aviso al 80% y bloqueo al 100%; el operador puede subir el tope.
- Ocultar y borrar al retirarse el consentimiento; borrado en el proveedor con reintentos.
- Mail de video publicado, agrupado en 30 minutos.
- Portal: lista, filtros, reproductor con comentarios.
**Listo cuando:** CA de la spec 03 pasan; se sube un clip de 3 minutos desde un celular real con mala señal y llega a la familia.
**Externos:** cuenta de Mux.
**Tamaño:** grande.

> **Punto de piloto:** al terminar el hito 4 el producto ya muestra su diferencial (progreso y videos). Se prueba con una escuela real.

### Hito 5 — Asistencia
**Specs:** 05 completa, parte de 04 (asistencia).
**Entrega:**
- `attendance_session`, `attendance_entry`, `attendance_revision`, `admin_alert`.
- Toma de lista rápida por grupo, invitados, suspensión, corrección con registro.
- **Toma de lista sin conexión** (service worker, cola local, sincronización, conflictos).
- Porcentaje a 90 días, calendario, informes (por arquero, por grupo y mes, baja asistencia), aviso por 3 faltas seguidas.
- Portal: porcentaje y calendario.
**Listo cuando:** CA de la spec 05 pasan; una lista tomada sin señal se sincroniza sola; el porcentaje coincide con el ejemplo de la spec.
**Tamaño:** mediano a grande (por el trabajo sin conexión).

### Hito 6 — Cuotas y suscripciones
**Specs:** 06 completa, 07 completa, parte de 04 (cuota).
**Entrega:**
- `fee`, `fee_revision`, `notification_log`, `subscription_payment`, `subscription_change`, `platform_alert`.
- Ciclo individual de cuotas, generación automática, registro de pagos y adelantos, exentos, importados, pausa y reactivación.
- Tarea diaria a las 9:00 (hora de Argentina): generación de cuotas, los cuatro avisos por cuota, alertas del operador y su mail resumen.
- Panel de cuotas y resumen de cobranza para el admin.
- Estados de la suscripción (prueba, al día, vencida con gracia, suspendida), pagos de la escuela, estado de cuenta, resumen de ingresos, historial de condiciones, alertas.
- "Mi plan" para el admin; portal: estado de la cuota e historial.
**Listo cuando:** CA de las specs 06 y 07 pasan; los ejemplos de fechas (inicio 12/03, inicio 31/01, adelantos) dan los valores de la spec.
**Tamaño:** grande (muchas reglas de fechas).

### Hito 7 — Cierre y lanzamiento
**Entrega:**
- PWA instalable (icono y nombre de la escuela).
- Revisión de accesibilidad, rendimiento y modo oscuro.
- Revisión de seguridad: RLS de todas las tablas, secretos, permisos, URLs firmadas, borrados.
- Textos legales finales (consentimiento, privacidad, términos).
- Entorno de producción: Supabase, Vercel, dominio, mail, Mux, registro de errores, respaldos.
- Plan de datos: respaldo y restauración probados.
- Manual breve de uso para escuelas.
**Listo cuando:** lista de verificación de lanzamiento completa (sección 8).

## 6. Orden y dependencias
```
Hito 0 → 1 → 2 → 3 → 4 (piloto) → 5 → 6 → 7
```
- El hito 1 incluye ya las **condiciones de la suscripción** (precio, topes, prueba) porque el operador las carga al crear la escuela y el hito 4 necesita el tope de minutos.
- Los pagos de la escuela, los estados de la suscripción y las alertas llegan en el hito 6.
- El piloto podría empezar con la prueba gratuita sin suscripción pagada.

## 7. Pruebas obligatorias por hito
| Hito | Aislamiento / permisos | Reglas críticas |
|---|---|---|
| 1 | Todas las tablas del hito; operador vs. escuelas | Invitaciones (vencimiento y un solo uso), suspensión |
| 2 | Familia ve solo a sus arqueros; profesor no edita datos personales | Consentimiento (quién y cuándo), bloqueo del PIN, importación, duplicados |
| 3 | Borradores no visibles a la familia | Estado "pendiente", radar sin evaluar, evaluación de ingreso única |
| 4 | URLs de video: solo tutor vinculado, consentimiento vigente y publicado | Cuota (80%/100%), retiro del consentimiento, borrado en el proveedor |
| 5 | Familia no ve motivos de justificación | Porcentaje, racha de 3 faltas, sincronización y conflictos |
| 6 | Profesor sin acceso a cuotas ni suscripción; admin sin precio | Ciclo de cuotas y fechas, idempotencia de avisos, estados de la suscripción |

Además, un conjunto de **pruebas end-to-end** con los flujos principales: alta de escuela e invitación; alta de arquero y primer ingreso de un tutor; evaluación publicada vista por la familia; video subido y reproducido; asistencia; cuota y aviso.

## 8. Lista de verificación de lanzamiento
- [ ] Todas las pruebas obligatorias y end-to-end pasan.
- [ ] RLS revisada tabla por tabla, con prueba de aislamiento.
- [ ] Textos legales aprobados por un profesional.
- [ ] Guías de puntajes de la rúbrica cargadas.
- [ ] Precios de proveedores (Mux, Supabase, Vercel) confirmados.
- [ ] Verificación en dos pasos del operador activa.
- [ ] Respaldo y restauración probados.
- [ ] Registro de errores y alertas en producción.
- [ ] Dominio y mail configurados (SPF, DKIM).
- [ ] Probado en celulares Android e iPhone reales.
- [ ] Piloto realizado y ajustes incorporados.

## 9. Riesgos del plan
| Riesgo | Mitigación |
|---|---|
| RLS mal escrita | Pruebas de aislamiento desde el hito 1, reutilizadas en cada tabla |
| Subida de video con mala señal | Probar en celular real en el hito 4; reintentos y estado visible |
| Sincronización sin conexión (hito 5) | Alcance acotado a la toma de lista; pruebas de conflictos |
| Reglas de fechas de cuotas (hito 6) | Funciones de fechas con pruebas de los ejemplos de la spec |
| Dependencia de cuentas y servicios externos | Crearlas justo antes del hito que las usa |
| Contenido pendiente (guías de puntajes, textos legales) | Aparece en cada hito donde se necesita, con aviso previo |
| Cambios de alcance durante el piloto | Registrarlos como nuevas specs o ajustes antes de implementarlos |
