"use server";

import { revalidatePath } from "next/cache";
import { argentinaDate } from "@/lib/dates";
import { requireOperator } from "@/server/auth/guards";
import { createServiceClient } from "@/server/supabase";
import {
  adjustCoveredUntil,
  closeTrialToPaid,
  dismissAlert,
  registerPayment,
  updateConditions,
  voidPayment,
  type ActionResult,
} from "@/server/subscriptions";

/** Acciones del operador sobre la suscripción de una escuela (spec 07). Cada una verifica al operador en vivo. */

export type SubscriptionState = { ok?: boolean; error?: string; message?: string };

const ERRORS: Record<Extract<ActionResult, { ok: false }>["error"], string> = {
  not_found: "No encontramos el registro.",
  invalid: "Revisá los datos: los montos y los meses tienen que ser mayores que cero.",
  not_trial: "La escuela ya no está en prueba.",
  already_voided: "Ese pago ya estaba deshecho.",
  failed: "No pudimos guardar el cambio. Probá de nuevo.",
};

const text = (data: FormData, key: string) => {
  const value = data.get(key);
  return typeof value === "string" ? value.trim() : "";
};
/** Número escrito en un formulario: acepta coma o punto decimal; NaN si está vacío. */
const num = (data: FormData, key: string) => {
  const raw = text(data, key).replace(",", ".");
  return raw === "" ? Number.NaN : Number(raw);
};
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function refresh(slug: string) {
  revalidatePath(`/operator/escuelas/${slug}`);
  revalidatePath("/operator");
  revalidatePath("/operator/ingresos");
}

const finish = (result: ActionResult, message: string): SubscriptionState =>
  result.ok ? { ok: true, message } : { error: ERRORS[result.error] };

export async function updateConditionsAction(
  schoolId: string,
  slug: string,
  _previous: SubscriptionState,
  formData: FormData,
): Promise<SubscriptionState> {
  const operator = await requireOperator("ready");
  const result = await updateConditions(createServiceClient(), {
    schoolId,
    actorId: operator.user.id,
    note: text(formData, "note").slice(0, 300) || null,
    changes: {
      monthlyPriceArs: num(formData, "monthlyPriceArs"),
      goalkeeperLimit: num(formData, "goalkeeperLimit"),
      videoMinutesLimit: num(formData, "videoMinutesLimit"),
    },
  });
  refresh(slug);
  return finish(result, "Condiciones guardadas. Los cambios quedan en el historial.");
}

export async function registerPaymentAction(
  schoolId: string,
  slug: string,
  _previous: SubscriptionState,
  formData: FormData,
): Promise<SubscriptionState> {
  const operator = await requireOperator("ready");
  const today = argentinaDate(new Date());
  const paidOn = text(formData, "paidOn") || today;
  if (!DATE.test(paidOn)) return { error: "Ingresá una fecha válida." };
  const result = await registerPayment(createServiceClient(), {
    schoolId,
    actorId: operator.user.id,
    paidOn,
    amountArs: num(formData, "amountArs"),
    monthsCovered: num(formData, "monthsCovered"),
    note: text(formData, "note").slice(0, 300) || null,
    today,
  });
  refresh(slug);
  if (!result.ok) return { error: ERRORS[result.error] };
  return {
    ok: true,
    message: result.suggestReactivate
      ? "Pago registrado. La escuela sigue suspendida: si corresponde, reactivala desde “Estado de la escuela”."
      : "Pago registrado.",
  };
}

export async function voidPaymentAction(
  schoolId: string,
  slug: string,
  paymentId: string,
  _previous: SubscriptionState,
): Promise<SubscriptionState> {
  const operator = await requireOperator("ready");
  const result = await voidPayment(createServiceClient(), {
    schoolId,
    paymentId,
    actorId: operator.user.id,
  });
  refresh(slug);
  return finish(result, "Pago deshecho.");
}

export async function adjustCoveredAction(
  schoolId: string,
  slug: string,
  _previous: SubscriptionState,
  formData: FormData,
): Promise<SubscriptionState> {
  const operator = await requireOperator("ready");
  const coveredUntil = text(formData, "coveredUntil");
  if (!DATE.test(coveredUntil)) return { error: "Ingresá una fecha válida." };
  const note = text(formData, "note");
  if (!note) return { error: "Escribí una nota que explique el ajuste." };
  const result = await adjustCoveredUntil(createServiceClient(), {
    schoolId,
    actorId: operator.user.id,
    coveredUntil,
    note: note.slice(0, 300),
  });
  refresh(slug);
  return finish(result, "Fecha ajustada.");
}

export async function closeTrialAction(
  schoolId: string,
  slug: string,
  _previous: SubscriptionState,
  formData: FormData,
): Promise<SubscriptionState> {
  const operator = await requireOperator("ready");
  const today = argentinaDate(new Date());
  const startOn = text(formData, "startOn") || today;
  if (!DATE.test(startOn)) return { error: "Ingresá una fecha válida." };
  const result = await closeTrialToPaid(createServiceClient(), {
    schoolId,
    actorId: operator.user.id,
    startOn,
    amountArs: num(formData, "amountArs"),
    monthsCovered: num(formData, "monthsCovered"),
    note: text(formData, "note").slice(0, 300) || null,
    paidOn: today,
  });
  refresh(slug);
  return finish(result, "Prueba cerrada: la escuela pasó a pago.");
}

export async function dismissAlertAction(
  alertId: string,
  _previous: SubscriptionState,
): Promise<SubscriptionState> {
  const operator = await requireOperator("ready");
  const result = await dismissAlert(createServiceClient(), { alertId, actorId: operator.user.id });
  revalidatePath("/operator");
  return finish(result, "Alerta descartada.");
}
