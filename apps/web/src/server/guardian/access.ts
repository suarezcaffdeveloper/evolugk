import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeAccessCode } from "@/lib/access-code";
import { checkPin, generateInitialPin } from "@/lib/pin";
import { normalizeSlug } from "@/lib/slug";
import { getGuardianSessionSecret } from "../config";
import { hashPin, verifyPin } from "./pin-hash";

/** Spec 00: sesión de 30 días; 5 intentos fallidos bloquean 15 minutos. */
export const SESSION_DAYS = 30;
export const MAX_PIN_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;

const DAY_MS = 24 * 60 * 60 * 1000;

export type GuardianLoginResult =
  | {
      ok: true;
      token: string;
      expiresAt: Date;
      guardianId: string;
      schoolId: string;
      /** Todavía usa el PIN inicial: el asistente de primer ingreso exige cambiarlo. */
      mustChangePin: boolean;
    }
  | { ok: false; reason: "invalid" }
  | { ok: false; reason: "locked"; lockedUntil: Date };

/** Hash del token con el secreto del servidor: robar la tabla no alcanza para armar una sesión. */
export function hashSessionToken(token: string): string {
  return createHmac("sha256", getGuardianSessionSecret()).update(token).digest("hex");
}

// Hash de un PIN inexistente: se verifica igual cuando el código no existe, para que el tiempo
// de respuesta no delate si un código existe.
let decoyHash: Promise<string> | null = null;
function getDecoyHash(): Promise<string> {
  decoyHash ??= hashPin("000000");
  return decoyHash;
}

/**
 * Ingreso de un tutor con código y PIN (spec 00, RF-13 a RF-18).
 *
 * Todo fallo de credenciales devuelve `invalid`, sin distinguir código inexistente, PIN
 * incorrecto, acceso revocado, escuela equivocada o suspendida. Solo un bloqueo ya vigente se
 * informa aparte: mientras dura, se rechaza aunque el PIN sea correcto (CA-04).
 */
export async function loginGuardian(
  client: SupabaseClient,
  input: { slug: string; code: string; pin: string },
  now: Date = new Date(),
): Promise<GuardianLoginResult> {
  const code = normalizeAccessCode(input.code);
  const slug = normalizeSlug(input.slug);

  const { data: guardian } = await client
    .from("guardian")
    .select(
      "id, school_id, pin_hash, pin_changed, locked_until, access_revoked, school:school_id(slug, status)",
    )
    .eq("access_code", code)
    .maybeSingle();

  const school = guardian?.school as unknown as { slug: string; status: string } | null | undefined;
  const usable =
    guardian != null &&
    school?.slug === slug &&
    school.status === "active" &&
    !guardian.access_revoked &&
    guardian.pin_hash != null;

  if (!usable) {
    await verifyPin(input.pin, await getDecoyHash());
    return { ok: false, reason: "invalid" };
  }

  if (guardian.locked_until && new Date(guardian.locked_until) > now) {
    return { ok: false, reason: "locked", lockedUntil: new Date(guardian.locked_until) };
  }

  if (!(await verifyPin(input.pin, guardian.pin_hash))) {
    const { data } = await client.rpc("guardian_register_pin_failure", {
      p_guardian_id: guardian.id,
      p_max_attempts: MAX_PIN_ATTEMPTS,
      p_lock_minutes: LOCK_MINUTES,
    });
    const lockedUntil = data?.[0]?.locked_until ? new Date(data[0].locked_until) : null;
    if (lockedUntil && lockedUntil > now) return { ok: false, reason: "locked", lockedUntil };
    return { ok: false, reason: "invalid" };
  }

  await client
    .from("guardian")
    .update({ pin_failed_attempts: 0, locked_until: null })
    .eq("id", guardian.id);

  const session = await createGuardianSession(client, {
    guardianId: guardian.id,
    schoolId: guardian.school_id,
    now,
  });
  return {
    ok: true,
    ...session,
    guardianId: guardian.id,
    schoolId: guardian.school_id,
    mustChangePin: !guardian.pin_changed,
  };
}

export async function createGuardianSession(
  client: SupabaseClient,
  input: { guardianId: string; schoolId: string; now?: Date },
): Promise<{ token: string; expiresAt: Date }> {
  const now = input.now ?? new Date();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * DAY_MS);
  const { error } = await client.from("guardian_session").insert({
    school_id: input.schoolId,
    guardian_id: input.guardianId,
    token_hash: hashSessionToken(token),
    expires_at: expiresAt.toISOString(),
  });
  if (error) throw new Error(`No se pudo crear la sesión de familia: ${error.message}`);
  return { token, expiresAt };
}

export type GuardianSession = {
  sessionId: string;
  guardianId: string;
  schoolId: string;
  schoolSlug: string;
  firstName: string;
  lastName: string;
  pinChanged: boolean;
  firstLoginCompleted: boolean;
};

/**
 * Sesión de familia vigente para un token, o null. Verifica en vivo que la sesión no venció ni
 * fue revocada, que el acceso del tutor sigue habilitado y que la escuela no está suspendida
 * (spec 04, RF-04 y RN-07; spec 00, CA-05).
 */
