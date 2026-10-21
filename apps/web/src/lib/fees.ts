import { addDays } from "./dates";

/**
 * Reglas de fechas y estados de las cuotas (spec 06). Todo trabaja con fechas de calendario
 * "AAAA-MM-DD" en hora de Argentina; no hay horas ni husos acá.
 */

/** Días de gracia desde la fecha de pago hasta el vencimiento (RF-03). */
export const GRACE_DAYS = 10;
/** Cada cuota se genera con tanta anticipación a su fecha de pago (RF-07). */
export const GENERATION_LEAD_DAYS = 10;
/** Desde cuántos días antes de la fecha de pago la cuota figura "por vencer" (RF-10). */
export const DUE_SOON_DAYS = 5;
/** Máximo de meses que se pueden pagar por adelantado en un solo paso (RF-16). */
export const MAX_ADVANCE_MONTHS = 12;
/** Cuántos días después de su momento todavía se manda un aviso atrasado (caso borde: caída del proceso). */
export const NOTICE_CATCH_UP_DAYS = 3;

function parts(date: string): [number, number, number] {
  const [y, m, d] = date.split("-").map(Number);
  return [y, m, d];
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Suma `months` meses a una fecha conservando el día del mes; si el mes de destino no tiene ese
 * día, usa el último (RF-04). Se calcula siempre desde la fecha original, nunca encadenando.
 */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = parts(date);
  const index = y * 12 + (m - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  const day = Math.min(d, daysInMonth(year, month));
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export type FeeDates = { dueOn: string; graceUntil: string };

/** Fecha de pago y vencimiento de la cuota `number` (k ≥ 1) de un ciclo que empieza en `start` (RF-02 y RF-03). */
export function feeDates(start: string, number: number): FeeDates {
  const dueOn = addMonths(start, number - 1);
  return { dueOn, graceUntil: addDays(dueOn, GRACE_DAYS) };
}

/** Día desde el cual se genera la cuota (RF-07). */
export function generationDate(dueOn: string): string {
  return addDays(dueOn, -GENERATION_LEAD_DAYS);
}

export type StoredFeeStatus = "open" | "paid" | "void";
export type FeeStatus = "upcoming" | "due_soon" | "overdue" | "paid" | "void";

/** Estado de una cuota: lo guardado (pagada/anulada) y el resto por fechas (RF-10 y RF-11). */
export function feeStatus(
  fee: { status: StoredFeeStatus; dueOn: string; graceUntil: string },
  today: string,
): FeeStatus {
  if (fee.status === "paid") return "paid";
  if (fee.status === "void") return "void";
  if (today > fee.graceUntil) return "overdue";
  if (today >= addDays(fee.dueOn, -DUE_SOON_DAYS)) return "due_soon";
  return "upcoming";
}

export type StandingLevel = "current" | "due_soon" | "overdue";

/** Estado general de un arquero: el peor de sus cuotas impagas (RF-12). */
export function overallStanding(statuses: FeeStatus[]): StandingLevel {
  if (statuses.includes("overdue")) return "overdue";
  if (statuses.includes("due_soon")) return "due_soon";
  return "current";
}

/** Días de atraso respecto del vencimiento (0 si todavía no venció). */
export function daysOverdue(graceUntil: string, today: string): number {
  return Math.max(0, daysBetween(graceUntil, today));
}

/** Días entre dos fechas de calendario (positivo si `to` es posterior a `from`). */
export function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = parts(from);
  const [y2, m2, d2] = parts(to);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/**
 * Mayor número de cuota cuya fecha de pago ya llegó o pasó (la del ciclo vigente). Es 0 si el
 * inicio de cuotas es futuro.
 */
export function currentCycleNumber(start: string, today: string): number {
  if (start > today) return 0;
  const [sy, sm] = parts(start);
  const [ty, tm] = parts(today);
  let k = (ty - sy) * 12 + (tm - sm) + 1;
  while (k > 1 && feeDates(start, k).dueOn > today) k -= 1;
  while (feeDates(start, k + 1).dueOn <= today) k += 1;
  return k;
}

/** Mayor número de cuota que ya corresponde haber generado hoy (su fecha de pago está a 10 días o menos). */
export function lastGeneratableNumber(start: string, today: string): number {
  return currentCycleNumber(start, addDays(today, GENERATION_LEAD_DAYS));
}

export type PlannedFee = {
  number: number;
  dueOn: string;
  graceUntil: string;
  /** Se crea ya pagada (alta, importación, reactivación). */
  paidAutomatically: boolean;
};

/**
 * Cuotas que se crean cuando un ciclo nuevo empieza (alta, importación, reactivación o fin de la
 * exención), RF-06, RF-09 y RF-22:
 *  - inicio de hoy o anterior: la cuota del ciclo vigente se crea pagada automáticamente, sin
 *    generar los ciclos pasados;
 *  - si el inicio está en el pasado, además se crea ya la próxima a pagar (CA-10);
 *  - inicio futuro: no se crea nada; la generación diaria la crea 10 días antes de su fecha.
 */
export function initialFees(start: string, today: string): PlannedFee[] {
  if (start > today) return [];
  const current = currentCycleNumber(start, today);
  const planned: PlannedFee[] = [
    { number: current, ...feeDates(start, current), paidAutomatically: true },
  ];
  if (start < today) {
    planned.push({
      number: current + 1,
      ...feeDates(start, current + 1),
      paidAutomatically: false,
    });
  }
  return planned;
}

/**
 * Cuotas que la generación diaria tiene que crear para un ciclo (RF-07, RF-16 y caso borde del
 * proceso caído): desde la siguiente a la última existente hasta la que ya corresponde. Si el
 * ciclo no tiene ninguna cuota, solo se crea la vigente (no se inventan ciclos pasados).
 */
export function feesToGenerate(
  start: string,
  today: string,
  existingNumbers: number[],
): PlannedFee[] {
  const last = lastGeneratableNumber(start, today);
  if (last < 1) return [];
  const highest = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0;
  const first = highest > 0 ? highest + 1 : last;
  const planned: PlannedFee[] = [];
  for (let number = first; number <= last; number += 1) {
    if (existingNumbers.includes(number)) continue;
    planned.push({ number, ...feeDates(start, number), paidAutomatically: false });
  }
  return planned;
}

// ───────────────────────────── avisos por mail ─────────────────────────────

export const FEE_NOTICE_TYPES = [
  "fee_5_days_before",
  "fee_due_day",
  "fee_grace_ends",
  "fee_3_days_after",
] as const;
export type FeeNoticeType = (typeof FEE_NOTICE_TYPES)[number];

/** El día en que sale cada aviso (RF-25). */
export function noticeDate(
  type: FeeNoticeType,
  fee: { dueOn: string; graceUntil: string },
): string {
  switch (type) {
    case "fee_5_days_before":
      return addDays(fee.dueOn, -DUE_SOON_DAYS);
    case "fee_due_day":
      return fee.dueOn;
    case "fee_grace_ends":
      return fee.graceUntil;
    case "fee_3_days_after":
      return addDays(fee.graceUntil, 3);
  }
}

/**
 * El aviso que corresponde mandar hoy para una cuota impaga, o null. Es el último momento ya
 * alcanzado, si cayó hoy o dentro de la ventana de recuperación (un día sin proceso no pierde el
 * aviso, pero nunca se manda uno viejo cuando ya llegó el siguiente).
 */
export function noticeDueToday(
  fee: { dueOn: string; graceUntil: string },
  today: string,
): FeeNoticeType | null {
  let latest: FeeNoticeType | null = null;
  for (const type of FEE_NOTICE_TYPES) {
    if (noticeDate(type, fee) <= today) latest = type;
  }
  if (!latest) return null;
  return daysBetween(noticeDate(latest, fee), today) <= NOTICE_CATCH_UP_DAYS ? latest : null;
}

// ───────────────────────────── resumen de cobranza ─────────────────────────────

export type CollectionRow = {
  dueOn: string;
  status: FeeStatus;
};

export type CollectionSummary = {
  paid: number;
  dueSoon: number;
  overdue: number;
  upcoming: number;
  /** Arqueros activos marcados como exentos (no tienen cuotas). */
  exempt: number;
  /** Cuotas contadas para el porcentaje (sin anuladas). */
  total: number;
  /** % de cuotas pagadas sobre el total del mes; null si no hay cuotas. */
  paidPercent: number | null;
};

/** Resumen de un mes (RF-34): el mes lo da la fecha de pago de la cuota. */
export function collectionSummary(
  rows: CollectionRow[],
  month: string,
  exempt: number,
): CollectionSummary {
  const inMonth = rows.filter((r) => r.dueOn.startsWith(month) && r.status !== "void");
  const count = (status: FeeStatus) => inMonth.filter((r) => r.status === status).length;
  const total = inMonth.length;
  const paid = count("paid");
  return {
    paid,
    dueSoon: count("due_soon"),
    overdue: count("overdue"),
    upcoming: count("upcoming"),
    exempt,
    total,
    paidPercent: total === 0 ? null : Math.round((paid / total) * 100),
  };
}

// ───────────────────────────── textos de interfaz ─────────────────────────────

export const FEE_STATUS_LABELS: Record<FeeStatus, string> = {
  upcoming: "Pendiente",
  due_soon: "Por vencer",
  overdue: "Vencida",
  paid: "Pagada",
  void: "Anulada",
};

export const FEE_STATUS_TONES = {
  upcoming: "neutral",
  due_soon: "warning",
  overdue: "danger",
  paid: "success",
  void: "neutral",
} as const;

export const STANDING_LABELS: Record<StandingLevel, string> = {
  current: "Al día",
  due_soon: "Por vencer",
  overdue: "Vencida",
};

export const NOTICE_TYPE_LABELS: Record<FeeNoticeType, string> = {
  fee_5_days_before: "5 días antes",
  fee_due_day: "Día de pago",
  fee_grace_ends: "Vence el plazo",
  fee_3_days_after: "3 días después",
};

export const FEE_REVISION_LABELS: Record<string, string> = {
  paid: "Pago registrado",
  unpaid: "Pago deshecho",
  voided: "Cuota anulada",
  restored: "Cuota restaurada",
  created: "Cuota generada",
  auto_paid: "Pagada automáticamente",
  rescheduled: "Fechas reprogramadas",
};
