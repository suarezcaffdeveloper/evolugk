/** Fechas de calendario en hora de Argentina (spec 06 y 07: todas las fechas se manejan ahí). */

export const TIME_ZONE = "America/Argentina/Buenos_Aires";

const DATE_PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** La fecha de calendario de un instante, en Argentina, como "AAAA-MM-DD". */
export function argentinaDate(instant: Date): string {
  return DATE_PARTS.format(instant);
}

/** Suma días a una fecha "AAAA-MM-DD" (calendario puro, sin horas ni husos). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const result = new Date(Date.UTC(y, m - 1, d + days));
  return result.toISOString().slice(0, 10);
}

/** La fecha de calendario, en Argentina, que queda `days` días después de hoy. */
export function argentinaDatePlusDays(now: Date, days: number): string {
  return addDays(argentinaDate(now), days);
}

/** "19 de noviembre de 2026" a partir de una fecha de calendario "AAAA-MM-DD". */
export function formatCalendarDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  // Se formatea en UTC porque es una fecha de calendario sin hora: no debe correrse por husos horarios.
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}
