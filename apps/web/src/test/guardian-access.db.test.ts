/**
 * Acceso de familia (spec 00: CA-03, CA-04, CA-05; RF-13 a RF-20). Corre contra el proyecto de
 * desarrollo: `pnpm test:db`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateAccessCode } from "@/server/guardian/access-code";
import {
  changeGuardianPin,
  getGuardianSession,
  issueInitialPin,
  loginGuardian,
  revokeAllSessions,
  revokeGuardianAccess,
  unlockGuardian,
} from "@/server/guardian/access";
import { cleanup, createAdminClient, createSchool, purgeLeftovers, type TestSchool } from "./db";

const admin = createAdminClient();
const created = { schoolIds: [] as string[], userIds: [] as string[] };

const WRONG_PIN = "999111";
const NO_SESSION = "00000000-0000-0000-0000-000000000000";

let school: TestSchool;
let otherSchool: TestSchool;

async function createGuardian(target: TestSchool) {
  const code = generateAccessCode();
  const { data, error } = await admin
    .from("guardian")
    .insert({
      school_id: target.id,
      first_name: "Laura",
      last_name: "Pérez",
      phone: "1155550000",
      access_code: code,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`No se pudo crear el tutor: ${error?.message}`);
  const { pin } = await issueInitialPin(admin, data.id);
  return { id: data.id as string, code, pin };
}

async function failTimes(slug: string, code: string, times: number) {
  for (let i = 0; i < times; i += 1) {
    await loginGuardian(admin, { slug, code, pin: WRONG_PIN });
  }
}

beforeAll(async () => {
  await purgeLeftovers(admin);
  school = await createSchool(admin, "fam-a");
  otherSchool = await createSchool(admin, "fam-b");
  created.schoolIds.push(school.id, otherSchool.id);
});

afterAll(async () => {
  await cleanup(admin, created);
});

describe("ingreso con código y PIN", () => {
  it("ingresa con las credenciales correctas y crea una sesión de 30 días", async () => {
    const g = await createGuardian(school);
    const now = new Date();
    const result = await loginGuardian(admin, { slug: school.slug, code: g.code, pin: g.pin }, now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mustChangePin).toBe(true);
    expect(result.expiresAt.getTime() - now.getTime()).toBe(30 * 24 * 60 * 60 * 1000);

    const session = await getGuardianSession(admin, result.token);
    expect(session?.guardianId).toBe(g.id);
  });

  it("acepta el código escrito con minúsculas y guion", async () => {
    const g = await createGuardian(school);
    const typed = `${g.code.slice(0, 4)}-${g.code.slice(4)}`.toLowerCase();
    const result = await loginGuardian(admin, { slug: school.slug, code: typed, pin: g.pin });
    expect(result.ok).toBe(true);
  });

  it("rechaza sin distinguir código inexistente, PIN incorrecto o escuela equivocada", async () => {
    const g = await createGuardian(school);
    const wrongPin = await loginGuardian(admin, {
      slug: school.slug,
      code: g.code,
      pin: WRONG_PIN,
    });
    const noCode = await loginGuardian(admin, { slug: school.slug, code: "ZZZZZZZZ", pin: g.pin });
    const wrongSchool = await loginGuardian(admin, {
      slug: otherSchool.slug,
      code: g.code,
      pin: g.pin,
    });
    expect(wrongPin).toEqual({ ok: false, reason: "invalid" });
    expect(noCode).toEqual({ ok: false, reason: "invalid" });
    expect(wrongSchool).toEqual({ ok: false, reason: "invalid" });
  });

  it("CA-04: tras 5 fallos bloquea 15 minutos aunque el sexto PIN sea correcto", async () => {
    const g = await createGuardian(school);
    await failTimes(school.slug, g.code, 4);
    const fifth = await loginGuardian(admin, {
      slug: school.slug,
      code: g.code,
      pin: WRONG_PIN,
    });
    expect(fifth.ok === false && fifth.reason).toBe("locked");

    const sixth = await loginGuardian(admin, { slug: school.slug, code: g.code, pin: g.pin });
    expect(sixth.ok === false && sixth.reason).toBe("locked");
    if (!sixth.ok && sixth.reason === "locked") {
      const minutes = (sixth.lockedUntil.getTime() - Date.now()) / 60_000;
      expect(minutes).toBeGreaterThan(14);
      expect(minutes).toBeLessThanOrEqual(15);
    }
  });

  it("intentos fallidos simultáneos no se saltean el límite", async () => {
    const g = await createGuardian(school);
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        loginGuardian(admin, { slug: school.slug, code: g.code, pin: WRONG_PIN }),
      ),
    );
    expect(results.some((r) => !r.ok && r.reason === "locked")).toBe(true);
    const correct = await loginGuardian(admin, { slug: school.slug, code: g.code, pin: g.pin });
    expect(correct.ok).toBe(false);
  });

  it("el admin puede desbloquear antes de los 15 minutos", async () => {
    const g = await createGuardian(school);
    await failTimes(school.slug, g.code, 5);
    await unlockGuardian(admin, g.id);
    const result = await loginGuardian(admin, { slug: school.slug, code: g.code, pin: g.pin });
    expect(result.ok).toBe(true);
  });

  it("pasado el bloqueo se vuelve a poder ingresar", async () => {
    const g = await createGuardian(school);
    await failTimes(school.slug, g.code, 5);
    const later = new Date(Date.now() + 16 * 60_000);
    const result = await loginGuardian(
      admin,
      { slug: school.slug, code: g.code, pin: g.pin },
      later,
    );
    expect(result.ok).toBe(true);
  });
});

describe("sesiones", () => {
  it("CA-05: al revocar el acceso la sesión deja de valer; los demás tutores no se afectan", async () => {
    const a = await createGuardian(school);
    const b = await createGuardian(school);
    const sa = await loginGuardian(admin, { slug: school.slug, code: a.code, pin: a.pin });
    const sb = await loginGuardian(admin, { slug: school.slug, code: b.code, pin: b.pin });
    if (!sa.ok || !sb.ok) throw new Error("no ingresó");

    await revokeGuardianAccess(admin, a.id);
    expect(await getGuardianSession(admin, sa.token)).toBeNull();
    expect(await getGuardianSession(admin, sb.token)).not.toBeNull();
    const again = await loginGuardian(admin, { slug: school.slug, code: a.code, pin: a.pin });
    expect(again).toEqual({ ok: false, reason: "invalid" });
  });

  it("generar un PIN nuevo rehabilita el acceso y cierra las sesiones viejas", async () => {
    const g = await createGuardian(school);
    const s = await loginGuardian(admin, { slug: school.slug, code: g.code, pin: g.pin });
    if (!s.ok) throw new Error("no ingresó");
    await revokeGuardianAccess(admin, g.id);

    const { pin } = await issueInitialPin(admin, g.id);
    expect(await getGuardianSession(admin, s.token)).toBeNull();
    const result = await loginGuardian(admin, { slug: school.slug, code: g.code, pin });
    expect(result.ok).toBe(true);
  });

  it("CA-11: cerrar sesión en todos los dispositivos las invalida todas", async () => {
    const g = await createGuardian(school);
    const s1 = await loginGuardian(admin, { slug: school.slug, code: g.code, pin: g.pin });
    const s2 = await loginGuardian(admin, { slug: school.slug, code: g.code, pin: g.pin });
    if (!s1.ok || !s2.ok) throw new Error("no ingresó");
    expect(await getGuardianSession(admin, s2.token)).not.toBeNull();

    await revokeAllSessions(admin, g.id);
    expect(await getGuardianSession(admin, s1.token)).toBeNull();
    expect(await getGuardianSession(admin, s2.token)).toBeNull();
  });

  it("una sesión vencida no vale", async () => {
    const g = await createGuardian(school);
    const s = await loginGuardian(admin, { slug: school.slug, code: g.code, pin: g.pin });
    if (!s.ok) throw new Error("no ingresó");
    const after31Days = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
    expect(await getGuardianSession(admin, s.token, after31Days)).toBeNull();
  });

  it("un token inventado o vacío no vale", async () => {
    expect(await getGuardianSession(admin, "inventado")).toBeNull();
    expect(await getGuardianSession(admin, undefined)).toBeNull();
  });

  it("CA-05 de la spec 04: con la escuela suspendida no se ingresa ni sigue valiendo la sesión", async () => {
    const suspended = await createSchool(admin, "fam-susp");
    created.schoolIds.push(suspended.id);
    const g = await createGuardian(suspended);
    const s = await loginGuardian(admin, { slug: suspended.slug, code: g.code, pin: g.pin });
    if (!s.ok) throw new Error("no ingresó");

    await admin
      .from("school")
      .update({ status: "suspended", suspended_at: new Date().toISOString() })
      .eq("id", suspended.id);
    expect(await getGuardianSession(admin, s.token)).toBeNull();
    const again = await loginGuardian(admin, { slug: suspended.slug, code: g.code, pin: g.pin });
    expect(again).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("cambio de PIN", () => {
  it("cambia el PIN, marca pin_changed y cierra las otras sesiones", async () => {
    const g = await createGuardian(school);
    const s1 = await loginGuardian(admin, { slug: school.slug, code: g.code, pin: g.pin });
    const s2 = await loginGuardian(admin, { slug: school.slug, code: g.code, pin: g.pin });
    if (!s1.ok || !s2.ok) throw new Error("no ingresó");
    const session1 = await getGuardianSession(admin, s1.token);

    const result = await changeGuardianPin(admin, {
      guardianId: g.id,
      keepSessionId: session1!.sessionId,
      currentPin: g.pin,
      newPin: "482915",
    });
    expect(result).toEqual({ ok: true });
    expect(await getGuardianSession(admin, s1.token)).not.toBeNull();
    expect(await getGuardianSession(admin, s2.token)).toBeNull();

    const old = await loginGuardian(admin, { slug: school.slug, code: g.code, pin: g.pin });
    expect(old.ok).toBe(false);
    const fresh = await loginGuardian(admin, { slug: school.slug, code: g.code, pin: "482915" });
    expect(fresh.ok && fresh.mustChangePin).toBe(false);
  });

  it("rechaza PIN débiles, el mismo PIN y un PIN actual incorrecto", async () => {
    const g = await createGuardian(school);
    const base = { guardianId: g.id, keepSessionId: NO_SESSION };
    const attempt = async (currentPin: string, newPin: string) =>
      (await changeGuardianPin(admin, { ...base, currentPin, newPin })).ok;

    expect(await attempt(g.pin, "123456")).toBe(false);
    expect(await attempt(g.pin, "111111")).toBe(false);
    expect(await attempt(g.pin, g.pin)).toBe(false);
    expect(await attempt(WRONG_PIN, "482915")).toBe(false);
  });

  it("los PIN actuales incorrectos también cuentan para el bloqueo", async () => {
    const g = await createGuardian(school);
    for (let i = 0; i < 5; i += 1) {
      await changeGuardianPin(admin, {
        guardianId: g.id,
        keepSessionId: NO_SESSION,
        currentPin: WRONG_PIN,
        newPin: "482915",
      });
    }
    const result = await loginGuardian(admin, { slug: school.slug, code: g.code, pin: g.pin });
    expect(result.ok === false && result.reason).toBe("locked");
  });
});

describe("PIN en la base", () => {
  it("se guarda hasheado, nunca en claro (RN-03)", async () => {
    const g = await createGuardian(school);
    const { data } = await admin.from("guardian").select("pin_hash").eq("id", g.id).single();
    expect(data?.pin_hash).toMatch(/^scrypt\$/);
    expect(data?.pin_hash).not.toContain(g.pin);
  });
});
