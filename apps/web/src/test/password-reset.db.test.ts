/**
 * Recuperación de contraseña del staff contra el proyecto de desarrollo (`pnpm test:db`).
 * Spec 00: RF-09.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { EmailMessage } from "../server/email/transport";
import { RESET_COOLDOWN_MS, requestPasswordReset, resetPassword } from "../server/password-reset";
import {
  cleanup,
  createAdminClient,
  createAnonClient,
  createSchool,
  createStaff,
  purgeLeftovers,
  type TestSchool,
  type TestUser,
} from "./db";

const admin = createAdminClient();
const created = { schoolIds: [] as string[], userIds: [] as string[] };

let school: TestSchool;
let otherSchool: TestSchool;
let suspendedSchool: TestSchool;
let coach: TestUser;
let otherCoach: TestUser;
let suspendedAdmin: TestUser;

const NEW_PASSWORD = "Una-clave-nueva-456";

/** Transporte falso que guarda los mails en vez de mandarlos. */
function fakeTransport() {
  const sent: EmailMessage[] = [];
  const transport = vi.fn(async (message: EmailMessage) => {
    sent.push(message);
    return { ok: true as const, id: "fake" };
  });
  return { transport, sent };
}

const tokenHashFrom = (message: EmailMessage) => {
  const link = message.text.split("\n").find((line) => line.includes("/restablecer?token_hash="));
  return decodeURIComponent(new URL(link!).searchParams.get("token_hash")!);
};

/** Pide el mail con un usuario nuevo (cada prueba usa el suyo para no chocar con el freno de repetición). */
async function freshCoach(label: string) {
  const user = await createStaff(admin, school, "coach", label);
  created.userIds.push(user.id);
  return user;
}

beforeAll(async () => {
  await purgeLeftovers(admin);
  school = await createSchool(admin, "reset-a");
  otherSchool = await createSchool(admin, "reset-b");
  suspendedSchool = await createSchool(admin, "reset-s");
  created.schoolIds.push(school.id, otherSchool.id, suspendedSchool.id);

  coach = await createStaff(admin, school, "coach", "reset-coach");
  otherCoach = await createStaff(admin, otherSchool, "coach", "reset-other");
  suspendedAdmin = await createStaff(admin, suspendedSchool, "school_admin", "reset-susp");
  created.userIds.push(coach.id, otherCoach.id, suspendedAdmin.id);
  await admin
    .from("school")
    .update({ status: "suspended", suspended_at: new Date().toISOString() })
    .eq("id", suspendedSchool.id);
});

afterAll(async () => {
  await admin.from("audit_log").delete().in("actor_id", created.userIds);
  await cleanup(admin, created);
});

describe("pedir el mail de recuperación", () => {
  it("manda un mail al staff de la escuela, con el link de esta escuela y su marca", async () => {
    const user = await freshCoach("reset-ok");
    const { transport, sent } = fakeTransport();
    await requestPasswordReset(admin, transport, { slug: school.slug, email: user.email });

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(user.email);
    expect(sent[0].subject).toContain("Escuela de prueba reset-a");
    expect(sent[0].text).toContain(`/${school.slug}/restablecer?token_hash=`);
    expect(tokenHashFrom(sent[0]).length).toBeGreaterThan(10);
  });

  it("acepta mayúsculas y espacios en el mail y en el slug", async () => {
    const user = await freshCoach("reset-mayus");
    const { transport, sent } = fakeTransport();
    await requestPasswordReset(admin, transport, {
      slug: ` ${school.slug.toUpperCase()} `,
      email: `  ${user.email.toUpperCase()} `,
    });
    expect(sent).toHaveLength(1);
  });

  describe("no manda nada, y no lo delata, en estos casos", () => {
    it.each([
      ["mail inexistente", () => ({ slug: school.slug, email: "nadie-existe@example.com" })],
      ["cuenta de otra escuela", () => ({ slug: school.slug, email: otherCoach.email })],
      ["escuela suspendida", () => ({ slug: suspendedSchool.slug, email: suspendedAdmin.email })],
      ["escuela inexistente", () => ({ slug: "no-existe-esta-escuela", email: coach.email })],
      ["slug reservado", () => ({ slug: "admin", email: coach.email })],
      ["mail inválido", () => ({ slug: school.slug, email: "no-es-mail" })],
      ["mail vacío", () => ({ slug: school.slug, email: "" })],
    ])("%s", async (_label, build) => {
      const { transport, sent } = fakeTransport();
      await expect(requestPasswordReset(admin, transport, build())).resolves.toBeUndefined();
      expect(sent).toHaveLength(0);
    });

    it("cuenta desactivada", async () => {
      const user = await freshCoach("reset-off");
      await admin.from("profile").update({ active: false }).eq("user_id", user.id);
      const { transport, sent } = fakeTransport();
      await requestPasswordReset(admin, transport, { slug: school.slug, email: user.email });
      expect(sent).toHaveLength(0);
    });

    it("el operador (sin escuela)", async () => {
      const operator = await createStaff(admin, school, "coach", "reset-op");
      created.userIds.push(operator.id);
      await admin.from("profile").delete().eq("user_id", operator.id);
      const { transport, sent } = fakeTransport();
      await requestPasswordReset(admin, transport, { slug: school.slug, email: operator.email });
      expect(sent).toHaveLength(0);
    });
  });

  it("frena los pedidos repetidos y vuelve a mandar pasado el lapso", async () => {
    const user = await freshCoach("reset-freno");
    const { transport, sent } = fakeTransport();
    await requestPasswordReset(admin, transport, { slug: school.slug, email: user.email });
    await requestPasswordReset(admin, transport, { slug: school.slug, email: user.email });
    expect(sent).toHaveLength(1);

    await requestPasswordReset(admin, transport, {
      slug: school.slug,
      email: user.email,
      now: new Date(Date.now() + RESET_COOLDOWN_MS + 5_000),
    });
    expect(sent).toHaveLength(2);
  });
});

