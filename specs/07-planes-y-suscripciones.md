# 07 — Planes y suscripciones

- **Estado:** Aprobada
- **Depende de:** [00 — Auth y tenancy](00-auth-y-tenancy.md), [01 — Arqueros y fichas](01-arqueros-y-fichas.md), [03 — Videos](03-videos.md)

## 1. Objetivo
Definir lo que cada escuela contrata con la plataforma (precio, tope de arqueros y tope de minutos de video), cómo se registra su pago y cuándo se la considera al día, vencida o suspendida. Es la relación comercial entre el operador y cada escuela; no tiene relación con las cuotas que los arqueros pagan a su escuela (spec 06).

## 2. Alcance
**Entra:**
- Condiciones a medida por escuela: precio mensual en pesos, tope de arqueros, tope de minutos de video.
- Período de prueba definido al crear la escuela.
- Estados: en prueba, al día, vencida, suspendida.
- Registro manual de pagos de la escuela, con fecha, monto y meses cubiertos.
- Seguimiento del uso contra los topes, con avisos.
- Historial de cambios de condiciones.
- Suspensión y reactivación manuales.
- Panel de alertas del operador y mail diario con resumen.
- Vista "Mi plan" para el admin de la escuela.

**No entra (MVP):**
- Catálogo de planes fijos (Inicial, Escuela, Academia).
- Cobro automático o suscripciones por MercadoPago.
- Facturación electrónica y comprobantes.
- Varias monedas.
- Suspensión automática por falta de pago.
- Descuentos o promociones configurables.
- Autoregistro de escuelas.

## 3. Actores
| Actor | Qué hace |
|---|---|
| Operador (`platform_admin`) | Define condiciones, registra pagos, suspende y reactiva, ve alertas e ingresos |
| Admin de escuela | Ve el uso de su plan, el estado de su suscripción y su próximo vencimiento |
| Profesor | No accede a nada de esta spec |
| Sistema | Calcula estados, avisos y topes |

## 4. Requisitos funcionales

### Condiciones de cada escuela
- **RF-01** Cada escuela tiene una suscripción con condiciones propias: **precio mensual en pesos**, **tope de arqueros activos** y **tope de minutos de video**.
- **RF-02** Solo el operador define y modifica las condiciones.
- **RF-03** Cada cambio de condiciones queda registrado con fecha, valor anterior, valor nuevo, quién lo hizo y una nota. El cambio rige desde el momento en que se hace.
- **RF-04** Subir un tope de video se aplica de inmediato y destraba las subidas bloqueadas (spec 03).

### Alta de la escuela
- **RF-05** Al crear una escuela (spec 00), el operador elige una de dos opciones:
  - **Con período de prueba:** indica la duración (por ejemplo 30 días).
  - **Sin prueba, con primer pago:** indica el monto y los meses cubiertos.
- **RF-06** Al crear la escuela se cargan también el precio mensual y los dos topes.

### Estados
- **RF-07** Estados de la suscripción:
  - **en prueba:** dentro del período de prueba, o con la prueba pasada pero sin cerrar.
  - **al día:** la escuela tiene pago hasta una fecha futura o igual a hoy.
  - **vencida:** pasó la fecha hasta la cual estaba paga; sigue funcionando con normalidad.
  - **suspendida:** el operador cortó el acceso.
- **RF-08** El sistema guarda la fecha **"cubierto hasta"**: el día hasta el cual la escuela tiene pago. Durante la prueba es el fin de la prueba. Es la **próxima fecha de pago**.
- **RF-09** Una suscripción está **vencida** cuando hoy es posterior a "cubierto hasta". Tiene **10 días de gracia**: pasados esos 10 días queda marcada como "gracia terminada" y se genera una alerta para el operador. No se suspende sola.
- **RF-10** El estado se calcula por fechas; no depende de que corra un proceso.

### Período de prueba
- **RF-11** Una escuela en prueba tiene todas las funciones y topes de su suscripción.
- **RF-12** Al terminar la fecha de prueba sin acción del operador, la escuela **sigue en prueba** hasta que el operador la cierre a mano.
- **RF-13** El operador cierra la prueba de dos maneras: **pasar a pago** (indica fecha de inicio del cobro, por defecto hoy, y los meses del primer pago con su monto) o **suspender**.

