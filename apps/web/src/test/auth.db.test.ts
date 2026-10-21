/**
 * Ingreso del staff y del operador contra el proyecto de desarrollo (`pnpm test:db`).
 * Spec 00: RF-07, RF-13, CA-06, CA-07 y verificación en dos pasos del operador (RF-06d).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  completeEnrollment,
  getMfaState,
  loginOperator,
  startEnrollment,
  verifyChallenge,
} from "../server/auth/operator-auth";
import { loginStaff } from "../server/auth/staff-login";
import {
  cleanup,
  createAdminClient,
  createAnonClient,
  createProfile,
  createSchool,
  createStaff,
  createUser,
  purgeLeftovers,
  type TestSchool,
  type TestUser,
} from "./db";
import { totpCode } from "./totp";

const admin = createAdminClient();
const created = { schoolIds: [] as string[], userIds: [] as string[] };
const INVALID = { ok: false, error: "invalid_credentials" };

let schoolA: TestSchool;
let schoolB: TestSchool;
let schoolSuspended: TestSchool;
let adminA: TestUser;
let coachA: TestUser;
let coachInactive: TestUser;
let coachB: TestUser;
let adminSuspended: TestUser;

/** Cliente nuevo y sin sesión, como el navegador de una persona que todavía no ingresó. */
const clients = () => ({ admin, auth: createAnonClient() });

async function hasSession(auth: SupabaseClient): Promise<boolean> {
  const { data } = await auth.auth.getSession();
  return Boolean(data.session);
}

/** Un código TOTP distinto del último usado (el servidor no acepta repetir el mismo en el mismo paso). */
const nextCode = (secret: string, step = 1) => totpCode(secret, Date.now() + step * 30_000);

async function createOperatorUser(label: string, active = true): Promise<TestUser> {
  const user = await createUser(admin, label);
  created.userIds.push(user.id);
  const { error } = await createProfile(admin, {
    userId: user.id,
    schoolId: null,
    role: "platform_admin",
    active,
  });
  expect(error).toBeNull();
  return user;
}

beforeAll(async () => {
  await purgeLeftovers(admin);

  schoolA = await createSchool(admin, "auth-a");
  schoolB = await createSchool(admin, "auth-b");
  schoolSuspended = await createSchool(admin, "auth-s");
  created.schoolIds.push(schoolA.id, schoolB.id, schoolSuspended.id);

  adminA = await createStaff(admin, schoolA, "school_admin", "auth-admin-a");
  coachA = await createStaff(admin, schoolA, "coach", "auth-coach-a");
  coachInactive = await createStaff(admin, schoolA, "coach", "auth-coach-off");
  coachB = await createStaff(admin, schoolB, "coach", "auth-coach-b");
  adminSuspended = await createStaff(admin, schoolSuspended, "school_admin", "auth-admin-s");
  created.userIds.push(adminA.id, coachA.id, coachInactive.id, coachB.id, adminSuspended.id);

  await admin.from("profile").update({ active: false }).eq("user_id", coachInactive.id);
  await admin
    .from("school")
    .update({ status: "suspended", suspended_at: new Date().toISOString() })
    .eq("id", schoolSuspended.id);
});

afterAll(async () => {
  await admin.from("audit_log").delete().in("actor_id", created.userIds);
  await cleanup(admin, created);
});

