/**
 * Invitaciones, alta de escuelas y equipo contra el proyecto de desarrollo (`pnpm test:db`).
 * Spec 00: RF-05, RF-06, RF-10, RF-11, RF-13, RN-07 y casos borde de invitaciones.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { argentinaDatePlusDays } from "../lib/dates";
import {
  INVITATION_TTL_DAYS,
  acceptInvitation,
  createInvitation,
  generateToken,
  hashToken,
  listPendingInvitations,
  lookupInvitation,
  revokeInvitation,
} from "../server/invitations";
import {
  createSchoolWithAdminInvitation,
  listSchools,
  setSchoolSuspended,
} from "../server/schools";
import { listTeam, setStaffActive } from "../server/team";
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
const DAY = 24 * 60 * 60 * 1000;

let schoolA: TestSchool;
let schoolB: TestSchool;
let adminA: TestUser;
let adminB: TestUser;

const email = (label: string) =>
  `isolation-test-inv-${label}-${randomUUID().slice(0, 8)}@example.com`;
const PASSWORD = "Una-clave-segura-123";

const validAccept = (token: string, extra: Record<string, unknown> = {}) => ({
  token,
  firstName: "Marcos",
  lastName: "Pérez",
  password: PASSWORD,
  passwordConfirmation: PASSWORD,
  ...extra,
});

async function newInvitation(
  school = schoolA,
  role: "coach" | "school_admin" = "coach",
  options: { now?: Date; mail?: string } = {},
) {
  const result = await createInvitation(admin, {
    schoolId: school.id,
    email: options.mail ?? email("nuevo"),
    role,
    createdBy: adminA.id,
    now: options.now,
  });
  if (!result.ok) throw new Error(`No se pudo crear la invitación de prueba: ${result.error}`);
  return result;
}

/** Acepta y registra la cuenta creada para limpiarla al terminar. */
async function accept(token: string, extra: Record<string, unknown> = {}) {
  const result = await acceptInvitation(admin, validAccept(token, extra));
  if (result.ok) created.userIds.push(result.userId);
  return result;
}

beforeAll(async () => {
  await purgeLeftovers(admin);
  schoolA = await createSchool(admin, "inv-a");
  schoolB = await createSchool(admin, "inv-b");
  created.schoolIds.push(schoolA.id, schoolB.id);
  adminA = await createStaff(admin, schoolA, "school_admin", "inv-admin-a");
  adminB = await createStaff(admin, schoolB, "school_admin", "inv-admin-b");
  created.userIds.push(adminA.id, adminB.id);
});

afterAll(async () => {
  await admin.from("audit_log").delete().in("actor_id", created.userIds);
  await cleanup(admin, created);
});

describe("tokens", () => {
  it("son de 43 caracteres base64url, distintos entre sí, y su hash es SHA-256", () => {
    const a = generateToken();
    const b = generateToken();
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.token).not.toBe(b.token);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(a.token)).toBe(a.hash);
    expect(a.hash).not.toBe(a.token);
  });
});

