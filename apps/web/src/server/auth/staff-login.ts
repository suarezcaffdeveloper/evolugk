import type { SupabaseClient } from "@supabase/supabase-js";
import { fieldErrorsFrom, loginSchema, type FieldErrors } from "@/lib/auth-schemas";
import { isValidSlug, normalizeSlug } from "@/lib/slug";

export type StaffRole = "school_admin" | "coach";

export type StaffLoginResult =
  | { ok: true; schoolId: string; role: StaffRole }
  | { ok: false; error: "invalid_input"; fieldErrors: FieldErrors }
  | { ok: false; error: "invalid_credentials" };

type Clients = {
  /** Clave secreta: se usa para consultar la escuela y el perfil con certeza, sin RLS. */
  admin: SupabaseClient;
  /** Cliente de la persona (con la clave pública): es el que queda con la sesión iniciada. */
  auth: SupabaseClient;
};

const INVALID: StaffLoginResult = { ok: false, error: "invalid_credentials" };

/**
 * Ingreso del staff (admin o profesor) a la escuela de /{slug} (spec 00, RF-07).
 *
 * Todas las fallas "de credenciales" devuelven el mismo resultado a propósito, para no revelar
 * si el mail existe, si la cuenta es de otra escuela, si está desactivada o si la escuela
 * está suspendida. La escuela se consulta EN VIVO (no usa la caché de la marca).
 */
export async function loginStaff(
  { admin, auth }: Clients,
  rawSlug: string,
  raw: { email?: unknown; password?: unknown },
): Promise<StaffLoginResult> {
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "invalid_input", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const slug = normalizeSlug(rawSlug);
  if (!isValidSlug(slug)) return INVALID;

  const { data: school } = await admin
    .from("school")
    .select("id, status")
    .eq("slug", slug)
    .maybeSingle();
  if (!school || school.status !== "active") return INVALID;

  const { data, error } = await auth.auth.signInWithPassword(parsed.data);
  if (error || !data.user) return INVALID;

  const { data: profile } = await admin
    .from("profile")
    .select("school_id, role, active")
    .eq("user_id", data.user.id)
    .maybeSingle();

  const allowed =
    profile?.active === true &&
    profile.school_id === school.id &&
    (profile.role === "school_admin" || profile.role === "coach");
  if (!allowed) {
    await auth.auth.signOut();
    return INVALID;
  }

  return { ok: true, schoolId: school.id, role: profile.role as StaffRole };
}
