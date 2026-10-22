import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays } from "@/lib/dates";
import {
  collectionSummary,
  daysOverdue,
  feeDates,
  feesToGenerate,
  feeStatus,
  initialFees,
  MAX_ADVANCE_MONTHS,
  noticeDueToday,
  overallStanding,
  type CollectionSummary,
  type FeeNoticeType,
  type FeeStatus,
  type PlannedFee,
  type StandingLevel,
  type StoredFeeStatus,
} from "@/lib/fees";
import { getAppUrl } from "./config";
import { feeNoticeEmail } from "./email/templates";
import type { EmailTransport } from "./email/transport";

/**
 * Cuotas de los arqueros (spec 06). Toda función recibe la escuela y filtra por ella: el cliente
 * con clave secreta se saltea RLS, así que el aislamiento depende de este código. La cuota no
 * guarda monto: solo fechas y estados (RN-04).
 */

type Db = SupabaseClient;
type Actor = { schoolId: string; actorId: string };

const PG_UNIQUE = "23505";
const PAGE = 1000;

async function audit(
  db: Db,
  actor: Actor,
  action: string,
  entityId: string,
  details: Record<string, unknown> = {},
) {
  // De mejor esfuerzo: la auditoría no debe impedir la acción ya realizada.
  await db.from("audit_log").insert({
    school_id: actor.schoolId,
    actor_id: actor.actorId,
    action,
    entity: "fee",
    entity_id: entityId,
    details,
  });
}

/** Lee todas las filas de una consulta paginando (PostgREST devuelve como mucho 1000 por pedido). */
async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error("No se pudo leer la lista de cuotas.");
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

// ───────────────────────────── altas de cuotas ─────────────────────────────

type FeeRow = {
  id: string;
  school_id: string;
  goalkeeper_id: string;
  series_start_on: string;
  number: number;
  due_on: string;
  grace_until: string;
  status: StoredFeeStatus;
  paid_on: string | null;
  is_automatic: boolean;
  note: string | null;
  recorded_by: string | null;
  created_at: string;
};

const FEE_COLUMNS =
  "id, school_id, goalkeeper_id, series_start_on, number, due_on, grace_until, status, paid_on, is_automatic, note, recorded_by, created_at";

/** Inserta cuotas planificadas de una serie y deja su primera revisión. Ignora las que ya existen. */
async function insertPlannedFees(
  db: Db,
  input: { schoolId: string; goalkeeperId: string; start: string; actorId: string | null },
  planned: PlannedFee[],
): Promise<number> {
  let created = 0;
  for (const fee of planned) {
    const { data, error } = await db
      .from("fee")
      .insert({
        school_id: input.schoolId,
        goalkeeper_id: input.goalkeeperId,
        series_start_on: input.start,
        number: fee.number,
        due_on: fee.dueOn,
        grace_until: fee.graceUntil,
        status: fee.paidAutomatically ? "paid" : "open",
        paid_on: fee.paidAutomatically ? fee.dueOn : null,
        is_automatic: fee.paidAutomatically || input.actorId === null,
        recorded_by: fee.paidAutomatically ? input.actorId : null,
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === PG_UNIQUE) continue; // otro proceso la creó primero: no se duplica.
      throw new Error("No se pudo crear la cuota.");
    }
    created += 1;
    await db.from("fee_revision").insert({
      school_id: input.schoolId,
      fee_id: data.id,
      edited_by: input.actorId,
      action: fee.paidAutomatically ? "auto_paid" : "created",
      old_status: null,
      new_status: fee.paidAutomatically ? "paid" : "open",
      new_paid_on: fee.paidAutomatically ? fee.dueOn : null,
    });
  }
  return created;
}

/**
 * Empieza un ciclo de cuotas nuevo para un arquero (alta, importación, reactivación o fin de la
 * exención): guarda el inicio y crea las cuotas iniciales (RF-06, RF-09 y RF-22).
 */
export async function startFeeCycle(
  db: Db,
  input: {
    schoolId: string;
    goalkeeperId: string;
    start: string;
    today: string;
    actorId: string | null;
  },
): Promise<void> {
  await db
    .from("goalkeeper")
    .update({ fees_start_on: input.start })
    .eq("id", input.goalkeeperId)
    .eq("school_id", input.schoolId);
  await insertPlannedFees(db, input, initialFees(input.start, input.today));
}

