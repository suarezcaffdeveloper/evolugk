import type { SupabaseClient } from "@supabase/supabase-js";
import { argentinaDate } from "@/lib/dates";
import {
  coveredUntilAfterPayment,
  daysUntilCovered,
  goalkeeperUsage,
  graceEnded,
  MAX_MONTHS_PER_PAYMENT,
  platformAlertsFor,
  subscriptionState,
  type GoalkeeperUsage,
  type PlatformAlertType,
  type SubscriptionState,
} from "@/lib/subscription";
import { getAppUrl } from "./config";
import { operatorSummaryEmail } from "./email/templates";
import type { EmailTransport } from "./email/transport";
import { getVideoQuota } from "./videos";
import type { Quota } from "@/lib/video-schemas";

/**
 * Suscripciones de las escuelas (spec 07). Solo las usa el operador, salvo `getSchoolPlan`, que
 * es lo único que ve el admin de la escuela y nunca incluye precio ni pagos (RF-33).
 */

type Db = SupabaseClient;

async function audit(
  db: Db,
  schoolId: string,
  actorId: string | null,
  action: string,
  details: Record<string, unknown> = {},
) {
  await db.from("audit_log").insert({
    school_id: schoolId,
    actor_id: actorId,
    action,
    entity: "subscription",
    entity_id: schoolId,
    details,
  });
}

type SubscriptionRow = {
  school_id: string;
  monthly_price_ars: number | string;
  goalkeeper_limit: number;
  video_minutes_limit: number;
  trial_until: string | null;
  covered_until: string;
  manually_suspended: boolean;
};

const SUB_COLUMNS =
  "school_id, monthly_price_ars, goalkeeper_limit, video_minutes_limit, trial_until, covered_until, manually_suspended";

async function loadSubscription(db: Db, schoolId: string): Promise<SubscriptionRow | null> {
  const { data } = await db
    .from("subscription")
    .select(SUB_COLUMNS)
    .eq("school_id", schoolId)
    .maybeSingle();
  return (data as SubscriptionRow | null) ?? null;
}

async function countActiveGoalkeepers(db: Db, schoolId: string): Promise<number> {
  // Cuentan los activos, incluidos los exentos de cuota (RF-20).
  const { count } = await db
    .from("goalkeeper")
    .select("id", { count: "exact", head: true })
    .eq("school_id", schoolId)
    .eq("status", "active");
  return count ?? 0;
}

export type ActionResult =
  | { ok: true }
  | { ok: false; error: "not_found" | "invalid" | "not_trial" | "already_voided" | "failed" };

// ───────────────────────────── condiciones ─────────────────────────────

export type ConditionsInput = {
  monthlyPriceArs?: number;
  goalkeeperLimit?: number;
  videoMinutesLimit?: number;
};

const FIELD_LABEL = {
  monthly_price_ars: "monthly_price_ars",
  goalkeeper_limit: "goalkeeper_limit",
  video_minutes_limit: "video_minutes_limit",
} as const;

async function logChange(
  db: Db,
  input: { schoolId: string; actorId: string; note?: string | null },
  field: string,
  oldValue: unknown,
  newValue: unknown,
) {
  await db.from("subscription_change").insert({
    school_id: input.schoolId,
    field,
    old_value: oldValue === null || oldValue === undefined ? null : String(oldValue),
    new_value: newValue === null || newValue === undefined ? null : String(newValue),
    note: input.note ?? null,
    made_by: input.actorId,
  });
}

