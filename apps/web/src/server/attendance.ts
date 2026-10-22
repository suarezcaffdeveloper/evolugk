import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  absenceStreakInfo,
  ATTENDANCE_WINDOW_DAYS,
  attendanceSummary,
  groupMonthSummary,
  isLowAttendance,
  STREAK_ALERT_LENGTH,
  type AttendanceRecord,
  type AttendanceSummary,
  type EntryStatus,
  type SessionStatus,
} from "@/lib/attendance";
import { addDays } from "@/lib/dates";
import type { StaffRole } from "./evaluations";

/**
 * Asistencia del staff (spec 05). Toda función recibe la escuela y filtra por ella: el cliente con
 * clave secreta se saltea RLS, así que el aislamiento depende de este código.
 *
 * Las marcas llegan con la hora en que se hicieron en el celular (`markedAt`): así la misma
 * función sirve para guardar con conexión y para sincronizar lo tomado sin ella, y cuando dos
 * dispositivos modifican lo mismo prevalece el último cambio por hora de marca (RF-29).
 */

type Db = SupabaseClient;
export type Actor = { schoolId: string; actorId: string; role: StaffRole };

const PG_UNIQUE = "23505";
const PG_CHECK = "23514";

async function audit(
  db: Db,
  actor: Pick<Actor, "schoolId" | "actorId">,
  action: string,
  entity: string,
  entityId: string,
  details: Record<string, unknown> = {},
) {
  // De mejor esfuerzo: la auditoría no debe impedir la acción ya realizada.
  await db.from("audit_log").insert({
    school_id: actor.schoolId,
    actor_id: actor.actorId,
    action,
    entity,
    entity_id: entityId,
    details,
  });
}

// ───────────────────────────── datos para tomar lista ─────────────────────────────

export type RosterGoalkeeper = { id: string; firstName: string; lastName: string };
export type RosterGroup = { id: string; name: string; members: RosterGoalkeeper[] };

export type AttendanceBootstrap = {
  groups: RosterGroup[];
  /** Todos los arqueros activos de la escuela: para buscar invitados (RF-09). */
  goalkeepers: RosterGoalkeeper[];
};

const byName = (a: RosterGoalkeeper, b: RosterGoalkeeper) =>
  a.lastName.localeCompare(b.lastName, "es") || a.firstName.localeCompare(b.firstName, "es");

/**
 * Lo que el celular precarga para poder tomar lista sin conexión (RF-27): los grupos vigentes con
 * sus miembros activos y los arqueros activos de la escuela. No incluye ningún dato sensible.
 */
export async function getAttendanceBootstrap(
  db: Db,
  schoolId: string,
): Promise<AttendanceBootstrap> {
  const [{ data: groups }, { data: goalkeepers }, { data: memberships }] = await Promise.all([
    db
      .from("groups")
      .select("id, name")
      .eq("school_id", schoolId)
      .eq("archived", false)
      .order("name"),
    db
      .from("goalkeeper")
      .select("id, first_name, last_name")
      .eq("school_id", schoolId)
      .eq("status", "active"),
    db.from("goalkeeper_group").select("goalkeeper_id, group_id").eq("school_id", schoolId),
  ]);

  const active = new Map<string, RosterGoalkeeper>(
    (goalkeepers ?? []).map((g) => [
      g.id as string,
      { id: g.id as string, firstName: g.first_name as string, lastName: g.last_name as string },
    ]),
  );
  const membersByGroup = new Map<string, RosterGoalkeeper[]>();
  for (const m of memberships ?? []) {
    const goalkeeper = active.get(m.goalkeeper_id as string);
    if (!goalkeeper) continue; // RF-05: solo activos
    const list = membersByGroup.get(m.group_id as string) ?? [];
    list.push(goalkeeper);
    membersByGroup.set(m.group_id as string, list);
  }

  return {
    groups: (groups ?? []).map((g) => ({
      id: g.id as string,
      name: g.name as string,
      members: (membersByGroup.get(g.id as string) ?? []).sort(byName),
    })),
    goalkeepers: [...active.values()].sort(byName),
  };
}

