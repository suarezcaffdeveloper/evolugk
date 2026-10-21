import { addDays } from "./dates";
import { addMonths, daysBetween } from "./fees";

/** Reglas de la suscripción de cada escuela (spec 07). Fechas de calendario en hora de Argentina. */

/** Días de gracia desde "cubierto hasta" (RF-09). */
export const SUBSCRIPTION_GRACE_DAYS = 10;
/** Cuántos días antes se avisa que una prueba o una suscripción está por vencer (RF-29). */
export const EXPIRY_WARNING_DAYS = 7;
export const MAX_MONTHS_PER_PAYMENT = 60;

export type SubscriptionState = "trial" | "current" | "overdue" | "suspended";

export type SubscriptionDates = {
  trialUntil: string | null;
  coveredUntil: string;
  manuallySuspended: boolean;
};

/**
 * Estado calculado por fechas (RF-07 y RF-10): suspendida si el operador la cortó; en prueba
 * mientras la prueba no se haya cerrado a mano (aunque su fecha ya haya pasado, RF-12); al día
 * hasta "cubierto hasta" inclusive; vencida después.
 */
export function subscriptionState(sub: SubscriptionDates, today: string): SubscriptionState {
  if (sub.manuallySuspended) return "suspended";
  if (sub.trialUntil !== null) return "trial";
  return today > sub.coveredUntil ? "overdue" : "current";
}

/** Pasaron los 10 días de gracia desde "cubierto hasta" (RF-09). No suspende nada. */
export function graceEnded(sub: SubscriptionDates, today: string): boolean {
  return (
    !sub.manuallySuspended &&
    sub.trialUntil === null &&
    today > addDays(sub.coveredUntil, SUBSCRIPTION_GRACE_DAYS)
  );
}

/** Un pago suma sus meses a "cubierto hasta", contando desde el valor anterior (RF-15). */
export function coveredUntilAfterPayment(coveredUntil: string, months: number): string {
  return addMonths(coveredUntil, months);
}

/** Días que faltan para "cubierto hasta" (negativo si ya pasó). */
export function daysUntilCovered(sub: SubscriptionDates, today: string): number {
  return daysBetween(today, sub.coveredUntil);
}

export type PlatformAlertType =
  | "trial_ending"
  | "trial_expired"
  | "expiring_soon"
  | "overdue"
  | "grace_ended"
  | "goalkeeper_limit_90"
  | "goalkeeper_limit_exceeded"
  | "video_limit_80"
  | "video_limit_100";

export const PLATFORM_ALERT_TYPES: PlatformAlertType[] = [
  "trial_ending",
  "trial_expired",
  "expiring_soon",
  "overdue",
  "grace_ended",
  "goalkeeper_limit_90",
  "goalkeeper_limit_exceeded",
  "video_limit_80",
  "video_limit_100",
];

export type AlertInput = {
  subscription: SubscriptionDates;
  goalkeeperLimit: number;
  activeGoalkeepers: number;
  videoPercent: number;
};

/**
 * Las alertas que hoy corresponden a una escuela (RF-29). Se recalcula todos los días: una
 * alerta que ya no figura acá se resuelve sola (RF-31). Una escuela suspendida no genera alertas.
 */
export function platformAlertsFor(input: AlertInput, today: string): PlatformAlertType[] {
  const { subscription: sub } = input;
  const alerts: PlatformAlertType[] = [];
  if (!sub.manuallySuspended) {
    const remaining = daysUntilCovered(sub, today);
    if (sub.trialUntil !== null) {
      if (remaining < 0) alerts.push("trial_expired");
      else if (remaining <= EXPIRY_WARNING_DAYS) alerts.push("trial_ending");
    } else if (remaining < 0) {
      alerts.push("overdue");
      if (graceEnded(sub, today)) alerts.push("grace_ended");
    } else if (remaining <= EXPIRY_WARNING_DAYS) {
      alerts.push("expiring_soon");
    }
  }
  // Los topes de arqueros: 90% y superado (RF-22). Llegar justo al 100% sigue siendo "90%".
  if (input.goalkeeperLimit > 0) {
    if (input.activeGoalkeepers > input.goalkeeperLimit) alerts.push("goalkeeper_limit_exceeded");
    else if (input.activeGoalkeepers >= Math.ceil(input.goalkeeperLimit * 0.9)) {
      alerts.push("goalkeeper_limit_90");
    }
  }
  if (input.videoPercent >= 100) alerts.push("video_limit_100");
  else if (input.videoPercent >= 80) alerts.push("video_limit_80");
  return alerts;
}

export type GoalkeeperUsage = {
  active: number;
  limit: number;
  percent: number;
  level: "ok" | "near" | "exceeded";
};

/** Uso del tope de arqueros activos (RF-20 a RF-22). */
export function goalkeeperUsage(active: number, limit: number): GoalkeeperUsage {
  const percent = limit > 0 ? Math.round((active / limit) * 100) : 0;
  const level = active > limit ? "exceeded" : active >= Math.ceil(limit * 0.9) ? "near" : "ok";
  return { active, limit, percent, level };
}