describe("ingreso del staff (loginStaff)", () => {
  it("el admin ingresa a su escuela y queda con sesión", async () => {
    const c = clients();
    const result = await loginStaff(c, schoolA.slug, {
      email: adminA.email,
      password: adminA.password,
    });
    expect(result).toEqual({ ok: true, schoolId: schoolA.id, role: "school_admin" });
    expect(await hasSession(c.auth)).toBe(true);
  });

  it("el profesor ingresa como profesor", async () => {
    const result = await loginStaff(clients(), schoolA.slug, {
      email: coachA.email,
      password: coachA.password,
    });
    expect(result).toEqual({ ok: true, schoolId: schoolA.id, role: "coach" });
  });

  it("no distingue mayúsculas en el mail ni en el slug, y tolera espacios", async () => {
    const result = await loginStaff(clients(), `  ${schoolA.slug.toUpperCase()} `, {
      email: `  ${adminA.email.toUpperCase()}  `,
      password: adminA.password,
    });
    expect(result).toMatchObject({ ok: true, schoolId: schoolA.id });
  });

  describe("todas las fallas de credenciales son idénticas (no revelan nada)", () => {
    const attempts: Array<[string, () => { slug: string; email: string; password: string }]> = [
      [
        "contraseña incorrecta",
        () => ({ slug: schoolA.slug, email: adminA.email, password: "incorrecta-123" }),
      ],
      [
        "mail inexistente",
        () => ({
          slug: schoolA.slug,
          email: "nadie-existe@example.com",
          password: "x-clave-larga-1",
        }),
      ],
      [
        "cuenta de otra escuela",
        () => ({ slug: schoolA.slug, email: coachB.email, password: coachB.password }),
      ],
      [
        "profesor desactivado",
        () => ({
          slug: schoolA.slug,
          email: coachInactive.email,
          password: coachInactive.password,
        }),
      ],
      [
        "escuela suspendida",
        () => ({
          slug: schoolSuspended.slug,
          email: adminSuspended.email,
          password: adminSuspended.password,
        }),
      ],
      [
        "escuela inexistente",
        () => ({ slug: "no-existe-esta-escuela", email: adminA.email, password: adminA.password }),
      ],
      ["slug reservado", () => ({ slug: "admin", email: adminA.email, password: adminA.password })],
      [
        "slug con formato inválido",
        () => ({ slug: "con espacio!", email: adminA.email, password: adminA.password }),
      ],
    ];

    it.each(attempts)("%s", async (_label, build) => {
      const { slug, ...credentials } = build();
      const c = clients();
      expect(await loginStaff(c, slug, credentials)).toEqual(INVALID);
      expect(await hasSession(c.auth)).toBe(false); // no queda ninguna sesión abierta
    });
  });

  it("el operador no puede ingresar por el login de una escuela", async () => {
    const operator = await createOperatorUser("auth-op-en-escuela");
    const c = clients();
    expect(
      await loginStaff(c, schoolA.slug, { email: operator.email, password: operator.password }),
    ).toEqual(INVALID);
    expect(await hasSession(c.auth)).toBe(false);
  });

  it("reactivar la escuela suspendida permite ingresar de nuevo", async () => {
    await admin
      .from("school")
      .update({ status: "active", suspended_at: null })
      .eq("id", schoolSuspended.id);
    try {
      const result = await loginStaff(clients(), schoolSuspended.slug, {
        email: adminSuspended.email,
        password: adminSuspended.password,
      });
      expect(result).toMatchObject({ ok: true, role: "school_admin" });
    } finally {
      await admin
        .from("school")
        .update({ status: "suspended", suspended_at: new Date().toISOString() })
        .eq("id", schoolSuspended.id);
    }
  });

  it("desactivar al profesor le impide volver a ingresar (RF-13)", async () => {
    const extra = await createStaff(admin, schoolA, "coach", "auth-coach-extra");
    created.userIds.push(extra.id);
    const creds = { email: extra.email, password: extra.password };
    expect(await loginStaff(clients(), schoolA.slug, creds)).toMatchObject({ ok: true });
    await admin.from("profile").update({ active: false }).eq("user_id", extra.id);
    expect(await loginStaff(clients(), schoolA.slug, creds)).toEqual(INVALID);
  });

  it.each([
    ["sin datos", {}, ["email", "password"]],
    ["mail inválido", { email: "no-es-mail", password: "x" }, ["email"]],
    ["sin contraseña", { email: "a@example.com", password: "" }, ["password"]],
  ])("valida los datos: %s", async (_label, input, fields) => {
    const result = await loginStaff(clients(), schoolA.slug, input);
    expect(result.ok).toBe(false);
    if (!result.ok && result.error === "invalid_input") {
      expect(Object.keys(result.fieldErrors).sort()).toEqual(fields);
    } else {
      throw new Error("Se esperaba invalid_input");
    }
  });
});