// ───────────────────────────── cambios de estado del arquero ─────────────────────────────

/** Anula las cuotas abiertas del arquero cuya fecha de pago todavía no llegó (RF-21). Las vencidas se conservan. */
async function voidFutureFees(
  db: Db,
  input: {
    schoolId: string;
    goalkeeperId: string;
    today: string;
    actorId: string | null;
    note: string;
  },
): Promise<number> {
  const { data } = await db
    .from("fee")
    .select("id")
    .eq("school_id", input.schoolId)
    .eq("goalkeeper_id", input.goalkeeperId)
    .eq("status", "open")
    .gt("due_on", input.today);
  const ids = (data ?? []).map((f) => f.id as string);
  if (ids.length === 0) return 0;
  await db
    .from("fee")
    .update({ status: "void", note: input.note })
    .eq("school_id", input.schoolId)
    .in("id", ids);
  await db.from("fee_revision").insert(
    ids.map((id) => ({
      school_id: input.schoolId,
      fee_id: id,
      edited_by: input.actorId,
      action: "voided",
      old_status: "open",
      new_status: "void",
      note: input.note,
    })),
  );
  return ids.length;
}

/**
 * Efecto de un cambio de estado del arquero en sus cuotas (RF-21 y RF-22):
 *  - pasa a inactivo o egresado: se anulan las futuras y se conservan las vencidas como deuda;
 *  - vuelve a activo: el inicio de cuotas pasa a ser hoy y se asume pagado el primer ciclo.
 * Un arquero exento no tiene cuotas en ningún caso.
 */
export async function applyStatusChangeToFees(
  db: Db,
  input: Actor & {
    goalkeeperId: string;
    previousStatus: "active" | "inactive" | "graduated";
    status: "active" | "inactive" | "graduated";
    today: string;
  },
): Promise<void> {
  if (input.previousStatus === input.status) return;
  const { data: g } = await db
    .from("goalkeeper")
    .select("fee_exempt, fees_start_on")
    .eq("id", input.goalkeeperId)
    .eq("school_id", input.schoolId)
    .maybeSingle();
  if (!g || g.fee_exempt) return;

  if (input.status !== "active") {
    await voidFutureFees(db, {
      ...input,
      note: "Anulada por baja del arquero.",
    });
    return;
  }
  // Reactivación el mismo día en que ya empezó un ciclo: se mantiene un único ciclo nuevo.
  if (input.previousStatus !== "active" && g.fees_start_on !== input.today) {
    await startFeeCycle(db, { ...input, start: input.today });
  }
}

export type FeeActionResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "not_found"
        | "invalid"
        | "not_open"
        | "not_paid"
        | "before_start"
        | "future_date"
        | "failed";
    };

/** Marca o quita la exención (RF-18 a RF-20). Al quitarla se reinicia el ciclo desde hoy, como una reactivación. */
export async function setFeeExempt(
  db: Db,
  input: Actor & { goalkeeperId: string; exempt: boolean; note: string | null; today: string },
): Promise<FeeActionResult> {
  const { data: g } = await db
    .from("goalkeeper")
    .select("id, status, fee_exempt")
    .eq("id", input.goalkeeperId)
    .eq("school_id", input.schoolId)
    .maybeSingle();
  if (!g) return { ok: false, error: "not_found" };

  const { error } = await db
    .from("goalkeeper")
    .update({
      fee_exempt: input.exempt,
      fee_exempt_note: input.exempt ? input.note : null,
    })
    .eq("id", input.goalkeeperId)
    .eq("school_id", input.schoolId);
  if (error) return { ok: false, error: "failed" };

  if (input.exempt) {
    await voidFutureFees(db, { ...input, note: "Anulada: arquero exento." });
  } else if (g.fee_exempt && g.status === "active") {
    await startFeeCycle(db, { ...input, start: input.today });
  }
  await audit(
    db,
    input,
    input.exempt ? "fee.exempt_set" : "fee.exempt_removed",
    input.goalkeeperId,
  );
  return { ok: true };
}

/**
 * Cambia el inicio de cuotas (RF-23): las cuotas abiertas que todavía no vencieron se reprograman
 * con las nuevas fechas (conservan su identidad, así los avisos ya enviados no se repiten); las
 * pagadas, anuladas y vencidas no se tocan.
 */
