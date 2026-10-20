# 06 — Pagos y avisos

- **Estado:** Aprobada
- **Depende de:** [00 — Auth y tenancy](00-auth-y-tenancy.md), [01 — Arqueros y fichas](01-arqueros-y-fichas.md)
- **Alimenta:** [04 — Portal de familia](04-portal-familia.md)

## 1. Objetivo
Llevar el seguimiento de las cuotas de cada arquero con un ciclo propio, avisar a la familia por mail a medida que se acerca el pago y darle al admin una vista clara de quién está al día y quién debe. El sistema **no cobra ni maneja dinero**: solo registra estados y fechas.

## 2. Alcance
**Entra:**
- Ciclo de cuotas individual por arquero, anclado a su fecha de inicio.
- Generación automática de cuotas.
- Registro manual de pagos por el admin, incluidos pagos por adelantado.
- Estados de la cuota y fecha de vencimiento con 10 días de gracia.
- Marca "exento" por arquero.
- Cuotas de arqueros importados, pausados y reactivados.
- Mails de aviso a la familia.
- Panel de cuotas por vencer y vencidas, y resumen de cobranza.
- Estado y historial de cuotas en el portal de familia.

**No entra (MVP):**
- Montos, precios, descuentos y resumen en pesos.
- Cobro online (MercadoPago) y conciliación.
- Medios de pago y comprobantes.
- Recibos o facturas.
- Avisos por WhatsApp.
- Resumen de cobranza por mail al admin.
- Recargos por mora.

> Nota: el precio que cada escuela le paga a la plataforma se negocia aparte y se trata en la [spec 07](07-planes-y-suscripciones.md). Esta spec trata solo de las cuotas que los arqueros pagan a su escuela.

## 3. Actores
| Actor | Qué hace |
|---|---|
| Admin | Registra pagos, marca exentos, anula cuotas, ve el panel y el resumen |
| Profesor | No accede a cuotas ni pagos |
| Tutor | Ve el estado de la cuota y el historial en el portal; recibe los mails |
| Sistema | Genera cuotas y envía los avisos cada día |

## 4. Requisitos funcionales

### Ciclo de cuotas
- **RF-01** Cada arquero tiene un **inicio de cuotas**, propuesto igual a su fecha de ingreso y editable por el admin.
- **RF-02** La cuota *k* (k ≥ 1) cubre un mes que comienza en `inicio + (k−1) meses`. Esa fecha es la **fecha de pago** de la cuota.
- **RF-03** Cada cuota **vence 10 días después** de su fecha de pago (10 días de gracia).
- **RF-04** El día del mes se calcula siempre desde la fecha de inicio, no encadenando meses. Si el mes no tiene ese día, se usa el último día del mes.
- **RF-05** Pagar tarde no corre el ciclo: las fechas de las cuotas siguientes no cambian.
- **RF-06** Al dar de alta a un arquero se asume que pagó la primera cuota: se crea la cuota 1 como pagada automáticamente, con fecha de pago igual al inicio de cuotas.

### Generación automática
- **RF-07** El sistema genera cada cuota **10 días antes** de su fecha de pago, sin intervención del admin.
- **RF-08** Se generan cuotas solo para arqueros activos y no exentos.
- **RF-09** Un arquero **importado** con inicio de cuotas en el pasado: no se generan cuotas de ciclos pasados; el ciclo vigente se crea como pagado automáticamente y se genera la próxima cuota a pagar.

### Estados
- **RF-10** Estados de una cuota:
  - **pendiente:** falta más de 5 días para su fecha de pago.
  - **por vencer:** desde 5 días antes de la fecha de pago hasta el día del vencimiento inclusive (incluye los días de gracia).
  - **vencida:** pasó el vencimiento sin pagarse.
  - **pagada:** el admin la registró (o se dio por pagada automáticamente).
  - **anulada:** el admin la dejó sin efecto, o se anuló por baja del arquero.
- **RF-11** El estado se calcula por fechas; no depende de que corra un proceso.
- **RF-12** El estado general de un arquero es el peor de sus cuotas impagas: vencida > por vencer > al día.

### Registro de pagos
- **RF-13** Solo el admin registra pagos: marca una cuota como pagada con la **fecha real de pago** (hoy por defecto).
- **RF-14** El admin puede deshacer un pago; la cuota vuelve al estado que corresponda por fecha.
- **RF-15** Cada pago, deshacer o anulación queda registrado (quién, cuándo, qué cambió).
- **RF-16** **Adelantos:** el admin puede marcar como pagadas varias cuotas futuras (hasta 12 meses); el sistema las crea si aún no existen. La generación automática no duplica cuotas ya creadas.
- **RF-17** El admin puede anular una cuota con una nota interna.