### Pagos de la escuela
- **RF-14** El operador registra cada pago con: fecha de pago, monto en pesos, cantidad de meses cubiertos (uno o más) y una nota opcional.
- **RF-15** Cada pago suma sus meses a "cubierto hasta", contando desde el valor anterior (no desde la fecha del pago).
- **RF-16** Un pago de varios meses (trimestral, anual) se registra como un solo pago.
- **RF-17** El operador puede deshacer un pago o ajustar "cubierto hasta" a mano, con una nota; queda registrado.
- **RF-18** El operador ve un **estado de cuenta** por escuela: precio pactado, pagos registrados, "cubierto hasta" y estado.
- **RF-19** El operador ve un **resumen de ingresos** por mes: suma de los montos de los pagos registrados. Solo el operador accede a estos datos.

### Topes de arqueros
- **RF-20** Cuentan para el tope los arqueros en estado **activo**, incluidos los exentos de cuota; no cuentan los inactivos ni los egresados.
- **RF-21** No se bloquean las altas ni la importación al llegar al tope.
- **RF-22** Al llegar al 90% del tope y al superar el 100%, se avisa dentro del sistema al admin de la escuela y al operador. Una escuela por encima del tope queda marcada en el panel del operador para renegociar.

### Topes de video
- **RF-23** Se aplican los avisos y el bloqueo definidos en la spec 03: aviso al 80% y bloqueo de subidas al 100%.
- **RF-24** El operador ve el uso de video de cada escuela contra su tope.

### Suspensión y reactivación
- **RF-25** Solo el operador suspende una escuela; es una decisión manual.
- **RF-26** Una escuela suspendida se comporta según la spec 00: nadie puede entrar, los datos se conservan 90 días y luego el operador decide si borrarlos.
- **RF-27** Al registrar el pago de una escuela suspendida, el sistema sugiere reactivarla, pero **la reactivación es una acción explícita aparte**.
- **RF-28** Al reactivar, la escuela vuelve al estado que corresponde por fechas (al día o vencida) y recupera el acceso con todos sus datos.

### Alertas y avisos al operador
- **RF-29** El panel del operador muestra alertas de: pruebas por terminar (7 días antes) o pasadas sin cerrar, suscripciones por vencer (7 días antes), suscripciones vencidas, gracia terminada, topes de arqueros (90% y superado) y topes de video (80% y 100%).
- **RF-29b** Una prueba que pasó su fecha sin cerrar queda como alerta hasta que el operador la cierre.
- **RF-30** Cada día a las 9:00 (hora de Argentina) el operador recibe un mail con el resumen **solo si hay novedades**.
- **RF-31** Las alertas se resuelven solas cuando la causa desaparece (por ejemplo, se registra el pago) o el operador las descarta.

### Vista de la escuela ("Mi plan")
- **RF-32** El admin de la escuela ve: arqueros activos contra su tope, minutos de video contra su tope, estado de la suscripción y "cubierto hasta" como próximo vencimiento.
- **RF-33** El admin de la escuela **no ve el precio** ni los pagos de la suscripción.
- **RF-34** Los profesores no ven esta pantalla.

## 5. Reglas de negocio
- **RN-01** Una escuela tiene una sola suscripción.
- **RN-02** El precio es en pesos argentinos.
- **RN-03** El sistema no cobra: solo registra lo que el operador cobra por fuera.
- **RN-04** Los pagos de la escuela y las condiciones comerciales son visibles solo para el operador.
- **RN-05** La gracia es de 10 días y no suspende nada por sí sola.
- **RN-06** La suspensión y la reactivación son siempre manuales.
- **RN-07** Todo cambio de condiciones, pago o suspensión queda auditado.
- **RN-08** Las fechas se manejan en zona horaria de Argentina.

## 6. Datos involucrados
Ver [docs/03-modelo-de-datos.md](../docs/03-modelo-de-datos.md). Cambios propuestos (a aplicar con tu OK):
- Se elimina `plan` (no hay catálogo en el MVP).
- `subscription`: `school_id` (único), `estado` (calculado: `prueba | al_dia | vencida | suspendida`; se guarda solo la suspensión), `precio_mensual_ars`, `tope_arqueros`, `tope_minutos_video`, `prueba_hasta`, `cubierto_hasta`, `suspendida_manual`.
- `subscription_payment`: `school_id`, `fecha_pago`, `monto_ars`, `meses_cubiertos`, `nota`, `registrado_por`, `anulado`.
- `subscription_change`: `school_id`, `campo`, `valor_anterior`, `valor_nuevo`, `nota`, `hecho_por`, `hecho_en`.
- `platform_alert`: `tipo`, `school_id`, `creada_en`, `resuelta_en`, `descartada`.
- `school.estado` queda como `activa | suspendida`, coherente con la suscripción.

## 7. Flujos

**F1 — Alta con prueba:** el operador crea la escuela con precio, topes y 30 días de prueba → la escuela queda en prueba con "cubierto hasta" = fin de prueba.

