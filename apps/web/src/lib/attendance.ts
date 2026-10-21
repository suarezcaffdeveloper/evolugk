import { addDays } from "./dates";

/**
 * Reglas de asistencia (spec 05): porcentaje, rachas de ausencias, calendario y resúmenes. Son
 * funciones puras sobre registros ya leídos; quien las llama decide a qué arquero y escuela
 * pertenecen.
 */

export const ENTRY_STATUSES = ["unmarked", "present", "absent", "excused"] as const;
export type EntryStatus = (typeof ENTRY_STATUSES)[number];
export type SessionStatus = "open" | "suspended";

/** Lo que se marca con un toque: no hay forma de volver a "sin marcar" desde la lista. */
export const MARKABLE_STATUSES = ["present", "absent", "excused"] as const;
export type MarkableStatus = (typeof MARKABLE_STATUSES)[number];

export const ENTRY_LABELS: Record<EntryStatus, string> = {
  unmarked: "Sin marcar",
  present: "Presente",
  absent: "Ausente",
  excused: "Justificada",
};

export function isMarkable(value: unknown): value is MarkableStatus {
  return MARKABLE_STATUSES.includes(value as MarkableStatus);
}

/** Ventana del porcentaje (RF-16). */
export const ATTENDANCE_WINDOW_DAYS = 90;
/** Por debajo de este porcentaje, un arquero figura con baja asistencia (RF-23). */
export const LOW_ATTENDANCE_PERCENT = 70;
/** Ausencias seguidas sin justificar que generan el aviso al admin (RF-24). */
export const STREAK_ALERT_LENGTH = 3;

export type AttendanceRecord = {
  /** Fecha de la sesión, "AAAA-MM-DD". */
  date: string;
  sessionStatus: SessionStatus;
  entryStatus: EntryStatus;
  /** Desempata sesiones de la misma fecha (por ejemplo, un invitado en dos grupos). */
  createdAt?: string;
};

export type AttendanceSummary = {
  present: number;
  absent: number;
  excused: number;
  suspended: number;
  unmarked: number;
  /** Sesiones que entran en el cálculo: presentes + ausentes. */
  counted: number;
  /** Porcentaje entero, o null si no hay datos para calcularlo ("sin datos", nunca 0%). */
  percent: number | null;
};

/** ¿La fecha cae dentro de los últimos 90 días contando hoy? */
export function isInWindow(date: string, today: string): boolean {
  return date > addDays(today, -ATTENDANCE_WINDOW_DAYS) && date <= today;
}

/**
 * Porcentaje de asistencia (RF-16): presentes ÷ sesiones en las que estaba en la lista, sin contar
 * ausencias justificadas, sesiones suspendidas ni arqueros sin marcar, en los últimos 90 días.
 * Con denominador 0 no hay porcentaje (spec 05, casos borde).
 */
export function attendanceSummary(
  records: readonly AttendanceRecord[],
  today: string,
): AttendanceSummary {
  const summary: AttendanceSummary = {
    present: 0,
    absent: 0,
    excused: 0,
    suspended: 0,
    unmarked: 0,
    counted: 0,
    percent: null,
  };
  for (const record of records) {
    if (!isInWindow(record.date, today)) continue;
    if (record.sessionStatus === "suspended") summary.suspended += 1;
    else summary[record.entryStatus] += 1;
  }
  summary.counted = summary.present + summary.absent;
  summary.percent =
    summary.counted === 0 ? null : Math.round((summary.present / summary.counted) * 100);
  return summary;
}

/** Baja asistencia (RF-23): hay datos y el porcentaje es menor al 70%. */
export function isLowAttendance(percent: number | null): boolean {
  return percent !== null && percent < LOW_ATTENDANCE_PERCENT;
}

function chronological(records: readonly AttendanceRecord[]): AttendanceRecord[] {
  return [...records].sort(
    (a, b) => a.date.localeCompare(b.date) || (a.createdAt ?? "").localeCompare(b.createdAt ?? ""),
  );
}

