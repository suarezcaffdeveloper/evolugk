import type { SupabaseClient } from "@supabase/supabase-js";

/** Equipo de una escuela: lista y activación/desactivación de cuentas (spec 00, RF-13). */

export type TeamMember = {
  userId: string;
  firstName: string;
  lastName: string;
  role: "school_admin" | "coach";
  active: boolean;
  email: string | null;
  createdAt: Date;
};

export async function listTeam(admin: SupabaseClient, schoolId: string): Promise<TeamMember[]> {
  const { data } = await admin
    .from("profile")
    .select("user_id, first_name, last_name, role, active, created_at")
    .eq("school_id", schoolId)
    .in("role", ["school_admin", "coach"])
    .order("created_at", { ascending: true });
  const rows = data ?? [];

  const emails = rows.length
    ? await admin.rpc("get_user_emails", { p_ids: rows.map((r) => r.user_id) })
    : { data: [] as { user_id: string; email: string }[] };
  const emailById = new Map<string, string>(
    (emails.data ?? []).map((e: { user_id: string; email: string }) => [e.user_id, e.email]),
  );

  return rows.map((r) => ({
    userId: r.user_id,
    firstName: r.first_name,
    lastName: r.last_name,
    role: r.role,
    active: r.active,
    email: emailById.get(r.user_id) ?? null,
    createdAt: new Date(r.created_at),
  }));
}

export type SetActiveResult =
  { ok: true } | { ok: false; error: "not_found" | "cannot_change_self" | "last_admin" | "failed" };

/**
 * Activa o desactiva a un miembro del equipo. Solo actúa sobre cuentas de la escuela indicada.
 * Nadie puede desactivarse a sí mismo (se quedaría sin acceso) y la base impide dejar a la escuela
 * sin su último administrador activo.
 */
export async function setStaffActive(
  admin: SupabaseClient,
  input: { schoolId: string; actorId: string; userId: string; active: boolean },
): Promise<SetActiveResult> {
  if (input.userId === input.actorId) return { ok: false, error: "cannot_change_self" };

  const { data, error } = await admin
    .from("profile")
    .update({ active: input.active })
    .eq("user_id", input.userId)
    .eq("school_id", input.schoolId)
    .in("role", ["school_admin", "coach"])
    .select("user_id");

  if (error) {
    return {
      ok: false,
      error: error.message.includes("último administrador") ? "last_admin" : "failed",
    };
  }
  if (!data?.length) return { ok: false, error: "not_found" };

  await admin.from("audit_log").insert({
    school_id: input.schoolId,
    actor_id: input.actorId,
    action: input.active ? "staff.reactivated" : "staff.deactivated",
    entity: "profile",
    entity_id: input.userId,
  });
  return { ok: true };
}