// ───────────────────────────── sesiones ─────────────────────────────

export type EntryState = {
  goalkeeperId: string;
  firstName: string;
  lastName: string;
  status: EntryStatus;
  reason: string | null;
  isGuest: boolean;
  markedAt: string | null;
};

export type SessionState = {
  sessionId: string;
  groupId: string;
  groupName: string;
  date: string;
  status: SessionStatus;
  suspensionReason: string | null;
  entries: EntryState[];
};

type EntryRow = {
  goalkeeper_id: string;
  status: EntryStatus;
  reason: string | null;
  is_guest: boolean;
  marked_at: string | null;
  goalkeeper: { first_name: string; last_name: string } | null;
};

const ENTRY_COLUMNS =
  "goalkeeper_id, status, reason, is_guest, marked_at, goalkeeper(first_name, last_name)";

/** El estado completo de una sesión tal como está en el servidor, o null si no es de la escuela. */
export async function getSessionState(
  db: Db,
  schoolId: string,
  sessionId: string,
): Promise<SessionState | null> {
  const { data: session } = await db
    .from("attendance_session")
    .select("id, group_id, date, status, suspension_reason, groups(name)")
    .eq("school_id", schoolId)
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) return null;

  const { data: entries } = await db
    .from("attendance_entry")
    .select(ENTRY_COLUMNS)
    .eq("school_id", schoolId)
    .eq("session_id", sessionId);

  return {
    sessionId: session.id as string,
    groupId: session.group_id as string,
    groupName: (session.groups as unknown as { name: string } | null)?.name ?? "",
    date: session.date as string,
    status: session.status as SessionStatus,
    suspensionReason: session.suspension_reason as string | null,
    entries: ((entries ?? []) as unknown as EntryRow[])
      .map((e) => ({
        goalkeeperId: e.goalkeeper_id,
        firstName: e.goalkeeper?.first_name ?? "",
        lastName: e.goalkeeper?.last_name ?? "",
        status: e.status,
        reason: e.reason,
        isGuest: e.is_guest,
        markedAt: e.marked_at,
      }))
      .sort(
        (a, b) =>
          Number(a.isGuest) - Number(b.isGuest) ||
          a.lastName.localeCompare(b.lastName, "es") ||
          a.firstName.localeCompare(b.firstName, "es"),
      ),
  };
}

export type OpenSessionResult =
  | { ok: true; created: boolean; state: SessionState }
  | { ok: false; error: "invalid_date" | "group_not_found" | "group_archived" | "failed" };

/**
 * Abre la sesión de un grupo y una fecha, y la crea si no existe (RF-01 y RF-02): si ya hay una,
 * se abre la existente (CA-02). La lista nueva se arma con los miembros activos del grupo en este
 * momento (RF-03); las sesiones pasadas no se modifican cuando un arquero cambia de grupo (CA-09).
 */
export async function openSession(
  db: Db,
  input: Actor & { groupId: string; date: string; today: string },
): Promise<OpenSessionResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || input.date > input.today) {
    return { ok: false, error: "invalid_date" };
  }

  const { data: group } = await db
    .from("groups")
    .select("id, archived")
    .eq("school_id", input.schoolId)
    .eq("id", input.groupId)
    .maybeSingle();
  if (!group) return { ok: false, error: "group_not_found" };

  const existing = await findSession(db, input.schoolId, input.groupId, input.date);
  if (existing) {
    const state = await getSessionState(db, input.schoolId, existing);
    return state ? { ok: true, created: false, state } : { ok: false, error: "failed" };
  }
  // RF-05: un grupo archivado no se ofrece para sesiones nuevas.
  if (group.archived) return { ok: false, error: "group_archived" };

  const { data: created, error } = await db
    .from("attendance_session")
    .insert({
      school_id: input.schoolId,
      group_id: input.groupId,
      date: input.date,
      created_by: input.actorId,
    })
    .select("id")
    .single();

  if (error || !created) {
    // Otra persona la creó al mismo tiempo: se abre la suya, sin duplicar (spec 05, casos borde).
    if (error?.code === PG_UNIQUE) {
      const raced = await findSession(db, input.schoolId, input.groupId, input.date);
      const state = raced ? await getSessionState(db, input.schoolId, raced) : null;
      if (state) return { ok: true, created: false, state };
    }
    return { ok: false, error: "failed" };
  }

  const { members } = await groupMembers(db, input.schoolId, input.groupId);
  if (members.length > 0) {
    const { error: entriesError } = await db.from("attendance_entry").insert(
      members.map((m) => ({
        school_id: input.schoolId,
        session_id: created.id,
        goalkeeper_id: m.id,
      })),
    );
    if (entriesError) {
      await db.from("attendance_session").delete().eq("id", created.id);
      return { ok: false, error: "failed" };
    }
  }

  await audit(db, input, "attendance.session_created", "attendance_session", created.id, {
    groupId: input.groupId,
    date: input.date,
  });
  const state = await getSessionState(db, input.schoolId, created.id);
  return state ? { ok: true, created: true, state } : { ok: false, error: "failed" };
}

