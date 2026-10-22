/**
 * Aislamiento entre escuelas de las tablas del hito 2 (arqueros, grupos, tutores, consentimiento
 * y sesiones de familia) y reglas de integridad. Corre contra desarrollo: `pnpm test:db`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateAccessCode } from "@/server/guardian/access-code";
import {
  cleanup,
  createAdminClient,
  createAnonClient,
  createSchool,
  createStaff,
  createUser,
  purgeLeftovers,
  signIn,
  type TestSchool,
} from "./db";

const PERMISSION_DENIED = "42501";
const FOREIGN_KEY_VIOLATION = "23503";
const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";

/** Tablas con school_id legibles por el staff de la escuela. */
const READABLE = [
  "groups",
  "goalkeeper",
  "goalkeeper_group",
  "goalkeeper_measurement",
  "guardian",
  "goalkeeper_guardian",
  "consent",
] as const;

const admin = createAdminClient();
const created = { schoolIds: [] as string[], userIds: [] as string[] };

type Seed = {
  school: TestSchool;
  groupId: string;
  goalkeeperId: string;
  guardianId: string;
  measurementId: string;
  consentId: string;
  accessCode: string;
};

let a: Seed;
let b: Seed;
let suspended: TestSchool;
let adminA: SupabaseClient;
let coachA: SupabaseClient;
let adminB: SupabaseClient;
let adminSuspended: SupabaseClient;
let noProfile: SupabaseClient;

function must<T>(
  result: { data: T; error: { message: string } | null },
  what: string,
): NonNullable<T> {
  if (result.error || result.data == null) {
    throw new Error(`No se pudo crear ${what}: ${result.error?.message}`);
  }
  return result.data as NonNullable<T>;
}