describe("ingreso del operador (loginOperator)", () => {
  it("rechaza a quien no es operador (un admin de escuela), sin dejar sesión", async () => {
    const c = clients();
    expect(await loginOperator(c, { email: adminA.email, password: adminA.password })).toEqual(
      INVALID,
    );
    expect(await hasSession(c.auth)).toBe(false);
  });

  it("rechaza al operador desactivado", async () => {
    const off = await createOperatorUser("auth-op-off", false);
    expect(await loginOperator(clients(), { email: off.email, password: off.password })).toEqual(
      INVALID,
    );
  });

  it("rechaza contraseña incorrecta y mail inexistente con el mismo resultado", async () => {
    const op = await createOperatorUser("auth-op-mal");
    expect(await loginOperator(clients(), { email: op.email, password: "incorrecta-123" })).toEqual(
      INVALID,
    );
    expect(
      await loginOperator(clients(), { email: "nadie@example.com", password: "x-clave-larga-1" }),
    ).toEqual(INVALID);
  });

  it("valida los datos de entrada", async () => {
    const result = await loginOperator(clients(), { email: "", password: "" });
    expect(result).toMatchObject({ ok: false, error: "invalid_input" });
  });

  it("recorre el camino completo: inscribir la app, verificar y volver a ingresar con el código", async () => {
    const op = await createOperatorUser("auth-op-flujo");
    const creds = { email: op.email, password: op.password };

    // 1) Primer ingreso: todavía no tiene la app de autenticación.
    const first = clients();
    expect(await loginOperator(first, creds)).toEqual({ ok: true, mfa: "enroll" });

    // 2) Inscripción: el QR sale con el nombre del producto, no con "localhost".
    const enrollment = await startEnrollment(first.auth);
    expect(enrollment.qrCode).toMatch(/^data:image\/svg\+xml/);
    expect(enrollment.secret).toMatch(/^[A-Z2-7]+$/);
    expect(decodeURIComponent(enrollment.uri)).toContain("EvoluGK");
    expect(enrollment.uri).not.toContain("localhost");

    // 3) Un código mal escrito o equivocado no completa la inscripción.
    expect(await completeEnrollment(first.auth, enrollment.factorId, "abc")).toMatchObject({
      ok: false,
      error: "invalid_input",
    });
    expect(await completeEnrollment(first.auth, enrollment.factorId, "000000")).toEqual({
      ok: false,
      error: "invalid_code",
    });
    expect(await getMfaState(first.auth)).toBe("enroll");

    // 4) El código correcto sí: la sesión pasa a aal2.
    const code = totpCode(enrollment.secret);
    expect(
      await completeEnrollment(
        first.auth,
        enrollment.factorId,
        `${code.slice(0, 3)} ${code.slice(3)}`,
      ),
    ).toEqual({ ok: true });
    expect(await getMfaState(first.auth)).toBe("ready");

    // 5) Ingreso posterior, desde cero: pide el código (challenge) y no ve nada hasta verificarlo.
    const second = clients();
    expect(await loginOperator(second, creds)).toEqual({ ok: true, mfa: "challenge" });
    const school = await admin
      .from("school")
      .insert({ name: "Escuela del operador", slug: `test-iso-opf-${Date.now().toString(36)}` })
      .select("id")
      .single();
    created.schoolIds.push(school.data!.id);
    expect((await second.auth.from("school").select("id").eq("id", school.data!.id)).data).toEqual(
      [],
    );

    expect(await verifyChallenge(second.auth, "000000")).toEqual({
      ok: false,
      error: "invalid_code",
    });
    expect(await getMfaState(second.auth)).toBe("challenge");

    expect(await verifyChallenge(second.auth, nextCode(enrollment.secret))).toEqual({ ok: true });
    expect(await getMfaState(second.auth)).toBe("ready");
    expect((await second.auth.from("school").select("id").eq("id", school.data!.id)).data).toEqual([
      { id: school.data!.id },
    ]);
  });

  it("reintentar la inscripción descarta el intento anterior sin verificar", async () => {
    const op = await createOperatorUser("auth-op-reintento");
    const c = clients();
    await loginOperator(c, { email: op.email, password: op.password });

    const first = await startEnrollment(c.auth);
    const second = await startEnrollment(c.auth); // no debe fallar por el factor a medias
    expect(second.factorId).not.toBe(first.factorId);

    const { data } = await c.auth.auth.mfa.listFactors();
    expect(data?.all.filter((f) => f.status === "unverified")).toHaveLength(1);

    // Solo el último intento sirve.
    expect(await completeEnrollment(c.auth, second.factorId, totpCode(second.secret))).toEqual({
      ok: true,
    });
  });

  it("no se puede verificar el segundo paso sin haber inscripto la app", async () => {
    const op = await createOperatorUser("auth-op-sinapp");
    const c = clients();
    await loginOperator(c, { email: op.email, password: op.password });
    expect(await verifyChallenge(c.auth, "123456")).toEqual({ ok: false, error: "failed" });
  });
});
