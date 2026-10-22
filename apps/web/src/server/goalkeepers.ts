import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { argentinaDate } from "@/lib/dates";
import { generateAccessCode } from "./guardian/access-code";
import {
  ADULT_AGE,
  ageOn,
  type GoalkeeperInput,
  type GoalkeeperStatus,
  type GroupInput,
  type GuardianInput,
  type Level,
  type MeasurementInput,
  type Relationship,
} from "@/lib/goalkeeper-schemas";
import { applyStatusChangeToFees, startFeeCycle } from "./fees";
import { issueInitialPin, revokeGuardianAccess, unlockGuardian } from "./guardian/access";
import { deleteGoalkeeperVideos } from "./videos";
import type { VideoProvider } from "./video/provider";

/**
 * Arqueros, tutores, grupos y medidas (spec 01). Toda función recibe la escuela y filtra por ella:
 * el cliente con clave secreta se saltea RLS, así que el aislamiento depende de este código.
 */

type Db = SupabaseClient;
type Actor = { schoolId: string; actorId: string };

const PG_UNIQUE = "23505";

async function audit(
  db: Db,
  actor: Actor,
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

/** Quita los caracteres que tienen significado en los filtros de PostgREST. */
function safeTerm(term: string): string {
  return term.replace(/[%_,()*\\"']/g, " ").trim();
}

// ───────────────────────────── consentimiento ─────────────────────────────

export type ConsentStatus = "pending" | "valid" | "revoked";

/** Vigente = otorgado y no retirado; "retirado" si hubo alguno y ninguno sigue vigente. */
export function consentStatusOf(rows: { revoked_at: string | null }[]): ConsentStatus {
  if (rows.some((r) => r.revoked_at === null)) return "valid";
  return rows.length > 0 ? "revoked" : "pending";
}

// ───────────────────────────── listado ─────────────────────────────

export type GoalkeeperFilters = {
  q?: string;
  groupId?: string;
  /** Por defecto solo los activos (RF-32). `all` muestra todos. */
  status?: GoalkeeperStatus | "all";
  level?: Level;
};

export type GoalkeeperListItem = {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  status: GoalkeeperStatus;
  level: Level | null;
  category: string | null;
  consent: ConsentStatus;
  groups: { id: string; name: string }[];
};

export async function listGoalkeepers(
  db: Db,
  schoolId: string,
  filters: GoalkeeperFilters = {},
): Promise<GoalkeeperListItem[]> {
  let query = db
    .from("goalkeeper")
    .select("id, first_name, last_name, birth_date, status, level, category")
    .eq("school_id", schoolId)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  const status = filters.status ?? "active";
  if (status !== "all") query = query.eq("status", status);
  if (filters.level) query = query.eq("level", filters.level);
  for (const term of (filters.q ?? "").split(/\s+/).map(safeTerm).filter(Boolean)) {
    query = query.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%`);
  }

  const [{ data: rows }, { data: consents }, { data: memberships }, { data: groups }] =
    await Promise.all([
      query,
      db
        .from("consent")
        .select("goalkeeper_id, revoked_at")
        .eq("school_id", schoolId)
        .eq("type", "media"),
      db.from("goalkeeper_group").select("goalkeeper_id, group_id").eq("school_id", schoolId),
      db.from("groups").select("id, name").eq("school_id", schoolId),
    ]);

  const groupName = new Map((groups ?? []).map((g) => [g.id as string, g.name as string]));
  const groupsByGoalkeeper = new Map<string, { id: string; name: string }[]>();
  for (const m of memberships ?? []) {
    const list = groupsByGoalkeeper.get(m.goalkeeper_id) ?? [];
    list.push({ id: m.group_id, name: groupName.get(m.group_id) ?? "" });
    groupsByGoalkeeper.set(m.goalkeeper_id, list);
  }
  const consentsByGoalkeeper = new Map<string, { revoked_at: string | null }[]>();
  for (const c of consents ?? []) {
    const list = consentsByGoalkeeper.get(c.goalkeeper_id) ?? [];
    list.push(c);
    consentsByGoalkeeper.set(c.goalkeeper_id, list);
  }

  return (rows ?? [])
    .filter(
      (r) =>
        !filters.groupId || groupsByGoalkeeper.get(r.id)?.some((g) => g.id === filters.groupId),
    )
    .map((r) => ({
      id: r.id,
      firstName: r.first_name,
      lastName: r.last_name,
      birthDate: r.birth_date,
      status: r.status,
      level: r.level,
      category: r.category,
      consent: consentStatusOf(consentsByGoalkeeper.get(r.id) ?? []),
      groups: groupsByGoalkeeper.get(r.id) ?? [],
    }));
}

// ───────────────────────────── duplicados ─────────────────────────────

export type DuplicateCandidate = {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string;
};

/** Arqueros con el mismo nombre, apellido y fecha de nacimiento (RF-34). */
export async function findDuplicates(
  db: Db,
  schoolId: string,
  person: { firstName: string; lastName: string; birthDate: string },
  excludeId?: string,
): Promise<DuplicateCandidate[]> {
  const { data } = await db
    .from("goalkeeper")
    .select("id, first_name, last_name, birth_date")
    .eq("school_id", schoolId)
    .eq("birth_date", person.birthDate);
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  return (data ?? [])
    .filter(
      (r) =>
        r.id !== excludeId &&
        same(r.first_name, person.firstName) &&
        same(r.last_name, person.lastName),
    )
    .map((r) => ({
      id: r.id,
      firstName: r.first_name,
      lastName: r.last_name,
      birthDate: r.birth_date,
    }));
}

// ───────────────────────────── tutores ─────────────────────────────

export type NewCredentials = {
  guardianId: string;
  name: string;
  phone: string;
  accessCode: string;
  /** PIN inicial en claro. Se muestra una sola vez y no se guarda. */
  pin: string;
};

/** Crea un tutor con código único (reintenta si choca) y su PIN inicial. */
export async function createGuardianRecord(
  db: Db,
  schoolId: string,
  data: GuardianInput,
): Promise<NewCredentials> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const accessCode = generateAccessCode();
    const { data: row, error } = await db
      .from("guardian")
      .insert({
        school_id: schoolId,
        first_name: data.firstName,
        last_name: data.lastName,
        phone: data.phone,
        email: data.email,
        access_code: accessCode,
      })
      .select("id")
      .single();
    if (error?.code === PG_UNIQUE) continue;
    if (error || !row) throw new Error(`No se pudo crear el tutor: ${error?.message}`);

    const { pin } = await issueInitialPin(db, row.id);
    return {
      guardianId: row.id,
      name: `${data.firstName} ${data.lastName}`,
      phone: data.phone,
      accessCode,
      pin,
    };
  }
  throw new Error("No se pudo generar un código de acceso libre.");
}

export type GuardianSpec = {
  relationship: Relationship;
} & ({ existingGuardianId: string } | { data: GuardianInput });

// ───────────────────────────── alta de arquero ─────────────────────────────

export type CreateGoalkeeperResult =
  | { ok: true; goalkeeperId: string; credentials: NewCredentials[] }
  | { ok: false; error: "duplicate"; duplicates: DuplicateCandidate[] }
  | {
      ok: false;
      error:
        | "no_guardian"
        | "future_date"
        | "self_requires_adult"
        | "invalid_group"
        | "invalid_guardian"
        | "failed";
    };

/**
 * Alta de un arquero con sus tutores y grupos (spec 01, F1). Un arquero sin tutor no se puede
 * crear (RF-16); si hay un homónimo con la misma fecha de nacimiento se avisa y, solo con
 * confirmación expresa, se continúa (RF-34). Un arquero puede ser su propio tutor solo desde los
 * 18 años (RF-15).
 */
export async function createGoalkeeper(
  db: Db,
  input: Actor & {
    goalkeeper: GoalkeeperInput;
    guardians: GuardianSpec[];
    groupIds: string[];
    today: string;
    confirmDuplicate?: boolean;
  },
): Promise<CreateGoalkeeperResult> {
  const { schoolId, goalkeeper: g } = input;

  if (input.guardians.length === 0) return { ok: false, error: "no_guardian" };
  if (g.birthDate > input.today || g.joinedOn > input.today) {
    return { ok: false, error: "future_date" };
  }
  if (
    input.guardians.some((s) => s.relationship === "self") &&
    ageOn(g.birthDate, input.today) < ADULT_AGE
  ) {
    return { ok: false, error: "self_requires_adult" };
  }

  if (!input.confirmDuplicate) {
    const duplicates = await findDuplicates(db, schoolId, g);
    if (duplicates.length > 0) return { ok: false, error: "duplicate", duplicates };
  }

  // Los grupos y tutores existentes tienen que ser de esta escuela; los grupos, vigentes.
  const groupIds = [...new Set(input.groupIds)];
  if (groupIds.length > 0) {
    const { data } = await db
      .from("groups")
      .select("id")
      .eq("school_id", schoolId)
      .eq("archived", false)
      .in("id", groupIds);
    if ((data ?? []).length !== groupIds.length) return { ok: false, error: "invalid_group" };
  }
  const existingIds = input.guardians.flatMap((s) =>
    "existingGuardianId" in s ? [s.existingGuardianId] : [],
  );
  if (existingIds.length > 0) {
    const { data } = await db
      .from("guardian")
      .select("id")
      .eq("school_id", schoolId)
      .in("id", existingIds);
    if ((data ?? []).length !== new Set(existingIds).size) {
      return { ok: false, error: "invalid_guardian" };
    }
  }

  const { data: created, error } = await db
    .from("goalkeeper")
    .insert({
      school_id: schoolId,
      first_name: g.firstName,
      last_name: g.lastName,
      birth_date: g.birthDate,
      joined_on: g.joinedOn,
      preferred_foot: g.preferredFoot,
      level: g.level,
      current_club: g.currentClub,
      category: g.category,
      goal: g.goal,
      emergency_name: g.emergencyName,
      emergency_phone: g.emergencyPhone,
      emergency_relationship: g.emergencyRelationship,
    })
    .select("id")
    .single();
  if (error || !created) return { ok: false, error: "failed" };

  const credentials: NewCredentials[] = [];
  const createdGuardianIds: string[] = [];
  try {
    for (const spec of input.guardians) {
      let guardianId: string;
      if ("existingGuardianId" in spec) {
        guardianId = spec.existingGuardianId;
      } else {
        const credential = await createGuardianRecord(db, schoolId, spec.data);
        credentials.push(credential);
        createdGuardianIds.push(credential.guardianId);
        guardianId = credential.guardianId;
      }
      const link = await db.from("goalkeeper_guardian").insert({
        school_id: schoolId,
        goalkeeper_id: created.id,
        guardian_id: guardianId,
        relationship: spec.relationship,
      });
      if (link.error) throw new Error(link.error.message);
    }
    if (groupIds.length > 0) {
      const memberships = await db.from("goalkeeper_group").insert(
        groupIds.map((groupId) => ({
          school_id: schoolId,
          goalkeeper_id: created.id,
          group_id: groupId,
        })),
      );
      if (memberships.error) throw new Error(memberships.error.message);
    }
  } catch {
    // Sin transacción entre varias tablas: se deshace lo creado para no dejar un arquero a medias.
    await db.from("goalkeeper").delete().eq("id", created.id).eq("school_id", schoolId);
    if (createdGuardianIds.length > 0) {
      await db.from("guardian").delete().eq("school_id", schoolId).in("id", createdGuardianIds);
    }
    return { ok: false, error: "failed" };
  }

  // Spec 06, RF-01 y RF-06: el inicio de cuotas es la fecha de ingreso y se asume pagada la primera.
  await startFeeCycle(db, {
    schoolId,
    goalkeeperId: created.id,
    start: g.joinedOn,
    today: input.today,
    actorId: input.actorId,
  }).catch(() => undefined);

  await audit(db, input, "goalkeeper.created", "goalkeeper", created.id);
  return { ok: true, goalkeeperId: created.id, credentials };
}

// ───────────────────────────── ficha ─────────────────────────────

export type UpdateResult =
  { ok: true } | { ok: false; error: "not_found" | "future_date" | "failed" };

export async function updateGoalkeeper(
  db: Db,
  input: Actor & { goalkeeperId: string; data: GoalkeeperInput; today: string },
): Promise<UpdateResult> {
  const g = input.data;
  if (g.birthDate > input.today || g.joinedOn > input.today) {
    return { ok: false, error: "future_date" };
  }
  const { data, error } = await db
    .from("goalkeeper")
    .update({
      first_name: g.firstName,
      last_name: g.lastName,
      birth_date: g.birthDate,
      joined_on: g.joinedOn,
      preferred_foot: g.preferredFoot,
      level: g.level,
      current_club: g.currentClub,
      category: g.category,
      goal: g.goal,
      emergency_name: g.emergencyName,
      emergency_phone: g.emergencyPhone,
      emergency_relationship: g.emergencyRelationship,
    })
    .eq("id", input.goalkeeperId)
    .eq("school_id", input.schoolId)
    .select("id");
  if (error) return { ok: false, error: "failed" };
  if (!data?.length) return { ok: false, error: "not_found" };
  await audit(db, input, "goalkeeper.updated", "goalkeeper", input.goalkeeperId);
  return { ok: true };
}

/** Cambia el estado (RF-22 y RF-23). El historial se conserva en todos los estados. */
export async function setGoalkeeperStatus(
  db: Db,
  input: Actor & { goalkeeperId: string; status: GoalkeeperStatus; today?: string },
): Promise<UpdateResult> {
  const { data: before } = await db
    .from("goalkeeper")
    .select("status")
    .eq("id", input.goalkeeperId)
    .eq("school_id", input.schoolId)
    .maybeSingle();
  const { data, error } = await db
    .from("goalkeeper")
    .update({ status: input.status })
    .eq("id", input.goalkeeperId)
    .eq("school_id", input.schoolId)
    .select("id");
  if (error) return { ok: false, error: "failed" };
  if (!data?.length) return { ok: false, error: "not_found" };
  // Spec 06, RF-21 y RF-22: la baja anula las cuotas futuras; la reactivación reinicia el ciclo.
  if (before) {
    await applyStatusChangeToFees(db, {
      ...input,
      today: input.today ?? argentinaDate(new Date()),
      previousStatus: before.status as GoalkeeperStatus,
    }).catch(() => undefined);
  }
  await audit(db, input, "goalkeeper.status_changed", "goalkeeper", input.goalkeeperId, {
    status: input.status,
  });
  return { ok: true };
}

/**
 * Eliminación definitiva (RF-40 a RF-42): borra la ficha y todo lo que cuelga de ella. Los
 * tutores que quedan sin ningún arquero se borran con ella; los que tienen otros hijos no se
 * tocan (RN-06). La auditoría no conserva datos personales.
 *
 * También se borran los videos del proveedor externo (RN-07), con reintentos si el proveedor
 * falla: por eso se necesita el proveedor y los videos se borran antes que la ficha.
 */
export async function deleteGoalkeeper(
  db: Db,
  input: Actor & { goalkeeperId: string; videoProvider: VideoProvider },
): Promise<UpdateResult> {
  const { data: links } = await db
    .from("goalkeeper_guardian")
    .select("guardian_id")
    .eq("school_id", input.schoolId)
    .eq("goalkeeper_id", input.goalkeeperId);
  const guardianIds = (links ?? []).map((l) => l.guardian_id as string);

  // Primero los videos: al borrar la ficha se van en cascada y se perdería el rastro de los archivos.
  const { data: owned } = await db
    .from("goalkeeper")
    .select("id")
    .eq("id", input.goalkeeperId)
    .eq("school_id", input.schoolId)
    .maybeSingle();
  if (!owned) return { ok: false, error: "not_found" };
  await deleteGoalkeeperVideos(db, input.videoProvider, input);

  const { data, error } = await db
    .from("goalkeeper")
    .delete()
    .eq("id", input.goalkeeperId)
    .eq("school_id", input.schoolId)
    .select("id");
  if (error) return { ok: false, error: "failed" };
  if (!data?.length) return { ok: false, error: "not_found" };

  await deleteOrphanGuardians(db, input.schoolId, guardianIds);
  await audit(db, input, "goalkeeper.deleted", "goalkeeper", input.goalkeeperId);
  return { ok: true };
}

async function deleteOrphanGuardians(db: Db, schoolId: string, guardianIds: string[]) {
  if (guardianIds.length === 0) return;
  const { data: stillLinked } = await db
    .from("goalkeeper_guardian")
    .select("guardian_id")
    .eq("school_id", schoolId)
    .in("guardian_id", guardianIds);
  const keep = new Set((stillLinked ?? []).map((l) => l.guardian_id as string));
  const orphans = guardianIds.filter((id) => !keep.has(id));
  if (orphans.length > 0) {
    await db.from("guardian").delete().eq("school_id", schoolId).in("id", orphans);
  }
}

// ───────────────────────────── medidas ─────────────────────────────

/** Admin y profesores registran altura y peso (RF-10). */
export async function addMeasurement(
  db: Db,
  input: Actor & { goalkeeperId: string; data: MeasurementInput; today: string },
): Promise<UpdateResult> {
  if (input.data.date > input.today) return { ok: false, error: "future_date" };

  const { data: goalkeeper } = await db
    .from("goalkeeper")
    .select("id")
    .eq("id", input.goalkeeperId)
    .eq("school_id", input.schoolId)
    .maybeSingle();
  if (!goalkeeper) return { ok: false, error: "not_found" };

  const { error } = await db.from("goalkeeper_measurement").insert({
    school_id: input.schoolId,
    goalkeeper_id: input.goalkeeperId,
    date: input.data.date,
    height_cm: input.data.heightCm,
    weight_kg: input.data.weightKg,
    recorded_by: input.actorId,
  });
  if (error) return { ok: false, error: "failed" };
  return { ok: true };
}

// ───────────────────────────── grupos ─────────────────────────────

export type GroupItem = {
  id: string;
  name: string;
  schedule: string | null;
  archived: boolean;
  memberCount: number;
};

export async function listGroups(
  db: Db,
  schoolId: string,
  options: { includeArchived?: boolean } = {},
): Promise<GroupItem[]> {
  let query = db
    .from("groups")
    .select("id, name, schedule, archived")
    .eq("school_id", schoolId)
    .order("archived", { ascending: true })
    .order("name", { ascending: true });
  if (!options.includeArchived) query = query.eq("archived", false);

  const [{ data: groups }, { data: memberships }] = await Promise.all([
    query,
    db.from("goalkeeper_group").select("group_id").eq("school_id", schoolId),
  ]);
  const counts = new Map<string, number>();
  for (const m of memberships ?? []) counts.set(m.group_id, (counts.get(m.group_id) ?? 0) + 1);

  return (groups ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    schedule: g.schedule,
    archived: g.archived,
    memberCount: counts.get(g.id) ?? 0,
  }));
}

export type GroupResult =
  { ok: true; groupId: string } | { ok: false; error: "name_taken" | "not_found" | "failed" };

export async function createGroup(
  db: Db,
  input: Actor & { data: GroupInput },
): Promise<GroupResult> {
  const { data, error } = await db
    .from("groups")
    .insert({ school_id: input.schoolId, name: input.data.name, schedule: input.data.schedule })
    .select("id")
    .single();
  if (error?.code === PG_UNIQUE) return { ok: false, error: "name_taken" };
  if (error || !data) return { ok: false, error: "failed" };
  await audit(db, input, "group.created", "groups", data.id);
  return { ok: true, groupId: data.id };
}

export async function updateGroup(
  db: Db,
  input: Actor & { groupId: string; data: GroupInput },
): Promise<GroupResult> {
  const { data, error } = await db
    .from("groups")
    .update({ name: input.data.name, schedule: input.data.schedule })
    .eq("id", input.groupId)
    .eq("school_id", input.schoolId)
    .select("id");
  if (error?.code === PG_UNIQUE) return { ok: false, error: "name_taken" };
  if (error) return { ok: false, error: "failed" };
  if (!data?.length) return { ok: false, error: "not_found" };
  return { ok: true, groupId: input.groupId };
}

/**
 * Un grupo con arqueros no se borra: se archiva (RF-21). Deja de ofrecerse para nuevas
 * asignaciones y conserva sus integrantes y su historial. Al desarchivar, su nombre tiene que
 * seguir libre entre los grupos vigentes.
 */
export async function setGroupArchived(
  db: Db,
  input: Actor & { groupId: string; archived: boolean },
): Promise<GroupResult> {
  const { data, error } = await db
    .from("groups")
    .update({ archived: input.archived })
    .eq("id", input.groupId)
    .eq("school_id", input.schoolId)
    .select("id");
  if (error?.code === PG_UNIQUE) return { ok: false, error: "name_taken" };
  if (error) return { ok: false, error: "failed" };
  if (!data?.length) return { ok: false, error: "not_found" };
  await audit(
    db,
    input,
    input.archived ? "group.archived" : "group.unarchived",
    "groups",
    input.groupId,
  );
  return { ok: true, groupId: input.groupId };
}

/**
 * Reemplaza los grupos de un arquero. Solo se pueden sumar grupos vigentes; la pertenencia a un
 * grupo archivado se conserva a menos que se la quite expresamente.
 */
export async function setGoalkeeperGroups(
  db: Db,
  input: Actor & { goalkeeperId: string; groupIds: string[] },
): Promise<UpdateResult | { ok: false; error: "invalid_group" }> {
  const { data: goalkeeper } = await db
    .from("goalkeeper")
    .select("id")
    .eq("id", input.goalkeeperId)
    .eq("school_id", input.schoolId)
    .maybeSingle();
  if (!goalkeeper) return { ok: false, error: "not_found" };

  const wanted = [...new Set(input.groupIds)];
  const { data: current } = await db
    .from("goalkeeper_group")
    .select("group_id")
    .eq("school_id", input.schoolId)
    .eq("goalkeeper_id", input.goalkeeperId);
  const currentIds = new Set((current ?? []).map((m) => m.group_id as string));

  const toAdd = wanted.filter((id) => !currentIds.has(id));
  const toRemove = [...currentIds].filter((id) => !wanted.includes(id));

  if (toAdd.length > 0) {
    const { data } = await db
      .from("groups")
      .select("id")
      .eq("school_id", input.schoolId)
      .eq("archived", false)
      .in("id", toAdd);
    if ((data ?? []).length !== toAdd.length) return { ok: false, error: "invalid_group" };
  }
  if (toRemove.length > 0) {
    await db
      .from("goalkeeper_group")
      .delete()
      .eq("school_id", input.schoolId)
      .eq("goalkeeper_id", input.goalkeeperId)
      .in("group_id", toRemove);
  }
  if (toAdd.length > 0) {
    const { error } = await db.from("goalkeeper_group").insert(
      toAdd.map((groupId) => ({
        school_id: input.schoolId,
        goalkeeper_id: input.goalkeeperId,
        group_id: groupId,
      })),
    );
    if (error) return { ok: false, error: "failed" };
  }
  return { ok: true };
}

// ───────────────────────────── tutores de un arquero ─────────────────────────────

export type GuardianResult =
  | { ok: true; credentials?: NewCredentials }
  | {
      ok: false;
      error: "not_found" | "self_requires_adult" | "already_linked" | "last_guardian" | "failed";
    };

/** Suma un tutor (nuevo o existente) a un arquero. */
export async function addGuardianToGoalkeeper(
  db: Db,
  input: Actor & { goalkeeperId: string; spec: GuardianSpec; today: string },
): Promise<GuardianResult> {
  const { data: goalkeeper } = await db
    .from("goalkeeper")
    .select("id, birth_date")
    .eq("id", input.goalkeeperId)
    .eq("school_id", input.schoolId)
    .maybeSingle();
  if (!goalkeeper) return { ok: false, error: "not_found" };
  if (input.spec.relationship === "self" && ageOn(goalkeeper.birth_date, input.today) < ADULT_AGE) {
    return { ok: false, error: "self_requires_adult" };
  }

  let guardianId: string;
  let credentials: NewCredentials | undefined;
  if ("existingGuardianId" in input.spec) {
    const { data: guardian } = await db
      .from("guardian")
      .select("id")
      .eq("id", input.spec.existingGuardianId)
      .eq("school_id", input.schoolId)
      .maybeSingle();
    if (!guardian) return { ok: false, error: "not_found" };
    guardianId = guardian.id;
  } else {
    credentials = await createGuardianRecord(db, input.schoolId, input.spec.data);
    guardianId = credentials.guardianId;
  }

  const { error } = await db.from("goalkeeper_guardian").insert({
    school_id: input.schoolId,
    goalkeeper_id: input.goalkeeperId,
    guardian_id: guardianId,
    relationship: input.spec.relationship,
  });
  if (error) {
    if (credentials) await db.from("guardian").delete().eq("id", guardianId);
    return { ok: false, error: error.code === PG_UNIQUE ? "already_linked" : "failed" };
  }
  await audit(db, input, "guardian.linked", "goalkeeper", input.goalkeeperId, { guardianId });
  return { ok: true, credentials };
}

/**
 * Desvincula un tutor de un arquero. Todo arquero conserva al menos un tutor (RF-16). Si el
 * tutor se queda sin ningún arquero, se borra con su acceso.
 */
export async function removeGuardianFromGoalkeeper(
  db: Db,
  input: Actor & { goalkeeperId: string; guardianId: string },
): Promise<GuardianResult> {
  const { data: links } = await db
    .from("goalkeeper_guardian")
    .select("guardian_id")
    .eq("school_id", input.schoolId)
    .eq("goalkeeper_id", input.goalkeeperId);
  if (!links?.some((l) => l.guardian_id === input.guardianId)) {
    return { ok: false, error: "not_found" };
  }
  if (links.length <= 1) return { ok: false, error: "last_guardian" };

  const { error } = await db
    .from("goalkeeper_guardian")
    .delete()
    .eq("school_id", input.schoolId)
    .eq("goalkeeper_id", input.goalkeeperId)
    .eq("guardian_id", input.guardianId);
  if (error) return { ok: false, error: "failed" };

  await deleteOrphanGuardians(db, input.schoolId, [input.guardianId]);
  await audit(db, input, "guardian.unlinked", "goalkeeper", input.goalkeeperId, {
    guardianId: input.guardianId,
  });
  return { ok: true };
}

export async function updateGuardian(
  db: Db,
  input: Actor & { guardianId: string; data: GuardianInput },
): Promise<UpdateResult> {
  const { data, error } = await db
    .from("guardian")
    .update({
      first_name: input.data.firstName,
      last_name: input.data.lastName,
      phone: input.data.phone,
      email: input.data.email,
    })
    .eq("id", input.guardianId)
    .eq("school_id", input.schoolId)
    .select("id");
  if (error) return { ok: false, error: "failed" };
  if (!data?.length) return { ok: false, error: "not_found" };
  await audit(db, input, "guardian.updated", "guardian", input.guardianId);
  return { ok: true };
}

export type AccessAction = "reset_pin" | "unlock" | "revoke";

/** Acciones del admin sobre el acceso de un tutor (spec 00, RF-15 y RF-18 a RF-20). */
export async function manageGuardianAccess(
  db: Db,
  input: Actor & { guardianId: string; action: AccessAction },
): Promise<{ ok: true; pin?: string } | { ok: false; error: "not_found" | "failed" }> {
  const { data: guardian } = await db
    .from("guardian")
    .select("id")
    .eq("id", input.guardianId)
    .eq("school_id", input.schoolId)
    .maybeSingle();
  if (!guardian) return { ok: false, error: "not_found" };

  try {
    if (input.action === "reset_pin") {
      const { pin } = await issueInitialPin(db, input.guardianId);
      await audit(db, input, "guardian.pin_reset", "guardian", input.guardianId);
      return { ok: true, pin };
    }
    if (input.action === "unlock") await unlockGuardian(db, input.guardianId);
    else await revokeGuardianAccess(db, input.guardianId);
    await audit(db, input, `guardian.${input.action}`, "guardian", input.guardianId);
    return { ok: true };
  } catch {
    return { ok: false, error: "failed" };
  }
}

/** Tutores de la escuela que coinciden con un nombre o teléfono, para vincular a hermanos. */
export async function searchGuardians(
  db: Db,
  schoolId: string,
  term: string,
): Promise<{ id: string; firstName: string; lastName: string; phone: string }[]> {
  const t = safeTerm(term);
  if (t.length < 2) return [];
  const { data } = await db
    .from("guardian")
    .select("id, first_name, last_name, phone")
    .eq("school_id", schoolId)
    .or(`first_name.ilike.%${t}%,last_name.ilike.%${t}%,phone.ilike.%${t}%`)
    .order("last_name")
    .limit(10);
  return (data ?? []).map((g) => ({
    id: g.id,
    firstName: g.first_name,
    lastName: g.last_name,
    phone: g.phone,
  }));
}

// ───────────────────────────── detalle ─────────────────────────────

export type GoalkeeperDetail = {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  joinedOn: string;
  preferredFoot: string | null;
  level: Level | null;
  currentClub: string | null;
  category: string | null;
  goal: string | null;
  status: GoalkeeperStatus;
  /** Marca de cuotas: solo se muestra a la administración (spec 06, RF-36). */
  feeExempt: boolean;
  emergency: { name: string | null; phone: string | null; relationship: string | null };
  consent: ConsentStatus;
  consentHistory: { grantedAt: string; revokedAt: string | null; guardianId: string }[];
  groups: { id: string; name: string; archived: boolean }[];
  guardians: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    email: string | null;
    relationship: Relationship;
    accessCode: string;
    pinChanged: boolean;
    firstLoginCompleted: boolean;
    accessRevoked: boolean;
    lockedUntil: string | null;
    /** Bloqueado por intentos fallidos en este momento. */
    locked: boolean;
  }[];
  measurements: { id: string; date: string; heightCm: number | null; weightKg: number | null }[];
};

export async function getGoalkeeperDetail(
  db: Db,
  schoolId: string,
  goalkeeperId: string,
): Promise<GoalkeeperDetail | null> {
  const { data: g } = await db
    .from("goalkeeper")
    .select("*")
    .eq("id", goalkeeperId)
    .eq("school_id", schoolId)
    .maybeSingle();
  if (!g) return null;

  const [links, memberships, consents, measurements] = await Promise.all([
    db
      .from("goalkeeper_guardian")
      .select(
        "relationship, guardian(id, first_name, last_name, phone, email, access_code, pin_changed, first_login_completed, access_revoked, locked_until)",
      )
      .eq("school_id", schoolId)
      .eq("goalkeeper_id", goalkeeperId),
    db
      .from("goalkeeper_group")
      .select("groups(id, name, archived)")
      .eq("school_id", schoolId)
      .eq("goalkeeper_id", goalkeeperId),
    db
      .from("consent")
      .select("guardian_id, granted_at, revoked_at")
      .eq("school_id", schoolId)
      .eq("goalkeeper_id", goalkeeperId)
      .eq("type", "media")
      .order("granted_at", { ascending: false }),
    db
      .from("goalkeeper_measurement")
      .select("id, date, height_cm, weight_kg")
      .eq("school_id", schoolId)
      .eq("goalkeeper_id", goalkeeperId)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  return {
    id: g.id,
    firstName: g.first_name,
    lastName: g.last_name,
    birthDate: g.birth_date,
    joinedOn: g.joined_on,
    preferredFoot: g.preferred_foot,
    level: g.level,
    currentClub: g.current_club,
    category: g.category,
    goal: g.goal,
    status: g.status,
    feeExempt: g.fee_exempt === true,
    emergency: {
      name: g.emergency_name,
      phone: g.emergency_phone,
      relationship: g.emergency_relationship,
    },
    consent: consentStatusOf(consents.data ?? []),
    consentHistory: (consents.data ?? []).map((c) => ({
      grantedAt: c.granted_at,
      revokedAt: c.revoked_at,
      guardianId: c.guardian_id,
    })),
    groups: (memberships.data ?? [])
      .map((m) => m.groups as unknown as { id: string; name: string; archived: boolean })
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name, "es")),
    guardians: (links.data ?? []).flatMap((l) => {
      const gd = l.guardian as unknown as Record<string, unknown> | null;
      if (!gd) return [];
      return [
        {
          id: gd.id as string,
          firstName: gd.first_name as string,
          lastName: gd.last_name as string,
          phone: gd.phone as string,
          email: gd.email as string | null,
          relationship: l.relationship as Relationship,
          accessCode: gd.access_code as string,
          pinChanged: gd.pin_changed as boolean,
          firstLoginCompleted: gd.first_login_completed as boolean,
          accessRevoked: gd.access_revoked as boolean,
          lockedUntil: gd.locked_until as string | null,
          locked: gd.locked_until !== null && new Date(gd.locked_until as string) > new Date(),
        },
      ];
    }),
    measurements: (measurements.data ?? []).map((m) => ({
      id: m.id,
      date: m.date,
      heightCm: m.height_cm === null ? null : Number(m.height_cm),
      weightKg: m.weight_kg === null ? null : Number(m.weight_kg),
    })),
  };
}
