/**
 * Portal de familia (spec 04: RN-01, RN-03, RN-05; CA-01, CA-03, CA-10, CA-11, CA-12; spec 01:
 * CA-02 y CA-03 de consentimiento). Corre contra el proyecto de desarrollo: `pnpm test:db`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { goalkeeperSchema } from "@/lib/goalkeeper-schemas";
import { consentStatusOf, createGoalkeeper, type GuardianSpec } from "@/server/goalkeepers";
import {
  changeGuardianPin,
  getGuardianSession,
  loginGuardian,
  revokeAllSessions,
  type GuardianSession,
} from "@/server/guardian/access";
import {
  completeFirstLogin,
  getFamilyGoalkeeper,
  getFamilyGoalkeeperProfile,
  getGuardianProfile,
  grantConsent,
  listFamilyGoalkeepers,
  revokeConsent,
  updateGuardianContact,
} from "@/server/guardian/portal";
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

let school: TestSchool;
let other: TestSchool;
let actor: { schoolId: string; actorId: string };
let otherActor: { schoolId: string; actorId: string };

async function newGoalkeeper(
  owner: { schoolId: string; actorId: string },
  firstName: string,
  guardians: GuardianSpec[],
) {
  const result = await createGoalkeeper(admin, {
    ...owner,
    goalkeeper: goalkeeperSchema.parse({
      firstName,
      lastName: "Prueba",
      birthDate: "2012-05-01",
      joinedOn: "2024-03-01",
      emergencyName: "Contacto Secreto",
      emergencyPhone: "1100000000",
    }),
    guardians,
    groupIds: [],
    today: "2026-10-21",
    confirmDuplicate: true,
  });
  if (!result.ok) throw new Error(`No se pudo crear el arquero: ${result.error}`);
  return result;
}

const spec = (firstName: string, relationship: GuardianSpec["relationship"] = "mother") =>
  ({
    relationship,
    data: { firstName, lastName: "Tutor", phone: "11 5555-0000", email: null },
  }) satisfies GuardianSpec;

/** Ingresa como el tutor y devuelve su sesión de familia. */
async function sessionOf(
  target: TestSchool,
  credential: { accessCode: string; pin: string },
): Promise<GuardianSession> {
  const login = await loginGuardian(admin, {
    slug: target.slug,
    code: credential.accessCode,
    pin: credential.pin,
  });
  if (!login.ok) throw new Error("No se pudo ingresar como tutor.");
  const session = await getGuardianSession(admin, login.token);
  if (!session) throw new Error("La sesión recién creada no es válida.");
  return session;
}

beforeAll(async () => {
  await purgeLeftovers(admin);
  school = await createSchool(admin, "fp-a");
  other = await createSchool(admin, "fp-b");
  created.schoolIds.push(school.id, other.id);
  const staffA = await createStaff(admin, school, "school_admin", "fp-admin-a");
  const staffB = await createStaff(admin, other, "school_admin", "fp-admin-b");
  created.userIds.push(staffA.id, staffB.id);
  actor = { schoolId: school.id, actorId: staffA.id };
  otherActor = { schoolId: other.id, actorId: staffB.id };
});

afterAll(async () => {
  await cleanup(admin, created);
});

describe("arqueros del tutor", () => {
  it("un tutor con dos hijos ve solo a los suyos, no a los de otro tutor (CA-03, CA-12)", async () => {
    const first = await newGoalkeeper(actor, "Uno", [spec("Madre")]);
    const [credential] = first.credentials;
    // Segundo hijo del mismo tutor, y un tercer arquero ajeno.
    const second = await newGoalkeeper(actor, "Dos", [
      { relationship: "mother", existingGuardianId: credential.guardianId },
    ]);
    const stranger = await newGoalkeeper(actor, "Ajeno", [spec("Otra")]);
    expect(second.credentials).toHaveLength(0);

    const session = await sessionOf(school, credential);
    const list = await listFamilyGoalkeepers(admin, session);
    expect(list.map((g) => g.firstName).sort()).toEqual(["Dos", "Uno"]);

    expect(await getFamilyGoalkeeper(admin, session, stranger.goalkeeperId)).toBeNull();
    expect(await getFamilyGoalkeeperProfile(admin, session, first.goalkeeperId)).not.toBeNull();
  });

  it("la ficha para la familia no incluye el contacto de emergencia (RN-03)", async () => {
    const gk = await newGoalkeeper(actor, "Privado", [spec("Madre")]);
    const session = await sessionOf(school, gk.credentials[0]);
    const profile = await getFamilyGoalkeeperProfile(admin, session, gk.goalkeeperId);
    expect(JSON.stringify(profile)).not.toContain("Secreto");
    expect(JSON.stringify(profile)).not.toContain("1100000000");
  });

  it("el tutor de otra escuela no ve estos arqueros (RN-01)", async () => {
    const mine = await newGoalkeeper(actor, "Mio", [spec("Madre")]);
    const foreign = await newGoalkeeper(otherActor, "Extranjero", [spec("Otra")]);
    const session = await sessionOf(school, mine.credentials[0]);
    expect(await getFamilyGoalkeeper(admin, session, foreign.goalkeeperId)).toBeNull();
    expect(await grantConsent(admin, session, foreign.goalkeeperId)).toMatchObject({ ok: false });
  });
});

