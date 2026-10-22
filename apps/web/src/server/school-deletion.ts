import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, argentinaDate } from "@/lib/dates";
import type { VideoProvider } from "./video/provider";
import { retryProviderCleanup } from "./videos";

/** Días que una escuela suspendida conserva todos sus datos antes de poder borrarse (spec 00, RN-09). */
export const SUSPENSION_RETENTION_DAYS = 90;

/** Primer día en que se puede borrar una escuela suspendida en `suspendedAt`, en hora de Argentina. */
export function deletionEligibleOn(suspendedAt: string): string {
  return addDays(argentinaDate(new Date(suspendedAt)), SUSPENSION_RETENTION_DAYS);
}

export type DeleteSchoolResult =
  | {
      ok: true;
      slug: string;
      goalkeepers: number;
      videos: number;
      /** Archivos de video que el proveedor todavía no confirmó borrar: el cron los reintenta. */
      pendingAtProvider: number;
      /** Cuentas del equipo que no se pudieron borrar de Auth (quedan sin acceso a nada). */
      usersNotDeleted: number;
    }
  | {
      ok: false;
      error: "not_found" | "not_suspended" | "too_early" | "confirmation_mismatch" | "failed";
      /** Con `too_early`: primer día en que se puede borrar ("AAAA-MM-DD"). */
      eligibleOn?: string;
    };

/**
 * Borrado definitivo de una escuela: sus datos, sus videos en el proveedor y las cuentas de su
 * equipo. Es irreversible y siempre una decisión manual del operador (spec 00, RN-09).
 *
 * Condiciones: la escuela está suspendida hace 90 días o más, y quien borra escribió el
 * identificador de la escuela para confirmar.
 *
 * Orden pensado para no perder nada ante una caída a mitad de camino:
 *  1. Una sola transacción en la base encola los archivos del proveedor y borra la escuela.
 *  2. Recién entonces se borran las cuentas de Auth y se limpia el proveedor. Si algo falla acá,
 *     los archivos quedan en la cola y el cron diario los reintenta.
 * Los pagos que la escuela le hizo a la plataforma se conservan (siguen contando como ingresos).
 */
export async function deleteSchoolPermanently(
  db: SupabaseClient,
  provider: VideoProvider,
  input: { schoolId: string; confirmSlug: string; actorId: string; now?: Date },
): Promise<DeleteSchoolResult> {
  const { data: school, error: readError } = await db
    .from("school")
    .select("id, slug, name, status, suspended_at")
    .eq("id", input.schoolId)
    .maybeSingle();
  if (readError) return { ok: false, error: "failed" };
  if (!school) return { ok: false, error: "not_found" };

  if (school.status !== "suspended" || !school.suspended_at) {
    return { ok: false, error: "not_suspended" };
  }
  const eligibleOn = deletionEligibleOn(school.suspended_at as string);
  if (argentinaDate(input.now ?? new Date()) < eligibleOn) {
    return { ok: false, error: "too_early", eligibleOn };
  }
  if (input.confirmSlug.trim().toLowerCase() !== school.slug) {
    return { ok: false, error: "confirmation_mismatch" };
  }

  const { data, error } = await db.rpc("delete_school_permanently", { p_school_id: school.id });
  if (error || !data) return { ok: false, error: "failed" };
  const summary = data as { users: string[]; goalkeepers: number; videos: number };

  let usersNotDeleted = 0;
  for (const userId of summary.users) {
    const { error: userError } = await db.auth.admin.deleteUser(userId);
    if (userError) usersNotDeleted += 1;
  }

  // Mejor esfuerzo: lo que no se confirme queda en la cola y lo reintenta la tarea de mantenimiento.
  await retryProviderCleanup(db, provider, Math.max(summary.videos, 1));
  const { count } = await db
    .from("video_provider_cleanup")
    .select("id", { count: "exact", head: true })
    .eq("school_id", school.id);
  const pendingAtProvider = count ?? 0;

  // La auditoría sobrevive al borrado de la escuela (audit_log no tiene clave foránea).
  await db.from("audit_log").insert({
    school_id: school.id,
    actor_id: input.actorId,
    action: "school.deleted",
    entity: "school",
    entity_id: school.id,
    details: {
      name: school.name,
      slug: school.slug,
      goalkeepers: summary.goalkeepers,
      videos: summary.videos,
      users: summary.users.length,
      usersNotDeleted,
      pendingAtProvider,
    },
  });

  return {
    ok: true,
    slug: school.slug as string,
    goalkeepers: summary.goalkeepers,
    videos: summary.videos,
    pendingAtProvider,
    usersNotDeleted,
  };
}
