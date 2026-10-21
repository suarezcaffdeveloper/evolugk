"use server";

import { revalidatePath } from "next/cache";
import { argentinaDate } from "@/lib/dates";
import { MAX_ADVANCE_MONTHS } from "@/lib/fees";
import { requireSchoolAdmin } from "@/server/auth/guards";
import {
  changeFeesStart,
  markFeePaid,
  registerAdvance,
  setFeeExempt,
  undoFeePayment,
  voidFee,
  type FeeActionResult,
} from "@/server/fees";
import { createServiceClient } from "@/server/supabase";

/** Acciones de cuotas: solo el admin (spec 06, RN-03). Cada una vuelve a verificar la sesión y el rol. */

export type FeeState = { ok?: boolean; error?: string };

const ERRORS: Record<Extract<FeeActionResult, { ok: false }>["error"], string> = {
  not_found: "No encontramos la cuota.",
  invalid: "Revisá los datos.",
  not_open: "Esa cuota ya no está pendiente de pago.",
  not_paid: "Esa cuota no figura como pagada.",
  before_start: "La fecha de pago no puede ser anterior al inicio de cuotas.",
  future_date: "La fecha de pago no puede ser futura.",
  failed: "No pudimos guardar el cambio. Probá de nuevo.",
};

const text = (data: FormData, key: string) => {
  const value = data.get(key);
  return typeof value === "string" ? value.trim() : "";
};
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function refresh(slug: string, goalkeeperId?: string) {
  revalidatePath(`/${slug}/panel/cuotas`);
  revalidatePath(`/${slug}/panel/cuotas/resumen`);
  revalidatePath(`/${slug}/panel`);
  if (goalkeeperId) revalidatePath(`/${slug}/panel/arqueros/${goalkeeperId}/cuotas`);
}

const finish = (result: FeeActionResult): FeeState =>
  result.ok ? { ok: true } : { error: ERRORS[result.error] };

/** Registra el pago con la fecha del formulario (hoy si no viene); desde el panel es un toque. */
export async function markPaidAction(
  slug: string,
  feeId: string,
  goalkeeperId: string,
  _previous: FeeState,
  formData: FormData,
): Promise<FeeState> {
  const session = await requireSchoolAdmin(slug);
  const today = argentinaDate(new Date());
  const given = text(formData, "paidOn");
  if (given && !DATE.test(given)) return { error: ERRORS.invalid };
  const result = await markFeePaid(createServiceClient(), {
    schoolId: session.school.id,
    actorId: session.user.id,
    feeId,
    paidOn: given || today,
    today,
  });
  refresh(session.school.slug, goalkeeperId);
  return finish(result);
}

export async function undoPaymentAction(
  slug: string,
  feeId: string,
  goalkeeperId: string,
  _previous: FeeState,
): Promise<FeeState> {
  const session = await requireSchoolAdmin(slug);
  const result = await undoFeePayment(createServiceClient(), {
    schoolId: session.school.id,
    actorId: session.user.id,
    feeId,
  });
  refresh(session.school.slug, goalkeeperId);
  return finish(result);
}

export async function voidFeeAction(
  slug: string,
  feeId: string,
  goalkeeperId: string,
  _previous: FeeState,
  formData: FormData,
): Promise<FeeState> {
  const session = await requireSchoolAdmin(slug);
  const result = await voidFee(createServiceClient(), {
    schoolId: session.school.id,
    actorId: session.user.id,
    feeId,
    note: text(formData, "note").slice(0, 300) || null,
  });
  refresh(session.school.slug, goalkeeperId);
  return finish(result);
}

export async function advanceAction(
  slug: string,
  goalkeeperId: string,
  _previous: FeeState,
  formData: FormData,
): Promise<FeeState> {
  const session = await requireSchoolAdmin(slug);
  const months = Number(text(formData, "months"));
  const result = await registerAdvance(createServiceClient(), {
    schoolId: session.school.id,
    actorId: session.user.id,
    goalkeeperId,
    months,
    today: argentinaDate(new Date()),
  });
  refresh(session.school.slug, goalkeeperId);
  if (result.ok) return { ok: true };
  if (result.error === "invalid") return { error: `Elegí entre 1 y ${MAX_ADVANCE_MONTHS} meses.` };
  if (result.error === "no_cycle") {
    return { error: "El arquero tiene que estar activo, no exento y con inicio de cuotas." };
  }
  return { error: result.error === "not_found" ? ERRORS.not_found : ERRORS.failed };
}

export async function exemptAction(
  slug: string,
  goalkeeperId: string,
  exempt: boolean,
  _previous: FeeState,
  formData: FormData,
): Promise<FeeState> {
  const session = await requireSchoolAdmin(slug);
  const result = await setFeeExempt(createServiceClient(), {
    schoolId: session.school.id,
    actorId: session.user.id,
    goalkeeperId,
    exempt,
    note: text(formData, "note").slice(0, 300) || null,
    today: argentinaDate(new Date()),
  });
  refresh(session.school.slug, goalkeeperId);
  return finish(result);
}

export async function changeStartAction(
  slug: string,
  goalkeeperId: string,
  _previous: FeeState,
  formData: FormData,
): Promise<FeeState> {
  const session = await requireSchoolAdmin(slug);
  const start = text(formData, "start");
  if (!DATE.test(start)) return { error: "Ingresá una fecha válida." };
  const result = await changeFeesStart(createServiceClient(), {
    schoolId: session.school.id,
    actorId: session.user.id,
    goalkeeperId,
    start,
    today: argentinaDate(new Date()),
  });
  refresh(session.school.slug, goalkeeperId);
  return finish(result);
}
