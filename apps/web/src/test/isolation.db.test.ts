/**
 * Aislamiento entre escuelas y permisos (spec 00: CA-01, CA-02 parcial, CA-06, CA-07, CA-08).
 * Corre contra el proyecto de desarrollo: `pnpm test:db`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  cleanup,
  createAdminClient,
  createAnonClient,
  createProfile,
  createSchool,
  createStaff,
  createUser,
  purgeLeftovers,
  signIn,
  type TestSchool,
  type TestUser,
} from "./db";

const TABLES = ["school", "profile", "invitation", "subscription", "audit_log"] as const;
const PERMISSION_DENIED = "42501";
const CHECK_VIOLATION = "23514";
const UNIQUE_VIOLATION = "23505";

const admin = createAdminClient();
const created = { schoolIds: [] as string[], userIds: [] as string[] };

let schoolA: TestSchool;
let schoolB: TestSchool;
let schoolC: TestSchool; // suspendida

let adminA: SupabaseClient;
let coachA: SupabaseClient;
let adminB: SupabaseClient;
let adminC: SupabaseClient;
let operator: SupabaseClient;
let noProfile: SupabaseClient;

let coachA2User: TestUser;
let coachA2: SupabaseClient;
let adminAUser: TestUser;
let coachAUser: TestUser;
let adminBUser: TestUser;

async function ids(client: SupabaseClient, table: string, column = "id"): Promise<string[]> {
  const { data, error } = await client.from(table).select(column);
  expect(error).toBeNull();
  return ((data ?? []) as unknown as Record<string, string>[]).map((row) => row[column]);
}

beforeAll(async () => {
  await purgeLeftovers(admin);

  schoolA = await createSchool(admin, "a");
  schoolB = await createSchool(admin, "b");
  schoolC = await createSchool(admin, "c");
  created.schoolIds.push(schoolA.id, schoolB.id, schoolC.id);

  adminAUser = await createStaff(admin, schoolA, "school_admin", "admin-a");
  coachAUser = await createStaff(admin, schoolA, "coach", "coach-a");
  coachA2User = await createStaff(admin, schoolA, "coach", "coach-a2");
  adminBUser = await createStaff(admin, schoolB, "school_admin", "admin-b");
  const coachBUser = await createStaff(admin, schoolB, "coach", "coach-b");
  const adminCUser = await createStaff(admin, schoolC, "school_admin", "admin-c");

  const operatorUser = await createUser(admin, "operator");
  await createProfile(admin, { userId: operatorUser.id, schoolId: null, role: "platform_admin" });
  const orphanUser = await createUser(admin, "sin-perfil");

  created.userIds.push(
    adminAUser.id,
    coachAUser.id,
    coachA2User.id,
    adminBUser.id,
    coachBUser.id,
    adminCUser.id,
    operatorUser.id,
    orphanUser.id,
  );

  // Datos en cada escuela para poder comprobar qué se ve y qué no.
  const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  for (const [school, email] of [
    [schoolA, "invitado-a@example.com"],
    [schoolB, "invitado-b@example.com"],
  ] as const) {
    const inv = await admin.from("invitation").insert({
      school_id: school.id,
      email,
      role: "coach",
      token_hash: randomUUID(),
      expires_at: expires,
    });
    expect(inv.error).toBeNull();
    const log = await admin
      .from("audit_log")
      .insert({ school_id: school.id, action: "prueba", entity: "school", entity_id: school.id });
    expect(log.error).toBeNull();
  }

  // La escuela C se suspende después de crear a su admin.
  const suspend = await admin
    .from("school")
    .update({ status: "suspended", suspended_at: new Date().toISOString() })
    .eq("id", schoolC.id);
  expect(suspend.error).toBeNull();

  [adminA, coachA, coachA2, adminB, adminC, operator, noProfile] = await Promise.all([
    signIn(adminAUser),
    signIn(coachAUser),
    signIn(coachA2User),
    signIn(adminBUser),
    signIn(adminCUser),
    signIn(operatorUser),
    signIn(orphanUser),
  ]);
});

afterAll(async () => {
  await cleanup(admin, created);
});

describe("sin sesión", () => {
  it.each(TABLES)("no puede leer %s", async (table) => {
    const { data, error } = await createAnonClient().from(table).select("*").limit(1);
    expect(error?.code).toBe(PERMISSION_DENIED);
    expect(data).toBeNull();
  });
});

describe("aislamiento entre escuelas (CA-01)", () => {
  it("el admin de A ve solo su escuela", async () => {
    expect(await ids(adminA, "school")).toEqual([schoolA.id]);
  });

  it("pedir por id una escuela ajena no devuelve nada ni da error", async () => {
    const { data, error } = await adminA.from("school").select("*").eq("id", schoolB.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("el admin de A ve solo los perfiles de A", async () => {
    const userIds = await ids(adminA, "profile", "user_id");
    expect(userIds.sort()).toEqual([adminAUser.id, coachAUser.id, coachA2User.id].sort());
    expect(userIds).not.toContain(adminBUser.id);
  });

  it("el profesor de A ve a sus compañeros de A y no a los de B", async () => {
    const userIds = await ids(coachA, "profile", "user_id");
    expect(userIds).toContain(adminAUser.id);
    expect(userIds).not.toContain(adminBUser.id);
  });

  it("el admin de A ve solo las invitaciones de A", async () => {
    const { data } = await adminA.from("invitation").select("school_id");
    expect(data?.length).toBe(1);
    expect(data?.every((row) => row.school_id === schoolA.id)).toBe(true);
  });

  it("el admin de A ve solo la auditoría de A", async () => {
    const { data } = await adminA.from("audit_log").select("school_id");
    expect(data?.length).toBeGreaterThan(0);
    expect(data?.every((row) => row.school_id === schoolA.id)).toBe(true);
  });

  it("el admin de B tampoco ve datos de A", async () => {
    expect(await ids(adminB, "school")).toEqual([schoolB.id]);
    const profiles = await ids(adminB, "profile", "user_id");
    expect(profiles).not.toContain(adminAUser.id);
  });
});

describe("permisos por rol (CA-02: el profesor no ve lo administrativo)", () => {
  it("el profesor no ve invitaciones, suscripción ni auditoría", async () => {
    for (const table of ["invitation", "subscription", "audit_log"] as const) {
      const { data, error } = await coachA.from(table).select("*");
      expect(error).toBeNull();
      expect(data).toEqual([]);
    }
  });

  it("el admin no ve la suscripción (precio y topes son del operador)", async () => {
    const { data, error } = await adminA.from("subscription").select("*");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("una cuenta sin perfil no ve nada", async () => {
    for (const table of ["school", "invitation", "subscription", "audit_log"] as const) {
      const { data, error } = await noProfile.from(table).select("*");
      expect(error).toBeNull();
      expect(data).toEqual([]);
    }
  });

  it("el operador ve todas las escuelas, perfiles y suscripciones", async () => {
    const schools = await ids(operator, "school");
    expect(schools).toEqual(expect.arrayContaining([schoolA.id, schoolB.id, schoolC.id]));
    const subs = await ids(operator, "subscription", "school_id");
    expect(subs).toEqual(expect.arrayContaining([schoolA.id, schoolB.id]));
    const profiles = await ids(operator, "profile", "user_id");
    expect(profiles).toEqual(expect.arrayContaining([adminAUser.id, adminBUser.id]));
  });
});

describe("los clientes no pueden escribir", () => {
  it("nadie puede insertar, modificar ni borrar desde el cliente", async () => {
    const attempts: Array<
      [string, SupabaseClient, () => PromiseLike<{ error: { code?: string } | null }>]
    > = [
      [
        "profesor inserta escuela",
        coachA,
        () => coachA.from("school").insert({ name: "Hack", slug: "hack-escuela" }),
      ],
      [
        "admin modifica su escuela",
        adminA,
        () => adminA.from("school").update({ name: "Otro" }).eq("id", schoolA.id),
      ],
      [
        "admin modifica otra escuela",
        adminA,
        () => adminA.from("school").update({ name: "Otro" }).eq("id", schoolB.id),
      ],
      [
        "admin borra un perfil",
        adminA,
        () => adminA.from("profile").delete().eq("user_id", coachAUser.id),
      ],
      [
        "profesor se asciende a admin",
        coachA,
        () => coachA.from("profile").update({ role: "school_admin" }).eq("user_id", coachAUser.id),
      ],
      [
        "profesor se cambia de escuela",
        coachA,
        () => coachA.from("profile").update({ school_id: schoolB.id }).eq("user_id", coachAUser.id),
      ],
      [
        "admin crea una invitación",
        adminA,
        () =>
          adminA
            .from("invitation")
            .insert({
              school_id: schoolA.id,
              email: "x@example.com",
              role: "coach",
              token_hash: randomUUID(),
              expires_at: new Date().toISOString(),
            }),
      ],
      [
        "profesor escribe auditoría",
        coachA,
        () => coachA.from("audit_log").insert({ school_id: schoolA.id, action: "x", entity: "x" }),
      ],
      [
        "operador modifica una suscripción",
        operator,
        () =>
          operator
            .from("subscription")
            .update({ monthly_price_ars: 1 })
            .eq("school_id", schoolA.id),
      ],
    ];

    for (const [label, , run] of attempts) {
      const { error } = await run();
      expect(error?.code, label).toBe(PERMISSION_DENIED);
    }

    // Y los datos siguen intactos.
    const { data: school } = await admin
      .from("school")
      .select("name")
      .eq("id", schoolA.id)
      .single();
    expect(school?.name).toBe("Escuela de prueba a");
    const { data: profile } = await admin
      .from("profile")
      .select("role, school_id")
      .eq("user_id", coachAUser.id)
      .single();
    expect(profile).toEqual({ role: "coach", school_id: schoolA.id });
  });
});

describe("profesor desactivado (CA-06)", () => {
  it("pierde el acceso al instante, sin esperar a que venza su sesión", async () => {
    // Con la sesión abierta, primero ve a sus compañeros.
    expect((await ids(coachA2, "profile", "user_id")).length).toBe(3);
    expect(await ids(coachA2, "school")).toEqual([schoolA.id]);

    const off = await admin.from("profile").update({ active: false }).eq("user_id", coachA2User.id);
    expect(off.error).toBeNull();

    // La misma sesión, sin volver a iniciar sesión, ya no ve nada de la escuela.
    expect(await ids(coachA2, "school")).toEqual([]);
    expect(await ids(coachA2, "profile", "user_id")).toEqual([coachA2User.id]);
  });
});

describe("escuela suspendida (spec 00, RN-09)", () => {
  it("su admin no ve ni la escuela ni a sus compañeros", async () => {
    expect(await ids(adminC, "school")).toEqual([]);
    expect(await ids(adminC, "invitation")).toEqual([]);
    const { data } = await adminC.from("profile").select("school_id");
    expect(data?.every((row) => row.school_id === schoolC.id)).toBe(true); // solo su propio perfil
    expect(data?.length).toBe(1);
  });

  it("al reactivarla recupera el acceso", async () => {
    await admin
      .from("school")
      .update({ status: "active", suspended_at: null })
      .eq("id", schoolC.id);
    expect(await ids(adminC, "school")).toEqual([schoolC.id]);
    await admin
      .from("school")
      .update({ status: "suspended", suspended_at: new Date().toISOString() })
      .eq("id", schoolC.id);
  });
});

describe("marca de la escuela para el login (CA-07)", () => {
  // La función solo la llama el servidor (clave secreta): no está expuesta a internet.
  const branding = (slug: string) => admin.rpc("get_school_branding", { p_slug: slug });

  it("no se puede llamar sin sesión ni con sesión de usuario", async () => {
    for (const client of [createAnonClient(), adminA, coachA, operator]) {
      const { data, error } = await client.rpc("get_school_branding", { p_slug: schoolA.slug });
      expect(error?.code).toBe(PERMISSION_DENIED);
      expect(data).toBeNull();
    }
  });

  it("el servidor obtiene la marca de una escuela activa", async () => {
    const { data, error } = await branding(schoolA.slug);
    expect(error).toBeNull();
    expect(data).toEqual([{ name: "Escuela de prueba a", logo_url: null, primary_color: null }]);
  });

  it("acepta mayúsculas y espacios en el slug", async () => {
    const { data } = await branding(`  ${schoolA.slug.toUpperCase()} `);
    expect(data?.length).toBe(1);
  });

  it.each([
    ["inexistente", "no-existe-esta-escuela"],
    ["vacío", ""],
  ])("devuelve vacío para un slug %s", async (_label, slug) => {
    const { data, error } = await branding(slug);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("devuelve lo mismo para una escuela suspendida que para una inexistente (RF-02)", async () => {
    const { data, error } = await branding(schoolC.slug);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("no expone nada más que nombre, logo y color", async () => {
    const { data } = await branding(schoolA.slug);
    expect(Object.keys(data?.[0] ?? {}).sort()).toEqual(["logo_url", "name", "primary_color"]);
  });
});

describe("reglas de la base de datos", () => {
  const baseSchool = { name: "Escuela de prueba reglas" };

  it.each([
    ["muy corto", "ab"],
    ["muy largo", "a".repeat(31)],
    ["con mayúsculas", "Mayuscula"],
    ["empieza con guion", "-empieza"],
    ["termina con guion", "termina-"],
    ["con guion bajo", "con_guion"],
    ["con espacio", "con espacio"],
    ["reservado: admin", "admin"],
    ["reservado: proto", "proto"],
    ["reservado: operador", "operador"],
  ])("rechaza un slug %s", async (_label, slug) => {
    const { error } = await admin.from("school").insert({ ...baseSchool, slug });
    expect(error?.code).toBe(CHECK_VIOLATION);
  });

  it("rechaza un slug repetido", async () => {
    const { error } = await admin.from("school").insert({ ...baseSchool, slug: schoolA.slug });
    expect(error?.code).toBe(UNIQUE_VIOLATION);
  });

  it("exige que suspended_at coincida con el estado", async () => {
    const { error } = await admin
      .from("school")
      .insert({
        ...baseSchool,
        slug: `test-iso-susp-${randomUUID().slice(0, 6)}`,
        status: "suspended",
      });
    expect(error?.code).toBe(CHECK_VIOLATION);
  });

  it("solo el operador puede no tener escuela, y los demás roles la necesitan", async () => {
    const u1 = await createUser(admin, "regla-1");
    const u2 = await createUser(admin, "regla-2");
    created.userIds.push(u1.id, u2.id);

    const operatorWithSchool = await createProfile(admin, {
      userId: u1.id,
      schoolId: schoolA.id,
      role: "platform_admin",
    });
    expect(operatorWithSchool.error?.code).toBe(CHECK_VIOLATION);

    const coachWithoutSchool = await createProfile(admin, {
      userId: u2.id,
      schoolId: null,
      role: "coach",
    });
    expect(coachWithoutSchool.error?.code).toBe(CHECK_VIOLATION);
  });

  it("una cuenta tiene un solo perfil: no puede pertenecer a dos escuelas (RF-12)", async () => {
    const { error } = await createProfile(admin, {
      userId: adminAUser.id,
      schoolId: schoolB.id,
      role: "coach",
    });
    expect(error?.code).toBe(UNIQUE_VIOLATION);
  });

  it("valida la suscripción", async () => {
    const school = await createSchool(admin, "sub");
    created.schoolIds.push(school.id);
    const negative = await admin
      .from("subscription")
      .update({ monthly_price_ars: -1 })
      .eq("school_id", school.id);
    expect(negative.error?.code).toBe(CHECK_VIOLATION);
    const zero = await admin
      .from("subscription")
      .update({ goalkeeper_limit: 0 })
      .eq("school_id", school.id);
    expect(zero.error?.code).toBe(CHECK_VIOLATION);
    const dup = await admin.from("subscription").insert({
      school_id: school.id,
      monthly_price_ars: 1,
      goalkeeper_limit: 1,
      video_minutes_limit: 1,
      covered_until: "2099-01-01",
    });
    expect(dup.error?.code).toBe(UNIQUE_VIOLATION); // una suscripción por escuela
  });

  describe("invitaciones", () => {
    const base = () => ({
      school_id: schoolA.id,
      role: "coach",
      token_hash: randomUUID(),
      expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    });

    it("solo permite una invitación abierta por escuela y mail; al revocar se puede reenviar", async () => {
      const email = `reenvio-${randomUUID().slice(0, 6)}@example.com`;
      const first = await admin
        .from("invitation")
        .insert({ ...base(), email })
        .select("id")
        .single();
      expect(first.error).toBeNull();

      const repeated = await admin.from("invitation").insert({ ...base(), email });
      expect(repeated.error?.code).toBe(UNIQUE_VIOLATION);

      await admin
        .from("invitation")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", first.data!.id);
      const resent = await admin.from("invitation").insert({ ...base(), email });
      expect(resent.error).toBeNull();
    });

    it("el mismo mail puede estar invitado en dos escuelas distintas", async () => {
      const email = `compartido-${randomUUID().slice(0, 6)}@example.com`;
      const a = await admin.from("invitation").insert({ ...base(), email });
      const b = await admin.from("invitation").insert({ ...base(), school_id: schoolB.id, email });
      expect(a.error).toBeNull();
      expect(b.error).toBeNull();
    });

    it("exige mail en minúsculas y con formato válido", async () => {
      for (const email of ["Mayus@Example.com", "sin-arroba.com", "dos@@example.com"]) {
        const { error } = await admin.from("invitation").insert({ ...base(), email });
        expect(error?.code, email).toBe(CHECK_VIOLATION);
      }
    });

    it("no se puede invitar con rol de operador", async () => {
      const { error } = await admin
        .from("invitation")
        .insert({ ...base(), role: "platform_admin", email: "operador@example.com" });
      expect(error?.code).toBe(CHECK_VIOLATION);
    });
  });

  describe("último administrador activo", () => {
    it("no se puede desactivar ni borrar al único admin; con un segundo sí", async () => {
      const school = await createSchool(admin, "ultimo");
      created.schoolIds.push(school.id);
      const first = await createStaff(admin, school, "school_admin", "ultimo-1");
      created.userIds.push(first.id);

      const deactivate = await admin
        .from("profile")
        .update({ active: false })
        .eq("user_id", first.id);
      expect(deactivate.error?.message).toMatch(/último administrador/);

      const demote = await admin.from("profile").update({ role: "coach" }).eq("user_id", first.id);
      expect(demote.error?.message).toMatch(/último administrador/);

      const remove = await admin.from("profile").delete().eq("user_id", first.id);
      expect(remove.error?.message).toMatch(/último administrador/);

      const second = await createStaff(admin, school, "school_admin", "ultimo-2");
      created.userIds.push(second.id);
      const ok = await admin.from("profile").update({ active: false }).eq("user_id", first.id);
      expect(ok.error).toBeNull();

      // Ahora el segundo es el único activo y queda protegido.
      const blocked = await admin
        .from("profile")
        .update({ active: false })
        .eq("user_id", second.id);
      expect(blocked.error?.message).toMatch(/último administrador/);
    });

    it("un profesor sí se puede desactivar libremente", async () => {
      const school = await createSchool(admin, "profe");
      created.schoolIds.push(school.id);
      const boss = await createStaff(admin, school, "school_admin", "profe-admin");
      const coach = await createStaff(admin, school, "coach", "profe-coach");
      created.userIds.push(boss.id, coach.id);
      const { error } = await admin
        .from("profile")
        .update({ active: false })
        .eq("user_id", coach.id);
      expect(error).toBeNull();
    });

    it("borrar la escuela borra a su único admin sin quedar bloqueada por la protección", async () => {
      const school = await createSchool(admin, "borrar");
      const only = await createStaff(admin, school, "school_admin", "borrar-1");
      created.userIds.push(only.id);
      const del = await admin.from("school").delete().eq("id", school.id);
      expect(del.error).toBeNull();
      const { data } = await admin.from("profile").select("user_id").eq("user_id", only.id);
      expect(data).toEqual([]);
    });
  });
});