describe("crear invitaciones", () => {
  it("guarda solo el hash del token y vence a los 7 días", async () => {
    const now = new Date("2026-10-21T12:00:00Z");
    const result = await newInvitation(schoolA, "coach", { now });

    expect(result.invitation.expiresAt.toISOString()).toBe(
      new Date(now.getTime() + INVITATION_TTL_DAYS * DAY).toISOString(),
    );

    const { data } = await admin
      .from("invitation")
      .select("*")
      .eq("id", result.invitation.id)
      .single();
    expect(data?.token_hash).toBe(hashToken(result.token));
    expect(JSON.stringify(data)).not.toContain(result.token); // el token en claro no está en ninguna columna
    expect(data).toMatchObject({
      school_id: schoolA.id,
      role: "coach",
      used_at: null,
      revoked_at: null,
      created_by: adminA.id,
    });
  });

  it("normaliza el mail a minúsculas", async () => {
    const mail = email("mayus");
    const result = await newInvitation(schoolA, "coach", { mail: `  ${mail.toUpperCase()} ` });
    expect(result.invitation.email).toBe(mail);
  });

  it.each(["", "   ", "no-es-mail", "dos@@example.com", "sin-dominio@"])(
    "rechaza el mail %j",
    async (mail) => {
      const result = await createInvitation(admin, {
        schoolId: schoolA.id,
        email: mail,
        role: "coach",
        createdBy: adminA.id,
      });
      expect(result).toMatchObject({ ok: false, error: "invalid_email" });
    },
  );

  it("rechaza un mail que ya tiene cuenta (una cuenta, una escuela)", async () => {
    const own = await createInvitation(admin, {
      schoolId: schoolA.id,
      email: adminA.email,
      role: "coach",
      createdBy: adminA.id,
    });
    expect(own).toEqual({ ok: false, error: "email_in_use" });
    const other = await createInvitation(admin, {
      schoolId: schoolA.id,
      email: adminB.email.toUpperCase(),
      role: "coach",
      createdBy: adminA.id,
    });
    expect(other).toEqual({ ok: false, error: "email_in_use" });
  });

  it("falla con una escuela que no existe", async () => {
    const result = await createInvitation(admin, {
      schoolId: randomUUID(),
      email: email("sin-escuela"),
      role: "coach",
      createdBy: null,
    });
    expect(result).toEqual({ ok: false, error: "school_not_found" });
  });

  it("reenviar revoca la invitación anterior: el link viejo deja de servir", async () => {
    const mail = email("reenvio");
    const first = await newInvitation(schoolA, "coach", { mail });
    const second = await newInvitation(schoolA, "coach", { mail });

    expect((await lookupInvitation(admin, first.token)).status).toBe("revoked");
    expect((await lookupInvitation(admin, second.token)).status).toBe("valid");
    expect(
      (await listPendingInvitations(admin, schoolA.id)).filter((i) => i.email === mail),
    ).toHaveLength(1);
  });
});

describe("consultar una invitación", () => {
  it("una válida trae los datos de la escuela y de la invitación", async () => {
    const { token, invitation } = await newInvitation(schoolA, "school_admin");
    const lookup = await lookupInvitation(admin, token);
    expect(lookup).toMatchObject({
      status: "valid",
      invitation: { id: invitation.id, email: invitation.email, role: "school_admin" },
      school: { id: schoolA.id, slug: schoolA.slug, name: "Escuela de prueba inv-a" },
    });
  });

  it.each(["", "corto", "x".repeat(43), "!".repeat(43), `${"a".repeat(42)} `])(
    "un token inexistente o mal formado es not_found: %j",
    async (token) => {
      expect(await lookupInvitation(admin, token)).toEqual({ status: "not_found" });
    },
  );

  it("el token de otra invitación no sirve para esta (se compara el hash completo)", async () => {
    const a = await newInvitation();
    const b = await newInvitation();
    expect((await lookupInvitation(admin, a.token)).status).toBe("valid");
    expect(a.token).not.toBe(b.token);
  });

  it("vencida, usada, revocada y escuela suspendida", async () => {
    const expired = await newInvitation(schoolA, "coach", { now: new Date(Date.now() - 8 * DAY) });
    expect((await lookupInvitation(admin, expired.token)).status).toBe("expired");

    // Justo en el límite: vence exactamente ahora.
    const edge = await newInvitation(schoolA, "coach", { now: new Date(Date.now() - 7 * DAY) });
    expect(
      (await lookupInvitation(admin, edge.token, new Date(edge.invitation.expiresAt))).status,
    ).toBe("expired");

    const revoked = await newInvitation();
    await revokeInvitation(admin, { schoolId: schoolA.id, invitationId: revoked.invitation.id });
    expect((await lookupInvitation(admin, revoked.token)).status).toBe("revoked");

    const used = await newInvitation();
    expect((await accept(used.token)).ok).toBe(true);
    expect((await lookupInvitation(admin, used.token)).status).toBe("used");

    const school = await createSchool(admin, "inv-susp");
    created.schoolIds.push(school.id);
    const pending = await newInvitation(school);
    await setSchoolSuspended(admin, { schoolId: school.id, suspended: true, actorId: adminA.id });
    expect((await lookupInvitation(admin, pending.token)).status).toBe("school_unavailable");
  });
});