export async function changeFeesStart(
  db: Db,
  input: Actor & { goalkeeperId: string; start: string; today: string },
): Promise<FeeActionResult> {
  const { data: g } = await db
    .from("goalkeeper")
    .select("id, fees_start_on")
    .eq("id", input.goalkeeperId)
    .eq("school_id", input.schoolId)
    .maybeSingle();
  if (!g) return { ok: false, error: "not_found" };
  if (g.fees_start_on === input.start) return { ok: true };

  const { data: open } = await db
    .from("fee")
    .select("id, number, due_on, grace_until, status")
    .eq("school_id", input.schoolId)
    .eq("goalkeeper_id", input.goalkeeperId)
    .eq("status", "open");
  const pending = (open ?? []).filter((f) => input.today <= (f.grace_until as string));

  await db
    .from("goalkeeper")
    .update({ fees_start_on: input.start })
    .eq("id", input.goalkeeperId)
    .eq("school_id", input.schoolId);

  // De la última a la primera para no chocar con la clave única (serie, número) a mitad de camino.
  for (const fee of pending.sort((a, b) => b.number - a.number)) {
    const dates = feeDates(input.start, fee.number as number);
    await db
      .from("fee")
      .update({
        series_start_on: input.start,
        due_on: dates.dueOn,
        grace_until: dates.graceUntil,
      })
      .eq("school_id", input.schoolId)
      .eq("id", fee.id);
    await db.from("fee_revision").insert({
      school_id: input.schoolId,
      fee_id: fee.id,
      edited_by: input.actorId,
      action: "rescheduled",
      old_status: "open",
      new_status: "open",
      note: `Nuevo inicio de cuotas: ${input.start}.`,
    });
  }
  await audit(db, input, "fee.start_changed", input.goalkeeperId, {
    from: g.fees_start_on,
    to: input.start,
  });
  return { ok: true };
}

// ───────────────────────────── pagos ─────────────────────────────

async function loadFee(db: Db, schoolId: string, feeId: string): Promise<FeeRow | null> {
  const { data } = await db
    .from("fee")
    .select(FEE_COLUMNS)
    .eq("id", feeId)
    .eq("school_id", schoolId)
    .maybeSingle();
  return (data as FeeRow | null) ?? null;
}

async function revise(
  db: Db,
  actor: Actor,
  feeId: string,
  revision: {
    action: "paid" | "unpaid" | "voided" | "restored";
    oldStatus: StoredFeeStatus;
    newStatus: StoredFeeStatus;
    oldPaidOn?: string | null;
    newPaidOn?: string | null;
    note?: string | null;
  },
) {
  await db.from("fee_revision").insert({
    school_id: actor.schoolId,
    fee_id: feeId,
    edited_by: actor.actorId,
    action: revision.action,
    old_status: revision.oldStatus,
    new_status: revision.newStatus,
    old_paid_on: revision.oldPaidOn ?? null,
    new_paid_on: revision.newPaidOn ?? null,
    note: revision.note ?? null,
  });
}

/** El admin registra el pago de una cuota con su fecha real (RF-13). No puede ser futura ni anterior al inicio. */
export async function markFeePaid(
  db: Db,
  input: Actor & { feeId: string; paidOn: string; today: string },
): Promise<FeeActionResult> {
  const fee = await loadFee(db, input.schoolId, input.feeId);
  if (!fee) return { ok: false, error: "not_found" };
  if (fee.status !== "open") return { ok: false, error: "not_open" };
  if (input.paidOn > input.today) return { ok: false, error: "future_date" };
  if (input.paidOn < fee.series_start_on) return { ok: false, error: "before_start" };

  const { data, error } = await db
    .from("fee")
    .update({ status: "paid", paid_on: input.paidOn, recorded_by: input.actorId })
    .eq("id", fee.id)
    .eq("school_id", input.schoolId)
    .eq("status", "open")
    .select("id");
  if (error) return { ok: false, error: "failed" };
  if (!data?.length) return { ok: false, error: "not_open" };

  await revise(db, input, fee.id, {
    action: "paid",
    oldStatus: "open",
    newStatus: "paid",
    newPaidOn: input.paidOn,
  });
  await audit(db, input, "fee.paid", fee.id, {
    goalkeeper_id: fee.goalkeeper_id,
    number: fee.number,
  });
  return { ok: true };
}