describe("cambiar la contraseña con el link", () => {
  async function requestToken(user: TestUser, slug = school.slug) {
    const { transport, sent } = fakeTransport();
    await requestPasswordReset(admin, transport, { slug, email: user.email });
    expect(sent).toHaveLength(1);
    return tokenHashFrom(sent[0]);
  }
  const clients = () => ({ admin, auth: createAnonClient() });

  it("cambia la contraseña: sirve la nueva, no la vieja, y el link no se puede reutilizar", async () => {
    const user = await freshCoach("reset-flujo");
    const tokenHash = await requestToken(user);

    const result = await resetPassword(clients(), {
      slug: school.slug,
      tokenHash,
      password: NEW_PASSWORD,
      passwordConfirmation: NEW_PASSWORD,
    });
    expect(result).toEqual({ ok: true });

    const withNew = await createAnonClient().auth.signInWithPassword({
      email: user.email,
      password: NEW_PASSWORD,
    });
    expect(withNew.error).toBeNull();
    const withOld = await createAnonClient().auth.signInWithPassword({
      email: user.email,
      password: user.password,
    });
    expect(withOld.error).not.toBeNull();

    // El mismo link no sirve una segunda vez.
    expect(
      await resetPassword(clients(), {
        slug: school.slug,
        tokenHash,
        password: NEW_PASSWORD,
        passwordConfirmation: NEW_PASSWORD,
      }),
    ).toEqual({ ok: false, error: "invalid_link" });

    const { data: log } = await admin
      .from("audit_log")
      .select("action")
      .eq("actor_id", user.id)
      .order("id");
    expect(log?.map((l) => l.action)).toEqual([
      "auth.password_reset_requested",
      "auth.password_reset_completed",
    ]);
  });

  it("deja la sesión cerrada después de cambiarla (hay que ingresar de nuevo)", async () => {
    const user = await freshCoach("reset-sesion");
    const tokenHash = await requestToken(user);
    const c = clients();
    await resetPassword(c, {
      slug: school.slug,
      tokenHash,
      password: NEW_PASSWORD,
      passwordConfirmation: NEW_PASSWORD,
    });
    expect((await c.auth.auth.getSession()).data.session).toBeNull();
  });

  it.each([
    ["contraseña corta", { password: "Corta1!", passwordConfirmation: "Corta1!" }, "password"],
    [
      "contraseñas distintas",
      { passwordConfirmation: "Otra-clave-nueva-9" },
      "passwordConfirmation",
    ],
    ["sin contraseña", { password: "", passwordConfirmation: "" }, "password"],
  ])("rechaza %s sin consumir el link", async (_label, override, field) => {
    const user = await freshCoach("reset-valida");
    const tokenHash = await requestToken(user);

    const bad = await resetPassword(clients(), {
      slug: school.slug,
      tokenHash,
      password: NEW_PASSWORD,
      passwordConfirmation: NEW_PASSWORD,
      ...override,
    });
    expect(bad).toMatchObject({ ok: false, error: "invalid_input" });
    if (!bad.ok && bad.error === "invalid_input")
      expect(Object.keys(bad.fieldErrors)).toContain(field);

    // El link sigue sirviendo después de un formulario inválido.
    const good = await resetPassword(clients(), {
      slug: school.slug,
      tokenHash,
      password: NEW_PASSWORD,
      passwordConfirmation: NEW_PASSWORD,
    });
    expect(good).toEqual({ ok: true });
  });

  it.each([
    ["un link inventado", () => randomUUID().replace(/-/g, "")],
    ["un link vacío", () => ""],
  ])("rechaza %s", async (_label, makeToken) => {
    const result = await resetPassword(clients(), {
      slug: school.slug,
      tokenHash: makeToken(),
      password: NEW_PASSWORD,
      passwordConfirmation: NEW_PASSWORD,
    });
    expect(result).toEqual({ ok: false, error: "invalid_link" });
  });

  it("un link de una escuela no sirve en otra", async () => {
    const user = await freshCoach("reset-cruce");
    const tokenHash = await requestToken(user);
    const result = await resetPassword(clients(), {
      slug: otherSchool.slug,
      tokenHash,
      password: NEW_PASSWORD,
      passwordConfirmation: NEW_PASSWORD,
    });
    expect(result).toEqual({ ok: false, error: "invalid_link" });
    // Y la contraseña no cambió.
    const old = await createAnonClient().auth.signInWithPassword({
      email: user.email,
      password: user.password,
    });
    expect(old.error).toBeNull();
  });

  it("si la cuenta se desactiva después de pedir el mail, el link ya no sirve", async () => {
    const user = await freshCoach("reset-baja");
    const tokenHash = await requestToken(user);
    await admin.from("profile").update({ active: false }).eq("user_id", user.id);
    const result = await resetPassword(clients(), {
      slug: school.slug,
      tokenHash,
      password: NEW_PASSWORD,
      passwordConfirmation: NEW_PASSWORD,
    });
    expect(result).toEqual({ ok: false, error: "invalid_link" });
    const old = await createAnonClient().auth.signInWithPassword({
      email: user.email,
      password: user.password,
    });
    expect(old.error).toBeNull(); // la contraseña vieja sigue igual
  });
});