describe("consentimiento", () => {
  it("lo da y lo retira el tutor, y queda el historial (spec 01, RF-31)", async () => {
    const gk = await newGoalkeeper(actor, "Consent", [spec("Madre")]);
    const session = await sessionOf(school, gk.credentials[0]);
    const status = async () =>
      (await getFamilyGoalkeeper(admin, session, gk.goalkeeperId))?.consent;

    expect(await status()).toBe("pending");
    expect(await grantConsent(admin, session, gk.goalkeeperId)).toEqual({ ok: true });
    expect(await status()).toBe("valid");

    expect(await revokeConsent(admin, session, gk.goalkeeperId)).toEqual({ ok: true });
    expect(await status()).toBe("revoked");

    // Volver a darlo es un registro nuevo; el anterior se conserva.
    expect(await grantConsent(admin, session, gk.goalkeeperId)).toEqual({ ok: true });
    expect(await status()).toBe("valid");
    const { data } = await admin
      .from("consent")
      .select("revoked_at, revoked_by")
      .eq("goalkeeper_id", gk.goalkeeperId);
    expect(data).toHaveLength(2);
    expect(consentStatusOf(data ?? [])).toBe("valid");
    expect((data ?? []).find((r) => r.revoked_at)?.revoked_by).toBe(session.guardianId);
  });

  it("dar el consentimiento dos veces no lo duplica", async () => {
    const gk = await newGoalkeeper(actor, "Doble", [spec("Madre")]);
    const session = await sessionOf(school, gk.credentials[0]);
    await grantConsent(admin, session, gk.goalkeeperId);
    expect(await grantConsent(admin, session, gk.goalkeeperId)).toEqual({ ok: true });
    const { data } = await admin.from("consent").select("id").eq("goalkeeper_id", gk.goalkeeperId);
    expect(data).toHaveLength(1);
  });

  it("basta uno de los tutores, y el otro lo ve vigente (spec 01, CA-02)", async () => {
    const gk = await newGoalkeeper(actor, "Dos tutores", [spec("Madre"), spec("Padre", "father")]);
    const [mother, father] = gk.credentials;
    const motherSession = await sessionOf(school, mother);
    const fatherSession = await sessionOf(school, father);

    await grantConsent(admin, motherSession, gk.goalkeeperId);
    expect((await getFamilyGoalkeeper(admin, fatherSession, gk.goalkeeperId))?.consent).toBe(
      "valid",
    );
    // El padre también puede retirarlo (spec 04, RF-32).
    await revokeConsent(admin, fatherSession, gk.goalkeeperId);
    expect((await getFamilyGoalkeeper(admin, motherSession, gk.goalkeeperId))?.consent).toBe(
      "revoked",
    );
  });

  it("deja auditado el consentimiento y su retiro (spec 04, RF-30)", async () => {
    const gk = await newGoalkeeper(actor, "Audit", [spec("Madre")]);
    const session = await sessionOf(school, gk.credentials[0]);
    await grantConsent(admin, session, gk.goalkeeperId);
    await revokeConsent(admin, session, gk.goalkeeperId);
    const { data } = await admin
      .from("audit_log")
      .select("action, actor_id")
      .eq("entity_id", gk.goalkeeperId)
      .in("action", ["consent.granted", "consent.revoked"]);
    expect((data ?? []).map((r) => r.action).sort()).toEqual([
      "consent.granted",
      "consent.revoked",
    ]);
    expect((data ?? []).every((r) => r.actor_id === session.guardianId)).toBe(true);
  });
});

