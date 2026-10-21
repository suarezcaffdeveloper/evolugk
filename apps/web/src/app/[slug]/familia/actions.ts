"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { normalizeSlug } from "@/lib/slug";
import { changeGuardianPin, revokeAllSessions, revokeSession } from "@/server/guardian/access";
import {
  auditPinChange,
  completeFirstLogin,
  getFamilyGoalkeeper,
  grantConsent,
  revokeConsent,
  updateGuardianContact,
} from "@/server/guardian/portal";
import {
  clearFamilySessionCookie,
  familyHome,
  rememberGoalkeeper,
  requireFamily,
} from "@/server/guardian/session";
import { createServiceClient } from "@/server/supabase";

/**
 * Cada acción vuelve a verificar la sesión de familia en vivo y filtra por el tutor de esa sesión:
 * el portal es de solo lectura salvo los datos propios, el PIN y el consentimiento (RN-05).
 */

const text = (formData: FormData, key: string): string => {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
};

export type FamilyActionState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

// ───────────────────────────── sesión ─────────────────────────────

/** Cierra la sesión de este dispositivo, o la de todos (spec 04, RF-03 y CA-11). */
export async function logoutAction(slug: string, everywhere: boolean): Promise<void> {
  const session = await requireFamily(slug, { allowIncompleteSetup: true });
  const db = createServiceClient();
  if (everywhere) await revokeAllSessions(db, session.guardianId);
  else await revokeSession(db, session.sessionId);
  await clearFamilySessionCookie();
  redirect(`/${normalizeSlug(slug)}`);
}

// ───────────────────────────── selector de arquero ─────────────────────────────

/** Cambia de arquero, lo recuerda para la próxima vez (RF-10) y va a su inicio. */
export async function selectGoalkeeperAction(slug: string, formData: FormData): Promise<void> {
  const session = await requireFamily(slug);
  const goalkeeper = await getFamilyGoalkeeper(
    createServiceClient(),
    session,
    text(formData, "goalkeeperId"),
  );
  // Un id ajeno o inexistente no revela nada: simplemente vuelve al inicio.
  if (!goalkeeper) redirect(familyHome(slug));
  await rememberGoalkeeper(goalkeeper.id);
  redirect(`${familyHome(slug)}/${goalkeeper.id}`);
}

// ───────────────────────────── PIN ─────────────────────────────

/** Valida el PIN nuevo contra su confirmación y lo cambia (spec 04, RF-06 y RF-29). */
async function changePin(slug: string, formData: FormData, allowIncompleteSetup: boolean) {
  const session = await requireFamily(slug, { allowIncompleteSetup });
  const currentPin = text(formData, "currentPin").trim();
  const newPin = text(formData, "newPin").trim();
  const confirmPin = text(formData, "confirmPin").trim();

  const fieldErrors: Record<string, string> = {};
  if (!/^\d{6}$/.test(currentPin)) fieldErrors.currentPin = "Escribí tu PIN actual de 6 dígitos.";
  if (newPin !== confirmPin) fieldErrors.confirmPin = "Los dos PIN nuevos no coinciden.";
  if (Object.keys(fieldErrors).length > 0) return { session, fieldErrors } as const;

  const db = createServiceClient();
  const result = await changeGuardianPin(db, {
    guardianId: session.guardianId,
    keepSessionId: session.sessionId,
    currentPin,
    newPin,
  });
  if (!result.ok) {
    return { session, fieldErrors: { [result.field ?? "newPin"]: result.message } } as const;
  }
  await auditPinChange(db, session);
  return { session, fieldErrors: null } as const;
}

/** Paso 1 del asistente de primer ingreso: cambiar el PIN inicial (obligatorio). */
export async function firstPinAction(
  slug: string,
  _previous: FamilyActionState,
  formData: FormData,
): Promise<FamilyActionState> {
  const result = await changePin(slug, formData, true);
  if (result.fieldErrors) return { fieldErrors: result.fieldErrors };
  redirect(`${familyHome(slug)}/primer-ingreso`);
}

/** Cambio de PIN desde Mis datos. */
export async function changePinAction(
  slug: string,
  _previous: FamilyActionState,
  formData: FormData,
): Promise<FamilyActionState> {
  const result = await changePin(slug, formData, false);
  if (result.fieldErrors) return { fieldErrors: result.fieldErrors };
  return { ok: true };
}

// ───────────────────────────── consentimiento ─────────────────────────────

/**
 * Paso 2 del asistente: el tutor acepta el consentimiento de los arqueros que tildó. No tildar
 * ninguno es válido: puede usar el portal y aceptarlo más tarde (spec 04, RF-08).
 */
export async function acceptConsentsAction(slug: string, formData: FormData): Promise<void> {
  const session = await requireFamily(slug, { allowIncompleteSetup: true });
  // Sin PIN cambiado no se avanza (CA-01).
  if (!session.pinChanged) redirect(`${familyHome(slug)}/primer-ingreso`);

  const db = createServiceClient();
  for (const value of formData.getAll("goalkeeperId")) {
    if (typeof value === "string") await grantConsent(db, session, value);
  }
  await completeFirstLogin(db, session);
  redirect(familyHome(slug));
}

export async function grantConsentAction(slug: string, goalkeeperId: string): Promise<void> {
  const session = await requireFamily(slug);
  await grantConsent(createServiceClient(), session, goalkeeperId);
  revalidatePath(`/${normalizeSlug(slug)}/familia`, "layout");
}

export async function revokeConsentAction(slug: string, goalkeeperId: string): Promise<void> {
  const session = await requireFamily(slug);
  await revokeConsent(createServiceClient(), session, goalkeeperId);
  revalidatePath(`/${normalizeSlug(slug)}/familia`, "layout");
}

// ───────────────────────────── mis datos ─────────────────────────────

export async function updateContactAction(
  slug: string,
  _previous: FamilyActionState,
  formData: FormData,
): Promise<FamilyActionState> {
  const session = await requireFamily(slug);
  const values = { phone: text(formData, "phone"), email: text(formData, "email") };

  const result = await updateGuardianContact(createServiceClient(), session, values);
  if (!result.ok) {
    return { error: result.message, fieldErrors: result.fieldErrors, values };
  }
  revalidatePath(`/${normalizeSlug(slug)}/familia/mis-datos`);
  return { ok: true, values };
}