/** Deshace un pago: la cuota vuelve al estado que le corresponde por fecha (RF-14, CA-15). */
export async function undoFeePayment(
  db: Db,
  input: Actor & { feeId: string },
): Promise<FeeActionResult> {
  const fee = await loadFee(db, input.schoolId, input.feeId);
  if (!fee) return { ok: false, error: "not_found" };
  if (fee.status !== "paid") return { ok: false, error: "not_paid" };

  const { data, error } = await db
    .from("fee")
    .update({ status: "open", paid_on: null, recorded_by: input.actorId })
    .eq("id", fee.id)
    .eq("school_id", input.schoolId)
    .eq("status", "paid")
    .select("id");
  if (error) return { ok: false, error: "failed" };
  if (!data?.length) return { ok: false, error: "not_paid" };

  await revise(db, input, fee.id, {
    action: "unpaid",
    oldStatus: "paid",
    newStatus: "open",
    oldPaidOn: fee.paid_on,
  });
  await audit(db, input, "fee.payment_undone", fee.id, { goalkeeper_id: fee.goalkeeper_id });
  return { ok: true };
}

/** Anula una cuota impaga con una nota interna (RF-17). Una vencida anulada deja de ser deuda y no se avisa. */
export async function voidFee(
  db: Db,
  input: Actor & { feeId: string; note: string | null },
): Promise<FeeActionResult> {
  const fee = await loadFee(db, input.schoolId, input.feeId);
  if (!fee) return { ok: false, error: "not_found" };
  if (fee.status !== "open") return { ok: false, error: "not_open" };

  const { data, error } = await db
    .from("fee")
    .update({ status: "void", note: input.note })
    .eq("id", fee.id)
    .eq("school_id", input.schoolId)
    .eq("status", "open")
    .select("id");
  if (error) return { ok: false, error: "failed" };
  if (!data?.length) return { ok: false, error: "not_open" };

  await revise(db, input, fee.id, {
    action: "voided",
    oldStatus: "open",
    newStatus: "void",
    note: input.note,
  });
  await audit(db, input, "fee.voided", fee.id, { goalkeeper_id: fee.goalkeeper_id });
  return { ok: true };
}

export type AdvanceResult =
  | { ok: true; paidNumbers: number[] }
  | { ok: false; error: "not_found" | "invalid" | "no_cycle" | "failed" };

/**
 * Pagó por adelantado (RF-16, F4): marca como pagadas las próximas `months` cuotas sin pagar del
 * ciclo vigente (hasta 12), creando las que todavía no existen. La generación automática no las
 * duplica porque ya existen.
 */
export async function registerAdvance(
  db: Db,
  input: Actor & { goalkeeperId: string; months: number; today: string },
): Promise<AdvanceResult> {
  if (!Number.isInteger(input.months) || input.months < 1 || input.months > MAX_ADVANCE_MONTHS) {
    return { ok: false, error: "invalid" };
  }
  const { data: g } = await db
    .from("goalkeeper")
    .select("id, status, fee_exempt, fees_start_on")
    .eq("id", input.goalkeeperId)
    .eq("school_id", input.schoolId)
    .maybeSingle();
  if (!g) return { ok: false, error: "not_found" };
  if (g.status !== "active" || g.fee_exempt || !g.fees_start_on) {
    return { ok: false, error: "no_cycle" };
  }
  const start = g.fees_start_on as string;

  const { data: existing } = await db
    .from("fee")
    .select("id, number, status")
    .eq("school_id", input.schoolId)
    .eq("goalkeeper_id", input.goalkeeperId)
    .eq("series_start_on", start);
  const rows = existing ?? [];
  const highest = rows.length > 0 ? Math.max(...rows.map((f) => f.number as number)) : 0;

  // Primero las abiertas que ya existen, en orden; después las que hay que crear.
  const openNumbers = rows
    .filter((f) => f.status === "open")
    .map((f) => f.number as number)
    .sort((a, b) => a - b);
  const targets = [...openNumbers];
  for (let n = highest + 1; targets.length < input.months; n += 1) targets.push(n);
  const paidNumbers = targets.slice(0, input.months);

  const toCreate = paidNumbers
    .filter((n) => !rows.some((f) => f.number === n))
    .map((n): PlannedFee => ({ number: n, ...feeDates(start, n), paidAutomatically: false }));
  try {
    await insertPlannedFees(db, { ...input, start, actorId: input.actorId }, toCreate);
  } catch {
    return { ok: false, error: "failed" };
  }

  const { data: toPay } = await db
    .from("fee")
    .select("id, number")
    .eq("school_id", input.schoolId)
    .eq("goalkeeper_id", input.goalkeeperId)
    .eq("series_start_on", start)
    .eq("status", "open")
    .in("number", paidNumbers);
  const ids = (toPay ?? []).map((f) => f.id as string);
  if (ids.length > 0) {
    const { error } = await db
      .from("fee")
      .update({ status: "paid", paid_on: input.today, recorded_by: input.actorId })
      .eq("school_id", input.schoolId)
      .eq("status", "open")
      .in("id", ids);
    if (error) return { ok: false, error: "failed" };
    await db.from("fee_revision").insert(
      ids.map((id) => ({
        school_id: input.schoolId,
        fee_id: id,
        edited_by: input.actorId,
        action: "paid",
        old_status: "open",
        new_status: "paid",
        new_paid_on: input.today,
        note: "Pago por adelantado.",
      })),
    );
  }
  await audit(db, input, "fee.advance_paid", input.goalkeeperId, {
    months: input.months,
    numbers: paidNumbers,
  });
  return { ok: true, paidNumbers };
}

