"use server";

import { redirect } from "next/navigation";
import type { FieldErrors } from "@/lib/auth-schemas";
import { createUserClient } from "@/lib/supabase/user-client";
import {
  completeEnrollment,
  loginOperator,
  startEnrollment,
  verifyChallenge,
  type Enrollment,
} from "@/server/auth/operator-auth";
import { getOperatorSession, operatorHome } from "@/server/auth/guards";
import { createServiceClient } from "@/server/supabase";

export type LoginState = { error?: string; fieldErrors?: FieldErrors; email?: string };
export type CodeState = { error?: string };

export async function operatorLoginAction(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = typeof formData.get("email") === "string" ? (formData.get("email") as string) : "";

  const result = await loginOperator(
    { admin: createServiceClient(), auth: await createUserClient() },
    { email: formData.get("email"), password: formData.get("password") },
  );
  if (!result.ok) {
    if (result.error === "invalid_input") return { fieldErrors: result.fieldErrors, email };
    return { error: "Mail o contraseña incorrectos.", email };
  }
  redirect(operatorHome(result.mfa));
}

const CODE_MESSAGES = {
  invalid_code: "El código no es correcto o ya venció. Probá con el que muestra ahora tu app.",
  failed: "No pudimos verificar el código. Intentá de nuevo en unos segundos.",
} as const;

/** Segundo paso en cada ingreso: código de la app ya inscripta. */
export async function verifyCodeAction(
  _previous: CodeState,
  formData: FormData,
): Promise<CodeState> {
  const session = await getOperatorSession();
  if (!session) redirect("/operator/login");

  const result = await verifyChallenge(await createUserClient(), formData.get("code"));
  if (!result.ok) {
    return {
      error: result.error === "invalid_input" ? result.message : CODE_MESSAGES[result.error],
    };
  }
  redirect("/operator");
}

export type BeginEnrollmentResult =
  { ok: true; enrollment: Enrollment } | { ok: false; message: string };

/**
 * Crea la inscripción de la app de autenticación. Se ejecuta SOLO cuando la persona lo pide
 * (botón "Generar código QR"): hacerlo al renderizar la página crea y descarta inscripciones en
 * cada render (recargas, validaciones de desarrollo) y deja el formulario apuntando a una que ya no existe.
 */
export async function beginEnrollmentAction(): Promise<BeginEnrollmentResult> {
  const session = await getOperatorSession();
  if (!session) redirect("/operator/login");
  if (session.mfa !== "enroll") redirect(operatorHome(session.mfa));

  try {
    return { ok: true, enrollment: await startEnrollment(await createUserClient()) };
  } catch {
    return {
      ok: false,
      message: "No pudimos generar el código QR. Intentá de nuevo en unos segundos.",
    };
  }
}

/** Primera vez: se verifica el primer código de la app recién inscripta. */
export async function completeEnrollmentAction(
  _previous: CodeState,
  formData: FormData,
): Promise<CodeState> {
  const session = await getOperatorSession();
  if (!session) redirect("/operator/login");

  const factorId = formData.get("factorId");
  if (typeof factorId !== "string" || !factorId) {
    return { error: "La inscripción venció. Recargá la página para obtener un código QR nuevo." };
  }

  const result = await completeEnrollment(await createUserClient(), factorId, formData.get("code"));
  if (!result.ok) {
    return {
      error: result.error === "invalid_input" ? result.message : CODE_MESSAGES[result.error],
    };
  }
  redirect("/operator");
}

export async function operatorLogoutAction(): Promise<void> {
  await (await createUserClient()).auth.signOut();
  redirect("/operator/login");
}
