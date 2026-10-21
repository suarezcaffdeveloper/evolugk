/**
 * Arqueros, tutores, grupos y medidas (spec 01: CA-04, CA-07, CA-09, RF-16, RF-21, RF-34, RF-40).
 * Corre contra el proyecto de desarrollo: `pnpm test:db`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  goalkeeperSchema,
  type GoalkeeperInput,
  type GuardianInput,
} from "@/lib/goalkeeper-schemas";
import {
  addGuardianToGoalkeeper,
  addMeasurement,
  createGoalkeeper,
  createGroup,
  deleteGoalkeeper,
  findDuplicates,
  getGoalkeeperDetail,
  listGoalkeepers,
  listGroups,
  manageGuardianAccess,
  removeGuardianFromGoalkeeper,
  searchGuardians,
  setGoalkeeperGroups,
  setGoalkeeperStatus,
  setGroupArchived,
  updateGoalkeeper,
  type GuardianSpec,
} from "@/server/goalkeepers";
import { loginGuardian } from "@/server/guardian/access";
import {
  cleanup,
  createAdminClient,
  createSchool,
  createStaff,
  purgeLeftovers,
  type TestSchool,
} from "./db";

const admin = createAdminClient();
const created = { schoolIds: [] as string[], userIds: [] as string[] };
const TODAY = "2026-10-21";

let school: TestSchool;
let other: TestSchool;
let actor: { schoolId: string; actorId: string };
let otherActor: { schoolId: string; actorId: string };

const person = (overrides: Partial<Record<string, unknown>> = {}): GoalkeeperInput =>
  goalkeeperSchema.parse({
    firstName: "Lucas",
    lastName: "Ríos",
    birthDate: "2012-05-01",
    joinedOn: "2024-03-01",
    ...overrides,
  });

const guardianData = (overrides: Partial<GuardianInput> = {}): GuardianInput => ({
  firstName: "Laura",
  lastName: "Ríos",
  phone: "11 5555-0000",
  email: null,
  ...overrides,
});

const newGuardian = (
  overrides: Partial<GuardianInput> = {},
  relationship: GuardianSpec["relationship"] = "mother",
): GuardianSpec => ({ relationship, data: guardianData(overrides) });

async function create(
  overrides: Partial<Parameters<typeof createGoalkeeper>[1]> & { name?: string } = {},
) {
  const { name, ...rest } = overrides;
  const result = await createGoalkeeper(admin, {
    ...actor,
    goalkeeper: person(name ? { firstName: name } : {}),
    guardians: [newGuardian()],
    groupIds: [],
    today: TODAY,
    confirmDuplicate: true,
    ...rest,
  });
  if (!result.ok) throw new Error(`No se pudo crear el arquero: ${result.error}`);
  return result;
}

beforeAll(async () => {
  await purgeLeftovers(admin);
  school = await createSchool(admin, "gk-a");
  other = await createSchool(admin, "gk-b");
  created.schoolIds.push(school.id, other.id);
  const staffA = await createStaff(admin, school, "school_admin", "gk-admin-a");
  const staffB = await createStaff(admin, other, "school_admin", "gk-admin-b");
  created.userIds.push(staffA.id, staffB.id);
  actor = { schoolId: school.id, actorId: staffA.id };
  otherActor = { schoolId: other.id, actorId: staffB.id };
});

afterAll(async () => {
  await cleanup(admin, created);
});

describe("alta de arqueros", () => {
  it("crea el arquero con su tutor y devuelve código y PIN una sola vez", async () => {
    const result = await create({ name: "Alta" });
    expect(result.credentials).toHaveLength(1);
    const [credential] = result.credentials;
    expect(credential.accessCode).toMatch(/^[A-Z0-9]{8}$/);
    expect(credential.pin).toMatch(/^\d{6}$/);

    // El PIN inicial sirve para ingresar al portal.
    const login = await loginGuardian(admin, {
      slug: school.slug,
      code: credential.accessCode,
      pin: credential.pin,
    });
    expect(login.ok && login.mustChangePin).toBe(true);

    const detail = await getGoalkeeperDetail(admin, school.id, result.goalkeeperId);
    expect(detail?.consent).toBe("pending");
    expect(detail?.status).toBe("active");
    expect(detail?.guardians[0]).toMatchObject({ firstName: "Laura", relationship: "mother" });
  });

  it("RF-16: no se puede dar de alta un arquero sin tutor", async () => {
    const result = await createGoalkeeper(admin, {
      ...actor,
      goalkeeper: person({ firstName: "SinTutor" }),
      guardians: [],
      groupIds: [],
      today: TODAY,
    });
    expect(result).toEqual({ ok: false, error: "no_guardian" });
    expect(await listGoalkeepers(admin, school.id, { q: "SinTutor", status: "all" })).toEqual([]);
  });

  it("CA-04: avisa si hay un homónimo y deja continuar con confirmación", async () => {
    await create({ name: "Duplicado" });
    const input = {
      ...actor,
      goalkeeper: person({ firstName: "Duplicado" }),
      guardians: [newGuardian()],
      groupIds: [],
      today: TODAY,
    };
    const warned = await createGoalkeeper(admin, input);
    expect(warned.ok === false && warned.error).toBe("duplicate");
    if (!warned.ok && warned.error === "duplicate") expect(warned.duplicates).toHaveLength(1);

    const confirmed = await createGoalkeeper(admin, { ...input, confirmDuplicate: true });
    expect(confirmed.ok).toBe(true);
  });

  it("el aviso de duplicado ignora mayúsculas y no cruza escuelas", async () => {
    await create({ name: "Mayus" });
    const same = await findDuplicates(admin, school.id, {
      firstName: "mayus",
      lastName: "RÍOS",
      birthDate: "2012-05-01",
    });
    expect(same).toHaveLength(1);
    const elsewhere = await findDuplicates(admin, other.id, {
      firstName: "Mayus",
      lastName: "Ríos",
      birthDate: "2012-05-01",
    });
    expect(elsewhere).toHaveLength(0);
  });

  it("CA-07: solo un mayor de 18 años puede ser su propio tutor", async () => {
    const minor = await createGoalkeeper(admin, {
      ...actor,
      goalkeeper: person({ firstName: "Menor", birthDate: "2012-05-01" }),
      guardians: [newGuardian({}, "self")],
      groupIds: [],
      today: TODAY,
      confirmDuplicate: true,
    });
    expect(minor).toEqual({ ok: false, error: "self_requires_adult" });

    const adult = await create({
      name: "Mayor",
      goalkeeper: person({ firstName: "Mayor", birthDate: "2000-01-15" }),
      guardians: [newGuardian({ firstName: "Mayor" }, "self")],
    });
    const detail = await getGoalkeeperDetail(admin, school.id, adult.goalkeeperId);
    expect(detail?.guardians[0].relationship).toBe("self");
  });

  it("rechaza fechas futuras", async () => {
    const result = await createGoalkeeper(admin, {
      ...actor,
      goalkeeper: person({ firstName: "Futuro", joinedOn: "2027-01-01" }),
      guardians: [newGuardian()],
      groupIds: [],
      today: TODAY,
      confirmDuplicate: true,
    });
    expect(result).toEqual({ ok: false, error: "future_date" });
  });

  it("hermanos: un tutor existente se vincula a un segundo arquero sin duplicarse", async () => {
    const first = await create({ name: "Hermano1" });
    const guardianId = first.credentials[0].guardianId;
    const second = await create({
      name: "Hermano2",
      guardians: [{ relationship: "mother", existingGuardianId: guardianId }],
    });
    expect(second.credentials).toHaveLength(0);
    const detail = await getGoalkeeperDetail(admin, school.id, second.goalkeeperId);
    expect(detail?.guardians.map((g) => g.id)).toEqual([guardianId]);
  });

  it("no se puede vincular un tutor ni un grupo de otra escuela", async () => {
    const foreign = await create({ name: "Ajeno", ...{} });
    const foreignOther = await createGoalkeeper(admin, {
      ...otherActor,
      goalkeeper: person({ firstName: "DeB" }),
      guardians: [newGuardian()],
      groupIds: [],
      today: TODAY,
      confirmDuplicate: true,
    });
    if (!foreignOther.ok) throw new Error("no se creó");
    const guardianOfB = foreignOther.credentials[0].guardianId;

    const withForeignGuardian = await createGoalkeeper(admin, {
      ...actor,
      goalkeeper: person({ firstName: "Cruzado" }),
      guardians: [{ relationship: "father", existingGuardianId: guardianOfB }],
      groupIds: [],
      today: TODAY,
      confirmDuplicate: true,
    });
    expect(withForeignGuardian).toEqual({ ok: false, error: "invalid_guardian" });

    const groupOfB = await createGroup(admin, {
      ...otherActor,
      data: { name: "Grupo de B", schedule: null },
    });
    if (!groupOfB.ok) throw new Error("no se creó el grupo");
    const withForeignGroup = await createGoalkeeper(admin, {
      ...actor,
      goalkeeper: person({ firstName: "CruzadoG" }),
      guardians: [newGuardian()],
      groupIds: [groupOfB.groupId],
      today: TODAY,
      confirmDuplicate: true,
    });
    expect(withForeignGroup).toEqual({ ok: false, error: "invalid_group" });
    expect(foreign.ok).toBe(true);
  });
});

describe("listado y búsqueda", () => {
  it("por defecto muestra solo los activos y busca por nombre y apellido", async () => {
    const a = await create({ name: "Zeta" });
    const b = await create({ name: "Zorro" });
    await setGoalkeeperStatus(admin, {
      ...actor,
      goalkeeperId: b.goalkeeperId,
      status: "inactive",
    });

    const active = await listGoalkeepers(admin, school.id, { q: "z" });
    const ids = active.map((r) => r.id);
    expect(ids).toContain(a.goalkeeperId);
    expect(ids).not.toContain(b.goalkeeperId);

    const all = await listGoalkeepers(admin, school.id, { q: "zorro", status: "all" });
    expect(all.map((r) => r.id)).toEqual([b.goalkeeperId]);

    const byFullName = await listGoalkeepers(admin, school.id, { q: "zeta ríos" });
    expect(byFullName.map((r) => r.id)).toEqual([a.goalkeeperId]);
  });

  it("no se deja engañar por caracteres especiales en la búsqueda", async () => {
    const rows = await listGoalkeepers(admin, school.id, { q: "%,(),*\"'" });
    expect(Array.isArray(rows)).toBe(true);
  });

  it("filtra por grupo y nivel, e indica el consentimiento", async () => {
    const group = await createGroup(admin, {
      ...actor,
      data: { name: "Filtro", schedule: "Lunes" },
    });
    if (!group.ok) throw new Error("no se creó el grupo");
    const inGroup = await create({
      name: "Gru",
      goalkeeper: person({ firstName: "Gru", level: "advanced" }),
      groupIds: [group.groupId],
    });
    await create({ name: "SinGru" });

    const byGroup = await listGoalkeepers(admin, school.id, { groupId: group.groupId });
    expect(byGroup.map((r) => r.id)).toEqual([inGroup.goalkeeperId]);
    expect(byGroup[0].consent).toBe("pending");
    expect(byGroup[0].groups[0].name).toBe("Filtro");

    const byLevel = await listGoalkeepers(admin, school.id, { level: "advanced", q: "gru" });
    expect(byLevel.map((r) => r.id)).toEqual([inGroup.goalkeeperId]);
  });

  it("nunca devuelve arqueros de otra escuela", async () => {
    const rows = await listGoalkeepers(admin, other.id, { status: "all" });
    expect(rows.every((r) => r.firstName !== "Zeta")).toBe(true);
  });
});

describe("edición, estados y medidas", () => {
  it("edita la ficha solo dentro de la escuela", async () => {
    const { goalkeeperId } = await create({ name: "Edit" });
    const ok = await updateGoalkeeper(admin, {
      ...actor,
      goalkeeperId,
      data: person({ firstName: "Editado", level: "intermediate", emergencyName: "Mamá" }),
      today: TODAY,
    });
    expect(ok).toEqual({ ok: true });
    const detail = await getGoalkeeperDetail(admin, school.id, goalkeeperId);
    expect(detail).toMatchObject({ firstName: "Editado", level: "intermediate" });
    expect(detail?.emergency.name).toBe("Mamá");

    const foreign = await updateGoalkeeper(admin, {
      ...otherActor,
      goalkeeperId,
      data: person({ firstName: "Robado" }),
      today: TODAY,
    });
    expect(foreign).toEqual({ ok: false, error: "not_found" });
    expect((await getGoalkeeperDetail(admin, school.id, goalkeeperId))?.firstName).toBe("Editado");
    expect(await getGoalkeeperDetail(admin, other.id, goalkeeperId)).toBeNull();
  });

  it("RF-22: pasa por inactivo, egresado y se reactiva conservando el historial", async () => {
    const { goalkeeperId } = await create({ name: "Estado" });
    await addMeasurement(admin, {
      ...actor,
      goalkeeperId,
      data: { date: "2026-09-01", heightCm: 150, weightKg: null },
      today: TODAY,
    });
    for (const status of ["inactive", "graduated", "active"] as const) {
      expect(await setGoalkeeperStatus(admin, { ...actor, goalkeeperId, status })).toEqual({
        ok: true,
      });
    }
    const detail = await getGoalkeeperDetail(admin, school.id, goalkeeperId);
    expect(detail?.status).toBe("active");
    expect(detail?.measurements).toHaveLength(1);
  });

  it("guarda el historial de medidas, la última primero", async () => {
    const { goalkeeperId } = await create({ name: "Medidas" });
    for (const [date, heightCm, weightKg] of [
      ["2026-01-10", 140.5, 35],
      ["2026-09-10", 146, null],
    ] as const) {
      const result = await addMeasurement(admin, {
        ...actor,
        goalkeeperId,
        data: { date, heightCm, weightKg },
        today: TODAY,
      });
      expect(result).toEqual({ ok: true });
    }
    const detail = await getGoalkeeperDetail(admin, school.id, goalkeeperId);
    expect(detail?.measurements.map((m) => m.date)).toEqual(["2026-09-10", "2026-01-10"]);
    expect(detail?.measurements[1]).toMatchObject({ heightCm: 140.5, weightKg: 35 });
  });

  it("rechaza medidas futuras y de arqueros de otra escuela", async () => {
    const { goalkeeperId } = await create({ name: "MedidasX" });
    const future = await addMeasurement(admin, {
      ...actor,
      goalkeeperId,
      data: { date: "2027-01-01", heightCm: 150, weightKg: null },
      today: TODAY,
    });
    expect(future).toEqual({ ok: false, error: "future_date" });
    const foreign = await addMeasurement(admin, {
      ...otherActor,
      goalkeeperId,
      data: { date: "2026-09-01", heightCm: 150, weightKg: null },
      today: TODAY,
    });
    expect(foreign).toEqual({ ok: false, error: "not_found" });
  });
});

describe("grupos", () => {
  it("CA-09: un grupo con arqueros se archiva, conserva sus integrantes y no se ofrece más", async () => {
    const group = await createGroup(admin, {
      ...actor,
      data: { name: "Archivable", schedule: null },
    });
    if (!group.ok) throw new Error("no se creó el grupo");
    const { goalkeeperId } = await create({ name: "EnGrupo", groupIds: [group.groupId] });

    expect(
      await setGroupArchived(admin, { ...actor, groupId: group.groupId, archived: true }),
    ).toEqual({ ok: true, groupId: group.groupId });
    expect((await listGroups(admin, school.id)).some((g) => g.id === group.groupId)).toBe(false);
    const withArchived = await listGroups(admin, school.id, { includeArchived: true });
    expect(withArchived.find((g) => g.id === group.groupId)).toMatchObject({
      archived: true,
      memberCount: 1,
    });

    // Conserva la pertenencia, pero no se puede sumar a otro arquero.
    const detail = await getGoalkeeperDetail(admin, school.id, goalkeeperId);
    expect(detail?.groups).toEqual([{ id: group.groupId, name: "Archivable", archived: true }]);
    const other1 = await create({ name: "OtroEnGrupo" });
    const add = await setGoalkeeperGroups(admin, {
      ...actor,
      goalkeeperId: other1.goalkeeperId,
      groupIds: [group.groupId],
    });
    expect(add).toEqual({ ok: false, error: "invalid_group" });
    // Reemplazar los grupos sin tocar el archivado lo conserva.
    const keep = await setGoalkeeperGroups(admin, {
      ...actor,
      goalkeeperId,
      groupIds: [group.groupId],
    });
    expect(keep).toEqual({ ok: true });
  });

  it("no admite dos grupos vigentes con el mismo nombre", async () => {
    await createGroup(admin, { ...actor, data: { name: "Único", schedule: null } });
    const again = await createGroup(admin, { ...actor, data: { name: " único ", schedule: null } });
    expect(again).toEqual({ ok: false, error: "name_taken" });
    // Otra escuela puede usar el mismo nombre.
    const elsewhere = await createGroup(admin, {
      ...otherActor,
      data: { name: "Único", schedule: null },
    });
    expect(elsewhere.ok).toBe(true);
  });

  it("asigna y quita grupos de un arquero", async () => {
    const g1 = await createGroup(admin, { ...actor, data: { name: "Asig1", schedule: null } });
    const g2 = await createGroup(admin, { ...actor, data: { name: "Asig2", schedule: null } });
    if (!g1.ok || !g2.ok) throw new Error("no se crearon los grupos");
    const { goalkeeperId } = await create({ name: "Asig" });

    await setGoalkeeperGroups(admin, {
      ...actor,
      goalkeeperId,
      groupIds: [g1.groupId, g2.groupId],
    });
    expect((await getGoalkeeperDetail(admin, school.id, goalkeeperId))?.groups).toHaveLength(2);
    await setGoalkeeperGroups(admin, { ...actor, goalkeeperId, groupIds: [g2.groupId] });
    const detail = await getGoalkeeperDetail(admin, school.id, goalkeeperId);
    expect(detail?.groups.map((g) => g.name)).toEqual(["Asig2"]);
  });
});

describe("tutores de un arquero", () => {
  it("suma un tutor nuevo con su propio acceso y quita al otro sin dejar al arquero sin tutor", async () => {
    const { goalkeeperId, credentials } = await create({ name: "Tutores" });
    const added = await addGuardianToGoalkeeper(admin, {
      ...actor,
      goalkeeperId,
      spec: newGuardian({ firstName: "Pablo", phone: "11 4444-0000" }, "father"),
      today: TODAY,
    });
    expect(added.ok && added.credentials?.pin).toMatch(/^\d{6}$/);

    const removed = await removeGuardianFromGoalkeeper(admin, {
      ...actor,
      goalkeeperId,
      guardianId: credentials[0].guardianId,
    });
    expect(removed).toEqual({ ok: true });
    // El tutor que quedó sin arqueros se borra con su acceso.
    const { data } = await admin.from("guardian").select("id").eq("id", credentials[0].guardianId);
    expect(data).toEqual([]);

    const last = await removeGuardianFromGoalkeeper(admin, {
      ...actor,
      goalkeeperId,
      guardianId: added.ok && added.credentials ? added.credentials.guardianId : "",
    });
    expect(last).toEqual({ ok: false, error: "last_guardian" });
  });

  it("no permite vincular dos veces al mismo tutor", async () => {
    const { goalkeeperId, credentials } = await create({ name: "Doble" });
    const again = await addGuardianToGoalkeeper(admin, {
      ...actor,
      goalkeeperId,
      spec: { relationship: "mother", existingGuardianId: credentials[0].guardianId },
      today: TODAY,
    });
    expect(again).toEqual({ ok: false, error: "already_linked" });
  });

  it("RF-15/RF-19/RF-20: resetea el PIN, desbloquea y revoca sin afectar al otro tutor", async () => {
    const { goalkeeperId, credentials } = await create({ name: "Acceso" });
    const second = await addGuardianToGoalkeeper(admin, {
      ...actor,
      goalkeeperId,
      spec: newGuardian({ firstName: "Pablo", phone: "11 4444-1111" }, "father"),
      today: TODAY,
    });
    if (!second.ok || !second.credentials) throw new Error("no se sumó el tutor");
    const [a] = credentials;
    const b = second.credentials;

    const reset = await manageGuardianAccess(admin, {
      ...actor,
      guardianId: a.guardianId,
      action: "reset_pin",
    });
    expect(reset.ok && reset.pin).toMatch(/^\d{6}$/);
    const oldPin = await loginGuardian(admin, {
      slug: school.slug,
      code: a.accessCode,
      pin: a.pin,
    });
    expect(oldPin.ok).toBe(false);

    await manageGuardianAccess(admin, { ...actor, guardianId: a.guardianId, action: "revoke" });
    const afterRevoke = await loginGuardian(admin, {
      slug: school.slug,
      code: a.accessCode,
      pin: reset.ok && reset.pin ? reset.pin : "",
    });
    expect(afterRevoke.ok).toBe(false);
    const other = await loginGuardian(admin, { slug: school.slug, code: b.accessCode, pin: b.pin });
    expect(other.ok).toBe(true);

    const unlock = await manageGuardianAccess(admin, {
      ...actor,
      guardianId: b.guardianId,
      action: "unlock",
    });
    expect(unlock.ok).toBe(true);
  });

  it("no actúa sobre tutores de otra escuela", async () => {
    const { credentials } = await create({ name: "Propio" });
    const result = await manageGuardianAccess(admin, {
      ...otherActor,
      guardianId: credentials[0].guardianId,
      action: "reset_pin",
    });
    expect(result).toEqual({ ok: false, error: "not_found" });
    const hash = await admin
      .from("guardian")
      .select("pin_hash")
      .eq("id", credentials[0].guardianId)
      .single();
    expect(hash.data?.pin_hash).toMatch(/^scrypt\$/);
  });

  it("busca tutores de la escuela por nombre o teléfono", async () => {
    await create({
      name: "Buscable",
      guardians: [newGuardian({ firstName: "Teodora", phone: "11 7777-9999" })],
    });
    expect((await searchGuardians(admin, school.id, "teodora")).length).toBeGreaterThan(0);
    expect((await searchGuardians(admin, school.id, "7777")).length).toBeGreaterThan(0);
    expect(await searchGuardians(admin, other.id, "teodora")).toEqual([]);
    expect(await searchGuardians(admin, school.id, "t")).toEqual([]);
  });
});

describe("eliminación definitiva", () => {
  it("RF-40/RF-42: borra todo, deja auditoría sin datos personales y respeta a los tutores con otros hijos", async () => {
    const first = await create({ name: "Borrar" });
    const shared = first.credentials[0].guardianId;
    const second = await create({
      name: "Queda",
      guardians: [{ relationship: "mother", existingGuardianId: shared }],
    });
    await addMeasurement(admin, {
      ...actor,
      goalkeeperId: first.goalkeeperId,
      data: { date: "2026-09-01", heightCm: 150, weightKg: null },
      today: TODAY,
    });

    expect(await deleteGoalkeeper(admin, { ...actor, goalkeeperId: first.goalkeeperId })).toEqual({
      ok: true,
    });
    expect(await getGoalkeeperDetail(admin, school.id, first.goalkeeperId)).toBeNull();
    const measurements = await admin
      .from("goalkeeper_measurement")
      .select("id")
      .eq("goalkeeper_id", first.goalkeeperId);
    expect(measurements.data).toEqual([]);

    // El tutor compartido sigue, vinculado al otro hijo (RN-06).
    const detail = await getGoalkeeperDetail(admin, school.id, second.goalkeeperId);
    expect(detail?.guardians.map((g) => g.id)).toEqual([shared]);

    const { data: log } = await admin
      .from("audit_log")
      .select("action, details")
      .eq("entity_id", first.goalkeeperId)
      .eq("action", "goalkeeper.deleted");
    expect(log).toHaveLength(1);
    expect(JSON.stringify(log)).not.toContain("Borrar");
  });

  it("borra al tutor que se queda sin arqueros y no actúa sobre otra escuela", async () => {
    const { goalkeeperId, credentials } = await create({ name: "Solo" });
    expect(await deleteGoalkeeper(admin, { ...otherActor, goalkeeperId })).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await getGoalkeeperDetail(admin, school.id, goalkeeperId)).not.toBeNull();

    await deleteGoalkeeper(admin, { ...actor, goalkeeperId });
    const { data } = await admin.from("guardian").select("id").eq("id", credentials[0].guardianId);
    expect(data).toEqual([]);
  });
});