// ───────────────────────────── consultas del admin ─────────────────────────────

export type FeeItem = {
  id: string;
  number: number;
  dueOn: string;
  graceUntil: string;
  status: FeeStatus;
  paidOn: string | null;
  isAutomatic: boolean;
  note: string | null;
  daysOverdue: number;
};

function toItem(row: FeeRow, today: string): FeeItem {
  const status = feeStatus(
    { status: row.status, dueOn: row.due_on, graceUntil: row.grace_until },
    today,
  );
  return {
    id: row.id,
    number: row.number,
    dueOn: row.due_on,
    graceUntil: row.grace_until,
    status,
    paidOn: row.paid_on,
    isAutomatic: row.is_automatic,
    note: row.note,
    daysOverdue: status === "overdue" ? daysOverdue(row.grace_until, today) : 0,
  };
}

export type FeeRevisionItem = {
  id: string;
  feeNumber: number;
  action: string;
  editedAt: string;
  editorName: string | null;
  oldPaidOn: string | null;
  newPaidOn: string | null;
  note: string | null;
};

export type GoalkeeperFees = {
  feesStartOn: string | null;
  exempt: boolean;
  exemptNote: string | null;
  standing: StandingLevel;
  fees: FeeItem[];
  history: FeeRevisionItem[];
};

/** Cuotas de un arquero con su estado general y el registro de cambios (RF-12 y RF-15). */
export async function getGoalkeeperFees(
  db: Db,
  input: { schoolId: string; goalkeeperId: string; today: string },
): Promise<GoalkeeperFees | null> {
  const { data: g } = await db
    .from("goalkeeper")
    .select("fees_start_on, fee_exempt, fee_exempt_note")
    .eq("id", input.goalkeeperId)
    .eq("school_id", input.schoolId)
    .maybeSingle();
  if (!g) return null;

  const [{ data: feeRows }, { data: revisions }] = await Promise.all([
    db
      .from("fee")
      .select(FEE_COLUMNS)
      .eq("school_id", input.schoolId)
      .eq("goalkeeper_id", input.goalkeeperId)
      .order("due_on", { ascending: false })
      .order("number", { ascending: false }),
    db
      .from("fee_revision")
      .select("id, fee_id, action, edited_at, edited_by, old_paid_on, new_paid_on, note")
      .eq("school_id", input.schoolId)
      .in(
        "fee_id",
        // Las revisiones de las cuotas de este arquero.
        (
          (
            await db
              .from("fee")
              .select("id")
              .eq("school_id", input.schoolId)
              .eq("goalkeeper_id", input.goalkeeperId)
          ).data ?? []
        ).map((f) => f.id as string),
      )
      .order("edited_at", { ascending: false })
      .limit(60),
  ]);

  const fees = ((feeRows ?? []) as FeeRow[]).map((row) => toItem(row, input.today));
  const numberById = new Map(((feeRows ?? []) as FeeRow[]).map((r) => [r.id, r.number]));

  const editorIds = [
    ...new Set((revisions ?? []).map((r) => r.edited_by).filter(Boolean)),
  ] as string[];
  const names = new Map<string, string>();
  if (editorIds.length > 0) {
    const { data: profiles } = await db
      .from("profile")
      .select("user_id, first_name, last_name")
      .in("user_id", editorIds);
    for (const p of profiles ?? []) names.set(p.user_id, `${p.first_name} ${p.last_name}`);
  }

  return {
    feesStartOn: g.fees_start_on,
    exempt: g.fee_exempt,
    exemptNote: g.fee_exempt_note,
    standing: overallStanding(fees.map((f) => f.status)),
    fees,
    history: (revisions ?? []).map((r) => ({
      id: r.id,
      feeNumber: numberById.get(r.fee_id) ?? 0,
      action: r.action,
      editedAt: r.edited_at,
      editorName: r.edited_by ? (names.get(r.edited_by) ?? null) : null,
      oldPaidOn: r.old_paid_on,
      newPaidOn: r.new_paid_on,
      note: r.note,
    })),
  };
}