/**
 * Ausencias seguidas sin justificar al día de hoy (RN-03): se cuentan sobre las sesiones en las
 * que el arquero estaba en la lista, en orden de fecha, ignorando las suspendidas. Una asistencia
 * o una justificada corta la racha; un arquero sin marcar no suma ni corta (no hay dato).
 * Devuelve el largo de la racha y la fecha de su primera ausencia (para no avisar dos veces la
 * misma racha).
 */
export function absenceStreakInfo(records: readonly AttendanceRecord[]): {
  length: number;
  startedOn: string | null;
} {
  let length = 0;
  let startedOn: string | null = null;
  for (const record of chronological(records).reverse()) {
    if (record.sessionStatus === "suspended" || record.entryStatus === "unmarked") continue;
    if (record.entryStatus !== "absent") break;
    length += 1;
    startedOn = record.date;
  }
  return { length, startedOn };
}

export function absenceStreak(records: readonly AttendanceRecord[]): number {
  return absenceStreakInfo(records).length;
}

// ───────────────────────────── calendario ─────────────────────────────

export type DayStatus = "present" | "absent" | "excused" | "suspended" | "unmarked";

/** Si un día tuvo varias sesiones, se muestra la más relevante para quien mira. */
const DAY_PRIORITY: DayStatus[] = ["absent", "present", "excused", "suspended", "unmarked"];

export function dayStatusOf(records: readonly AttendanceRecord[]): DayStatus | null {
  if (records.length === 0) return null;
  const statuses = records.map((r): DayStatus =>
    r.sessionStatus === "suspended" ? "suspended" : r.entryStatus,
  );
  return DAY_PRIORITY.find((s) => statuses.includes(s)) ?? null;
}

export type CalendarCell = { date: string; day: number; status: DayStatus | null } | null;

/**
 * Calendario de un mes (RF-17): semanas de lunes a domingo, con `null` en los huecos antes del
 * día 1 y después del último día.
 */
export function monthCalendar(
  year: number,
  month: number,
  records: readonly AttendanceRecord[],
): CalendarCell[][] {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  // getUTCDay: domingo = 0. Se pasa a lunes = 0.
  const offset = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;

  const byDate = new Map<string, AttendanceRecord[]>();
  for (const record of records) {
    byDate.set(record.date, [...(byDate.get(record.date) ?? []), record]);
  }

  const cells: CalendarCell[] = Array.from({ length: offset }, () => null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    cells.push({ date, day, status: dayStatusOf(byDate.get(date) ?? []) });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  return Array.from({ length: cells.length / 7 }, (_, week) => cells.slice(week * 7, week * 7 + 7));
}

/** "2026-10" → { year: 2026, month: 10 }, o null si no es un mes válido. */
export function parseMonth(value: string | undefined): { year: number; month: number } | null {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value ?? "");
  return match ? { year: Number(match[1]), month: Number(match[2]) } : null;
}

export function shiftMonth(year: number, month: number, delta: number): string {
  const index = year * 12 + (month - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

export const MONTH_NAMES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

// ───────────────────────────── resumen de un grupo ─────────────────────────────

export type SessionDigest = { sessionStatus: SessionStatus; entries: EntryStatus[] };

/**
 * Resumen de un grupo en un mes (RF-22): cantidad de entrenamientos y asistencia promedio. Un
 * entrenamiento es una sesión no suspendida con al menos una marca (RN-07). El promedio es
 * presentes ÷ (presentes + ausentes) sobre todas las marcas del mes; null si no hay datos.
 */
export function groupMonthSummary(sessions: readonly SessionDigest[]): {
  trainings: number;
  average: number | null;
} {
  let trainings = 0;
  let present = 0;
  let absent = 0;
  for (const session of sessions) {
    if (session.sessionStatus === "suspended") continue;
    const marked = session.entries.filter((e) => e !== "unmarked");
    if (marked.length === 0) continue;
    trainings += 1;
    present += marked.filter((e) => e === "present").length;
    absent += marked.filter((e) => e === "absent").length;
  }
  const counted = present + absent;
  return { trainings, average: counted === 0 ? null : Math.round((present / counted) * 100) };
}
