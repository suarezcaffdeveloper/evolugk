import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { isValidSlug, normalizeSlug } from "@/lib/slug";
import { createServiceClient } from "../supabase";
import { getGuardianSession, SESSION_DAYS, type GuardianSession } from "./access";

/**
 * Cookie de la sesión de familia (spec 04, RF-02 y RF-05). Guarda el token opaco; en la base solo
 * queda su hash. Es httpOnly y dura lo mismo que la sesión (30 días).
 */
const SESSION_COOKIE = "evolugk_family";
/** Último arquero elegido (RF-10). No es secreta y sobrevive al cierre de sesión (CA-04). */
const LAST_GOALKEEPER_COOKIE = "evolugk_last_goalkeeper";

const baseCookie = {
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};

/** Solo desde una acción de servidor: el navegador recibe el token y no lo puede leer. */
export async function setFamilySessionCookie(token: string, expiresAt: Date): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    ...baseCookie,
    httpOnly: true,
    expires: expiresAt,
  });
}

export async function clearFamilySessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function getLastGoalkeeperId(): Promise<string | undefined> {
  return (await cookies()).get(LAST_GOALKEEPER_COOKIE)?.value;
}

export async function rememberGoalkeeper(goalkeeperId: string): Promise<void> {
  (await cookies()).set(LAST_GOALKEEPER_COOKIE, goalkeeperId, {
    ...baseCookie,
    httpOnly: true,
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

/**
 * Sesión de familia de este pedido para la escuela del link, o null. Además de la sesión válida,
 * exige que el tutor pertenezca a la escuela de la URL: con la sesión de una escuela no se ve
 * nada de otra (RN-01). Se calcula una vez por pedido.
 */
export const getFamilySession = cache(async (rawSlug: string): Promise<GuardianSession | null> => {
  const slug = normalizeSlug(rawSlug);
  if (!isValidSlug(slug)) return null;

  // La vigencia de la sesión depende de la hora: se marca el pedido como dinámico antes de leerla.
  await connection();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await getGuardianSession(createServiceClient(), token);
  return session && session.schoolSlug === slug ? session : null;
});

export const familyHome = (slug: string) => `/${normalizeSlug(slug)}/familia`;
export const familyWizard = (slug: string) => `/${normalizeSlug(slug)}/familia/primer-ingreso`;

/**
 * Exige un tutor con sesión vigente. Sin sesión va al ingreso; si todavía no terminó el asistente
 * de primer ingreso va al asistente, salvo que la pantalla sea justamente el asistente (CA-01).
 */
export async function requireFamily(
  rawSlug: string,
  options: { allowIncompleteSetup?: boolean } = {},
): Promise<GuardianSession> {
  const session = await getFamilySession(rawSlug);
  if (!session) redirect(`/${normalizeSlug(rawSlug)}`);
  if (!options.allowIncompleteSetup && (!session.pinChanged || !session.firstLoginCompleted)) {
    redirect(familyWizard(rawSlug));
  }
  return session;
}