/** Cambia las condiciones de la escuela; cada campo modificado queda en el historial (RF-02 y RF-03). */
export async function updateConditions(
  db: Db,
  input: { schoolId: string; actorId: string; note: string | null; changes: ConditionsInput },
): Promise<ActionResult> {
  const { changes } = input;
  if (
    (changes.monthlyPriceArs !== undefined &&
      (!Number.isFinite(changes.monthlyPriceArs) || changes.monthlyPriceArs < 0)) ||
    (changes.goalkeeperLimit !== undefined &&
      (!Number.isInteger(changes.goalkeeperLimit) || changes.goalkeeperLimit < 1)) ||
    (changes.videoMinutesLimit !== undefined &&
      (!Number.isInteger(changes.videoMinutesLimit) || changes.videoMinutesLimit < 0))
  ) {
    return { ok: false, error: "invalid" };
  }
  const current = await loadSubscription(db, input.schoolId);
  if (!current) return { ok: false, error: "not_found" };

  const update: Record<string, number> = {};
  const logs: [string, unknown, unknown][] = [];
  if (
    changes.monthlyPriceArs !== undefined &&
    changes.monthlyPriceArs !== Number(current.monthly_price_ars)
  ) {
    update.monthly_price_ars = changes.monthlyPriceArs;
    logs.push([FIELD_LABEL.monthly_price_ars, current.monthly_price_ars, changes.monthlyPriceArs]);
  }
  if (
    changes.goalkeeperLimit !== undefined &&
    changes.goalkeeperLimit !== current.goalkeeper_limit
  ) {
    update.goalkeeper_limit = changes.goalkeeperLimit;
    logs.push([FIELD_LABEL.goalkeeper_limit, current.goalkeeper_limit, changes.goalkeeperLimit]);
  }
  if (
    changes.videoMinutesLimit !== undefined &&
    changes.videoMinutesLimit !== current.video_minutes_limit
  ) {
    update.video_minutes_limit = changes.videoMinutesLimit;
    logs.push([
      FIELD_LABEL.video_minutes_limit,
      current.video_minutes_limit,
      changes.videoMinutesLimit,
    ]);
  }
  if (logs.length === 0) return { ok: true };

  const { error } = await db.from("subscription").update(update).eq("school_id", input.schoolId);
  if (error) return { ok: false, error: "failed" };
  for (const [field, from, to] of logs) await logChange(db, input, field, from, to);
  await audit(db, input.schoolId, input.actorId, "subscription.conditions_changed", {
    fields: logs.map((l) => l[0]),
  });
  return { ok: true };
}

// ───────────────────────────── pagos de la escuela ─────────────────────────────

export type PaymentInput = {
  schoolId: string;
  actorId: string;
  paidOn: string;
  amountArs: number;
  monthsCovered: number;
  note: string | null;
  today: string;
};

function validPayment(i: Pick<PaymentInput, "amountArs" | "monthsCovered">): boolean {
  return (
    Number.isFinite(i.amountArs) &&
    i.amountArs > 0 &&
    Number.isInteger(i.monthsCovered) &&
    i.monthsCovered >= 1 &&
    i.monthsCovered <= MAX_MONTHS_PER_PAYMENT
  );
}

/**
 * Registra un pago de la escuela (RF-14 a RF-16): suma sus meses a "cubierto hasta" contando
 * desde el valor anterior. Un pago de monto o meses cero se rechaza. No reactiva una escuela
 * suspendida: eso es una acción explícita aparte (RF-27).
 */
export async function registerPayment(
  db: Db,
  input: PaymentInput,
): Promise<
  | { ok: true; coveredUntil: string; suggestReactivate: boolean }
  | Extract<ActionResult, { ok: false }>
> {
  if (!validPayment(input)) return { ok: false, error: "invalid" };
  const sub = await loadSubscription(db, input.schoolId);
  if (!sub) return { ok: false, error: "not_found" };

  const coveredAfter = coveredUntilAfterPayment(sub.covered_until, input.monthsCovered);
  const { error: insertError } = await db.from("subscription_payment").insert({
    school_id: input.schoolId,
    paid_on: input.paidOn,
    amount_ars: input.amountArs,
    months_covered: input.monthsCovered,
    note: input.note,
    recorded_by: input.actorId,
    covered_before: sub.covered_until,
    covered_after: coveredAfter,
  });
  if (insertError) return { ok: false, error: "failed" };

  const { error } = await db
    .from("subscription")
    .update({ covered_until: coveredAfter })
    .eq("school_id", input.schoolId);
  if (error) return { ok: false, error: "failed" };

  await audit(db, input.schoolId, input.actorId, "subscription.payment_registered", {
    months: input.monthsCovered,
    covered_until: coveredAfter,
  });
  const { data: school } = await db
    .from("school")
    .select("status")
    .eq("id", input.schoolId)
    .maybeSingle();
  return {
    ok: true,
    coveredUntil: coveredAfter,
    suggestReactivate: school?.status === "suspended",
  };
}

