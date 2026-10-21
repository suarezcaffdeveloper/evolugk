"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isValidSlug, normalizeSlug } from "@/lib/slug";
import { argentinaDate } from "@/lib/dates";
import { getStaffSession, requireStaff, type StaffSession } from "@/server/auth/guards";
import {
  applyMarks,
  deleteSession,
  dismissAbsenceAlert,
  getAttendanceBootstrap,
  openSession,
  setSessionSuspended,
  type Actor,
  type AttendanceBootstrap,
  type MarkOutcome,
  type SessionState,
} from "@/server/attendance";
import type { AttendanceActionError } from "@/lib/attendance-messages";
import { createServiceClient } from "@/server/supabase";

/**
 * Acciones de la toma de lista. Las que usa la pantalla sin conexión devuelven el resultado en
 * lugar de redirigir si la sesión venció: así el celular conserva las marcas y avisa con claridad
 * (spec 05, RF-26). Cada acción vuelve a verificar la sesión y el rol en vivo.
 */

const actorOf = (session: StaffSession): Actor => ({
  schoolId: session.school.id,
  actorId: session.user.id,
  role: session.role,
});

type Fail = { ok: false; error: AttendanceActionError };

/** Sesión del equipo para la pantalla de asistencia, sin redirigir (null si venció). */
async function staffOrNull(slug: string): Promise<StaffSession | null> {
  const normalized = normalizeSlug(slug);
  if (!isValidSlug(normalized)) return null;
  return getStaffSession(normalized);
}

// ───────────────────────────── precarga ─────────────────────────────

export async function refreshBootstrapAction(
  slug: string,
): Promise<({ ok: true } & AttendanceBootstrap & { generatedAt: string }) | Fail> {
  const session = await staffOrNull(slug);
  if (!session) return { ok: false, error: "session_expired" };
  const data = await getAttendanceBootstrap(createServiceClient(), session.school.id);
  return { ok: true, ...data, generatedAt: new Date().toISOString() };
}

// ───────────────────────────── abrir y sincronizar ─────────────────────────────

export async function openSessionAction(
  slug: string,
  groupId: string,
  date: string,
): Promise<{ ok: true; state: SessionState } | Fail> {
  const session = await staffOrNull(slug);
  if (!session) return { ok: false, error: "session_expired" };

  const result = await openSession(createServiceClient(), {
    ...actorOf(session),
    groupId,
    date,
    today: argentinaDate(new Date()),
  });
  return result.ok ? { ok: true, state: result.state } : { ok: false, error: result.error };
}

const syncSchema = z.object({
  groupId: z.uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  marks: z
    .array(
      z.object({
        goalkeeperId: z.uuid(),
        status: z.enum(["unmarked", "present", "absent", "excused"]),
        reason: z.string().max(200).nullable(),
        markedAt: z.string().max(40),
        guest: z.boolean(),
      }),
    )
    .max(200),
});

export type SyncResult =
  { ok: true; state: SessionState; outcomes: Record<string, MarkOutcome> } | Fail;

/**
 * Sincroniza una lista: abre la sesión del grupo y la fecha (la crea si no existe, o se une a la
 * existente, RF-02) y aplica las marcas. Sirve igual para guardar con conexión que para enviar lo
 * tomado sin ella (RF-26): prevalece el último cambio por hora de marca (RF-29).
 */
export async function syncSessionAction(slug: string, payload: unknown): Promise<SyncResult> {
  const session = await staffOrNull(slug);
  if (!session) return { ok: false, error: "session_expired" };

  const parsed = syncSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "failed" };

  const db = createServiceClient();
  const actor = actorOf(session);
  const opened = await openSession(db, {
    ...actor,
    groupId: parsed.data.groupId,
    date: parsed.data.date,
    today: argentinaDate(new Date()),
  });
  if (!opened.ok) return { ok: false, error: opened.error };

  const result = await applyMarks(db, {
    ...actor,
    sessionId: opened.state.sessionId,
    marks: parsed.data.marks,
  });
  if (!result.ok) {
    // Una sesión suspendida en otro dispositivo: se devuelve su estado para que el celular lo muestre.
    return { ok: false, error: result.error };
  }

  revalidatePath(`/${session.school.slug}/panel/asistencia`);
  revalidatePath(`/${session.school.slug}/panel`);
  return { ok: true, state: result.state, outcomes: result.outcomes };
}

// ───────────────────────────── suspender, borrar, avisos ─────────────────────────────

export type ChangeState = { ok?: boolean; error?: string };

export async function suspendSessionAction(
  slug: string,
  sessionId: string,
  suspended: boolean,
  _previous: ChangeState,
  formData: FormData,
): Promise<ChangeState> {
  const session = await requireStaff(slug);
  const reason = formData.get("reason");
  const result = await setSessionSuspended(createServiceClient(), {
    ...actorOf(session),
    sessionId,
    suspended,
    reason: typeof reason === "string" ? reason : "",
  });
  if (!result.ok) {
    return {
      error:
        result.error === "reason_required"
          ? "Escribí el motivo de la suspensión (por ejemplo, lluvia o feriado)."
          : "No pudimos cambiar el estado de la sesión.",
    };
  }
  revalidatePath(`/${session.school.slug}/panel/asistencia`);
  revalidatePath(`/${session.school.slug}/panel/asistencia/sesion/${sessionId}`);
  return { ok: true };
}

export async function deleteSessionAction(
  slug: string,
  sessionId: string,
  _previous: ChangeState,
): Promise<ChangeState> {
  const session = await requireStaff(slug);
  const result = await deleteSession(createServiceClient(), { ...actorOf(session), sessionId });
  if (!result.ok) {
    return {
      error:
        result.error === "forbidden"
          ? "Solo la administración puede borrar una sesión."
          : "No pudimos borrar la sesión.",
    };
  }
  revalidatePath(`/${session.school.slug}/panel/asistencia`);
  revalidatePath(`/${session.school.slug}/panel`);
  redirect(`/${session.school.slug}/panel/asistencia/informes?borrada=1`);
}

export async function dismissAlertAction(
  slug: string,
  alertId: string,
  _previous: ChangeState,
): Promise<ChangeState> {
  const session = await requireStaff(slug);
  const result = await dismissAbsenceAlert(createServiceClient(), { ...actorOf(session), alertId });
  if (!result.ok) return { error: "No pudimos descartar el aviso." };
  revalidatePath(`/${session.school.slug}/panel`);
  return { ok: true };
}