describe("primer ingreso", () => {
  it("el tutor nuevo tiene el asistente pendiente hasta cambiar el PIN y cerrarlo (CA-01)", async () => {
    const gk = await newGoalkeeper(actor, "Primero", [spec("Madre")]);
    const [credential] = gk.credentials;
    const session = await sessionOf(school, credential);
    expect(session.pinChanged).toBe(false);
    expect(session.firstLoginCompleted).toBe(false);

    const changed = await changeGuardianPin(admin, {
      guardianId: session.guardianId,
      keepSessionId: session.sessionId,
      currentPin: credential.pin,
      newPin: "482916",
    });
    expect(changed).toEqual({ ok: true });
    await completeFirstLogin(admin, session);

    const login = await loginGuardian(admin, {
      slug: school.slug,
      code: credential.accessCode,
      pin: "482916",
    });
    expect(login.ok && login.mustChangePin).toBe(false);
    if (!login.ok) return;
    const fresh = await getGuardianSession(admin, login.token);
    expect(fresh).toMatchObject({ pinChanged: true, firstLoginCompleted: true });
  });

  it("señala qué campo falla al cambiar el PIN", async () => {
    const gk = await newGoalkeeper(actor, "Campos", [spec("Madre")]);
    const [credential] = gk.credentials;
    const session = await sessionOf(school, credential);
    const base = { guardianId: session.guardianId, keepSessionId: session.sessionId };

    expect(
      await changeGuardianPin(admin, { ...base, currentPin: "000999", newPin: "482916" }),
    ).toMatchObject({
      ok: false,
      field: "currentPin",
    });
    expect(
      await changeGuardianPin(admin, { ...base, currentPin: credential.pin, newPin: "123456" }),
    ).toMatchObject({
      ok: false,
      field: "newPin",
    });
  });
});

describe("mis datos y sesiones", () => {
  it("el tutor cambia su mail y su teléfono, y queda auditado (RF-28 y RF-30)", async () => {
    const gk = await newGoalkeeper(actor, "Datos", [spec("Madre")]);
    const session = await sessionOf(school, gk.credentials[0]);

    expect(
      await updateGuardianContact(admin, session, {
        phone: "11 4444-9999",
        email: "Nueva@Mail.com",
      }),
    ).toEqual({
      ok: true,
    });
    const profile = await getGuardianProfile(admin, session);
    expect(profile).toMatchObject({ phone: "11 4444-9999", email: "nueva@mail.com" });
    expect(profile?.accessCode).toBe(gk.credentials[0].accessCode);

    const { data } = await admin
      .from("audit_log")
      .select("action")
      .eq("entity_id", session.guardianId)
      .eq("action", "guardian.contact_updated");
    expect(data).toHaveLength(1);
  });

  it("rechaza un mail o un teléfono inválidos sin guardar nada", async () => {
    const gk = await newGoalkeeper(actor, "Invalido", [spec("Madre")]);
    const session = await sessionOf(school, gk.credentials[0]);
    const result = await updateGuardianContact(admin, session, {
      phone: "abc",
      email: "no-es-mail",
    });
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { phone: expect.any(String), email: expect.any(String) },
    });
    expect((await getGuardianProfile(admin, session))?.phone).toBe("11 5555-0000");
  });

  it("cerrar sesión en todos los dispositivos invalida cada sesión (CA-11)", async () => {
    const gk = await newGoalkeeper(actor, "Sesiones", [spec("Madre")]);
    const [credential] = gk.credentials;
    const a = await sessionOf(school, credential);
    const b = await sessionOf(school, credential);

    await revokeAllSessions(admin, a.guardianId);
    const login = await loginGuardian(admin, {
      slug: school.slug,
      code: credential.accessCode,
      pin: credential.pin,
    });
    expect(login.ok).toBe(true);
    // Las dos sesiones anteriores ya no sirven: hay que ingresar de nuevo.
    for (const old of [a, b]) {
      const { data } = await admin
        .from("guardian_session")
        .select("revoked")
        .eq("id", old.sessionId)
        .single();
      expect(data?.revoked).toBe(true);
    }
  });

  it("la sesión trae la escuela, para que el portal descarte links de otra (RN-01)", async () => {
    const gk = await newGoalkeeper(actor, "Escuela", [spec("Madre")]);
    const session = await sessionOf(school, gk.credentials[0]);
    expect(session.schoolSlug).toBe(school.slug);
    expect(session.schoolSlug).not.toBe(other.slug);
  });
});