export async function getGuardianSession(
  client: SupabaseClient,
  token: string | undefined,
  now: Date = new Date(),
): Promise<GuardianSession | null> {
  if (!token) return null;

  const { data } = await client
    .from("guardian_session")
    .select(
      "id, guardian_id, school_id, expires_at, revoked, guardian(first_name, last_name, pin_changed, first_login_completed, access_revoked), school:school_id(status, slug)",
    )
    .eq("token_hash", hashSessionToken(token))
    .maybeSingle();
  if (!data || data.revoked || new Date(data.expires_at) <= now) return null;

  const guardian = data.guardian as unknown as {
    first_name: string;
    last_name: string;
    pin_changed: boolean;
    first_login_completed: boolean;
    access_revoked: boolean;
  } | null;
  const school = data.school as unknown as { status: string; slug: string } | null;
  if (!guardian || guardian.access_revoked || school?.status !== "active") return null;

  return {
    sessionId: data.id,
    guardianId: data.guardian_id,
    schoolId: data.school_id,
    schoolSlug: school.slug,
    firstName: guardian.first_name,
    lastName: guardian.last_name,
    pinChanged: guardian.pin_changed,
    firstLoginCompleted: guardian.first_login_completed,
  };
}

/** Cierra la sesión de este dispositivo (spec 04, RF-03). */
export async function revokeSession(client: SupabaseClient, sessionId: string): Promise<void> {
  await client.from("guardian_session").update({ revoked: true }).eq("id", sessionId);
}

/** Cierra todas las sesiones de un tutor (RF-03 y CA-11). */
export async function revokeAllSessions(client: SupabaseClient, guardianId: string): Promise<void> {
  await client
    .from("guardian_session")
    .update({ revoked: true })
    .eq("guardian_id", guardianId)
    .eq("revoked", false);
}

/** `field` indica qué campo del formulario corresponde al error, cuando hay uno claro. */
export type PinChangeResult =
  { ok: true } | { ok: false; message: string; field?: "currentPin" | "newPin" };

/**
 * El propio tutor cambia su PIN (spec 00, RF-16; spec 04, RF-06 y RF-29). Pide el PIN actual
 * y cierra las demás sesiones, conservando la actual.
 */
export async function changeGuardianPin(
  client: SupabaseClient,
  input: { guardianId: string; keepSessionId: string; currentPin: string; newPin: string },
): Promise<PinChangeResult> {
  const check = checkPin(input.newPin);
  if (!check.ok) return { ...check, field: "newPin" };
  if (input.newPin === input.currentPin) {
    return {
      ok: false,
      message: "El PIN nuevo tiene que ser distinto del actual.",
      field: "newPin",
    };
  }

  const { data: guardian } = await client
    .from("guardian")
    .select("pin_hash")
    .eq("id", input.guardianId)
    .maybeSingle();
  if (!guardian?.pin_hash) return { ok: false, message: "No se pudo cambiar el PIN." };

  if (!(await verifyPin(input.currentPin, guardian.pin_hash))) {
    // Cuenta como intento fallido: si no, esta pantalla permitiría adivinar el PIN sin límite.
    await client.rpc("guardian_register_pin_failure", {
      p_guardian_id: input.guardianId,
      p_max_attempts: MAX_PIN_ATTEMPTS,
      p_lock_minutes: LOCK_MINUTES,
    });
    return { ok: false, message: "El PIN actual no es correcto.", field: "currentPin" };
  }

  const { error } = await client
    .from("guardian")
    .update({
      pin_hash: await hashPin(input.newPin),
      pin_changed: true,
      pin_failed_attempts: 0,
      locked_until: null,
    })
    .eq("id", input.guardianId);
  if (error) return { ok: false, message: "No se pudo cambiar el PIN." };

  await client
    .from("guardian_session")
    .update({ revoked: true })
    .eq("guardian_id", input.guardianId)
    .eq("revoked", false)
    .neq("id", input.keepSessionId);
  return { ok: true };
}

/**
 * Genera un PIN inicial nuevo para un tutor (alta o reseteo por el admin, spec 00, RF-15 y
 * RF-19): rehabilita el acceso, limpia el bloqueo y cierra todas sus sesiones. Devuelve el PIN en
 * claro UNA sola vez; en la base queda solo el hash.
 */
export async function issueInitialPin(
  client: SupabaseClient,
  guardianId: string,
): Promise<{ pin: string }> {
  const pin = generateInitialPin();
  const { error } = await client
    .from("guardian")
    .update({
      pin_hash: await hashPin(pin),
      pin_changed: false,
      pin_failed_attempts: 0,
      locked_until: null,
      access_revoked: false,
    })
    .eq("id", guardianId);
  if (error) throw new Error(`No se pudo generar el PIN: ${error.message}`);
  await revokeAllSessions(client, guardianId);
  return { pin };
}

/** El admin desbloquea a un tutor antes de que pasen los 15 minutos (RF-18). */
export async function unlockGuardian(client: SupabaseClient, guardianId: string): Promise<void> {
  const { error } = await client
    .from("guardian")
    .update({ pin_failed_attempts: 0, locked_until: null })
    .eq("id", guardianId);
  if (error) throw new Error(`No se pudo desbloquear al tutor: ${error.message}`);
}

/** El admin revoca el acceso de un tutor sin afectar a los demás tutores del arquero (RF-20). */
export async function revokeGuardianAccess(
  client: SupabaseClient,
  guardianId: string,
): Promise<void> {
  const { error } = await client
    .from("guardian")
    .update({ access_revoked: true })
    .eq("id", guardianId);
  if (error) throw new Error(`No se pudo revocar el acceso: ${error.message}`);
  await revokeAllSessions(client, guardianId);
}