describe("aceptar una invitación", () => {
  it("crea la cuenta y el perfil con el rol invitado, y la persona puede ingresar", async () => {
    const mail = email("acepta");
    const { token, invitation } = await newInvitation(schoolA, "coach", { mail });

    const result = await accept(token);
    expect(result).toMatchObject({
      ok: true,
      email: mail,
      schoolSlug: schoolA.slug,
      role: "coach",
    });

    const { data: profile } = await admin
      .from("profile")
      .select("*")
      .eq("user_id", result.ok ? result.userId : "")
      .single();
    expect(profile).toMatchObject({
      school_id: schoolA.id,
      role: "coach",
      first_name: "Marcos",
      last_name: "Pérez",
      active: true,
    });

    const { data: row } = await admin
      .from("invitation")
      .select("used_at")
      .eq("id", invitation.id)
      .single();
    expect(row?.used_at).not.toBeNull();

    const login = await createAnonClient().auth.signInWithPassword({
      email: mail,
      password: PASSWORD,
    });
    expect(login.error).toBeNull();

    const { data: log } = await admin
      .from("audit_log")
      .select("action, school_id")
      .eq("actor_id", result.ok ? result.userId : "");
    expect(log).toEqual([{ action: "invitation.accepted", school_id: schoolA.id }]);
  });

  it("una invitación de administración da el rol de administración", async () => {
    const { token } = await newInvitation(schoolA, "school_admin");
    const result = await accept(token);
    expect(result).toMatchObject({ ok: true, role: "school_admin" });
  });

  it("no se puede aceptar dos veces", async () => {
    const { token } = await newInvitation();
    expect((await accept(token)).ok).toBe(true);
    expect(await accept(token)).toEqual({ ok: false, error: "used" });
  });

  it("dos aceptaciones simultáneas crean una sola cuenta", async () => {
    const mail = email("carrera");
    const { token } = await newInvitation(schoolA, "coach", { mail });

    const results = await Promise.all([accept(token), accept(token), accept(token)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(
      results
        .filter((r) => !r.ok)
        .every((r) => !r.ok && (r.error === "used" || r.error === "email_in_use")),
    ).toBe(true);

    const found = await admin.rpc("find_user_id_by_email", { p_email: mail });
    expect(found.data).toBeTruthy();
    const { count } = await admin
      .from("profile")
      .select("user_id", { count: "exact", head: true })
      .eq("school_id", schoolA.id)
      .eq("first_name", "Marcos");
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it.each([
    ["sin nombre", { firstName: "  " }, "firstName"],
    ["sin apellido", { lastName: "" }, "lastName"],
    ["contraseña corta", { password: "Corta1!", passwordConfirmation: "Corta1!" }, "password"],
    [
      "contraseñas distintas",
      { passwordConfirmation: "Otra-clave-segura-1" },
      "passwordConfirmation",
    ],
  ])("valida los datos: %s, y la invitación sigue válida", async (_label, override, field) => {
    const { token } = await newInvitation();
    const result = await acceptInvitation(admin, validAccept(token, override));
    expect(result).toMatchObject({ ok: false, error: "invalid_input" });
    if (!result.ok && result.error === "invalid_input")
      expect(Object.keys(result.fieldErrors)).toContain(field);
    expect((await lookupInvitation(admin, token)).status).toBe("valid"); // no se consumió
  });

  it("rechaza una contraseña igual al mail", async () => {
    const mail = email("igual");
    const { token } = await newInvitation(schoolA, "coach", { mail });
    const result = await acceptInvitation(
      admin,
      validAccept(token, { password: mail, passwordConfirmation: mail }),
    );
    expect(result).toMatchObject({ ok: false, error: "invalid_input" });
    expect((await lookupInvitation(admin, token)).status).toBe("valid");
  });

  it("si el mail se registró mientras tanto, lo informa y libera la invitación", async () => {
    const mail = email("ocupado");
    const { token } = await newInvitation(schoolA, "coach", { mail });
    const squatter = await admin.auth.admin.createUser({
      email: mail,
      password: PASSWORD,
      email_confirm: true,
    });
    if (squatter.data.user) created.userIds.push(squatter.data.user.id);

    expect(await accept(token)).toEqual({ ok: false, error: "email_in_use" });
    expect((await lookupInvitation(admin, token)).status).toBe("valid"); // se liberó el reclamo
  });

  it.each([
    [
      "vencida",
      async () =>
        (await newInvitation(schoolA, "coach", { now: new Date(Date.now() - 8 * DAY) })).token,
      "expired",
    ],
    [
      "revocada",
      async () => {
        const inv = await newInvitation();
        await revokeInvitation(admin, { schoolId: schoolA.id, invitationId: inv.invitation.id });
        return inv.token;
      },
      "revoked",
    ],
    ["inexistente", async () => generateToken().token, "not_found"],
  ])("no acepta una invitación %s", async (_label, makeToken, error) => {
    expect(await accept(await makeToken())).toEqual({ ok: false, error });
  });

  it("no acepta si la escuela está suspendida", async () => {
    const school = await createSchool(admin, "inv-susp2");
    created.schoolIds.push(school.id);
    const { token } = await newInvitation(school);
    await setSchoolSuspended(admin, { schoolId: school.id, suspended: true, actorId: adminA.id });
    expect(await accept(token)).toEqual({ ok: false, error: "school_unavailable" });
  });
});

describe("revocar y listar", () => {
  it("solo revoca invitaciones de la escuela indicada", async () => {
    const { invitation } = await newInvitation(schoolA);
    expect(
      await revokeInvitation(admin, { schoolId: schoolB.id, invitationId: invitation.id }),
    ).toBe(false);
    expect(
      await revokeInvitation(admin, { schoolId: schoolA.id, invitationId: invitation.id }),
    ).toBe(true);
    expect(
      await revokeInvitation(admin, { schoolId: schoolA.id, invitationId: invitation.id }),
    ).toBe(false); // ya revocada
  });

  it("la lista marca las vencidas y no incluye usadas ni revocadas", async () => {
    const school = await createSchool(admin, "inv-lista");
    created.schoolIds.push(school.id);
    const live = await newInvitation(school);
    const old = await newInvitation(school, "coach", { now: new Date(Date.now() - 8 * DAY) });
    const gone = await newInvitation(school);
    await revokeInvitation(admin, { schoolId: school.id, invitationId: gone.invitation.id });
    const used = await newInvitation(school);
    await accept(used.token);

    const list = await listPendingInvitations(admin, school.id);
    expect(list.map((i) => [i.id, i.expired]).sort()).toEqual(
      [
        [live.invitation.id, false],
        [old.invitation.id, true],
      ].sort(),
    );
  });
});

describe("alta de escuela por el operador", () => {
  const valid = (override: Record<string, unknown> = {}) => ({
    name: "Guantes del Sur",
    slug: `test-iso-alta-${randomUUID().slice(0, 8)}`,
    adminEmail: email("director"),
    monthlyPriceArs: "15000",
    goalkeeperLimit: "40",
    videoMinutesLimit: "300",
    trialDays: "30",
    ...override,
  });

  async function create(raw: Record<string, unknown>, now?: Date) {
    const result = await createSchoolWithAdminInvitation(admin, raw, { actorId: adminA.id, now });
    if (result.ok) created.schoolIds.push(result.school.id);
    return result;
  }

  it("crea la escuela, sus condiciones con la prueba en hora de Argentina y la invitación del admin", async () => {
    const now = new Date("2026-10-21T01:30:00Z"); // 20/10 22:30 en Argentina
    const raw = valid({ monthlyPriceArs: "15000,50" });
    const result = await create(raw, now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { data: sub } = await admin
      .from("subscription")
      .select("*")
      .eq("school_id", result.school.id)
      .single();
    const trialEnd = argentinaDatePlusDays(now, 30);
    expect(trialEnd).toBe("2026-11-19");
    expect(sub).toMatchObject({
      monthly_price_ars: 15000.5,
      goalkeeper_limit: 40,
      video_minutes_limit: 300,
      trial_until: trialEnd,
      covered_until: trialEnd,
      manually_suspended: false,
    });

    const lookup = await lookupInvitation(admin, result.token);
    expect(lookup).toMatchObject({
      status: "valid",
      invitation: { role: "school_admin" },
      school: { id: result.school.id },
    });

    const { data: log } = await admin
      .from("audit_log")
      .select("action, actor_id")
      .eq("school_id", result.school.id);
    expect(log).toEqual([{ action: "school.created", actor_id: adminA.id }]);
  });

  it.each([
    ["nombre vacío", { name: "" }, "name"],
    ["identificador reservado", { slug: "admin" }, "slug"],
    ["identificador con mayúscula y espacio", { slug: "Mi Escuela" }, "slug"],
    ["identificador de 2 letras", { slug: "ab" }, "slug"],
    ["mail inválido", { adminEmail: "no-es-mail" }, "adminEmail"],
    ["precio vacío", { monthlyPriceArs: "" }, "monthlyPriceArs"],
    ["precio negativo", { monthlyPriceArs: "-1" }, "monthlyPriceArs"],
    ["precio no numérico", { monthlyPriceArs: "mucho" }, "monthlyPriceArs"],
    ["tope de arqueros 0", { goalkeeperLimit: "0" }, "goalkeeperLimit"],
    ["tope de arqueros decimal", { goalkeeperLimit: "2,5" }, "goalkeeperLimit"],
    ["tope de video negativo", { videoMinutesLimit: "-5" }, "videoMinutesLimit"],
    ["prueba de 0 días", { trialDays: "0" }, "trialDays"],
    ["prueba de 366 días", { trialDays: "366" }, "trialDays"],
  ])("rechaza %s sin crear nada", async (_label, override, field) => {
    const raw = valid(override);
    const result = await create(raw);
    expect(result).toMatchObject({ ok: false, error: "invalid_input" });
    if (!result.ok && result.error === "invalid_input")
      expect(Object.keys(result.fieldErrors)).toContain(field);
    const { count } = await admin
      .from("school")
      .select("id", { count: "exact", head: true })
      .eq("slug", String(raw.slug));
    expect(count).toBe(0);
  });

  it("acepta el límite de la prueba (365) y un tope de video en 0", async () => {
    expect(
      (await create(valid({ trialDays: "365", videoMinutesLimit: "0", monthlyPriceArs: "0" }))).ok,
    ).toBe(true);
  });

  it("rechaza un identificador repetido", async () => {
    const taken = await create(valid());
    expect(taken.ok).toBe(true);
    if (!taken.ok) return;
    expect(await create(valid({ slug: taken.school.slug }))).toEqual({
      ok: false,
      error: "slug_taken",
    });
  });

  it("si el mail del admin ya tiene cuenta, deshace la escuela completa", async () => {
    const raw = valid({ adminEmail: adminB.email });
    expect(await create(raw)).toEqual({ ok: false, error: "admin_email_in_use" });
    const { count } = await admin
      .from("school")
      .select("id", { count: "exact", head: true })
      .eq("slug", String(raw.slug));
    expect(count).toBe(0);
  });

  it("si falla la suscripción, deshace la escuela", async () => {
    const raw = valid();
    const failing = new Proxy(admin, {
      get(target, prop, receiver) {
        if (prop === "from") {
          return (table: string) =>
            table === "subscription"
              ? { insert: async () => ({ error: { message: "fallo simulado" } }) }
              : target.from(table);
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as SupabaseClient;

    expect(await createSchoolWithAdminInvitation(failing, raw, { actorId: adminA.id })).toEqual({
      ok: false,
      error: "failed",
    });
    const { count } = await admin
      .from("school")
      .select("id", { count: "exact", head: true })
      .eq("slug", String(raw.slug));
    expect(count).toBe(0);
  });

  it("aparece en el listado con su prueba y un admin pendiente", async () => {
    const result = await create(valid({ goalkeeperLimit: "12" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const summary = (await listSchools(admin)).find((s) => s.id === result.school.id);
    expect(summary).toMatchObject({
      slug: result.school.slug,
      status: "active",
      goalkeeperLimit: 12,
      admins: { active: 0, pending: 1 },
    });
    expect(summary?.trialUntil).toBeTruthy();
  });
});

describe("suspender y reactivar una escuela", () => {
  it("cambia el estado, es reversible y queda auditado", async () => {
    const school = await createSchool(admin, "inv-suspender");
    created.schoolIds.push(school.id);

    const off = await setSchoolSuspended(admin, {
      schoolId: school.id,
      suspended: true,
      actorId: adminA.id,
    });
    expect(off).toEqual({ ok: true, slug: school.slug });
    const { data: suspended } = await admin
      .from("school")
      .select("status, suspended_at")
      .eq("id", school.id)
      .single();
    expect(suspended?.status).toBe("suspended");
    expect(suspended?.suspended_at).not.toBeNull();

    await setSchoolSuspended(admin, { schoolId: school.id, suspended: false, actorId: adminA.id });
    const { data: active } = await admin
      .from("school")
      .select("status, suspended_at")
      .eq("id", school.id)
      .single();
    expect(active).toEqual({ status: "active", suspended_at: null });

    const { data: log } = await admin
      .from("audit_log")
      .select("action")
      .eq("school_id", school.id)
      .order("id");
    expect(log?.map((l) => l.action)).toEqual(["school.suspended", "school.reactivated"]);
  });

  it("es idempotente y falla con una escuela inexistente", async () => {
    const school = await createSchool(admin, "inv-idem");
    created.schoolIds.push(school.id);
    expect(
      (
        await setSchoolSuspended(admin, {
          schoolId: school.id,
          suspended: true,
          actorId: adminA.id,
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await setSchoolSuspended(admin, {
          schoolId: school.id,
          suspended: true,
          actorId: adminA.id,
        })
      ).ok,
    ).toBe(true);
    expect(
      await setSchoolSuspended(admin, {
        schoolId: randomUUID(),
        suspended: true,
        actorId: adminA.id,
      }),
    ).toEqual({
      ok: false,
      error: "not_found",
    });
  });
});

describe("equipo de la escuela", () => {
  it("lista a los miembros con su mail y sin mezclar escuelas", async () => {
    const team = await listTeam(admin, schoolA.id);
    expect(team.find((m) => m.userId === adminA.id)).toMatchObject({
      email: adminA.email,
      role: "school_admin",
      active: true,
    });
    expect(team.some((m) => m.userId === adminB.id)).toBe(false);
  });

  it("desactiva y reactiva a un profesor, y queda auditado", async () => {
    const coach = await createStaff(admin, schoolA, "coach", "inv-coach");
    created.userIds.push(coach.id);

    expect(
      await setStaffActive(admin, {
        schoolId: schoolA.id,
        actorId: adminA.id,
        userId: coach.id,
        active: false,
      }),
    ).toEqual({ ok: true });
    expect((await listTeam(admin, schoolA.id)).find((m) => m.userId === coach.id)?.active).toBe(
      false,
    );
    expect(
      await setStaffActive(admin, {
        schoolId: schoolA.id,
        actorId: adminA.id,
        userId: coach.id,
        active: true,
      }),
    ).toEqual({ ok: true });

    const { data: log } = await admin
      .from("audit_log")
      .select("action")
      .eq("entity_id", coach.id)
      .order("id");
    expect(log?.map((l) => l.action)).toEqual(["staff.deactivated", "staff.reactivated"]);
  });

  it("no actúa sobre cuentas de otra escuela ni sobre ids inexistentes", async () => {
    expect(
      await setStaffActive(admin, {
        schoolId: schoolA.id,
        actorId: adminA.id,
        userId: adminB.id,
        active: false,
      }),
    ).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(
      await setStaffActive(admin, {
        schoolId: schoolA.id,
        actorId: adminA.id,
        userId: randomUUID(),
        active: false,
      }),
    ).toEqual({
      ok: false,
      error: "not_found",
    });
    const { data } = await admin.from("profile").select("active").eq("user_id", adminB.id).single();
    expect(data?.active).toBe(true);
  });

  it("nadie puede desactivarse a sí mismo", async () => {
    expect(
      await setStaffActive(admin, {
        schoolId: schoolA.id,
        actorId: adminA.id,
        userId: adminA.id,
        active: false,
      }),
    ).toEqual({
      ok: false,
      error: "cannot_change_self",
    });
  });

  it("no deja a la escuela sin su último administrador activo", async () => {
    const school = await createSchool(admin, "inv-ultimo");
    created.schoolIds.push(school.id);
    const only = await createStaff(admin, school, "school_admin", "inv-ultimo-1");
    const other = await createStaff(admin, school, "school_admin", "inv-ultimo-2");
    created.userIds.push(only.id, other.id);

    // `other` desactiva a `only`: se puede, porque queda `other`.
    expect(
      await setStaffActive(admin, {
        schoolId: school.id,
        actorId: other.id,
        userId: only.id,
        active: false,
      }),
    ).toEqual({ ok: true });
    // Ahora `other` es el único activo: un tercero (el operador, con un id distinto) no puede desactivarlo.
    expect(
      await setStaffActive(admin, {
        schoolId: school.id,
        actorId: adminA.id,
        userId: other.id,
        active: false,
      }),
    ).toEqual({
      ok: false,
      error: "last_admin",
    });
  });
});