/**
 * Deshace un pago (RF-17, CA-14): "cubierto hasta" vuelve al valor anterior si era el último pago;
 * si hubo pagos posteriores, se le restan sus meses.
 */
export async function voidPayment(
  db: Db,
  input: { schoolId: string; paymentId: string; actorId: string },
): Promise<ActionResult> {
  const { data: payment } = await db
    .from("subscription_payment")
    .select("id, voided, months_covered, covered_before, covered_after")
    .eq("id", input.paymentId)
    .eq("school_id", input.schoolId)
    .maybeSingle();
  if (!payment) return { ok: false, error: "not_found" };
  if (payment.voided) return { ok: false, error: "already_voided" };
  const sub = await loadSubscription(db, input.schoolId);
  if (!sub) return { ok: false, error: "not_found" };

  const restored =
    sub.covered_until === payment.covered_after
      ? (payment.covered_before as string)
      : coveredUntilAfterPayment(sub.covered_until, -(payment.months_covered as number));

  const { data, error } = await db
    .from("subscription_payment")
    .update({ voided: true, voided_at: new Date().toISOString(), voided_by: input.actorId })
    .eq("id", payment.id)
    .eq("school_id", input.schoolId)
    .eq("voided", false)
    .select("id");
  if (error) return { ok: false, error: "failed" };
  if (!data?.length) return { ok: false, error: "already_voided" };

  await db.from("subscription").update({ covered_until: restored }).eq("school_id", input.schoolId);
  await logChange(db, input, "covered_until", sub.covered_until, restored);
  await audit(db, input.schoolId, input.actorId, "subscription.payment_voided", {
    payment_id: payment.id,
    covered_until: restored,
  });
  return { ok: true };
}

/** Ajusta "cubierto hasta" a mano, con una nota (RF-17). */
export async function adjustCoveredUntil(
  db: Db,
  input: { schoolId: string; actorId: string; coveredUntil: string; note: string },
): Promise<ActionResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.coveredUntil) || input.note.trim().length === 0) {
    return { ok: false, error: "invalid" };
  }
  const sub = await loadSubscription(db, input.schoolId);
  if (!sub) return { ok: false, error: "not_found" };
  const { error } = await db
    .from("subscription")
    .update({
      covered_until: input.coveredUntil,
      // En prueba, la fecha de fin de prueba y "cubierto hasta" son la misma.
      ...(sub.trial_until !== null ? { trial_until: input.coveredUntil } : {}),
    })
    .eq("school_id", input.schoolId);
  if (error) return { ok: false, error: "failed" };
  await logChange(db, input, "covered_until", sub.covered_until, input.coveredUntil);
  await audit(db, input.schoolId, input.actorId, "subscription.covered_until_adjusted", {
    from: sub.covered_until,
    to: input.coveredUntil,
  });
  return { ok: true };
}

/**
 * Cierra la prueba pasando a pago (RF-13): el cobro arranca en `startOn` (sin retroactividad) y
 * el primer pago cubre `monthsCovered` meses desde esa fecha. Suspender al cerrar la prueba se
 * hace con la suspensión manual de siempre.
 */
export async function closeTrialToPaid(
  db: Db,
  input: {
    schoolId: string;
    actorId: string;
    startOn: string;
    amountArs: number;
    monthsCovered: number;
    note: string | null;
    paidOn: string;
  },
): Promise<ActionResult> {
  if (!validPayment(input)) return { ok: false, error: "invalid" };
  const sub = await loadSubscription(db, input.schoolId);
  if (!sub) return { ok: false, error: "not_found" };
  if (sub.trial_until === null) return { ok: false, error: "not_trial" };

  const coveredAfter = coveredUntilAfterPayment(input.startOn, input.monthsCovered);
  const { error: paymentError } = await db.from("subscription_payment").insert({
    school_id: input.schoolId,
    paid_on: input.paidOn,
    amount_ars: input.amountArs,
    months_covered: input.monthsCovered,
    note: input.note,
    recorded_by: input.actorId,
    covered_before: sub.covered_until,
    covered_after: coveredAfter,
  });
  if (paymentError) return { ok: false, error: "failed" };
  const { error } = await db
    .from("subscription")
    .update({ trial_until: null, covered_until: coveredAfter })
    .eq("school_id", input.schoolId);
  if (error) return { ok: false, error: "failed" };
  await logChange(db, input, "trial_until", sub.trial_until, null);
  await audit(db, input.schoolId, input.actorId, "subscription.trial_closed", {
    start_on: input.startOn,
    covered_until: coveredAfter,
  });
  return { ok: true };
}

