# 14 — Cuotas, avisos y suscripciones

- **Estado:** Hito 6 (implementado)
- **Specs:** [06 — Pagos y avisos](../specs/06-pagos-y-avisos.md), [07 — Planes y suscripciones](../specs/07-planes-y-suscripciones.md) y la parte de cuota de [04 — Portal de familia](../specs/04-portal-familia.md)

## Reglas de fechas (`apps/web/src/lib/fees.ts`)
- **Cuota *k*:** fecha de pago = `inicio + (k−1) meses`, calculada **siempre desde el inicio** (nunca encadenando) y con el último día del mes si falta el día (31/01 → 28/02 → 31/03). Vence 10 días después. Pagar tarde no corre el ciclo.
- **Estado por fecha (RF-10/11):** *pendiente* hasta 6 días antes de la fecha de pago; *por vencer* desde 5 días antes hasta el día del vencimiento inclusive; *vencida* desde el día siguiente. Lo guardado es solo `open`, `paid` o `void`.
- **Generación (RF-07):** cada cuota se crea 10 días antes de su fecha de pago. Si el proceso no corrió, recupera las que faltan sin duplicar. Un ciclo sin cuotas solo crea la vigente (no inventa ciclos pasados).
- **Ciclo nuevo (alta, importación, reactivación, fin de exención):** si el inicio es hoy o pasado, la cuota del ciclo vigente se crea **pagada automáticamente**; si el inicio es pasado, se crea además la próxima a pagar (CA-10). Con inicio futuro no se crea nada hasta 10 días antes.
- **Baja (RF-21):** al pasar a inactivo o egresado se anulan las cuotas abiertas cuya fecha de pago todavía no llegó. Las que ya llegaron (en gracia o vencidas) se conservan como deuda hasta que el admin las anule.
- **Series:** cada cuota guarda `series_start_on` (el inicio de cuotas con el que se generó). Al reactivar, quitar una exención o cambiar el inicio empieza una serie nueva y los números vuelven a 1 sin chocar con la anterior.
- **Cambio de inicio (RF-23):** las cuotas abiertas que todavía no vencieron se **reprograman en el lugar** (conservan su identidad, así los avisos ya enviados no se repiten); pagadas, anuladas y vencidas no se tocan.
- **Adelantos (RF-16):** pagan primero las cuotas abiertas que ya existen, en orden, y crean las que falten (hasta 12 meses).
- **Resumen de cobranza (RF-34):** cuenta por mes de la fecha de pago, sin anuladas; el porcentaje es pagadas ÷ total del mes. Los exentos se muestran aparte.

## Avisos por mail
- **Tarea diaria:** `GET /api/cron/daily` (protegida con `CRON_SECRET`). `vercel.json` la programa a las 12:00 UTC = **9:00 de Argentina**. Orden: genera cuotas → manda avisos → recalcula alertas del operador → manda su resumen. Es idempotente.
- **Cuatro momentos (RF-25):** 5 días antes del pago, día del pago, último día de la gracia y 3 días después del vencimiento. Cada día se manda el **último momento alcanzado**; si el proceso no corrió un día, el aviso sale al siguiente (ventana de 3 días) y nunca se manda uno viejo cuando ya llegó el siguiente.
- **Sin duplicados (RF-28):** `notification_log` tiene una fila única por cuota, tipo y destinatario, que se **reserva antes de enviar** (`pending`) y pasa a `sent` o `failed`. Dos procesos simultáneos no mandan el mismo mail. Un envío fallido se reintenta dentro de la ventana; los fallidos se ven en el panel de cuotas.
- **A quién:** tutores con mail, sin repetir direcciones (se normalizan a minúsculas). No se manda si la cuota está pagada o anulada, si el arquero es exento, inactivo o egresado, ni si la escuela está suspendida. Sin montos.
- **Mails de prueba:** mientras no haya dominio verificado en Resend, los mails solo llegan a la casilla del dueño de la cuenta; el resto queda registrado como fallido.

## Suscripciones (`apps/web/src/lib/subscription.ts`, `server/subscriptions.ts`)
- **Estado por fecha (RF-07/10):** *suspendida* si el operador la cortó; *en prueba* mientras la prueba no se cierre a mano (aunque su fecha ya pasó); *al día* hasta "cubierto hasta" inclusive; *vencida* después. Pasados 10 días de gracia se genera la alerta; **nunca se suspende sola**.
- **Pagos (RF-14/15):** cada pago suma sus meses a "cubierto hasta" contando desde el valor anterior. Guarda `covered_before` y `covered_after`: al deshacer el último pago vuelve al valor anterior; si hubo pagos posteriores, se le restan sus meses. Monto o meses en cero se rechazan. Un pago a una escuela suspendida **no la reactiva** (RF-27).
- **Cierre de prueba (RF-13):** pasar a pago con fecha de inicio del cobro (sin retroactividad), monto y meses; o suspender con la suspensión de siempre. El alta de una escuela admite además "sin prueba, con primer pago".
- **Historial (RF-03):** cada cambio de precio o tope queda en `subscription_change` con valor anterior y nuevo, autor, fecha y nota; también los ajustes de "cubierto hasta".
- **Alertas del operador (RF-29 a RF-31):** se **recalculan todos los días**. Una alerta cuya causa desaparece se resuelve sola; una descartada no se reabre mientras la causa siga y se olvida cuando la causa desaparece. El mail diario incluye solo las alertas nuevas desde el último resumen y no se manda si no hay novedades.
- **Topes (RF-20 a RF-22):** cuentan los arqueros **activos**, incluidos los exentos. Nada se bloquea. Aviso al 90% y al superar el 100%: el admin lo ve en su panel y en "Mi plan"; el operador, como alerta.
- **Qué ve cada rol:** el operador, todo (`/operator/escuelas/{slug}`, `/operator/ingresos`). El admin de la escuela, solo `getSchoolPlan` (uso, estado y próximo vencimiento: sin precio ni pagos). El profesor, nada de esto.

## Seguridad
- `fee`, `fee_revision` y `notification_log`: lectura solo del `school_admin` de la escuela (RLS); ninguna escritura desde el cliente. La familia consulta con la clave de servicio filtrando por tutor vinculado y nunca recibe notas ni montos.
- `subscription_payment`, `subscription_change` y `platform_alert`: sin políticas ni privilegios; solo el servidor con la clave secreta.
- Claves foráneas compuestas `(id, school_id)`: una cuota no puede apuntar a un arquero de otra escuela.
- Auditoría: pagos, deshacer, anulaciones, adelantos, exenciones, cambios de inicio, condiciones, pagos de la escuela, cierre de prueba y alertas descartadas.

## Pruebas
- Reglas puras: `src/lib/fees.test.ts` (ejemplos de la spec: inicio 12/03, inicio 31/01, adelantos, avisos) y `src/lib/subscription.test.ts`.
- Base de datos: `src/test/fees.db.test.ts` y `src/test/subscriptions.db.test.ts` (criterios de aceptación, idempotencia de avisos, aislamiento, permisos).
- End-to-end: `e2e/cuotas.spec.ts` (cuota vencida → pago de un toque → portal; profesor sin acceso; "Mi plan").

## Pendiente para el lanzamiento
- Activar la tarea programada en Vercel y definir `CRON_SECRET` en producción.
- Verificar el dominio en Resend (SPF y DKIM) para que los avisos lleguen a las familias.
