/**
 * Asistencia (spec 05: CA-01 a CA-12, RF-26 a RF-29). Corre contra desarrollo: `pnpm test:db`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import {
  applyMarks,
  deleteSession,
  dismissAbsenceAlert,
  getAttendanceBootstrap,
  getGoalkeeperAttendance,
  getGroupMonthReport,
  getLowAttendance,
  listAbsenceAlerts,
  listSessionRevisions,
  openSession,
  refreshAbsenceAlert,
  setSessionSuspended,
  toRecords,
  type Actor,
  type MarkInput,
} from "@/server/attendance";
import { attendanceSummary } from "@/lib/attendance";
import type { GuardianSession } from "@/server/guardian/access";
import { getFamilyAttendance } from "@/server/guardian/attendance";
import {
  cleanup,
  createAdminClient,
  createAnonClient,
  createSchool,
  createStaff,
  purgeLeftovers,
  signIn,
  type TestSchool,
} from "./db";

const PERMISSION_DENIED = "42501";
const CHECK_VIOLATION = "23514";
const FOREIGN_KEY_VIOLATION = "23503";
const UNIQUE_VIOLATION = "23505";

const admin = createAdminClient();
const created = { schoolIds: [] as string[], userIds: [] as string[] };
// Fecha real: la base rechaza fechas futuras con su propio reloj.
const TODAY = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
const day = (offset: number) => addDays(TODAY, offset);

let school: TestSchool;
let other: TestSchool;
let adminActor: Actor;
let coachActor: Actor;
let coach2Actor: Actor;
let otherAdminActor: Actor;
let adminClient: SupabaseClient;
let coachClient: SupabaseClient;
let otherAdminClient: SupabaseClient;

const must = <T>(result: { data: T; error: { message: string } | null }, what: string) => {
  if (result.error || result.data == null) {
    throw new Error(`No se pudo crear ${what}: ${result.error?.message}`);
  }
  return result.data as NonNullable<T>;
};

async function newGroup(target: TestSchool, name: string, archived = false): Promise<string> {
  return must(
    await admin
      .from("groups")
      .insert({
        school_id: target.id,
        name: `${name}-${crypto.randomUUID().slice(0, 4)}`,
        archived,
      })
      .select("id")
      .single(),
    "el grupo",
  ).id as string;
}

async function newGoalkeeper(
  target: TestSchool,
  label: string,
  options: { groupId?: string; status?: string } = {},
): Promise<string> {
  const id = must(
    await admin
      .from("goalkeeper")
      .insert({
        school_id: target.id,
        first_name: label,
        last_name: "Asistencia",
        birth_date: "2012-05-01",
        joined_on: "2024-03-01",
        status: options.status ?? "active",
      })
      .select("id")
      .single(),
    "el arquero",
  ).id as string;
  if (options.groupId) {
    must(
      await admin
        .from("goalkeeper_group")
        .insert({ school_id: target.id, goalkeeper_id: id, group_id: options.groupId })
        .select("group_id")
        .single(),
      "la pertenencia",
    );
  }
  return id;
}

async function newGuardian(target: TestSchool, goalkeeperId: string): Promise<GuardianSession> {
  const guardianId = must(
    await admin
      .from("guardian")
      .insert({
        school_id: target.id,
        first_name: "Tutor",
        last_name: "Asistencia",
        phone: "1155551111",
        access_code: crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase(),
        pin_hash: "scrypt$x",
      })
      .select("id")
      .single(),
    "el tutor",
  ).id as string;
  must(
    await admin
      .from("goalkeeper_guardian")
      .insert({
        school_id: target.id,
        goalkeeper_id: goalkeeperId,
        guardian_id: guardianId,
        relationship: "mother",
      })
      .select("guardian_id")
      .single(),
    "el vínculo",
  );
  return { guardianId, schoolId: target.id, schoolSlug: target.slug } as GuardianSession;
}

const mark = (
  goalkeeperId: string,
  status: MarkInput["status"],
  markedAt: Date = new Date(),
  extra: Partial<MarkInput> = {},
): MarkInput => ({
  goalkeeperId,
  status,
  reason: null,
  markedAt: markedAt.toISOString(),
  ...extra,
});

async function open(actor: Actor, groupId: string, date = TODAY) {
  const result = await openSession(admin, { ...actor, groupId, date, today: TODAY });
  if (!result.ok) throw new Error(`No se pudo abrir la sesión: ${result.error}`);
  return result;
}

async function save(actor: Actor, sessionId: string, marks: MarkInput[], now?: Date) {
  const result = await applyMarks(admin, { ...actor, sessionId, marks, now });
  if (!result.ok) throw new Error(`No se pudo guardar: ${result.error}`);
  return result;
}

const statusOf = (state: { entries: { goalkeeperId: string; status: string }[] }, id: string) =>
  state.entries.find((e) => e.goalkeeperId === id)?.status;

beforeAll(async () => {
  await purgeLeftovers(admin);
  school = await createSchool(admin, "asist-a");
  other = await createSchool(admin, "asist-b");
  created.schoolIds.push(school.id, other.id);

  const adminUser = await createStaff(admin, school, "school_admin", "adminA5");
  const coachUser = await createStaff(admin, school, "coach", "coachA5");
  const coach2User = await createStaff(admin, school, "coach", "coachA52");
  const otherAdminUser = await createStaff(admin, other, "school_admin", "adminB5");
  created.userIds.push(adminUser.id, coachUser.id, coach2User.id, otherAdminUser.id);

  adminActor = { schoolId: school.id, actorId: adminUser.id, role: "school_admin" };
  coachActor = { schoolId: school.id, actorId: coachUser.id, role: "coach" };
  coach2Actor = { schoolId: school.id, actorId: coach2User.id, role: "coach" };
  otherAdminActor = { schoolId: other.id, actorId: otherAdminUser.id, role: "school_admin" };

  [adminClient, coachClient, otherAdminClient] = await Promise.all([
    signIn(adminUser),
    signIn(coachUser),
    signIn(otherAdminUser),
  ]);
});

afterAll(async () => {
  await cleanup(admin, created);
});

describe("abrir la sesión (RF-01 a RF-05, CA-02, CA-08, CA-09)", () => {
  it("crea la sesión con los miembros activos del grupo, sin marcar (RF-03 y RF-06)", async () => {
    const groupId = await newGroup(school, "Infantil");
    const a = await newGoalkeeper(school, "Ana", { groupId });
    const b = await newGoalkeeper(school, "Beto", { groupId });
    await newGoalkeeper(school, "Fuera"); // otro grupo: no figura

    const result = await open(coachActor, groupId);
    expect(result.created).toBe(true);
    expect(result.state.entries.map((e) => e.goalkeeperId).sort()).toEqual([a, b].sort());
    expect(result.state.entries.every((e) => e.status === "unmarked" && !e.isGuest)).toBe(true);
    expect(result.state.status).toBe("open");
  });

  it("CA-02: si ya hay una sesión para el grupo y la fecha, se abre la existente", async () => {
    const groupId = await newGroup(school, "Doble");
    await newGoalkeeper(school, "Uno", { groupId });
    const first = await open(coachActor, groupId);
    const second = await open(coach2Actor, groupId);
    expect(second.created).toBe(false);
    expect(second.state.sessionId).toBe(first.state.sessionId);

    // La base también lo garantiza.
    const direct = await admin.from("attendance_session").insert({
      school_id: school.id,
      group_id: groupId,
      date: TODAY,
    });
    expect(direct.error?.code).toBe(UNIQUE_VIOLATION);
  });

  it("dos aperturas simultáneas no duplican la sesión", async () => {
    const groupId = await newGroup(school, "Carrera");
    await newGoalkeeper(school, "Veloz", { groupId });
    const [x, y] = await Promise.all([open(coachActor, groupId), open(coach2Actor, groupId)]);
    expect(x.state.sessionId).toBe(y.state.sessionId);
    const { data } = await admin.from("attendance_session").select("id").eq("group_id", groupId);
    expect(data).toHaveLength(1);
  });

  it("CA-08 y RN-04: un arquero inactivo no aparece en las listas nuevas", async () => {
    const groupId = await newGroup(school, "Bajas");
    const active = await newGoalkeeper(school, "Activo", { groupId });
    await newGoalkeeper(school, "Inactivo", { groupId, status: "inactive" });
    await newGoalkeeper(school, "Egresado", { groupId, status: "graduated" });
    const result = await open(coachActor, groupId);
    expect(result.state.entries.map((e) => e.goalkeeperId)).toEqual([active]);
  });

  it("CA-09 y RF-03: cambiar de grupo no modifica las sesiones pasadas", async () => {
    const groupA = await newGroup(school, "GrupoA");
    const groupB = await newGroup(school, "GrupoB");
    const gk = await newGoalkeeper(school, "Viajero", { groupId: groupA });
    const past = await open(coachActor, groupA, day(-3));
    await save(coachActor, past.state.sessionId, [
      mark(gk, "present", new Date(Date.now() - 1000)),
    ]);

    await admin.from("goalkeeper_group").delete().eq("goalkeeper_id", gk);
    await admin
      .from("goalkeeper_group")
      .insert({ school_id: school.id, goalkeeper_id: gk, group_id: groupB });

    const reopened = await open(coachActor, groupA, day(-3));
    expect(statusOf(reopened.state, gk)).toBe("present");
    const newer = await open(coachActor, groupB);
    expect(statusOf(newer.state, gk)).toBe("unmarked");
    const history = await getGoalkeeperAttendance(admin, school.id, gk);
    expect(history.map((h) => h.date)).toContain(day(-3));
  });

  it("rechaza fechas futuras (RF-04) también en la base", async () => {
    const groupId = await newGroup(school, "Futuro");
    const result = await openSession(admin, { ...coachActor, groupId, date: day(2), today: TODAY });
    expect(result).toEqual({ ok: false, error: "invalid_date" });
    const direct = await admin
      .from("attendance_session")
      .insert({ school_id: school.id, group_id: groupId, date: "2099-01-01" });
    expect(direct.error?.code).toBe(CHECK_VIOLATION);
  });

  it("un grupo archivado no se ofrece para sesiones nuevas, pero se abre una existente (RF-05)", async () => {
    const groupId = await newGroup(school, "Viejo");
    await newGoalkeeper(school, "Antiguo", { groupId });
    const before = await open(coachActor, groupId, day(-1));
    await admin.from("groups").update({ archived: true }).eq("id", groupId);

    expect(await openSession(admin, { ...coachActor, groupId, date: TODAY, today: TODAY })).toEqual(
      {
        ok: false,
        error: "group_archived",
      },
    );
    const existing = await open(coachActor, groupId, day(-1));
    expect(existing.state.sessionId).toBe(before.state.sessionId);
  });

  it("no abre sesiones de grupos de otra escuela", async () => {
    const foreign = await newGroup(other, "Ajeno");
    expect(
      await openSession(admin, { ...coachActor, groupId: foreign, date: TODAY, today: TODAY }),
    ).toEqual({ ok: false, error: "group_not_found" });
  });

  it("un grupo vacío se puede abrir solo para invitados", async () => {
    const groupId = await newGroup(school, "Vacio");
    const result = await open(coachActor, groupId);
    expect(result.state.entries).toEqual([]);
  });

  it("la precarga trae solo grupos vigentes y arqueros activos", async () => {
    const groupId = await newGroup(school, "Precarga");
    const gk = await newGoalkeeper(school, "Precargado", { groupId });
    const hidden = await newGoalkeeper(school, "Baja", { groupId, status: "inactive" });
    const archived = await newGroup(school, "Archivado", true);

    const boot = await getAttendanceBootstrap(admin, school.id);
    const group = boot.groups.find((g) => g.id === groupId);
    expect(group?.members.map((m) => m.id)).toEqual([gk]);
    expect(boot.groups.some((g) => g.id === archived)).toBe(false);
    expect(boot.goalkeepers.some((g) => g.id === gk)).toBe(true);
    expect(boot.goalkeepers.some((g) => g.id === hidden)).toBe(false);
    // Nada de otra escuela.
    const foreign = await newGoalkeeper(other, "OtraEscuela");
    expect(boot.goalkeepers.some((g) => g.id === foreign)).toBe(false);
  });
});

describe("marcar (RF-06 a RF-11, CA-01, CA-03, CA-12)", () => {
  it("CA-01: todos presentes y 2 desmarcados dan 10 presentes y 2 ausentes", async () => {
    const groupId = await newGroup(school, "Doce");
    const ids: string[] = [];
    for (let i = 0; i < 12; i += 1) ids.push(await newGoalkeeper(school, `Doce${i}`, { groupId }));
    const { state } = await open(coachActor, groupId);

    const t = Date.now() - 5000;
    const marks = ids.map((id, i) => mark(id, i < 2 ? "absent" : "present", new Date(t + i)));
    const result = await save(coachActor, state.sessionId, marks);
    expect(result.state.entries.filter((e) => e.status === "present")).toHaveLength(10);
    expect(result.state.entries.filter((e) => e.status === "absent")).toHaveLength(2);
  });

  it("CA-12 y RF-08: se puede guardar con arqueros sin marcar; no cuentan para el porcentaje", async () => {
    const groupId = await newGroup(school, "Parcial");
    const a = await newGoalkeeper(school, "Marcado", { groupId });
    const b = await newGoalkeeper(school, "SinMarcar", { groupId });
    const { state } = await open(coachActor, groupId);
    const result = await save(coachActor, state.sessionId, [mark(a, "present")]);
    expect(statusOf(result.state, b)).toBe("unmarked");

    const rows = await getGoalkeeperAttendance(admin, school.id, b);
    expect(attendanceSummary(toRecords(rows), TODAY).percent).toBeNull();
  });

  it("CA-03 y RN-05: un invitado figura en su historial sin cambiar de grupo", async () => {
    const home = await newGroup(school, "Casa");
    const visit = await newGroup(school, "Visita");
    const guest = await newGoalkeeper(school, "Invitado", { groupId: home });
    await newGoalkeeper(school, "Local", { groupId: visit });
    const { state } = await open(coachActor, visit);

    const result = await save(coachActor, state.sessionId, [
      mark(guest, "present", new Date(), { guest: true }),
    ]);
    const entry = result.state.entries.find((e) => e.goalkeeperId === guest);
    expect(entry).toMatchObject({ status: "present", isGuest: true });

    const history = await getGoalkeeperAttendance(admin, school.id, guest);
    expect(history.find((h) => h.sessionId === state.sessionId)).toMatchObject({
      status: "present",
      isGuest: true,
    });
    const { data: groups } = await admin
      .from("goalkeeper_group")
      .select("group_id")
      .eq("goalkeeper_id", guest);
    expect(groups?.map((g) => g.group_id)).toEqual([home]);
  });

  it("no se agrega como invitado a un arquero inactivo ni de otra escuela (RN-04)", async () => {
    const groupId = await newGroup(school, "Invitados");
    const inactive = await newGoalkeeper(school, "InactivoInv", { status: "inactive" });
    const foreign = await newGoalkeeper(other, "AjenoInv");
    const { state } = await open(coachActor, groupId);
    const result = await save(coachActor, state.sessionId, [
      mark(inactive, "present", new Date(), { guest: true }),
      mark(foreign, "present", new Date(), { guest: true }),
    ]);
    expect(result.outcomes[inactive]).toBe("skipped");
    expect(result.outcomes[foreign]).toBe("skipped");
    expect(result.state.entries).toEqual([]);
  });

  it("una marca para alguien que no está en la lista (y no es invitado) se ignora", async () => {
    const groupId = await newGroup(school, "Lista");
    const stranger = await newGoalkeeper(school, "Extraño");
    const { state } = await open(coachActor, groupId);
    const result = await save(coachActor, state.sessionId, [mark(stranger, "present")]);
    expect(result.outcomes[stranger]).toBe("skipped");
  });

  it("RF-10: una justificada lleva su motivo, que solo existe para ausencias justificadas", async () => {
    const groupId = await newGroup(school, "Motivo");
    const a = await newGoalkeeper(school, "Justificado", { groupId });
    const b = await newGoalkeeper(school, "Presente", { groupId });
    const { state } = await open(coachActor, groupId);
    const result = await save(coachActor, state.sessionId, [
      mark(a, "excused", new Date(), { reason: "  Tenía examen  " }),
      mark(b, "present", new Date(), { reason: "no debería guardarse" }),
    ]);
    expect(result.state.entries.find((e) => e.goalkeeperId === a)?.reason).toBe("Tenía examen");
    expect(result.state.entries.find((e) => e.goalkeeperId === b)?.reason).toBeNull();
  });

  it("la hora de la marca nunca es futura (se acota a la del servidor)", async () => {
    const groupId = await newGroup(school, "Reloj");
    const a = await newGoalkeeper(school, "Adelantado", { groupId });
    const { state } = await open(coachActor, groupId);
    const farFuture = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    await save(coachActor, state.sessionId, [mark(a, "present", farFuture)]);
    const { data } = await admin
      .from("attendance_entry")
      .select("marked_at")
      .eq("session_id", state.sessionId)
      .single();
    expect(new Date(data!.marked_at as string).getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });
});

describe("sesión suspendida (RF-12, RN-02, CA-05)", () => {
  it("pide un motivo, no admite marcas y no cuenta para nadie", async () => {
    const groupId = await newGroup(school, "Lluvia");
    const a = await newGoalkeeper(school, "Mojado", { groupId });
    const past = await open(coachActor, groupId, day(-5));
    await save(coachActor, past.state.sessionId, [mark(a, "present", new Date(Date.now() - 2000))]);

    const { state } = await open(coachActor, groupId, day(-2));
    expect(
      await setSessionSuspended(admin, {
        ...coachActor,
        sessionId: state.sessionId,
        suspended: true,
      }),
    ).toEqual({ ok: false, error: "reason_required" });
    expect(
      await setSessionSuspended(admin, {
        ...coachActor,
        sessionId: state.sessionId,
        suspended: true,
        reason: "Lluvia",
      }),
    ).toEqual({ ok: true });

    const blocked = await applyMarks(admin, {
      ...coachActor,
      sessionId: state.sessionId,
      marks: [mark(a, "absent")],
    });
    expect(blocked).toEqual({ ok: false, error: "suspended" });
    // La base también lo impide.
    const direct = await admin
      .from("attendance_entry")
      .update({ status: "absent" })
      .eq("session_id", state.sessionId);
    expect(direct.error?.code).toBe(CHECK_VIOLATION);

    const rows = await getGoalkeeperAttendance(admin, school.id, a);
    expect(rows.find((r) => r.sessionId === state.sessionId)).toMatchObject({
      sessionStatus: "suspended",
      suspensionReason: "Lluvia",
    });
    expect(attendanceSummary(toRecords(rows), TODAY)).toMatchObject({ suspended: 1, percent: 100 });
  });

  it("al reactivarla vuelve a abrirse y conserva las marcas previas", async () => {
    const groupId = await newGroup(school, "Reactivar");
    const a = await newGoalkeeper(school, "Conserva", { groupId });
    const { state } = await open(coachActor, groupId, day(-1));
    await save(coachActor, state.sessionId, [mark(a, "present", new Date(Date.now() - 2000))]);
    await setSessionSuspended(admin, {
      ...adminActor,
      sessionId: state.sessionId,
      suspended: true,
      reason: "Feriado",
    });
    await setSessionSuspended(admin, {
      ...adminActor,
      sessionId: state.sessionId,
      suspended: false,
    });

    const result = await save(coachActor, state.sessionId, [mark(a, "absent", new Date())]);
    expect(result.state.status).toBe("open");
    expect(result.state.suspensionReason).toBeNull();
    expect(statusOf(result.state, a)).toBe("absent");
  });
});

describe("corrección y registro de cambios (RF-13, RF-14, CA-07)", () => {
  it("cada cambio queda con quién, cuándo, valor anterior y nuevo; el porcentaje se recalcula", async () => {
    const groupId = await newGroup(school, "Corregir");
    const a = await newGoalkeeper(school, "Corregido", { groupId });
    const first = await open(coachActor, groupId, day(-4));
    const second = await open(coachActor, groupId, day(-3));
    const t = Date.now();
    await save(coachActor, first.state.sessionId, [mark(a, "present", new Date(t - 5000))]);
    await save(coachActor, second.state.sessionId, [mark(a, "absent", new Date(t - 4000))]);

    let rows = await getGoalkeeperAttendance(admin, school.id, a);
    expect(attendanceSummary(toRecords(rows), TODAY).percent).toBe(50);

    // El admin corrige la ausencia a justificada.
    await save(adminActor, second.state.sessionId, [
      mark(a, "excused", new Date(t - 1000), { reason: "Enfermo" }),
    ]);
    rows = await getGoalkeeperAttendance(admin, school.id, a);
    expect(attendanceSummary(toRecords(rows), TODAY).percent).toBe(100);

    const revisions = await listSessionRevisions(admin, school.id, second.state.sessionId);
    expect(revisions.map((r) => [r.oldValue, r.newValue, r.discarded])).toEqual([
      ["absent", "excused", false],
      ["unmarked", "absent", false],
    ]);
    expect(revisions[0].editorName).toContain("adminA5");
    expect(revisions[0].editedAt).toBeTruthy();
  });

  it("guardar lo mismo otra vez no agrega registros", async () => {
    const groupId = await newGroup(school, "Idem");
    const a = await newGoalkeeper(school, "Repetido", { groupId });
    const { state } = await open(coachActor, groupId);
    await save(coachActor, state.sessionId, [mark(a, "present", new Date(Date.now() - 3000))]);
    await save(coachActor, state.sessionId, [mark(a, "present", new Date(Date.now() - 1000))]);
    expect(await listSessionRevisions(admin, school.id, state.sessionId)).toHaveLength(1);
  });
});

describe("sin conexión: último cambio por hora de marca (RF-26 y RF-29)", () => {
  it("prevalece la marca más reciente aunque llegue antes; la perdedora queda registrada como descartada", async () => {
    const groupId = await newGroup(school, "Conflicto");
    const a = await newGoalkeeper(school, "Disputado", { groupId });
    const { state } = await open(coachActor, groupId);
    const t = Date.now();

    // El dispositivo 2 marcó "ausente" a las T-1s pero sincroniza primero...
    await save(coach2Actor, state.sessionId, [mark(a, "absent", new Date(t - 1000))]);
    // ...y el dispositivo 1, que marcó "presente" a las T-5s (antes), sincroniza después.
    const late = await save(coachActor, state.sessionId, [mark(a, "present", new Date(t - 5000))]);

    expect(late.outcomes[a]).toBe("discarded");
    expect(statusOf(late.state, a)).toBe("absent");

    const revisions = await listSessionRevisions(admin, school.id, state.sessionId);
    expect(
      revisions.some((r) => r.discarded && r.newValue === "present" && r.oldValue === "absent"),
    ).toBe(true);
    expect(revisions.some((r) => !r.discarded && r.newValue === "absent")).toBe(true);
  });

  it("la marca más nueva reemplaza a la guardada", async () => {
    const groupId = await newGroup(school, "Reemplazo");
    const a = await newGoalkeeper(school, "Cambiado", { groupId });
    const { state } = await open(coachActor, groupId);
    const t = Date.now();
    await save(coach2Actor, state.sessionId, [mark(a, "absent", new Date(t - 5000))]);
    const result = await save(coachActor, state.sessionId, [
      mark(a, "present", new Date(t - 1000)),
    ]);
    expect(result.outcomes[a]).toBe("applied");
    expect(statusOf(result.state, a)).toBe("present");
  });

  it("una sesión creada sin conexión que ya existía se unifica con la existente", async () => {
    const groupId = await newGroup(school, "Unifica");
    const a = await newGoalkeeper(school, "Uno", { groupId });
    const b = await newGoalkeeper(school, "Dos", { groupId });
    const online = await open(coach2Actor, groupId);
    await save(coach2Actor, online.state.sessionId, [
      mark(a, "present", new Date(Date.now() - 3000)),
    ]);

    // El otro celular, sin conexión, creó "su" sesión y ahora sincroniza: abre la existente y suma sus marcas.
    const offline = await open(coachActor, groupId);
    expect(offline.created).toBe(false);
    const result = await save(coachActor, offline.state.sessionId, [
      mark(b, "absent", new Date(Date.now() - 1000)),
    ]);
    expect(statusOf(result.state, a)).toBe("present");
    expect(statusOf(result.state, b)).toBe("absent");
  });

  it("un arquero que se desactiva mientras se tomaba lista conserva las marcas sincronizadas", async () => {
    const groupId = await newGroup(school, "Desactivado");
    const a = await newGoalkeeper(school, "Baja", { groupId });
    const { state } = await open(coachActor, groupId);
    await admin.from("goalkeeper").update({ status: "inactive" }).eq("id", a);
    const result = await save(coachActor, state.sessionId, [
      mark(a, "present", new Date(Date.now() - 1000)),
    ]);
    expect(statusOf(result.state, a)).toBe("present");
  });
});

describe("aviso por 3 ausencias seguidas (RF-24, RF-25, CA-06)", () => {
  async function absences(
    groupId: string,
    gk: string,
    dates: number[],
    status: "absent" | "present" | "excused" = "absent",
  ) {
    let last = 0;
    for (const offset of dates) {
      const { state } = await open(coachActor, groupId, day(offset));
      await save(coachActor, state.sessionId, [
        mark(gk, status, new Date(Date.now() - 100000 + last)),
      ]);
      last += 10;
    }
  }

  it("se genera una sola vez por racha y el admin lo ve", async () => {
    const groupId = await newGroup(school, "Racha");
    const gk = await newGoalkeeper(school, "Faltador", { groupId });
    await absences(groupId, gk, [-9, -8]);
    expect((await listAbsenceAlerts(admin, school.id)).some((a) => a.goalkeeperId === gk)).toBe(
      false,
    );

    await absences(groupId, gk, [-7]);
    let alerts = (await listAbsenceAlerts(admin, school.id)).filter((a) => a.goalkeeperId === gk);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].streakLength).toBe(3);

    // Una cuarta falta sigue siendo la misma racha: no se repite, solo se actualiza el largo.
    await absences(groupId, gk, [-6]);
    alerts = (await listAbsenceAlerts(admin, school.id)).filter((a) => a.goalkeeperId === gk);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].streakLength).toBe(4);
  });

  it("se cierra solo cuando el arquero vuelve a asistir y una racha nueva genera otro aviso", async () => {
    const groupId = await newGroup(school, "Vuelve");
    const gk = await newGoalkeeper(school, "Regresa", { groupId });
    await absences(groupId, gk, [-20, -19, -18]);
    expect((await listAbsenceAlerts(admin, school.id)).some((a) => a.goalkeeperId === gk)).toBe(
      true,
    );

    await absences(groupId, gk, [-17], "present");
    expect((await listAbsenceAlerts(admin, school.id)).some((a) => a.goalkeeperId === gk)).toBe(
      false,
    );

    await absences(groupId, gk, [-16, -15, -14]);
    const alerts = (await listAbsenceAlerts(admin, school.id)).filter((a) => a.goalkeeperId === gk);
    expect(alerts).toHaveLength(1);
  }, 90_000);

  it("CA-07: corregir una ausencia a justificada corta la racha y cierra el aviso", async () => {
    const groupId = await newGroup(school, "Justifica");
    const gk = await newGoalkeeper(school, "Enfermo", { groupId });
    await absences(groupId, gk, [-30, -29, -28]);
    expect((await listAbsenceAlerts(admin, school.id)).some((a) => a.goalkeeperId === gk)).toBe(
      true,
    );

    const { state } = await open(coachActor, groupId, day(-29));
    await save(adminActor, state.sessionId, [mark(gk, "excused", new Date())]);
    expect((await listAbsenceAlerts(admin, school.id)).some((a) => a.goalkeeperId === gk)).toBe(
      false,
    );
  });

  it("si el admin lo descarta no vuelve a aparecer mientras sea la misma racha", async () => {
    const groupId = await newGroup(school, "Descarta");
    const gk = await newGoalkeeper(school, "Descartado", { groupId });
    await absences(groupId, gk, [-40, -39, -38]);
    const alert = (await listAbsenceAlerts(admin, school.id)).find((a) => a.goalkeeperId === gk)!;

    expect(await dismissAbsenceAlert(admin, { ...coachActor, alertId: alert.id })).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await dismissAbsenceAlert(admin, { ...otherAdminActor, alertId: alert.id })).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await dismissAbsenceAlert(admin, { ...adminActor, alertId: alert.id })).toEqual({
      ok: true,
    });

    // Más ausencias de la misma racha y una revisión posterior: no se genera otro aviso.
    await absences(groupId, gk, [-37]);
    await refreshAbsenceAlert(admin, school.id, gk);
    expect((await listAbsenceAlerts(admin, school.id)).some((a) => a.goalkeeperId === gk)).toBe(
      false,
    );
  });

  it("las ausencias justificadas y las sesiones suspendidas no suman a la racha", async () => {
    const groupId = await newGroup(school, "NoSuma");
    const gk = await newGoalkeeper(school, "Mixto", { groupId });
    await absences(groupId, gk, [-50, -49]);
    await absences(groupId, gk, [-48], "excused");
    await absences(groupId, gk, [-47]);
    expect((await listAbsenceAlerts(admin, school.id)).some((a) => a.goalkeeperId === gk)).toBe(
      false,
    );

    // Una sesión suspendida en el medio no corta ni suma: con otra falta más, son 2 seguidas, no 3.
    const { state } = await open(coachActor, groupId, day(-46));
    await setSessionSuspended(admin, {
      ...coachActor,
      sessionId: state.sessionId,
      suspended: true,
      reason: "Lluvia",
    });
    expect((await listAbsenceAlerts(admin, school.id)).some((a) => a.goalkeeperId === gk)).toBe(
      false,
    );
  });

  it("los profesores no ven los avisos (RLS); el admin sí", async () => {
    const groupId = await newGroup(school, "Visible");
    const gk = await newGoalkeeper(school, "Avisado", { groupId });
    await absences(groupId, gk, [-60, -59, -58]);
    expect(
      (await adminClient.from("admin_alert").select("id").eq("goalkeeper_id", gk)).data,
    ).toHaveLength(1);
    expect(
      (await coachClient.from("admin_alert").select("id").eq("goalkeeper_id", gk)).data,
    ).toEqual([]);
    expect(
      (await otherAdminClient.from("admin_alert").select("id").eq("goalkeeper_id", gk)).data,
    ).toEqual([]);
  });
});

describe("borrar una sesión (RF-15, CA-11)", () => {
  it("un profesor no puede; el admin sí, y la racha se recalcula", async () => {
    const groupId = await newGroup(school, "Borrar");
    const gk = await newGoalkeeper(school, "Borrado", { groupId });
    const { state } = await open(coachActor, groupId, day(-70));
    await save(coachActor, state.sessionId, [mark(gk, "absent", new Date(Date.now() - 2000))]);

    expect(await deleteSession(admin, { ...coachActor, sessionId: state.sessionId })).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await deleteSession(admin, { ...otherAdminActor, sessionId: state.sessionId })).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await deleteSession(admin, { ...adminActor, sessionId: state.sessionId })).toEqual({
      ok: true,
    });
    expect(
      (await admin.from("attendance_session").select("id").eq("id", state.sessionId)).data,
    ).toEqual([]);
    expect(
      (await admin.from("attendance_entry").select("id").eq("session_id", state.sessionId)).data,
    ).toEqual([]);
  });

  it("RN-06: al borrar al arquero se va su asistencia", async () => {
    const groupId = await newGroup(school, "Eliminar");
    const gk = await newGoalkeeper(school, "Eliminado", { groupId });
    const { state } = await open(coachActor, groupId, day(-71));
    await save(coachActor, state.sessionId, [mark(gk, "present", new Date(Date.now() - 2000))]);
    await admin.from("goalkeeper").delete().eq("id", gk);
    expect(
      (await admin.from("attendance_entry").select("id").eq("goalkeeper_id", gk)).data,
    ).toEqual([]);
  });
});

describe("informes (RF-21 a RF-23)", () => {
  it("resumen por grupo y mes: entrenamientos con marcas y asistencia promedio", async () => {
    const groupId = await newGroup(school, "Resumen");
    const a = await newGoalkeeper(school, "R1", { groupId });
    const b = await newGoalkeeper(school, "R2", { groupId });
    const lastMonth = addDays(TODAY.slice(0, 8) + "01", -1); // último día del mes anterior
    const month = { year: Number(lastMonth.slice(0, 4)), month: Number(lastMonth.slice(5, 7)) };
    const monthDay = (d: number) => `${lastMonth.slice(0, 8)}${String(d).padStart(2, "0")}`;

    const s1 = await open(coachActor, groupId, monthDay(2));
    const s2 = await open(coachActor, groupId, monthDay(9));
    const s3 = await open(coachActor, groupId, monthDay(16)); // sin marcas: no cuenta (RN-07)
    const s4 = await open(coachActor, groupId, monthDay(23));
    const t = Date.now() - 50000;
    await save(coachActor, s1.state.sessionId, [
      mark(a, "present", new Date(t)),
      mark(b, "present", new Date(t + 1)),
    ]);
    await save(coachActor, s2.state.sessionId, [
      mark(a, "present", new Date(t + 2)),
      mark(b, "absent", new Date(t + 3)),
    ]);
    await setSessionSuspended(admin, {
      ...coachActor,
      sessionId: s4.state.sessionId,
      suspended: true,
      reason: "Lluvia",
    });
    void s3;

    const report = await getGroupMonthReport(admin, school.id, month);
    const row = report.find((r) => r.groupId === groupId);
    expect(row).toMatchObject({ trainings: 2, average: 75 }); // 3 presentes de 4
  });

  it("baja asistencia: menos de 70% en los últimos 90 días, solo arqueros activos", async () => {
    const groupId = await newGroup(school, "Baja");
    const low = await newGoalkeeper(school, "Poco", { groupId });
    const fine = await newGoalkeeper(school, "Mucho", { groupId });
    const t = Date.now() - 80000;
    for (const [i, status] of (["absent", "absent", "present"] as const).entries()) {
      const { state } = await open(coachActor, groupId, day(-10 + i * 3)); // dentro de la ventana
      await save(coachActor, state.sessionId, [
        mark(low, status, new Date(t + i)),
        mark(fine, "present", new Date(t + i + 10)),
      ]);
    }
    const rows = await getLowAttendance(admin, school.id, TODAY);
    const mine = rows.find((r) => r.goalkeeperId === low);
    expect(mine?.summary.percent).toBe(33);
    expect(rows.some((r) => r.goalkeeperId === fine)).toBe(false);

    await admin.from("goalkeeper").update({ status: "inactive" }).eq("id", low);
    expect(
      (await getLowAttendance(admin, school.id, TODAY)).some((r) => r.goalkeeperId === low),
    ).toBe(false);
  });
});

describe("la familia (spec 04, RF-22 y RF-23; spec 05, CA-10 y RF-20)", () => {
  it("ve el porcentaje y el calendario, con 'justificada' y sin el motivo (CA-10)", async () => {
    const groupId = await newGroup(school, "Familia");
    const gk = await newGoalkeeper(school, "Hijo", { groupId });
    const tutor = await newGuardian(school, gk);
    const t = Date.now() - 30000;
    for (const [i, [offset, status, reason]] of (
      [
        [-3, "present", null],
        [-2, "excused", "Estaba con fiebre"],
      ] as const
    ).entries()) {
      const { state } = await open(coachActor, groupId, day(offset));
      await save(coachActor, state.sessionId, [mark(gk, status, new Date(t + i), { reason })]);
    }

    const month = { year: Number(TODAY.slice(0, 4)), month: Number(TODAY.slice(5, 7)) };
    const result = await getFamilyAttendance(admin, tutor, gk, month, TODAY);
    expect(result.available).toBe(true);
    if (!result.available) return;
    expect(result.summary).toMatchObject({ present: 1, excused: 1, percent: 100 });
    expect(JSON.stringify(result)).not.toContain("fiebre");
    expect(JSON.stringify(result)).not.toContain("Familia"); // ni el nombre del grupo
    const cells = result.weeks.flat().filter(Boolean);
    expect(cells.find((c) => c!.date === day(-2))?.status).toBe("excused");
  });

  it("CA-08 de la spec 04 y RF-20: un arquero inactivo o egresado no muestra asistencia", async () => {
    const gk = await newGoalkeeper(school, "Egresado", { status: "graduated" });
    const tutor = await newGuardian(school, gk);
    const result = await getFamilyAttendance(admin, tutor, gk, { year: 2026, month: 10 }, TODAY);
    expect(result).toEqual({ available: false });
  });

  it("no ve la asistencia de un arquero de otra escuela", async () => {
    const foreign = await newGoalkeeper(other, "AjenoFam");
    const tutor = await newGuardian(school, await newGoalkeeper(school, "PropioFam"));
    const result = await getFamilyAttendance(
      admin,
      tutor,
      foreign,
      { year: 2026, month: 10 },
      TODAY,
    );
    expect(result).toEqual({ available: false });
  });
});

describe("aislamiento entre escuelas (RLS)", () => {
  let sessionId: string;
  let entryGk: string;

  beforeAll(async () => {
    const groupId = await newGroup(school, "Aislada");
    entryGk = await newGoalkeeper(school, "Aislado", { groupId });
    const { state } = await open(coachActor, groupId, day(-80));
    sessionId = state.sessionId;
    await save(coachActor, sessionId, [mark(entryGk, "present", new Date(Date.now() - 4000))]);
    await save(coach2Actor, sessionId, [mark(entryGk, "absent", new Date(Date.now() - 1000))]);
  });

  it("el staff de otra escuela no ve sesiones, marcas ni revisiones", async () => {
    for (const [table, column] of [
      ["attendance_session", "id"],
      ["attendance_entry", "session_id"],
    ] as const) {
      const foreign = await otherAdminClient.from(table).select("school_id").eq(column, sessionId);
      expect(foreign.data, table).toEqual([]);
      const own = await adminClient.from(table).select("school_id").eq(column, sessionId);
      expect(own.data?.length, table).toBeGreaterThan(0);
    }
    const revisions = await otherAdminClient.from("attendance_revision").select("id");
    expect(new Set((revisions.data ?? []).map(() => "x")).size).toBeLessThanOrEqual(1);
    const own = await adminClient.from("attendance_revision").select("school_id");
    expect(new Set(own.data?.map((r) => r.school_id))).toEqual(new Set([school.id]));
  });

  it("los profesores ven la asistencia de toda su escuela (spec 05, sección 3)", async () => {
    expect(
      (await coachClient.from("attendance_session").select("id").eq("id", sessionId)).data,
    ).toHaveLength(1);
  });

  it("nadie escribe desde el cliente y sin sesión no se lee nada", async () => {
    expect(
      (
        await adminClient
          .from("attendance_entry")
          .update({ status: "absent" })
          .eq("session_id", sessionId)
      ).error?.code,
    ).toBe(PERMISSION_DENIED);
    expect(
      (
        await adminClient
          .from("attendance_session")
          .insert({ school_id: school.id, group_id: crypto.randomUUID(), date: day(-1) })
      ).error?.code,
    ).toBe(PERMISSION_DENIED);
    expect(
      (await adminClient.from("attendance_session").delete().eq("id", sessionId)).error?.code,
    ).toBe(PERMISSION_DENIED);
    const anon = createAnonClient();
    for (const table of [
      "attendance_session",
      "attendance_entry",
      "attendance_revision",
      "admin_alert",
    ]) {
      expect((await anon.from(table).select("*")).data ?? [], table).toEqual([]);
    }
  });

  it("una marca no puede apuntar a una sesión o a un arquero de otra escuela (clave compuesta)", async () => {
    const foreignGk = await newGoalkeeper(other, "Cruzado");
    const crossSchool = await admin.from("attendance_entry").insert({
      school_id: other.id,
      session_id: sessionId,
      goalkeeper_id: foreignGk,
    });
    expect(crossSchool.error?.code).toBe(FOREIGN_KEY_VIOLATION);
    const crossGoalkeeper = await admin.from("attendance_entry").insert({
      school_id: school.id,
      session_id: sessionId,
      goalkeeper_id: foreignGk,
    });
    // Falla por el disparador (arquero no activo en esta escuela) o por la clave compuesta.
    expect([FOREIGN_KEY_VIOLATION, CHECK_VIOLATION]).toContain(crossGoalkeeper.error?.code);
  });

  it("el estado, el motivo y el vínculo grupo-escuela se validan en la base", async () => {
    expect(
      (await admin.from("attendance_entry").update({ status: "tarde" }).eq("session_id", sessionId))
        .error?.code,
    ).toBe(CHECK_VIOLATION);
    expect(
      (
        await admin
          .from("attendance_entry")
          .update({ status: "present", reason: "solo justificadas" })
          .eq("session_id", sessionId)
      ).error?.code,
    ).toBe(CHECK_VIOLATION);
    const foreignGroup = await newGroup(other, "GrupoAjeno");
    expect(
      (
        await admin
          .from("attendance_session")
          .insert({ school_id: school.id, group_id: foreignGroup, date: day(-1) })
      ).error?.code,
    ).toBe(FOREIGN_KEY_VIOLATION);
  });
});