async function findSession(db: Db, schoolId: string, groupId: string, date: string) {
  const { data } = await db
    .from("attendance_session")
    .select("id")
    .eq("school_id", schoolId)
    .eq("group_id", groupId)
    .eq("date", date)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

async function groupMembers(db: Db, schoolId: string, groupId: string) {
  const { data: memberships } = await db
    .from("goalkeeper_group")
    .select("goalkeeper_id")
    .eq("school_id", schoolId)
    .eq("group_id", groupId);
  const ids = (memberships ?? []).map((m) => m.goalkeeper_id as string);
  if (ids.length === 0) return { members: [] as { id: string }[] };

  // RF-05 y RN-04: solo los activos entran en una lista nueva.
  const { data: active } = await db
    .from("goalkeeper")
    .select("id")
    .eq("school_id", schoolId)
    .eq("status", "active")
    .in("id", ids);
  return { members: (active ?? []).map((g) => ({ id: g.id as string })) };
}

// ───────────────────────────── marcas ─────────────────────────────

export type MarkInput = {
  goalkeeperId: string;
  status: EntryStatus;
  reason: string | null;
  /** Hora de la marca en el dispositivo (ISO). Se acota a la hora del servidor. */
  markedAt: string;
  /** El arquero no está en la lista del grupo: se agrega como invitado (RF-09). */
  guest?: boolean;
};

export type MarkOutcome = "applied" | "unchanged" | "discarded" | "skipped";

export type ApplyMarksResult =
  | { ok: true; outcomes: Record<string, MarkOutcome>; state: SessionState }
  | { ok: false; error: "not_found" | "suspended" | "failed" };

/** Una marca más vieja que lo ya guardado pierde (RF-29); el empate lo gana lo que ya estaba. */
function clampMarkedAt(raw: string, now: Date): Date {
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime()) || parsed.getTime() > now.getTime()) return now;
  return parsed;
}

/**
 * Aplica marcas a una sesión (RF-06 a RF-11, RF-13 y RF-26). Cada cambio de estado queda en el
 * registro de revisiones (RF-14); un cambio que perdió contra uno más reciente también queda,
 * como descartado (RF-29). Después se revisa si algún arquero llegó a 3 ausencias seguidas.
 */
