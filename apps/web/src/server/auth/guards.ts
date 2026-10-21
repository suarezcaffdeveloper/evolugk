import "server-only";
import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createUserClient } from "@/lib/supabase/user-client";
import { isValidSlug, normalizeSlug } from "@/lib/slug";
import { createServiceClient } from "../supabase";
import { getMfaState, type MfaState } from "./operator-auth";
import type { StaffRole } from "./staff-login";

/**
 * Guardas de acceso para páginas y acciones de servidor. Verifican en vivo (no usan la caché de
 * la marca): la persona, su perfil activo y su escuela. RLS sigue siendo la última barrera.
 */

export type StaffSession = {
  user: User;
  role: StaffRole;
  firstName: string;
  lastName: string;
  school: { id: string; name: string; slug: string };
};

/** Sesión de staff válida para /{slug}, o null (sin redirigir). */
export async function getStaffSession(rawSlug: string): Promise<StaffSession | null> {
  const slug = normalizeSlug(rawSlug);
  if (!isValidSlug(slug)) return null;

  const supabase = await createUserClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;

  const admin = createServiceClient();
  const [{ data: school }, { data: profile }] = await Promise.all([
    admin.from("school").select("id, name, status").eq("slug", slug).maybeSingle(),
    admin
      .from("profile")
      .select("school_id, role, active, first_name, last_name")
      .eq("user_id", data.user.id)
      .maybeSingle(),
  ]);

  const valid =
    school?.status === "active" &&
    profile?.active === true &&
    profile.school_id === school.id &&
    (profile.role === "school_admin" || profile.role === "coach");
  if (!valid) return null;

  return {
    user: data.user,
    role: profile.role as StaffRole,
    firstName: profile.first_name,
    lastName: profile.last_name,
    school: { id: school.id, name: school.name, slug },
  };
}

export async function requireStaff(rawSlug: string): Promise<StaffSession> {
  const session = await getStaffSession(rawSlug);
  if (!session) redirect(`/${normalizeSlug(rawSlug)}/login`);
  return session;
}

export type OperatorSession = {
  user: User;
  firstName: string;
  lastName: string;
  mfa: MfaState;
};

/** Sesión de operador (con mail y contraseña correctos), o null. El segundo paso se indica en `mfa`. */
export async function getOperatorSession(): Promise<OperatorSession | null> {
  const supabase = await createUserClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;

  const { data: profile } = await createServiceClient()
    .from("profile")
    .select("role, active, first_name, last_name")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (!profile || profile.role !== "platform_admin" || !profile.active) return null;

  return {
    user: data.user,
    firstName: profile.first_name,
    lastName: profile.last_name,
    mfa: await getMfaState(supabase),
  };
}

const OPERATOR_PATH: Record<MfaState, string> = {
  enroll: "/operator/2fa/setup",
  challenge: "/operator/2fa",
  ready: "/operator",
};

/** Lleva al operador a la pantalla que corresponde a su estado de verificación. */
export function operatorHome(mfa: MfaState): string {
  return OPERATOR_PATH[mfa];
}

/**
 * Exige un operador en el estado indicado. Sin sesión va al login; en otro estado, a la pantalla
 * que le toca (por ejemplo, al panel no entra sin haber verificado el segundo paso).
 */
export async function requireOperator(required: MfaState): Promise<OperatorSession> {
  const session = await getOperatorSession();
  if (!session) redirect("/operator/login");
  if (session.mfa !== required) redirect(OPERATOR_PATH[session.mfa]);
  return session;
}
