import type { SupabaseClient } from "@supabase/supabase-js";
import { fieldErrorsFrom, loginSchema, totpCodeSchema, type FieldErrors } from "@/lib/auth-schemas";
import { toSafeSvgDataUri } from "@/lib/qr";

/** Dónde está el operador en el camino hacia la verificación en dos pasos. */
export type MfaState = "enroll" | "challenge" | "ready";

export type OperatorLoginResult =
  | { ok: true; mfa: MfaState }
  | { ok: false; error: "invalid_input"; fieldErrors: FieldErrors }
  | { ok: false; error: "invalid_credentials" };

export type CodeResult =
  | { ok: true }
  | { ok: false; error: "invalid_input"; message: string }
  | { ok: false; error: "invalid_code" | "failed" };

type Clients = { admin: SupabaseClient; auth: SupabaseClient };

const ISSUER = "EvoluGK";
const FACTOR_NAME = "App de autenticación";

/**
 * Estado de la verificación en dos pasos de la sesión actual:
 *  - ready: ya está en aal2 (verificó el segundo paso en esta sesión).
 *  - challenge: tiene la app inscripta; falta ingresar el código.
 *  - enroll: todavía no inscribió ninguna app.
 */
export async function getMfaState(auth: SupabaseClient): Promise<MfaState> {
  const { data } = await auth.auth.mfa.getAuthenticatorAssuranceLevel();
  if (data?.currentLevel === "aal2") return "ready";
  if (data?.nextLevel === "aal2") return "challenge";
  return "enroll";
}

/** Ingreso del operador con mail y contraseña (spec 00, RF-06d). Falta luego el segundo paso. */
export async function loginOperator(
  { admin, auth }: Clients,
  raw: { email?: unknown; password?: unknown },
): Promise<OperatorLoginResult> {
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "invalid_input", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const { data, error } = await auth.auth.signInWithPassword(parsed.data);
  if (error || !data.user) return { ok: false, error: "invalid_credentials" };

  const { data: profile } = await admin
    .from("profile")
    .select("role, active")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (!profile || profile.role !== "platform_admin" || !profile.active) {
    await auth.auth.signOut();
    return { ok: false, error: "invalid_credentials" };
  }

  return { ok: true, mfa: await getMfaState(auth) };
}

export type Enrollment = { factorId: string; qrCode: string; secret: string; uri: string };

/**
 * Empieza la inscripción de la app de autenticación. Descarta intentos anteriores que no se
 * llegaron a verificar, para poder reintentar sin chocar con un factor a medias.
 */
export async function startEnrollment(auth: SupabaseClient): Promise<Enrollment> {
  const { data: factors } = await auth.auth.mfa.listFactors();
  for (const factor of factors?.all ?? []) {
    if (factor.factor_type === "totp" && factor.status === "unverified") {
      await auth.auth.mfa.unenroll({ factorId: factor.id });
    }
  }

  const { data, error } = await auth.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: FACTOR_NAME,
    issuer: ISSUER,
  });
  if (error || !data) throw new Error(`No se pudo iniciar la inscripción: ${error?.message}`);
  return {
    factorId: data.id,
    qrCode: toSafeSvgDataUri(data.totp.qr_code),
    secret: data.totp.secret,
    uri: data.totp.uri,
  };
}

async function verify(
  auth: SupabaseClient,
  factorId: string,
  rawCode: unknown,
): Promise<CodeResult> {
  const parsed = totpCodeSchema.safeParse(rawCode);
  if (!parsed.success) {
    return {
      ok: false,
      error: "invalid_input",
      message: parsed.error.issues[0]?.message ?? "Código inválido.",
    };
  }
  const { error } = await auth.auth.mfa.challengeAndVerify({ factorId, code: parsed.data });
  if (!error) return { ok: true };
  // Un código equivocado o vencido es un error normal; cualquier otra cosa es una falla.
  return {
    ok: false,
    error: "code" in error && error.code === "mfa_verification_failed" ? "invalid_code" : "failed",
  };
}

/** Termina la inscripción verificando el primer código que muestra la app. */
export async function completeEnrollment(
  auth: SupabaseClient,
  factorId: string,
  rawCode: unknown,
): Promise<CodeResult> {
  return verify(auth, factorId, rawCode);
}

/** Verifica el código de la app ya inscripta (segundo paso en cada ingreso). */
export async function verifyChallenge(auth: SupabaseClient, rawCode: unknown): Promise<CodeResult> {
  const { data } = await auth.auth.mfa.listFactors();
  const factor = data?.totp[0]; // `totp` solo trae los verificados
  if (!factor) return { ok: false, error: "failed" };
  return verify(auth, factor.id, rawCode);
}