// ───────────────────────────── estado de cuenta (operador) ─────────────────────────────

export type PaymentItem = {
  id: string;
  paidOn: string;
  amountArs: number;
  monthsCovered: number;
  note: string | null;
  voided: boolean;
};

export type ChangeItem = {
  id: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  note: string | null;
  madeAt: string;
};

export type AccountStatement = {
  state: SubscriptionState;
  graceEnded: boolean;
  daysUntilCovered: number;
  monthlyPriceArs: number;
  coveredUntil: string;
  trialUntil: string | null;
  goalkeepers: GoalkeeperUsage;
  video: Quota;
  payments: PaymentItem[];
  changes: ChangeItem[];
};

/** Estado de cuenta de una escuela (RF-18 y RF-24): precio, pagos, "cubierto hasta", estado y uso. */
export async function getAccountStatement(
  db: Db,
  schoolId: string,
  today: string,
): Promise<AccountStatement | null> {
  const sub = await loadSubscription(db, schoolId);
  if (!sub) return null;
  const [{ data: payments }, { data: changes }, active, video] = await Promise.all([
    db
      .from("subscription_payment")
      .select("id, paid_on, amount_ars, months_covered, note, voided")
      .eq("school_id", schoolId)
      .order("paid_on", { ascending: false })
      .order("created_at", { ascending: false }),
    db
      .from("subscription_change")
      .select("id, field, old_value, new_value, note, made_at")
      .eq("school_id", schoolId)
      .order("made_at", { ascending: false })
      .limit(50),
    countActiveGoalkeepers(db, schoolId),
    getVideoQuota(db, schoolId),
  ]);
  const dates = {
    trialUntil: sub.trial_until,
    coveredUntil: sub.covered_until,
    manuallySuspended: sub.manually_suspended,
  };
  return {
    state: subscriptionState(dates, today),
    graceEnded: graceEnded(dates, today),
    daysUntilCovered: daysUntilCovered(dates, today),
    monthlyPriceArs: Number(sub.monthly_price_ars),
    coveredUntil: sub.covered_until,
    trialUntil: sub.trial_until,
    goalkeepers: goalkeeperUsage(active, sub.goalkeeper_limit),
    video,
    payments: (payments ?? []).map((p) => ({
      id: p.id,
      paidOn: p.paid_on,
      amountArs: Number(p.amount_ars),
      monthsCovered: p.months_covered,
      note: p.note,
      voided: p.voided,
    })),
    changes: (changes ?? []).map((c) => ({
      id: c.id,
      field: c.field,
      oldValue: c.old_value,
      newValue: c.new_value,
      note: c.note,
      madeAt: c.made_at,
    })),
  };
}

export type MonthlyIncome = { month: string; totalArs: number; payments: number };

/** Ingresos por mes: suma de los pagos registrados y no deshechos (RF-19). */
export async function incomeByMonth(db: Db): Promise<MonthlyIncome[]> {
  const { data } = await db
    .from("subscription_payment")
    .select("paid_on, amount_ars")
    .eq("voided", false)
    .order("paid_on", { ascending: false })
    .limit(5000);
  const months = new Map<string, MonthlyIncome>();
  for (const p of data ?? []) {
    const month = (p.paid_on as string).slice(0, 7);
    const entry = months.get(month) ?? { month, totalArs: 0, payments: 0 };
    entry.totalArs += Number(p.amount_ars);
    entry.payments += 1;
    months.set(month, entry);
  }
  return [...months.values()].sort((a, b) => b.month.localeCompare(a.month));
}

// ───────────────────────────── "Mi plan" (admin de la escuela) ─────────────────────────────