export async function applyMarks(
  db: Db,
  input: Actor & { sessionId: string; marks: MarkInput[]; now?: Date },
): Promise<ApplyMarksResult> {
  const now = input.now ?? new Date();
  const { data: session } = await db
    .from("attendance_session")
    .select("id, status")
    .eq("school_id", input.schoolId)
    .eq("id", input.sessionId)
    .maybeSingle();
  if (!session) return { ok: false, error: "not_found" };
  // RN-02: una sesión suspendida no admite marcar asistencia.
  if (session.status === "suspended" && input.marks.some((m) => m.status !== "unmarked")) {
    return { ok: false, error: "suspended" };
  }

  const { data: existingRows } = await db
    .from("attendance_entry")
    .select("id, goalkeeper_id, status, reason, marked_at")
    .eq("school_id", input.schoolId)
    .eq("session_id", input.sessionId);
  const entries = new Map((existingRows ?? []).map((e) => [e.goalkeeper_id as string, e] as const));

  const outcomes: Record<string, MarkOutcome> = {};
  const changed = new Set<string>();

  for (const mark of input.marks) {
    const markedAt = clampMarkedAt(mark.markedAt, now);
    const reason = mark.status === "excused" ? mark.reason?.trim().slice(0, 200) || null : null;
    const entry = entries.get(mark.goalkeeperId);

    if (!entry) {
      // Solo se crea una fila nueva para un invitado (RF-09); cualquier otro arquero no está en la lista.
      if (!mark.guest) {
        outcomes[mark.goalkeeperId] = "skipped";
        continue;
      }
      const { data: created, error } = await db
        .from("attendance_entry")
        .insert({
          school_id: input.schoolId,
          session_id: input.sessionId,
          goalkeeper_id: mark.goalkeeperId,
          is_guest: true,
          status: mark.status,
          reason,
          marked_at: mark.status === "unmarked" ? null : markedAt.toISOString(),
          marked_by: mark.status === "unmarked" ? null : input.actorId,
        })
        .select("id")
        .single();
      if (error || !created) {
        // Arquero inactivo o de otra escuela (RN-04), o ya agregado por otro dispositivo.
        outcomes[mark.goalkeeperId] = error?.code === PG_UNIQUE ? "unchanged" : "skipped";
        if (error && error.code !== PG_UNIQUE && error.code !== PG_CHECK) {
          return { ok: false, error: "failed" };
        }
        continue;
      }
      outcomes[mark.goalkeeperId] = "applied";
      if (mark.status !== "unmarked") {
        await recordRevision(db, input, created.id, "unmarked", mark.status, markedAt, false);
        changed.add(mark.goalkeeperId);
      }
      continue;
    }

    // Volver a "sin marcar" no es una marca.
    if (mark.status === "unmarked") {
      outcomes[mark.goalkeeperId] = "unchanged";
      continue;
    }

    const current = entry.status as EntryStatus;
    const currentReason = (entry.reason as string | null) ?? null;
    const storedAt = entry.marked_at ? new Date(entry.marked_at as string) : null;

    if (storedAt && storedAt.getTime() >= markedAt.getTime()) {
      // Ya hay algo igual o más reciente: este cambio pierde (RF-29). Si pedía otra cosa, queda registrado.
      outcomes[mark.goalkeeperId] = "discarded";
      if (mark.status !== current) {
        await recordRevision(db, input, entry.id as string, current, mark.status, markedAt, true);
      }
      continue;
    }

    if (mark.status === current && reason === currentReason) {
      // Igual a lo guardado: solo se adelanta la hora de la marca.
      await db
        .from("attendance_entry")
        .update({ marked_at: markedAt.toISOString() })
        .eq("id", entry.id)
        .eq("school_id", input.schoolId);
      outcomes[mark.goalkeeperId] = "unchanged";
      continue;
    }

    const { error } = await db
      .from("attendance_entry")
      .update({
        status: mark.status,
        reason,
        marked_at: markedAt.toISOString(),
        marked_by: input.actorId,
      })
      .eq("id", entry.id)
      .eq("school_id", input.schoolId);
    if (error) {
      if (error.code === PG_CHECK) return { ok: false, error: "suspended" };
      return { ok: false, error: "failed" };
    }
    outcomes[mark.goalkeeperId] = "applied";
    if (mark.status !== current) {
      await recordRevision(db, input, entry.id as string, current, mark.status, markedAt, false);
      changed.add(mark.goalkeeperId);
    }
  }

  for (const goalkeeperId of changed) {
    await refreshAbsenceAlert(db, input.schoolId, goalkeeperId);
  }

  const state = await getSessionState(db, input.schoolId, input.sessionId);
  return state ? { ok: true, outcomes, state } : { ok: false, error: "failed" };
}