### Exentos
- **RF-18** El admin puede marcar a un arquero como **exento**, con una nota interna (becas, acuerdos, hijos del personal).
- **RF-19** Un arquero exento no genera cuotas ni avisos.
- **RF-20** Al quitar la marca se reinicia el ciclo desde esa fecha, como una reactivación (ver RF-22).

### Pausa, baja y reactivación
- **RF-21** Cuando un arquero pasa a inactivo o egresado: las cuotas futuras no pagadas se anulan, las **vencidas sin pagar se conservan como deuda** hasta que el admin las anule, y no se generan cuotas ni avisos nuevos.
- **RF-22** Al reactivar a un arquero, su inicio de cuotas pasa a ser la fecha de reactivación, y se asume que vuelve pagando el primer ciclo (se crea como pagado automáticamente, igual que en un alta). El admin puede deshacerlo.
- **RF-23** Si el admin cambia el inicio de cuotas, se regeneran las cuotas pendientes con las nuevas fechas; las pagadas no se tocan.

### Avisos por mail
- **RF-24** El sistema revisa las cuotas todos los días y manda mails a las **9:00 (hora de Argentina)**.
- **RF-25** Hay cuatro avisos por cuota impaga:
  1. 5 días antes de la fecha de pago.
  2. El día de la fecha de pago.
  3. El día del vencimiento, que es el último día de la gracia ("hoy vence el plazo"); la cuota todavía no figura vencida.
  4. 3 días después del vencimiento.
- **RF-26** Los avisos van a todos los tutores del arquero que tengan mail cargado; si dos tutores comparten mail, se manda uno solo.
- **RF-27** No se manda aviso si la cuota está pagada, anulada o el arquero es exento, inactivo o egresado, ni si la escuela está suspendida.
- **RF-28** Cada aviso se envía una sola vez (queda en el registro de envíos) aunque el proceso se ejecute más de una vez.
- **RF-29** El mail incluye el nombre de la escuela, el nombre del arquero, la fecha de pago o vencimiento y el contacto de la escuela. **No incluye montos.**
- **RF-30** Si el pago se registra el mismo día antes del envío, no se manda el aviso.
- **RF-31** Un tutor sin mail no recibe aviso; el estado se ve igual en el portal.

### Panel y resumen del admin
- **RF-32** Panel con las cuotas **por vencer** y **vencidas**, ordenado por urgencia, con el arquero, la fecha y los días de atraso.
- **RF-33** Desde el panel, el admin puede registrar el pago de una cuota con un toque.
- **RF-34** **Resumen de cobranza** por mes: cuotas pagadas, por vencer, vencidas y exentas, y el % de cuotas pagadas. El mes se determina por la fecha de pago de la cuota.
- **RF-35** El resumen incluye la lista de quién debe.
- **RF-36** El profesor no ve ninguna de estas pantallas.

### Portal de familia
- **RF-37** El tutor ve el estado de cada arquero (al día, por vencer, vencida) con la fecha de pago y la de vencimiento de la cuota actual.
- **RF-38** El tutor ve el historial de cuotas pagadas con su fecha de pago.
- **RF-39** El portal no muestra montos.
- **RF-40** Para un arquero exento, inactivo o egresado, el portal no muestra la sección de cuota.

## 5. Reglas de negocio
- **RN-01** Una cuota pertenece a una escuela y a un arquero, y tiene un número de ciclo.
- **RN-02** No puede haber dos cuotas del mismo número para el mismo arquero.
- **RN-03** Solo el admin puede modificar cuotas.
- **RN-04** El sistema no registra montos.
- **RN-05** Una cuota pagada no se vuelve a generar ni a avisar.
- **RN-06** Las deudas conservadas tras una baja no generan avisos.
- **RN-07** La eliminación definitiva de un arquero borra sus cuotas (spec 01).
- **RN-08** Las fechas se manejan en la zona horaria de Argentina.

## 6. Datos involucrados
Ver [docs/03-modelo-de-datos.md](../docs/03-modelo-de-datos.md). Cambios:
- `goalkeeper`: agregar `inicio_cuotas` y `exento` (booleano) con `nota_exento`.
- `fee` (cuota): `school_id`, `goalkeeper_id`, `numero`, `fecha_pago`, `vence_el`, `estado` (`pagada | anulada` guardado; el resto se calcula por fecha), `pagada_en`, `automatica` (booleano), `nota`, `registrada_por`. **Sin monto.**
- `payment`: se elimina; el pago es un cambio de estado de la cuota.
- `fee_revision`: registro de cambios.
- `notification_log`: tipo de aviso (`cuota_5_antes | cuota_dia_pago | cuota_vencimiento | cuota_3_despues`), `fee_id`, destinatario, fecha, estado.
- `school`: sin cambios; la hora de envío y los plazos son fijos del sistema.