export type SchoolPlan = {
  state: SubscriptionState;
  coveredUntil: string;
  goalkeepers: GoalkeeperUsage;
  video: Quota;
};

/** Lo que ve el admin de su plan (RF-32 y RF-33): uso, estado y próximo vencimiento, sin precio ni pagos. */
export async function getSchoolPlan(
  db: Db,
  schoolId: string,
  today: string,
): Promise<SchoolPlan | null> {
  const sub = await loadSubscription(db, schoolId);
  if (!sub) return null;
  const [active, video] = await Promise.all([
    countActiveGoalkeepers(db, schoolId),
    getVideoQuota(db, schoolId),
  ]);
  return {
    state: subscriptionState(
      {
        trialUntil: sub.trial_until,
        coveredUntil: sub.covered_until,
        manuallySuspended: sub.manually_suspended,
      },
      today,
    ),
    coveredUntil: sub.covered_until,
    goalkeepers: goalkeeperUsage(active, sub.goalkeeper_limit),
    video,
  };
}

// ───────────────────────────── alertas del operador ─────────────────────────────

export type AlertItem = {
  id: string;
  type: PlatformAlertType;
  schoolId: string;
  schoolName: string;
  schoolSlug: string;
  createdAt: string;
};

export const ALERT_LABELS: Record<PlatformAlertType, string> = {
  trial_ending: "La prueba termina en menos de 7 días",
  trial_expired: "La prueba ya terminó y sigue sin cerrarse",
  expiring_soon: "La suscripción vence en menos de 7 días",
  overdue: "La suscripción está vencida",
  grace_ended: "Pasaron los 10 días de gracia",
  goalkeeper_limit_90: "Llegó al 90% del tope de arqueros",
  goalkeeper_limit_exceeded: "Superó el tope de arqueros: renegociar",
  video_limit_80: "Usó el 80% de los minutos de video",
  video_limit_100: "Llegó al tope de minutos de video",
};

export async function listOpenAlerts(db: Db): Promise<AlertItem[]> {
  const { data } = await db
    .from("platform_alert")
    .select("id, type, school_id, created_at, school(name, slug)")
    .is("resolved_at", null)
    .order("created_at", { ascending: false });
  return (data ?? []).map((row) => {
    const school = row.school as unknown as { name: string; slug: string } | null;
    return {
      id: row.id,
      type: row.type,
      schoolId: row.school_id,
      schoolName: school?.name ?? "—",
      schoolSlug: school?.slug ?? "",
      createdAt: row.created_at,
    };
  });
}

/** El operador descarta una alerta (RF-31). Si la causa sigue, no vuelve a abrirse hasta que desaparezca y reaparezca. */
export async function dismissAlert(
  db: Db,
  input: { alertId: string; actorId: string },
): Promise<ActionResult> {
  const { data, error } = await db
    .from("platform_alert")
    .update({ dismissed: true, resolved_at: new Date().toISOString() })
    .eq("id", input.alertId)
    .is("resolved_at", null)
    .select("school_id");
  if (error) return { ok: false, error: "failed" };
  if (!data?.length) return { ok: false, error: "not_found" };
  await audit(db, data[0].school_id, input.actorId, "platform_alert.dismissed", {
    alert_id: input.alertId,
  });
  return { ok: true };
}

const freshQuery = (db: Db) =>
  db
    .from("platform_alert")
    .select("id, type, school(name)")
    .is("resolved_at", null)
    .is("notified_at", null);

export type RefreshResult = { opened: number; resolved: number };

/**
 * Recalcula las alertas de todas las escuelas (RF-29 a RF-31): abre las que corresponden y
 * resuelve solas las que ya no. Una alerta descartada mientras la causa sigue no se reabre: la
 * fila resuelta ocupa el lugar hasta que la causa desaparece.
 */