async function recordRevision(
  db: Db,
  actor: Pick<Actor, "schoolId" | "actorId">,
  entryId: string,
  oldValue: string,
  newValue: string,
  markedAt: Date,
  discarded: boolean,
) {
  await db.from("attendance_revision").insert({
    school_id: actor.schoolId,
    entry_id: entryId,
    edited_by: actor.actorId,
    client_marked_at: markedAt.toISOString(),
    old_value: oldValue,
    new_value: newValue,
    discarded,
  });
}

// ───────────────────────────── suspensión y borrado ─────────────────────────────

export type SessionChangeResult =
  { ok: true } | { ok: false; error: "not_found" | "forbidden" | "reason_required" | "failed" };

/**
 * Suspende una sesión con un motivo corto (RF-12) o la reactiva (RN-02). Al reactivarla vuelve a
 * abrirse y se conservan las marcas previas (spec 05, casos borde).
 */
export async function setSessionSuspended(
  db: Db,
  input: Actor & { sessionId: string; suspended: boolean; reason?: string },
): Promise<SessionChangeResult> {
  const reason = input.reason?.trim().slice(0, 200) ?? "";
  if (input.suspended && !reason) return { ok: false, error: "reason_required" };

  const { data, error } = await db
    .from("attendance_session")
    .update(
      input.suspended
        ? { status: "suspended", suspension_reason: reason }
        : { status: "open", suspension_reason: null },
    )
    .eq("id", input.sessionId)
    .eq("school_id", input.schoolId)
    .select("id");
  if (error) return { ok: false, error: "failed" };
  if (!data?.length) return { ok: false, error: "not_found" };

  await audit(
    db,
    input,
    input.suspended ? "attendance.session_suspended" : "attendance.session_reactivated",
    "attendance_session",
    input.sessionId,
    input.suspended ? { reason } : {},
  );
  // Suspender o reactivar cambia las rachas de ausencias de toda la lista.
  await refreshAlertsForSession(db, input.schoolId, input.sessionId);
  return { ok: true };
}

/** Solo el admin borra una sesión (RF-15). */
export async function deleteSession(
  db: Db,
  input: Actor & { sessionId: string },
): Promise<SessionChangeResult> {
  if (input.role !== "school_admin") return { ok: false, error: "forbidden" };

  const { data: entries } = await db
    .from("attendance_entry")
    .select("goalkeeper_id")
    .eq("school_id", input.schoolId)
    .eq("session_id", input.sessionId);

  const { data, error } = await db
    .from("attendance_session")
    .delete()
    .eq("id", input.sessionId)
    .eq("school_id", input.schoolId)
    .select("id, group_id, date");
  if (error) return { ok: false, error: "failed" };
  if (!data?.length) return { ok: false, error: "not_found" };

  await audit(db, input, "attendance.session_deleted", "attendance_session", input.sessionId, {
    groupId: data[0].group_id,
    date: data[0].date,
  });
  for (const e of entries ?? []) {
    await refreshAbsenceAlert(db, input.schoolId, e.goalkeeper_id as string);
  }
  return { ok: true };
}

async function refreshAlertsForSession(db: Db, schoolId: string, sessionId: string) {
  const { data: entries } = await db
    .from("attendance_entry")
    .select("goalkeeper_id")
    .eq("school_id", schoolId)
    .eq("session_id", sessionId);
  for (const e of entries ?? []) await refreshAbsenceAlert(db, schoolId, e.goalkeeper_id as string);
}

// ───────────────────────────── historial de un arquero ─────────────────────────────

export type GoalkeeperAttendanceRow = {
  entryId: string;
  sessionId: string;
  date: string;
  groupName: string;
  sessionStatus: SessionStatus;
  suspensionReason: string | null;
  status: EntryStatus;
  /** Motivo de la justificación: solo para el staff. */
  reason: string | null;
  isGuest: boolean;
  createdAt: string;
};

type HistoryRow = {
  id: string;
  status: EntryStatus;
  reason: string | null;
  is_guest: boolean;
  created_at: string;
  attendance_session: {
    id: string;
    date: string;
    status: SessionStatus;
    suspension_reason: string | null;
    groups: { name: string } | null;
  };
};