## 7. Flujos

**F1 — Alta:** el admin da de alta al arquero → se propone el inicio de cuotas = fecha de ingreso → se crea la cuota 1 como pagada → 10 días antes del siguiente ciclo se genera la cuota 2.

**F2 — Pago:** el admin abre el panel o la ficha → toca "Marcar pagada" → confirma la fecha → la cuota queda pagada.

**F3 — Aviso:** cada día a las 9:00 el sistema busca cuotas que cumplen alguno de los cuatro momentos → envía el mail → lo registra.

**F4 — Adelanto:** el admin elige "Pagó por adelantado" → indica cuántos meses → el sistema crea y marca como pagadas esas cuotas.

**F5 — Baja y reactivación:** al pasar a inactivo, se anulan las futuras y se conservan las vencidas → al reactivar, se reinicia el ciclo y se asume el primer pago.

**F6 — Revisión mensual:** el admin abre el resumen de cobranza → ve los conteos y la lista de quién debe.

## 8. Criterios de aceptación
- **CA-01** Dado un arquero con inicio 12/03, entonces su cuota 2 tiene fecha de pago 12/04 y vence el 22/04.
- **CA-02** Dado el mismo arquero que paga la cuota 2 el 20/04, entonces la cuota 3 sigue con fecha de pago 12/05.
- **CA-03** Dado un arquero con inicio 31/01, entonces su cuota 2 tiene fecha de pago 28/02 (o 29/02 en bisiesto) y la cuota 3 el 31/03.
- **CA-04** Dada una cuota cuya fecha de pago es el 12/04, entonces se genera el 02/04 y el primer aviso sale el 07/04 a las 9:00.
- **CA-05** Dada una cuota ya avisada, cuando el proceso diario corre dos veces el mismo día, entonces el tutor recibe un solo mail.
- **CA-06** Dada una cuota pagada el día del aviso antes de las 9:00, entonces no se envía el aviso.
- **CA-07** Dado un arquero exento, entonces no se generan cuotas ni mails.
- **CA-08** Dado un arquero que pasa a inactivo con una cuota vencida y otra futura, entonces la vencida se conserva y la futura queda anulada.
- **CA-09** Dado un arquero reactivado, entonces su nuevo inicio es la fecha de reactivación y se crea una cuota 1 pagada automáticamente.
- **CA-10** Dado un arquero importado con inicio 5 meses atrás, entonces no se generan cuotas pasadas y se crea la próxima a pagar.
- **CA-11** Dado un adelanto de 3 meses, entonces las 3 cuotas siguientes quedan pagadas y la generación automática no las duplica.
- **CA-12** Dado un tutor sin mail, entonces no recibe avisos y ve el estado en el portal.
- **CA-13** Dado un profesor, cuando intenta abrir cuotas o el resumen, entonces recibe acceso denegado.
- **CA-14** Dados dos tutores del mismo arquero que comparten mail, entonces se envía un solo mail.
- **CA-15** Dado un pago deshecho, entonces la cuota vuelve al estado que le corresponde por fecha y queda registrado.
- **CA-16** Dado un tutor, cuando abre el portal, entonces no ve ningún monto.

## 9. Casos borde
- Cuota con fecha de pago en fin de semana o feriado: no se ajusta; las fechas son calendario.
- El proceso diario no corre un día (caída): al día siguiente envía los avisos atrasados pendientes, sin duplicar los ya enviados.
- Arquero que cambia de inicio de cuotas con cuotas ya avisadas: se regeneran solo las pendientes; los avisos ya enviados no se repiten.
- Tutor con mail inválido o rebotado: queda registrado como fallido; el admin lo ve en el registro de envíos.
- Cuota vencida que se anula: deja de contar como deuda y no se avisa.
- Arquero con dos cuotas vencidas: el panel las muestra por separado; el estado general es "vencida".
- Escuela suspendida: no se envían mails; las cuotas siguen su ciclo por fechas.
- Reactivación en la misma fecha del cambio de estado: se crea un único ciclo nuevo.
- Alta con fecha de ingreso futura: el inicio de cuotas queda en el futuro; no se generan cuotas ni avisos hasta 10 días antes de su primera fecha de pago.
- Fecha de pago registrada anterior al inicio de cuotas: se rechaza.

## 10. Seguridad y privacidad
- Solo el admin accede a cuotas y pagos; RLS por `school_id` y por rol.
- Los mails no incluyen datos sensibles ni montos.
- El tutor ve solo las cuotas de sus arqueros.
- Todo cambio de cuota queda auditado.
- El envío de mails respeta la baja de la escuela suspendida.

## 11. Preguntas abiertas
Ninguna pendiente de decisión.