export async function refreshPlatformAlerts(
  db: Db,
  today: string,
  onlySchoolIds?: string[],
): Promise<RefreshResult> {
  const [{ data: subs }, { data: open }, { data: dismissed }] = await Promise.all([
    onlySchoolIds
      ? db.from("subscription").select(SUB_COLUMNS).in("school_id", onlySchoolIds)
      : db.from("subscription").select(SUB_COLUMNS),
    onlySchoolIds
      ? db
          .from("platform_alert")
          .select("id, school_id, type")
          .is("resolved_at", null)
          .in("school_id", onlySchoolIds)
      : db.from("platform_alert").select("id, school_id, type").is("resolved_at", null),
    onlySchoolIds
      ? db
          .from("platform_alert")
          .select("id, school_id, type")
          .eq("dismissed", true)
          .in("school_id", onlySchoolIds)
      : db.from("platform_alert").select("id, school_id, type").eq("dismissed", true),
  ]);

  const openKeys = new Set((open ?? []).map((a) => `${a.school_id}:${a.type}`));
  const dismissedKeys = new Set((dismissed ?? []).map((a) => `${a.school_id}:${a.type}`));
  const wanted = new Set<string>();
  let opened = 0;

  for (const sub of (subs ?? []) as SubscriptionRow[]) {
    const [active, video] = await Promise.all([
      countActiveGoalkeepers(db, sub.school_id),
      getVideoQuota(db, sub.school_id),
    ]);
    const types = platformAlertsFor(
      {
        subscription: {
          trialUntil: sub.trial_until,
          coveredUntil: sub.covered_until,
          manuallySuspended: sub.manually_suspended,
        },
        goalkeeperLimit: sub.goalkeeper_limit,
        activeGoalkeepers: active,
        videoPercent: video.percent,
      },
      today,
    );
    for (const type of types) {
      const key = `${sub.school_id}:${type}`;
      wanted.add(key);
      if (openKeys.has(key) || dismissedKeys.has(key)) continue;
      const { error } = await db.from("platform_alert").insert({ school_id: sub.school_id, type });
      if (!error) opened += 1;
    }
  }

  const stale = (open ?? []).filter((a) => !wanted.has(`${a.school_id}:${a.type}`));
  if (stale.length > 0) {
    await db
      .from("platform_alert")
      .update({ resolved_at: new Date().toISOString() })
      .in(
        "id",
        stale.map((a) => a.id),
      );
  }
  // Una alerta descartada cuya causa desapareció se olvida: si reaparece, vuelve a abrirse.
  const forgotten = (dismissed ?? []).filter((a) => !wanted.has(`${a.school_id}:${a.type}`));
  if (forgotten.length > 0) {
    await db
      .from("platform_alert")
      .delete()
      .in(
        "id",
        forgotten.map((a) => a.id),
      );
  }
  return { opened, resolved: stale.length };
}

/**
 * Manda al operador el resumen diario (RF-30), solo con las alertas nuevas desde el último
 * resumen. Sin novedades, no manda nada (CA-13).
 */
export async function sendOperatorSummary(
  db: Db,
  transport: EmailTransport,
  onlySchoolIds?: string[],
): Promise<{ sent: number; items: number }> {
  const { data: fresh } = await (onlySchoolIds
    ? freshQuery(db).in("school_id", onlySchoolIds)
    : freshQuery(db));
  const items = (fresh ?? []).map((a) => ({
    id: a.id as string,
    schoolName: (a.school as unknown as { name: string } | null)?.name ?? "—",
    label: ALERT_LABELS[a.type as PlatformAlertType],
  }));
  if (items.length === 0) return { sent: 0, items: 0 };

  const { data: operators } = await db
    .from("profile")
    .select("user_id")
    .eq("role", "platform_admin")
    .eq("active", true);
  let sent = 0;
  for (const op of operators ?? []) {
    const { data } = await db.auth.admin.getUserById(op.user_id);
    const email = data.user?.email;
    if (!email) continue;
    const result = await transport(
      operatorSummaryEmail({ to: email, items, link: `${getAppUrl()}/operator` }),
    );
    if (result.ok) sent += 1;
  }
  // Se marcan como avisadas solo si llegó al menos un mail; si no, se reintenta mañana.
  if (sent > 0) {
    await db
      .from("platform_alert")
      .update({ notified_at: new Date().toISOString() })
      .in(
        "id",
        items.map((i) => i.id),
      );
  }
  return { sent, items: items.length };
}

/** La fecha de hoy en Argentina, para quienes llaman desde el servidor. */
export function today(now: Date = new Date()): string {
  return argentinaDate(now);
}