export type PanelFee = FeeItem & {
  goalkeeperId: string;
  firstName: string;
  lastName: string;
  goalkeeperStatus: "active" | "inactive" | "graduated";
};

/**
 * Panel de cuotas por vencer y vencidas, ordenado por urgencia (RF-32): primero las de más días
 * de atraso, después las que vencen antes. Las deudas de arqueros dados de baja se muestran.
 */
export async function listFeePanel(
  db: Db,
  input: { schoolId: string; today: string },
): Promise<PanelFee[]> {
  const rows = await fetchAll<FeeRow & { goalkeeper: unknown }>((from, to) =>
    db
      .from("fee")
      .select(`${FEE_COLUMNS}, goalkeeper(first_name, last_name, status, fee_exempt)`)
      .eq("school_id", input.schoolId)
      .eq("status", "open")
      // Hasta 5 días antes de su fecha de pago (por vencer) o ya vencidas.
      .lte("due_on", addDays(input.today, 5))
      .order("due_on", { ascending: true })
      .range(from, to),
  );

  const panel: PanelFee[] = [];
  for (const row of rows) {
    const g = row.goalkeeper as {
      first_name: string;
      last_name: string;
      status: PanelFee["goalkeeperStatus"];
      fee_exempt: boolean;
    } | null;
    if (!g) continue;
    const item = toItem(row, input.today);
    if (item.status !== "due_soon" && item.status !== "overdue") continue;
    panel.push({
      ...item,
      goalkeeperId: row.goalkeeper_id,
      firstName: g.first_name,
      lastName: g.last_name,
      goalkeeperStatus: g.status,
    });
  }
  return panel.sort(
    (a, b) =>
      b.daysOverdue - a.daysOverdue ||
      a.dueOn.localeCompare(b.dueOn) ||
      a.lastName.localeCompare(b.lastName, "es"),
  );
}

export type CollectionOverview = {
  month: string;
  summary: CollectionSummary;
  debtors: PanelFee[];
};

/** Resumen de cobranza de un mes "AAAA-MM" y la lista de quién debe (RF-34 y RF-35). */
export async function getCollectionOverview(
  db: Db,
  input: { schoolId: string; month: string; today: string },
): Promise<CollectionOverview> {
  const first = `${input.month}-01`;
  const next = addDays(`${input.month}-28`, 5).slice(0, 7);
  const rows = await fetchAll<FeeRow>((from, to) =>
    db
      .from("fee")
      .select(FEE_COLUMNS)
      .eq("school_id", input.schoolId)
      .gte("due_on", first)
      .lt("due_on", `${next}-01`)
      .range(from, to),
  );
  const { count: exempt } = await db
    .from("goalkeeper")
    .select("id", { count: "exact", head: true })
    .eq("school_id", input.schoolId)
    .eq("status", "active")
    .eq("fee_exempt", true);

  const items = rows.map((row) => toItem(row, input.today));
  const summary = collectionSummary(
    items.map((i) => ({ dueOn: i.dueOn, status: i.status })),
    input.month,
    exempt ?? 0,
  );
  const debtors = (await listFeePanel(db, input)).filter((f) => f.status === "overdue");
  return { month: input.month, summary, debtors };
}

// ───────────────────────────── generación diaria ─────────────────────────────

export type GenerationResult = { created: number; goalkeepers: number };