**F2 — Cierre de prueba:** el operador abre la escuela → "Cerrar prueba" → elige pasar a pago (fecha de inicio, meses y monto) → la escuela pasa a "al día".

**F3 — Cobro mensual:** el operador cobra por fuera → registra el pago (fecha, monto, 1 mes) → "cubierto hasta" avanza un mes.

**F4 — Pago anual:** el operador registra un pago de 12 meses → "cubierto hasta" avanza 12 meses.

**F5 — Falta de pago:** pasa "cubierto hasta" → la escuela figura vencida → a los 10 días se genera la alerta de gracia terminada → el operador decide si suspender.

**F6 — Suspensión y vuelta:** el operador suspende → la escuela no puede entrar → luego registra el pago → el sistema sugiere reactivar → el operador reactiva.

**F7 — Crecimiento:** la escuela llega al 90% de su tope de arqueros → aviso a la escuela y al operador → el operador renegocia y sube el tope (queda en el historial).

## 8. Criterios de aceptación
- **CA-01** Dada una escuela creada con 30 días de prueba, entonces figura "en prueba" y "cubierto hasta" es el día 30.
- **CA-02** Dada una prueba que llegó a su fin sin que el operador haga nada, entonces la escuela sigue funcionando en prueba y figura una alerta en el panel.
- **CA-03** Dado un pago de 1 mes registrado con "cubierto hasta" = 15/03, entonces "cubierto hasta" pasa a 15/04, aunque el pago se haya hecho el 20/03.
- **CA-04** Dado un pago de 12 meses, entonces "cubierto hasta" avanza 12 meses con un solo registro.
- **CA-05** Dada una escuela con "cubierto hasta" 15/03 y fecha de hoy 20/03, entonces figura vencida y sigue funcionando.
- **CA-06** Dada la misma escuela el 26/03 (más de 10 días), entonces se marca "gracia terminada", se crea la alerta y la escuela **no** se suspende sola.
- **CA-07** Dada una escuela con 90 de 100 arqueros activos, entonces el admin de la escuela y el operador reciben el aviso del 90%.
- **CA-08** Dada una escuela con 105 arqueros activos y tope 100, entonces se pueden seguir dando de alta arqueros y la escuela queda marcada para renegociar.
- **CA-09** Dado un arquero inactivo, entonces no cuenta para el tope.
- **CA-10** Dado un cambio de precio, entonces queda registrado con valor anterior, valor nuevo, quién lo hizo y fecha.
- **CA-11** Dada una escuela suspendida a la que se le registra un pago, entonces sigue suspendida hasta que el operador la reactive; el sistema sugiere hacerlo.
- **CA-12** Dado un admin de escuela, cuando abre "Mi plan", entonces ve el uso y el vencimiento, pero no el precio ni los pagos.
- **CA-13** Dado el operador sin novedades en el día, entonces no recibe el mail resumen.
- **CA-14** Dado un pago deshecho, entonces "cubierto hasta" vuelve al valor anterior y queda registrado.
- **CA-15** Dado un profesor, cuando intenta abrir "Mi plan", entonces recibe acceso denegado.

## 9. Casos borde
- Pago de varios meses cuando "cubierto hasta" ya está muy atrasado: el pago suma meses desde el valor anterior y la escuela puede seguir vencida; el operador ajusta "cubierto hasta" a mano con una nota.
- Día 31: el "cubierto hasta" se calcula sumando meses al día del mes original, usando el último día del mes si hace falta.
- Cierre de prueba hecho tarde: el operador indica la fecha de inicio del cobro; no se cobra con retroactividad.
- Escuela suspendida durante la prueba: queda suspendida; al reactivarla vuelve a "en prueba" con su fecha de fin original.
- Cambio de precio el mismo día de un pago: rige el valor vigente al registrar el pago; el pago guarda el monto cobrado.
- Tope de arqueros reducido por debajo del uso actual: se marca como superado sin bloquear nada.
- Baja de la escuela por falta de pago prolongada: suspensión, 90 días, y el operador decide el borrado (spec 00).
- Pago registrado por error con monto 0 o meses 0: se rechaza.
- Dos operadores registran el mismo pago: no hay control de duplicados en el MVP; el historial permite deshacer.

## 10. Seguridad y privacidad
- Solo el operador (con verificación en dos pasos) accede a precios, pagos y alertas.
- El admin de escuela solo ve su propio uso y estado, sin importes.
- Aislamiento por `school_id`; las tablas de suscripción se leen solo con el rol de servicio.
- Toda acción queda auditada.

## 11. Preguntas abiertas
Ninguna pendiente de decisión.
