"use server";

import { redirect } from "next/navigation";
import { isValidAccessCode, normalizeAccessCode } from "@/lib/access-code";
import { normalizeSlug } from "@/lib/slug";
import { loginGuardian } from "@/server/guardian/access";
import { familyHome, setFamilySessionCookie } from "@/server/guardian/session";
import { createServiceClient } from "@/server/supabase";

export type FamilyLoginState = {
  error?: string;
  /** Se conserva el código escrito para no obligar a volver a tipearlo. El PIN nunca se devuelve. */
  code?: string;
};

const INVALID = "El código o el PIN no son correctos. Revisalos y probá de nuevo.";

/** Ingreso de un tutor con código y PIN (spec 04, RF-01; spec 00, RF-13 a RF-18). */
export async function familyLoginAction(
  slug: string,
  _previous: FamilyLoginState,
  formData: FormData,
): Promise<FamilyLoginState> {
  const rawCode = formData.get("code");
  const rawPin = formData.get("pin");
  const code = typeof rawCode === "string" ? rawCode : "";
  const pin = typeof rawPin === "string" ? rawPin.trim() : "";

  // Un formato imposible no llega a la base: no hay nada que verificar.
  if (!isValidAccessCode(normalizeAccessCode(code)) || !/^\d{6}$/.test(pin)) {
    return { error: INVALID, code };
  }

  const result = await loginGuardian(createServiceClient(), { slug, code, pin });
  if (!result.ok) {
    if (result.reason === "locked") {
      const minutes = Math.max(1, Math.ceil((result.lockedUntil.getTime() - Date.now()) / 60_000));
      return {
        error: `Hiciste demasiados intentos. Probá de nuevo en ${minutes} ${
          minutes === 1 ? "minuto" : "minutos"
        } o pedile a la escuela que te desbloquee.`,
        code,
      };
    }
    return { error: INVALID, code };
  }

  await setFamilySessionCookie(result.token, result.expiresAt);
  // /familia decide si falta el asistente de primer ingreso o si va directo al inicio.
  redirect(familyHome(normalizeSlug(slug)));
}
