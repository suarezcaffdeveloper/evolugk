import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { feeStatus, overallStanding, type FeeStatus, type StandingLevel } from "@/lib/fees";
import type { GuardianSession } from "./access";

/**
 * Cuotas para la familia (spec 06, RF-37 a RF-40). El cliente con clave secreta se saltea RLS:
 * acá se filtra por escuela y arquero (el llamador ya verificó que es del tutor). Nunca se
 * devuelven montos, notas internas ni nombres de quien registró el pago.
 */

type Db = SupabaseClient;

export type FamilyFees =
  /** Arquero exento, inactivo o egresado: no hay sección de cuota (RF-40). */
  | { available: false }
  | {
      available: true;
      standing: StandingLevel;
      /** La cuota que corresponde mirar ahora: la más urgente sin pagar, o la próxima. */
      current: { number: number; dueOn: string; graceUntil: string; status: FeeStatus } | null;
      paid: { number: number; dueOn: string; paidOn: string }[];
    };

export async function getFamilyFees(
  db: Db,
  session: GuardianSession,
  goalkeeperId: string,
  today: string,
): Promise<FamilyFees> {
  const { data: goalkeeper } = await db
    .from("goalkeeper")
    .select("status, fee_exempt")
    .eq("school_id", session.schoolId)
    .eq("id", goalkeeperId)
    .maybeSingle();
  if (!goalkeeper || goalkeeper.status !== "active" || goalkeeper.fee_exempt) {
    return { available: false };
  }

  const { data } = await db
    .from("fee")
    .select("number, due_on, grace_until, status, paid_on")
    .eq("school_id", session.schoolId)
    .eq("goalkeeper_id", goalkeeperId)
    .order("due_on", { ascending: true });

  const rows = (data ?? []).map((f) => ({
    number: f.number as number,
    dueOn: f.due_on as string,
    graceUntil: f.grace_until as string,
    paidOn: f.paid_on as string | null,
    status: feeStatus({ status: f.status, dueOn: f.due_on, graceUntil: f.grace_until }, today),
  }));
  const unpaid = rows.filter((r) => r.status !== "paid" && r.status !== "void");
  const urgency: Record<FeeStatus, number> = {
    overdue: 0,
    due_soon: 1,
    upcoming: 2,
    paid: 3,
    void: 3,
  };
  const current =
    [...unpaid].sort(
      (a, b) => urgency[a.status] - urgency[b.status] || a.dueOn.localeCompare(b.dueOn),
    )[0] ?? null;

  return {
    available: true,
    standing: overallStanding(unpaid.map((r) => r.status)),
    current: current && {
      number: current.number,
      dueOn: current.dueOn,
      graceUntil: current.graceUntil,
      status: current.status,
    },
    paid: rows
      .filter((r) => r.status === "paid" && r.paidOn)
      .map((r) => ({ number: r.number, dueOn: r.dueOn, paidOn: r.paidOn as string }))
      .sort((a, b) => b.paidOn.localeCompare(a.paidOn)),
  };
}