/** Historial de asistencia de un arquero, de la sesión más reciente a la más antigua (RF-18 y RF-21). */
export async function getGoalkeeperAttendance(
  db: Db,
  schoolId: string,
  goalkeeperId: string,
): Promise<GoalkeeperAttendanceRow[]> {
  const { data } = await db
    .from("attendance_entry")
    .select(
      "id, status, reason, is_guest, created_at, attendance_session!inner(id, date, status, suspension_reason, groups(name))",
    )
    .eq("school_id", schoolId)
    .eq("goalkeeper_id", goalkeeperId);

  return ((data ?? []) as unknown as HistoryRow[])
    .map((row) => ({
      entryId: row.id,
      sessionId: row.attendance_session.id,
      date: row.attendance_session.date,
      groupName: row.attendance_session.groups?.name ?? "",
      sessionStatus: row.attendance_session.status,
      suspensionReason: row.attendance_session.suspension_reason,
      status: row.status,
      reason: row.reason,
      isGuest: row.is_guest,
      createdAt: row.created_at,
    }))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

export const toRecords = (rows: GoalkeeperAttendanceRow[]): AttendanceRecord[] =>
  rows.map((r) => ({
    date: r.date,
    sessionStatus: r.sessionStatus,
    entryStatus: r.status,
    createdAt: r.createdAt,
  }));

// ───────────────────────────── sesiones y su registro ─────────────────────────────

export type SessionListItem = {
  id: string;
  date: string;
  groupName: string;
  status: SessionStatus;
  suspensionReason: string | null;
  present: number;
  absent: number;
  excused: number;
  unmarked: number;
};

export async function listSessions(
  db: Db,
  schoolId: string,
  options: { groupId?: string; limit?: number } = {},
): Promise<SessionListItem[]> {
  let query = db
    .from("attendance_session")
    .select("id, date, status, suspension_reason, groups(name), attendance_entry(status)")
    .eq("school_id", schoolId)
    .order("date", { ascending: false })
    .limit(options.limit ?? 30);
  if (options.groupId) query = query.eq("group_id", options.groupId);

  const { data } = await query;
  return (data ?? []).map((row) => {
    const statuses = ((row.attendance_entry as unknown as { status: EntryStatus }[]) ?? []).map(
      (e) => e.status,
    );
    const count = (s: EntryStatus) => statuses.filter((x) => x === s).length;
    return {
      id: row.id as string,
      date: row.date as string,
      groupName: (row.groups as unknown as { name: string } | null)?.name ?? "",
      status: row.status as SessionStatus,
      suspensionReason: row.suspension_reason as string | null,
      present: count("present"),
      absent: count("absent"),
      excused: count("excused"),
      unmarked: count("unmarked"),
    };
  });
}

export type RevisionView = {
  id: string;
  goalkeeperName: string;
  editorName: string | null;
  editedAt: string;
  clientMarkedAt: string | null;
  oldValue: EntryStatus;
  newValue: EntryStatus;
  discarded: boolean;
};

export async function listSessionRevisions(
  db: Db,
  schoolId: string,
  sessionId: string,
): Promise<RevisionView[]> {
  const { data: entries } = await db
    .from("attendance_entry")
    .select("id, goalkeeper(first_name, last_name)")
    .eq("school_id", schoolId)
    .eq("session_id", sessionId);
  const names = new Map(
    (entries ?? []).map((e) => {
      const g = e.goalkeeper as unknown as { first_name: string; last_name: string } | null;
      return [e.id as string, g ? `${g.first_name} ${g.last_name}` : ""] as const;
    }),
  );
  if (names.size === 0) return [];

  const { data } = await db
    .from("attendance_revision")
    .select("id, entry_id, edited_by, edited_at, client_marked_at, old_value, new_value, discarded")
    .eq("school_id", schoolId)
    .in("entry_id", [...names.keys()])
    .order("edited_at", { ascending: false });
  const rows = data ?? [];

  const editorIds = [...new Set(rows.map((r) => r.edited_by as string | null).filter(Boolean))];
  const { data: profiles } = editorIds.length
    ? await db
        .from("profile")
        .select("user_id, first_name, last_name")
        .eq("school_id", schoolId)
        .in("user_id", editorIds as string[])
    : { data: [] };
  const editors = new Map(
    (profiles ?? []).map((p) => [p.user_id as string, `${p.first_name} ${p.last_name}`.trim()]),
  );

  return rows.map((r) => ({
    id: r.id as string,
    goalkeeperName: names.get(r.entry_id as string) ?? "",
    editorName: r.edited_by ? (editors.get(r.edited_by as string) ?? null) : null,
    editedAt: r.edited_at as string,
    clientMarkedAt: r.client_marked_at as string | null,
    oldValue: r.old_value as EntryStatus,
    newValue: r.new_value as EntryStatus,
    discarded: r.discarded as boolean,
  }));
}

// ───────────────────────────── informes ─────────────────────────────

export type GroupMonthRow = {
  groupId: string;
  groupName: string;
  trainings: number;
  average: number | null;
};

/** Resumen por grupo y mes (RF-22): cantidad de entrenamientos y asistencia promedio. */
export async function getGroupMonthReport(
  db: Db,
  schoolId: string,
  month: { year: number; month: number },
): Promise<GroupMonthRow[]> {
  const first = `${month.year}-${String(month.month).padStart(2, "0")}-01`;
  const last = `${month.year}-${String(month.month).padStart(2, "0")}-${String(new Date(Date.UTC(month.year, month.month, 0)).getUTCDate()).padStart(2, "0")}`;

  const [{ data: groups }, { data: sessions }] = await Promise.all([
    db.from("groups").select("id, name, archived").eq("school_id", schoolId).order("name"),
    db
      .from("attendance_session")
      .select("group_id, status, attendance_entry(status)")
      .eq("school_id", schoolId)
      .gte("date", first)
      .lte("date", last),
  ]);

  const byGroup = new Map<string, { sessionStatus: SessionStatus; entries: EntryStatus[] }[]>();
  for (const s of sessions ?? []) {
    const list = byGroup.get(s.group_id as string) ?? [];
    list.push({
      sessionStatus: s.status as SessionStatus,
      entries: ((s.attendance_entry as unknown as { status: EntryStatus }[]) ?? []).map(
        (e) => e.status,
      ),
    });
    byGroup.set(s.group_id as string, list);
  }

  return (groups ?? [])
    .filter((g) => !g.archived || byGroup.has(g.id as string))
    .map((g) => ({
      groupId: g.id as string,
      groupName: g.name as string,
      ...groupMonthSummary(byGroup.get(g.id as string) ?? []),
    }));
}

export type LowAttendanceRow = {
  goalkeeperId: string;
  firstName: string;
  lastName: string;
  summary: AttendanceSummary;
};

/** Arqueros activos con menos de 70% en los últimos 90 días (RF-23), de menor a mayor porcentaje. */
export async function getLowAttendance(
  db: Db,
  schoolId: string,
  today: string,
): Promise<LowAttendanceRow[]> {
  const cutoff = addDays(today, -ATTENDANCE_WINDOW_DAYS);
  const [{ data: goalkeepers }, { data: entries }] = await Promise.all([
    db
      .from("goalkeeper")
      .select("id, first_name, last_name")
      .eq("school_id", schoolId)
      .eq("status", "active"),
    db
      .from("attendance_entry")
      .select("goalkeeper_id, status, attendance_session!inner(date, status)")
      .eq("school_id", schoolId)
      .gt("attendance_session.date", cutoff),
  ]);

  const records = new Map<string, AttendanceRecord[]>();
  for (const e of entries ?? []) {
    const session = e.attendance_session as unknown as { date: string; status: SessionStatus };
    const list = records.get(e.goalkeeper_id as string) ?? [];
    list.push({
      date: session.date,
      sessionStatus: session.status,
      entryStatus: e.status as EntryStatus,
    });
    records.set(e.goalkeeper_id as string, list);
  }

  return (goalkeepers ?? [])
    .map((g) => ({
      goalkeeperId: g.id as string,
      firstName: g.first_name as string,
      lastName: g.last_name as string,
      summary: attendanceSummary(records.get(g.id as string) ?? [], today),
    }))
    .filter((row) => isLowAttendance(row.summary.percent))
    .sort(
      (a, b) =>
        (a.summary.percent ?? 0) - (b.summary.percent ?? 0) ||
        a.lastName.localeCompare(b.lastName, "es"),
    );
}

// ───────────────────────────── aviso por ausencias seguidas ─────────────────────────────

/**
 * Revisa las ausencias seguidas de un arquero (RF-24 y RF-25). Con 3 o más se genera un aviso para
 * el admin, una sola vez por racha: no se repite mientras sea la misma racha, ni aunque el admin
 * lo haya descartado. El aviso se cierra solo cuando la racha se corta (el arquero vuelve a
 * asistir o se corrige una ausencia). No manda mails.
 */
export async function refreshAbsenceAlert(
  db: Db,
  schoolId: string,
  goalkeeperId: string,
): Promise<void> {
  const rows = await getGoalkeeperAttendance(db, schoolId, goalkeeperId);
  const { length, startedOn } = absenceStreakInfo(toRecords(rows));

  const { data: open } = await db
    .from("admin_alert")
    .select("id, streak_started_on")
    .eq("school_id", schoolId)
    .eq("goalkeeper_id", goalkeeperId)
    .eq("type", "absence_streak")
    .is("resolved_at", null)
    .maybeSingle();

  if (length < STREAK_ALERT_LENGTH) {
    if (open) {
      await db
        .from("admin_alert")
        .update({ resolved_at: new Date().toISOString(), resolution: "attended" })
        .eq("id", open.id);
    }
    return;
  }

  if (open) {
    await db.from("admin_alert").update({ streak_length: length }).eq("id", open.id);
    return;
  }
  // ¿Ya se avisó (y se resolvió o descartó) esta misma racha?
  const { data: same } = await db
    .from("admin_alert")
    .select("id")
    .eq("school_id", schoolId)
    .eq("goalkeeper_id", goalkeeperId)
    .eq("type", "absence_streak")
    .eq("streak_started_on", startedOn)
    .limit(1);
  if (same?.length) return;

  await db.from("admin_alert").insert({
    school_id: schoolId,
    type: "absence_streak",
    goalkeeper_id: goalkeeperId,
    streak_length: length,
    streak_started_on: startedOn,
  });
}

export type AbsenceAlertView = {
  id: string;
  goalkeeperId: string;
  firstName: string;
  lastName: string;
  streakLength: number;
  createdAt: string;
};

/** Avisos abiertos para el admin. */
export async function listAbsenceAlerts(db: Db, schoolId: string): Promise<AbsenceAlertView[]> {
  const { data } = await db
    .from("admin_alert")
    .select("id, goalkeeper_id, streak_length, created_at, goalkeeper(first_name, last_name)")
    .eq("school_id", schoolId)
    .eq("type", "absence_streak")
    .is("resolved_at", null)
    .order("created_at", { ascending: false });
  return (data ?? []).map((row) => {
    const g = row.goalkeeper as unknown as { first_name: string; last_name: string } | null;
    return {
      id: row.id as string,
      goalkeeperId: row.goalkeeper_id as string,
      firstName: g?.first_name ?? "",
      lastName: g?.last_name ?? "",
      streakLength: (row.streak_length as number | null) ?? STREAK_ALERT_LENGTH,
      createdAt: row.created_at as string,
    };
  });
}

/** El admin descarta un aviso (RF-25). */
export async function dismissAbsenceAlert(
  db: Db,
  input: Actor & { alertId: string },
): Promise<SessionChangeResult> {
  if (input.role !== "school_admin") return { ok: false, error: "forbidden" };
  const { data, error } = await db
    .from("admin_alert")
    .update({
      resolved_at: new Date().toISOString(),
      resolved_by: input.actorId,
      resolution: "dismissed",
    })
    .eq("id", input.alertId)
    .eq("school_id", input.schoolId)
    .is("resolved_at", null)
    .select("id");
  if (error) return { ok: false, error: "failed" };
  if (!data?.length) return { ok: false, error: "not_found" };
  await audit(db, input, "attendance.alert_dismissed", "admin_alert", input.alertId);
  return { ok: true };
}