/**
 * Genera las cuotas que ya corresponden (RF-07 a RF-09): 10 días antes de su fecha de pago, solo
 * para arqueros activos y no exentos, sin duplicar las existentes. También recupera las que se
 * hayan salteado si el proceso no corrió. Corre para todas las escuelas, aun suspendidas: las
 * cuotas siguen su ciclo por fechas.
 */
export async function generateFees(
  db: Db,
  today: string,
  onlySchoolIds?: string[],
): Promise<GenerationResult> {
  const goalkeepers = await fetchAll<{ id: string; school_id: string; fees_start_on: string }>(
    (from, to) => {
      const query = db
        .from("goalkeeper")
        .select("id, school_id, fees_start_on")
        .eq("status", "active")
        .eq("fee_exempt", false)
        .not("fees_start_on", "is", null);
      return (onlySchoolIds ? query.in("school_id", onlySchoolIds) : query)
        .order("id")
        .range(from, to);
    },
  );

  let created = 0;
  for (const g of goalkeepers) {
    const { data: existing } = await db
      .from("fee")
      .select("number")
      .eq("school_id", g.school_id)
      .eq("goalkeeper_id", g.id)
      .eq("series_start_on", g.fees_start_on);
    const numbers = (existing ?? []).map((f) => f.number as number);
    const planned = feesToGenerate(g.fees_start_on, today, numbers);
    if (planned.length === 0) continue;
    created += await insertPlannedFees(
      db,
      { schoolId: g.school_id, goalkeeperId: g.id, start: g.fees_start_on, actorId: null },
      planned,
    );
  }
  return { created, goalkeepers: goalkeepers.length };
}

// ───────────────────────────── avisos por mail ─────────────────────────────

export type NoticeResult = { sent: number; failed: number; skipped: number };

type NoticeCandidate = FeeRow & {
  goalkeeper: { first_name: string; last_name: string; status: string; fee_exempt: boolean } | null;
};

/**
 * Manda los avisos de cuota del día (RF-24 a RF-31). Cada aviso sale una sola vez por cuota, tipo
 * y destinatario (RF-28): la fila del registro se reserva antes de enviar, así que correr el
 * proceso dos veces el mismo día no duplica nada. No avisa si la cuota se pagó o anuló, si el
 * arquero es exento, inactivo o egresado, ni si la escuela está suspendida; los tutores sin mail
 * se saltean y los que comparten mail reciben uno solo.
 */
export async function sendFeeNotices(
  db: Db,
  transport: EmailTransport,
  today: string,
  options: { now?: Date; onlySchoolIds?: string[] } = {},
): Promise<NoticeResult> {
  const now = options.now ?? new Date();
  const result: NoticeResult = { sent: 0, failed: 0, skipped: 0 };

  // Cuotas abiertas cuyo momento de aviso pudo caer hoy: desde 5 días antes del pago hasta
  // 3 días de gracia más la ventana de recuperación después del vencimiento.
  const candidates = await fetchAll<NoticeCandidate>((from, to) => {
    const query = db
      .from("fee")
      .select(`${FEE_COLUMNS}, goalkeeper(first_name, last_name, status, fee_exempt)`)
      .eq("status", "open")
      .lte("due_on", addDays(today, 5))
      .gte("grace_until", addDays(today, -6));
    return (options.onlySchoolIds ? query.in("school_id", options.onlySchoolIds) : query)
      .order("id")
      .range(from, to);
  });

  const schoolIds = [...new Set(candidates.map((c) => c.school_id))];
  if (schoolIds.length === 0) return result;
  const { data: schools } = await db
    .from("school")
    .select("id, name, slug, status, primary_color, contact_phone, whatsapp, contact_email")
    .in("id", schoolIds);
  const schoolById = new Map((schools ?? []).map((s) => [s.id as string, s]));

  for (const fee of candidates) {
    const school = schoolById.get(fee.school_id);
    const g = fee.goalkeeper;
    if (!school || school.status !== "active" || !g) {
      result.skipped += 1;
      continue;
    }
    if (g.status !== "active" || g.fee_exempt) {
      result.skipped += 1;
      continue;
    }
    const type = noticeDueToday({ dueOn: fee.due_on, graceUntil: fee.grace_until }, today);
    if (!type) {
      result.skipped += 1;
      continue;
    }

    // Destinatarios: tutores con mail, sin repetir direcciones.
    const { data: links } = await db
      .from("goalkeeper_guardian")
      .select("guardian(email)")
      .eq("school_id", fee.school_id)
      .eq("goalkeeper_id", fee.goalkeeper_id);
    const recipients = [
      ...new Set(
        (links ?? [])
          .map((l) => (l.guardian as unknown as { email: string | null } | null)?.email)
          .filter((e): e is string => !!e)
          .map((e) => e.trim().toLowerCase()),
      ),
    ];
    if (recipients.length === 0) {
      result.skipped += 1; // RF-31: el estado se ve igual en el portal.
      continue;
    }

    for (const recipient of recipients) {
      if (!(await claimNotice(db, fee, type, recipient, now))) {
        result.skipped += 1;
        continue;
      }
      const message = feeNoticeEmail({
        to: recipient,
        type,
        schoolName: school.name,
        accentColor: school.primary_color,
        goalkeeperName: `${g.first_name} ${g.last_name}`,
        dueOn: fee.due_on,
        graceUntil: fee.grace_until,
        contact: {
          phone: school.contact_phone,
          whatsapp: school.whatsapp,
          email: school.contact_email,
        },
        link: `${getAppUrl()}/${school.slug}`,
      });
      const sent = await transport(message);
      if (sent.ok) {
        await db
          .from("notification_log")
          .update({ status: "sent", sent_at: now.toISOString(), detail: null })
          .eq("fee_id", fee.id)
          .eq("type", type)
          .eq("recipient", recipient);
        result.sent += 1;
      } else {
        // El destinatario inválido o rebotado queda registrado como fallido (caso borde).
        await db
          .from("notification_log")
          .update({
            status: "failed",
            detail: `${sent.reason}${sent.detail ? `: ${sent.detail}` : ""}`.slice(0, 300),
          })
          .eq("fee_id", fee.id)
          .eq("type", type)
          .eq("recipient", recipient);
        result.failed += 1;
      }
    }
  }
  return result;
}

