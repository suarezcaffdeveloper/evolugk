# 13 — Asistencia y toma de lista sin conexión

- **Estado:** Hito 5 (implementado)
- **Spec:** [05 — Asistencia](../specs/05-asistencia.md) y la parte de asistencia de [04 — Portal de familia](../specs/04-portal-familia.md)

## Reglas de cálculo (`apps/web/src/lib/attendance.ts`)
- **Porcentaje (RF-16):** presentes ÷ (presentes + ausentes), en los **últimos 90 días contando hoy** (del día −89 al día 0). No cuentan las justificadas, las sesiones suspendidas ni los arqueros sin marcar. Con denominador 0 se muestra "sin datos", nunca 0%.
- **Racha de ausencias (RN-03):** sobre las sesiones en las que el arquero estaba en la lista, por fecha. Una presente o una justificada **corta** la racha; una sesión suspendida o un arquero sin marcar **no suman ni cortan**. Con 3 o más ausencias seguidas se genera un aviso para el admin (solo dentro del sistema, sin mails).
- **Aviso una vez por racha (RF-25):** el aviso recuerda la fecha en que empezó la racha (`admin_alert.streak_started_on`). No se repite mientras sea la misma racha, ni aunque el admin lo descarte; se cierra solo cuando la racha se corta (el arquero vuelve a asistir o se corrige una ausencia).
- **Resumen por grupo y mes (RF-22):** un entrenamiento es una sesión no suspendida con al menos una marca (RN-07). La asistencia promedio es presentes ÷ (presentes + ausentes) sobre todas las marcas del mes.
- **Baja asistencia (RF-23):** menos de 70% con datos, solo arqueros activos. Lo ven el admin y los profesores; los avisos de ausencias seguidas, solo el admin.

## Cómo funciona sin conexión
1. **Precarga:** al abrir `/{slug}/panel/asistencia` con conexión, el celular guarda en IndexedDB los grupos vigentes con sus miembros activos y los arqueros activos (para buscar invitados). Una base por persona (`evolugk-attendance-<id>`): las marcas pendientes de una cuenta nunca se envían con la sesión de otra.
2. **Service worker (`public/sw.js`):** solo activo en producción. Guarda los archivos estáticos de la app y la página de asistencia, y la sirve desde la copia si no hay red (con señal mala espera 4 segundos y usa la copia). No intercepta nada más.
3. **Marcar:** cada toque se aplica primero en el celular, al instante (lista local), y queda como "pendiente". Con conexión se envía solo (tras una pausa corta para juntar toques), al volver la señal y cada 15 segundos si el primer intento falló. El botón "Guardar" fuerza el envío.
4. **Estado visible (RF-28):** "Con conexión / Sin conexión", "Pendientes de sincronizar" con la lista de sesiones pendientes y "Sincronizada hace X".
5. **Conflictos (RF-29):** cada marca viaja con la hora en que se hizo en el celular (acotada a la hora del servidor). Prevalece la **más reciente**; el empate lo gana lo que ya estaba. Cada cambio queda en `attendance_revision`; el que pierde queda registrado como **descartado**. Tomar lista dos veces la misma fecha y grupo no duplica la sesión: se une con la existente (RF-02).
6. **Límites sin conexión (RF-30):** sin conexión solo se toma la lista **de hoy**, de un grupo precargado. Informes, avisos, suspender, borrar y corregir listas de otras fechas requieren conexión.
7. **Privacidad en el celular:** al llegar a la pantalla de ingreso se borra la copia guardada de la página. Los datos de otras cuentas se borran solos si no tienen marcas pendientes. Las marcas pendientes se conservan hasta que esa cuenta vuelva a ingresar y se sincronicen.

## Pruebas
- Reglas puras: `src/lib/attendance.test.ts` (porcentaje, rachas, calendario, resúmenes) y `src/lib/attendance-offline.test.ts` (lista local, marcas, invitados, mezcla con el servidor).
- Base de datos: `src/test/attendance.db.test.ts` (criterios de aceptación, conflictos, avisos, informes, familia y aislamiento entre escuelas).
- End-to-end: `e2e/asistencia.spec.ts`. El flujo sin conexión necesita la aplicación compilada: `E2E_PROD=1 E2E_PORT=3100 pnpm test:e2e e2e/asistencia.spec.ts` (si no, se omite).

## Pendiente para probar a mano
Probar en celulares reales (Android e iPhone): instalar la app, abrir Asistencia con conexión, activar modo avión, tomar lista, cerrar y abrir la app, y volver a conectar. El comportamiento de IndexedDB y del service worker puede variar entre navegadores (en iPhone, el almacenamiento de una web que no está instalada se puede borrar tras unos días sin uso).