async function seedSchool(school: TestSchool, label: string): Promise<Seed> {
  const group = must(
    await admin
      .from("groups")
      .insert({ school_id: school.id, name: `Grupo ${label}` })
      .select("id")
      .single(),
    "el grupo",
  );
  const goalkeeper = must(
    await admin
      .from("goalkeeper")
      .insert({
        school_id: school.id,
        first_name: `Arquero${label}`,
        last_name: "Prueba",
        birth_date: "2012-05-01",
        joined_on: "2024-03-01",
        emergency_name: "Contacto",
        emergency_phone: "1111111111",
      })
      .select("id")
      .single(),
    "el arquero",
  );
  const accessCode = generateAccessCode();
  const guardian = must(
    await admin
      .from("guardian")
      .insert({
        school_id: school.id,
        first_name: `Tutor${label}`,
        last_name: "Prueba",
        phone: "1155551111",
        access_code: accessCode,
        pin_hash: "scrypt$secreto",
      })
      .select("id")
      .single(),
    "el tutor",
  );
  must(
    await admin
      .from("goalkeeper_group")
      .insert({ school_id: school.id, goalkeeper_id: goalkeeper.id, group_id: group.id })
      .select("goalkeeper_id")
      .single(),
    "la pertenencia al grupo",
  );
  must(
    await admin
      .from("goalkeeper_guardian")
      .insert({
        school_id: school.id,
        goalkeeper_id: goalkeeper.id,
        guardian_id: guardian.id,
        relationship: "mother",
      })
      .select("goalkeeper_id")
      .single(),
    "el vínculo",
  );
  const measurement = must(
    await admin
      .from("goalkeeper_measurement")
      .insert({
        school_id: school.id,
        goalkeeper_id: goalkeeper.id,
        date: "2025-01-10",
        height_cm: 150.5,
        weight_kg: 42,
      })
      .select("id")
      .single(),
    "la medida",
  );
  const consent = must(
    await admin
      .from("consent")
      .insert({
        school_id: school.id,
        goalkeeper_id: goalkeeper.id,
        guardian_id: guardian.id,
        text_version: "2026-10",
      })
      .select("id")
      .single(),
    "el consentimiento",
  );
  must(
    await admin
      .from("guardian_session")
      .insert({
        school_id: school.id,
        guardian_id: guardian.id,
        token_hash: `hash-${label}-${Date.now()}`,
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .select("id")
      .single(),
    "la sesión",
  );

  return {
    school,
    groupId: group.id,
    goalkeeperId: goalkeeper.id,
    guardianId: guardian.id,
    measurementId: measurement.id,
    consentId: consent.id,
    accessCode,
  };
}

async function schoolIds(client: SupabaseClient, table: string): Promise<string[]> {
  // guardian: columnas explícitas (no se puede pedir pin_hash ni usar select *).
  const { data, error } = await client.from(table).select("school_id");
  expect(error).toBeNull();
  return [...new Set((data ?? []).map((row) => row.school_id as string))];
}

beforeAll(async () => {
  await purgeLeftovers(admin);

  const schoolA = await createSchool(admin, "h2-a");
  const schoolB = await createSchool(admin, "h2-b");
  suspended = await createSchool(admin, "h2-s");
  created.schoolIds.push(schoolA.id, schoolB.id, suspended.id);

  const adminAUser = await createStaff(admin, schoolA, "school_admin", "h2-admin-a");
  const coachAUser = await createStaff(admin, schoolA, "coach", "h2-coach-a");
  const adminBUser = await createStaff(admin, schoolB, "school_admin", "h2-admin-b");
  const adminSUser = await createStaff(admin, suspended, "school_admin", "h2-admin-s");
  const orphan = await createUser(admin, "h2-sin-perfil");
  created.userIds.push(adminAUser.id, coachAUser.id, adminBUser.id, adminSUser.id, orphan.id);

  a = await seedSchool(schoolA, "A");
  b = await seedSchool(schoolB, "B");
  await seedSchool(suspended, "S");
  await admin
    .from("school")
    .update({ status: "suspended", suspended_at: new Date().toISOString() })
    .eq("id", suspended.id);

  [adminA, coachA, adminB, adminSuspended, noProfile] = await Promise.all([
    signIn(adminAUser),
    signIn(coachAUser),
    signIn(adminBUser),
    signIn(adminSUser),
    signIn(orphan),
  ]);
});

afterAll(async () => {
  await cleanup(admin, created);
});

describe("lectura por escuela", () => {
  it.each(READABLE)("%s: el admin y el profesor ven solo su escuela", async (table) => {
    expect(await schoolIds(adminA, table)).toEqual([a.school.id]);
    expect(await schoolIds(coachA, table)).toEqual([a.school.id]);
    expect(await schoolIds(adminB, table)).toEqual([b.school.id]);
  });

  it.each(READABLE)(
    "%s: sin sesión, sin perfil o con la escuela suspendida no se ve nada",
    async (table) => {
      for (const client of [createAnonClient(), noProfile, adminSuspended]) {
        const { data } = await client.from(table).select("school_id");
        expect(data ?? []).toEqual([]);
      }
    },
  );

  it("no se puede pedir una fila de otra escuela por id", async () => {
    const { data } = await adminA.from("goalkeeper").select("id").eq("id", b.goalkeeperId);
    expect(data).toEqual([]);
    const guardian = await adminA.from("guardian").select("id").eq("id", b.guardianId);
    expect(guardian.data).toEqual([]);
  });

  it("el staff ve el contacto de emergencia de su escuela (solo staff, spec 01 RF-06)", async () => {
    const { data } = await coachA
      .from("goalkeeper")
      .select("emergency_name, emergency_phone")
      .eq("id", a.goalkeeperId)
      .single();
    expect(data?.emergency_name).toBe("Contacto");
  });
});

describe("datos del tutor que el staff no puede leer", () => {
  it("el hash del PIN no se puede pedir", async () => {
    const { error } = await adminA.from("guardian").select("pin_hash").eq("id", a.guardianId);
    expect(error?.code).toBe(PERMISSION_DENIED);
  });

  it("select * sobre guardian está denegado", async () => {
    const { error } = await adminA.from("guardian").select("*");
    expect(error?.code).toBe(PERMISSION_DENIED);
  });

  it("el staff sí ve el código de acceso de sus tutores y no el de otra escuela", async () => {
    const own = await adminA.from("guardian").select("access_code").eq("id", a.guardianId).single();
    expect(own.data?.access_code).toBe(a.accessCode);
    const other = await adminA
      .from("guardian")
      .select("access_code")
      .eq("access_code", b.accessCode);
    expect(other.data).toEqual([]);
  });

  it("guardian_session no se puede leer desde internet", async () => {
    for (const client of [adminA, coachA, createAnonClient()]) {
      const { error } = await client.from("guardian_session").select("id");
      expect(error?.code).toBe(PERMISSION_DENIED);
    }
  });
});

describe("escritura solo por el servidor", () => {
  it.each([...READABLE, "guardian_session"])(
    "%s: el cliente no puede insertar, editar ni borrar",
    async (table) => {
      for (const client of [adminA, coachA]) {
        const insert = await client.from(table).insert({ school_id: a.school.id });
        expect(insert.error?.code).toBe(PERMISSION_DENIED);
        const update = await client
          .from(table)
          .update({ school_id: a.school.id })
          .eq("school_id", a.school.id);
        expect(update.error?.code).toBe(PERMISSION_DENIED);
        const del = await client.from(table).delete().eq("school_id", a.school.id);
        expect(del.error?.code).toBe(PERMISSION_DENIED);
      }
    },
  );
});

describe("integridad entre escuelas", () => {
  it("un vínculo no puede unir un arquero de una escuela con un tutor de otra", async () => {
    const { error } = await admin.from("goalkeeper_guardian").insert({
      school_id: a.school.id,
      goalkeeper_id: a.goalkeeperId,
      guardian_id: b.guardianId,
      relationship: "father",
    });
    expect(error?.code).toBe(FOREIGN_KEY_VIOLATION);
  });

  it("un arquero no puede estar en el grupo de otra escuela", async () => {
    const { error } = await admin
      .from("goalkeeper_group")
      .insert({ school_id: a.school.id, goalkeeper_id: a.goalkeeperId, group_id: b.groupId });
    expect(error?.code).toBe(FOREIGN_KEY_VIOLATION);
  });

  it("una medida, un consentimiento o una sesión no pueden colgar de otra escuela", async () => {
    const measurement = await admin.from("goalkeeper_measurement").insert({
      school_id: a.school.id,
      goalkeeper_id: b.goalkeeperId,
      date: "2025-02-01",
      height_cm: 150,
    });
    expect(measurement.error?.code).toBe(FOREIGN_KEY_VIOLATION);

    const consent = await admin.from("consent").insert({
      school_id: a.school.id,
      goalkeeper_id: b.goalkeeperId,
      guardian_id: a.guardianId,
      text_version: "x",
      type: "social",
    });
    expect(consent.error?.code).toBe(FOREIGN_KEY_VIOLATION);

    const session = await admin.from("guardian_session").insert({
      school_id: a.school.id,
      guardian_id: b.guardianId,
      token_hash: `cruzada-${Date.now()}`,
      expires_at: new Date(Date.now() + 1000).toISOString(),
    });
    expect(session.error?.code).toBe(FOREIGN_KEY_VIOLATION);
  });

  it("el código de acceso es único en toda la plataforma (RN-02)", async () => {
    const { error } = await admin.from("guardian").insert({
      school_id: b.school.id,
      first_name: "Otro",
      last_name: "Tutor",
      phone: "1155552222",
      access_code: a.accessCode,
    });
    expect(error?.code).toBe(UNIQUE_VIOLATION);
  });
});

describe("reglas de datos", () => {
  const base = (): Record<string, unknown> => ({
    school_id: a.school.id,
    first_name: "Nuevo",
    last_name: "Arquero",
    birth_date: "2012-05-01",
    joined_on: "2024-03-01",
  });

  it("rechaza una fecha de nacimiento futura", async () => {
    const { error } = await admin
      .from("goalkeeper")
      .insert({ ...base(), birth_date: "2999-01-01" });
    expect(error?.code).toBe(CHECK_VIOLATION);
  });

  it("rechaza un ingreso anterior al nacimiento", async () => {
    const { error } = await admin.from("goalkeeper").insert({ ...base(), joined_on: "2000-01-01" });
    expect(error?.code).toBe(CHECK_VIOLATION);
  });

  it("rechaza nivel, pie hábil y estado fuera de las listas", async () => {
    for (const patch of [{ level: "experto" }, { preferred_foot: "ambos" }, { status: "baja" }]) {
      const { error } = await admin.from("goalkeeper").insert({ ...base(), ...patch });
      expect(error?.code).toBe(CHECK_VIOLATION);
    }
  });

  it("una medida necesita al menos altura o peso", async () => {
    const { error } = await admin.from("goalkeeper_measurement").insert({
      school_id: a.school.id,
      goalkeeper_id: a.goalkeeperId,
      date: "2025-03-01",
    });
    expect(error?.code).toBe(CHECK_VIOLATION);
  });

  it("solo puede haber un consentimiento vigente por arquero y tipo", async () => {
    const { error } = await admin.from("consent").insert({
      school_id: a.school.id,
      goalkeeper_id: a.goalkeeperId,
      guardian_id: a.guardianId,
      text_version: "2026-10",
    });
    expect(error?.code).toBe(UNIQUE_VIOLATION);
  });

  it("retirado un consentimiento, se puede dar uno nuevo y se conserva el historial", async () => {
    await admin
      .from("consent")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", a.consentId);
    const again = await admin
      .from("consent")
      .insert({
        school_id: a.school.id,
        goalkeeper_id: a.goalkeeperId,
        guardian_id: a.guardianId,
        text_version: "2026-10",
      })
      .select("id")
      .single();
    expect(again.error).toBeNull();
    const { data } = await admin.from("consent").select("id").eq("goalkeeper_id", a.goalkeeperId);
    expect(data).toHaveLength(2);
  });

  it("un tutor necesita nombre, apellido y teléfono; el mail es opcional pero con formato", async () => {
    const guardian = {
      school_id: a.school.id,
      first_name: "Ana",
      last_name: "Gómez",
      phone: "1155553333",
      access_code: generateAccessCode(),
    };
    expect((await admin.from("guardian").insert({ ...guardian, phone: "" })).error?.code).toBe(
      CHECK_VIOLATION,
    );
    expect(
      (await admin.from("guardian").insert({ ...guardian, email: "no-es-mail" })).error?.code,
    ).toBe(CHECK_VIOLATION);
    expect((await admin.from("guardian").insert(guardian)).error).toBeNull();
  });

  it("dos grupos vigentes no pueden llamarse igual, pero uno archivado libera el nombre", async () => {
    const dup = await admin.from("groups").insert({ school_id: a.school.id, name: " grupo a " });
    expect(dup.error?.code).toBe(UNIQUE_VIOLATION);

    await admin.from("groups").update({ archived: true }).eq("id", a.groupId);
    const again = await admin.from("groups").insert({ school_id: a.school.id, name: "Grupo A" });
    expect(again.error).toBeNull();
  });

  it("borrar un arquero borra sus medidas, vínculos y consentimientos, y no toca al tutor", async () => {
    await admin.from("goalkeeper").delete().eq("id", a.goalkeeperId);
    for (const table of [
      "goalkeeper_measurement",
      "goalkeeper_guardian",
      "consent",
      "goalkeeper_group",
    ]) {
      const { data } = await admin
        .from(table)
        .select("school_id")
        .eq("goalkeeper_id", a.goalkeeperId);
      expect(data).toEqual([]);
    }
    const { data } = await admin.from("guardian").select("id").eq("id", a.guardianId);
    expect(data).toHaveLength(1);
  });
});