/** Reserva el envío de un aviso. Falso si ya se envió o lo está enviando otro proceso. */
async function claimNotice(
  db: Db,
  fee: FeeRow,
  type: FeeNoticeType,
  recipient: string,
  now: Date,
): Promise<boolean> {
  const { error } = await db.from("notification_log").insert({
    school_id: fee.school_id,
    fee_id: fee.id,
    type,
    recipient,
    status: "pending",
  });
  if (!error) return true;
  if (error.code !== PG_UNIQUE) return false;

  // Ya hay una fila: solo se reintenta si el envío anterior falló o quedó colgado hace rato.
  const stale = new Date(now.getTime() - 30 * 60_000).toISOString();
  const { data } = await db
    .from("notification_log")
    .update({ status: "pending", created_at: now.toISOString() })
    .eq("fee_id", fee.id)
    .eq("type", type)
    .eq("recipient", recipient)
    .or(`status.eq.failed,and(status.eq.pending,created_at.lt.${stale})`)
    .select("id");
  return (data?.length ?? 0) > 0;
}

// ───────────────────────────── registro de envíos ─────────────────────────────

export type NoticeLogItem = {
  id: string;
  type: FeeNoticeType;
  recipient: string;
  status: "pending" | "sent" | "failed";
  detail: string | null;
  createdAt: string;
  feeNumber: number;
  goalkeeperName: string;
};

/** Los últimos envíos de la escuela, con los fallidos a la vista (caso borde: mail rebotado). */
export async function listNoticeLog(
  db: Db,
  input: { schoolId: string; limit?: number },
): Promise<NoticeLogItem[]> {
  const { data } = await db
    .from("notification_log")
    .select(
      "id, type, recipient, status, detail, created_at, fee(number, goalkeeper(first_name, last_name))",
    )
    .eq("school_id", input.schoolId)
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 50);
  return (data ?? []).map((row) => {
    const fee = row.fee as unknown as {
      number: number;
      goalkeeper: { first_name: string; last_name: string } | null;
    } | null;
    return {
      id: row.id,
      type: row.type,
      recipient: row.recipient,
      status: row.status,
      detail: row.detail,
      createdAt: row.created_at,
      feeNumber: fee?.number ?? 0,
      goalkeeperName: fee?.goalkeeper
        ? `${fee.goalkeeper.last_name}, ${fee.goalkeeper.first_name}`
        : "—",
    };
  });
}
