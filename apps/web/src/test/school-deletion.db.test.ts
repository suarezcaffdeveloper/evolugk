/**
 * Borrado definitivo de una escuela (spec 00, RN-09): condiciones, qué se borra y qué se conserva,
 * tolerancia a fallas del proveedor de video y permisos. Corre contra desarrollo: `pnpm test:db`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import {
  SUSPENSION_RETENTION_DAYS,
  deleteSchoolPermanently,
  deletionEligibleOn,
} from "@/server/school-deletion";
import { retryProviderCleanup } from "@/server/videos";
import {
  cleanup,
  createAdminClient,
  createAnonClient,
  createSchool,
  createStaff,
  createUser,
  createProfile,
  purgeLeftovers,
  signIn,
  type TestSchool,
  type TestUser,
} from "./db";
import { FakeVideoProvider } from "./fake-video-provider";

const admin = createAdminClient();
const created = { schoolIds: [] as string[], userIds: [] as string[] };

let operator: TestUser;
const SUSPENDED_AT = new Date("2026-01-10T15:00:00Z");
const LONG_AFTER = new Date("2026-06-01T15:00:00Z"); // más de 90 días después

const must = <T>(result: { data: T; error: { message: string } | null }, what: string) => {
  if (result.error || result.data == null) {
    throw new Error(`No se pudo crear ${what}: ${result.error?.message}`);
  }
  return result.data as NonNullable<T>;
};

/** Escuela con equipo, un arquero, y un video ya procesado en el proveedor. */
async function schoolWithData(label: string, options: { suspend?: boolean } = {}) {
  const school: TestSchool = await createSchool(admin, label);
  created.schoolIds.push(school.id);
  const schoolAdmin = await createStaff(admin, school, "school_admin", `${label}-admin`);
  const coach = await createStaff(admin, school, "coach", `${label}-coach`);
  created.userIds.push(schoolAdmin.id, coach.id);

  const goalkeeperId = must(
    await admin
      .from("goalkeeper")
      .insert({
        school_id: school.id,
        first_name: label,
        last_name: "Borrado",
        birth_date: "2012-05-01",
        joined_on: "2024-03-01",
      })
      .select("id")
      .single(),
    "el arquero",
  ).id as string;
  const guardianId = must(
    await admin
      .from("guardian")
      .insert({
        school_id: school.id,
        first_name: "Tutor",
        last_name: label,
        phone: "1155551111",
        email: `${label}-${crypto.randomUUID().slice(0, 6)}@example.com`,
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
        school_id: school.id,
        goalkeeper_id: goalkeeperId,
        guardian_id: guardianId,
        relationship: "mother",
      })
      .select("guardian_id")
      .single(),
    "el vínculo",
  );
  must(
    await admin
      .from("consent")
      .insert({
        school_id: school.id,
        goalkeeper_id: goalkeeperId,
        guardian_id: guardianId,
        type: "media",
        text_version: "test",
      })
      .select("id")
      .single(),
    "el consentimiento",
  );
  const assetId = `asset_${crypto.randomUUID().slice(0, 8)}`;
  must(
    await admin
      .from("video")
      .insert({
        school_id: school.id,
        goalkeeper_id: goalkeeperId,
        title: "Atajada",
        topic: "reflexes",
        provider_asset_id: assetId,
        processing_status: "ready",
      })
      .select("id")
      .single(),
    "el video",
  );
  // Un pago de la escuela a la plataforma: tiene que sobrevivir al borrado.
  must(
    await admin
      .from("subscription_payment")
      .insert({
        school_id: school.id,
        paid_on: "2026-01-05",
        amount_ars: 15000,
        months_covered: 1,
        covered_before: "2026-01-01",
        covered_after: "2026-02-01",
      })
      .select("id")
      .single(),
    "el pago",
  );

  if (options.suspend !== false) {
    await admin
      .from("school")
      .update({ status: "suspended", suspended_at: SUSPENDED_AT.toISOString() })
      .eq("id", school.id);
  }
  return { school, schoolAdmin, coach, goalkeeperId, assetId };
}

const remove = (
  provider: FakeVideoProvider,
  fixture: { school: TestSchool },
  overrides: { confirmSlug?: string; now?: Date } = {},
) =>
  deleteSchoolPermanently(admin, provider, {
    schoolId: fixture.school.id,
    confirmSlug: overrides.confirmSlug ?? fixture.school.slug,
    actorId: operator.id,
    now: overrides.now ?? LONG_AFTER,
  });

const schoolExists = async (id: string) =>
  ((await admin.from("school").select("id").eq("id", id).maybeSingle()).data ?? null) !== null;
const userExists = async (id: string) =>
  (await admin.auth.admin.getUserById(id)).data.user !== null;

beforeAll(async () => {
  await purgeLeftovers(admin);
  operator = await createUser(admin, "del-operator");
  created.userIds.push(operator.id);
  const { error } = await createProfile(admin, {
    userId: operator.id,
    schoolId: null,
    role: "platform_admin",
  });
  if (error) throw new Error(`No se pudo crear el operador de prueba: ${error.message}`);
});

afterAll(async () => {
  await cleanup(admin, created);
});

describe("reglas de elegibilidad", () => {
  it("la fecha de elegibilidad es 90 días después de la suspensión, en hora de Argentina", () => {
    expect(SUSPENSION_RETENTION_DAYS).toBe(90);
    expect(deletionEligibleOn("2026-01-10T15:00:00Z")).toBe("2026-04-10");
    // 22:30 en Argentina del 31/01 ya es 01:30 UTC del 01/02: cuenta el día argentino.
    expect(deletionEligibleOn("2026-02-01T01:30:00Z")).toBe(addDays("2026-01-31", 90));
  });

  it("una escuela activa no se puede borrar", async () => {
    const f = await schoolWithData("del-activa", { suspend: false });
    const provider = new FakeVideoProvider();
    expect(await remove(provider, f)).toEqual({ ok: false, error: "not_suspended" });
    expect(await schoolExists(f.school.id)).toBe(true);
    expect(provider.deleted).toEqual([]);
  });

  it("antes de los 90 días se rechaza y dice desde cuándo", async () => {
    const f = await schoolWithData("del-pronto");
    const provider = new FakeVideoProvider();
    const justBefore = new Date("2026-04-09T15:00:00Z");
    expect(await remove(provider, f, { now: justBefore })).toEqual({
      ok: false,
      error: "too_early",
      eligibleOn: "2026-04-10",
    });
    expect(await schoolExists(f.school.id)).toBe(true);

    // El día 90 ya se puede (el borde es inclusivo).
    const exactly = new Date("2026-04-10T15:00:00Z");
    expect((await remove(provider, f, { now: exactly })).ok).toBe(true);
  });

  it("exige escribir el identificador de la escuela", async () => {
    const f = await schoolWithData("del-confirma");
    const provider = new FakeVideoProvider();
    expect(await remove(provider, f, { confirmSlug: "otra-cosa" })).toEqual({
      ok: false,
      error: "confirmation_mismatch",
    });
    expect(await remove(provider, f, { confirmSlug: "" })).toEqual({
      ok: false,
      error: "confirmation_mismatch",
    });
    expect(await schoolExists(f.school.id)).toBe(true);
    // Mayúsculas y espacios de más no importan: es lo que el operador escribió a mano.
    expect(
      (await remove(provider, f, { confirmSlug: `  ${f.school.slug.toUpperCase()} ` })).ok,
    ).toBe(true);
  });

  it("una escuela inexistente responde not_found", async () => {
    const provider = new FakeVideoProvider();
    const result = await deleteSchoolPermanently(admin, provider, {
      schoolId: crypto.randomUUID(),
      confirmSlug: "x",
      actorId: operator.id,
    });
    expect(result).toEqual({ ok: false, error: "not_found" });
  });
});

describe("el borrado", () => {
  it("borra los datos, las cuentas del equipo y los videos del proveedor; conserva lo que corresponde", async () => {
    const f = await schoolWithData("del-ok");
    const provider = new FakeVideoProvider();

    const result = await remove(provider, f);
    expect(result).toEqual({
      ok: true,
      slug: f.school.slug,
      goalkeepers: 1,
      videos: 1,
      pendingAtProvider: 0,
      usersNotDeleted: 0,
    });

    // Los datos de la escuela ya no existen (en cascada).
    expect(await schoolExists(f.school.id)).toBe(false);
    for (const table of ["goalkeeper", "guardian", "video", "consent", "profile", "subscription"]) {
      const { count } = await admin
        .from(table)
        .select("*", { count: "exact", head: true })
        .eq("school_id", f.school.id);
      expect(count, table).toBe(0);
    }

    // Las cuentas del equipo se borran de Auth; la del operador no se toca.
    expect(await userExists(f.schoolAdmin.id)).toBe(false);
    expect(await userExists(f.coach.id)).toBe(false);
    expect(await userExists(operator.id)).toBe(true);

    // El archivo se borró en el proveedor y la cola quedó vacía.
    expect(provider.deleted).toEqual([f.assetId]);
    const queue = await admin
      .from("video_provider_cleanup")
      .select("id")
      .eq("school_id", f.school.id);
    expect(queue.data).toEqual([]);

    // El pago a la plataforma se conserva: sigue contando como ingreso.
    const payments = await admin
      .from("subscription_payment")
      .select("amount_ars")
      .eq("school_id", f.school.id);
    expect(payments.data?.map((p) => Number(p.amount_ars))).toEqual([15000]);

    // Queda constancia, con el resumen, en la auditoría (que no depende de la escuela).
    const audit = await admin
      .from("audit_log")
      .select("actor_id, action, details")
      .eq("school_id", f.school.id)
      .eq("action", "school.deleted")
      .single();
    expect(audit.data?.actor_id).toBe(operator.id);
    expect(audit.data?.details).toMatchObject({
      slug: f.school.slug,
      goalkeepers: 1,
      videos: 1,
      users: 2,
      usersNotDeleted: 0,
      pendingAtProvider: 0,
    });
  });

  it("si el proveedor falla, la escuela se borra igual y el archivo queda en la cola para reintentar", async () => {
    const f = await schoolWithData("del-falla");
    const provider = new FakeVideoProvider();
    provider.failDeletes = true;

    const result = await remove(provider, f);
    expect(result).toMatchObject({ ok: true, videos: 1, pendingAtProvider: 1 });
    expect(await schoolExists(f.school.id)).toBe(false);
    expect(provider.deleted).toEqual([]);

    // El identificador no se perdió con la escuela: sigue en la cola.
    const queued = await admin
      .from("video_provider_cleanup")
      .select("asset_id, attempts")
      .eq("school_id", f.school.id);
    expect(queued.data?.map((row) => row.asset_id)).toEqual([f.assetId]);

    // Cuando el proveedor vuelve, la tarea de mantenimiento termina el trabajo.
    provider.failDeletes = false;
    await retryProviderCleanup(admin, provider, 500);
    expect(provider.deleted).toContain(f.assetId);
    const after = await admin
      .from("video_provider_cleanup")
      .select("id")
      .eq("school_id", f.school.id);
    expect(after.data).toEqual([]);
  });

  it("una subida que nunca terminó se cancela en el proveedor en vez de borrarse como archivo", async () => {
    const f = await schoolWithData("del-subida");
    await admin
      .from("video")
      .update({
        provider_asset_id: null,
        provider_upload_id: "up_pendiente",
        processing_status: "uploading",
      })
      .eq("school_id", f.school.id);
    const provider = new FakeVideoProvider();

    expect((await remove(provider, f)).ok).toBe(true);
    expect(provider.cancelled).toEqual(["up_pendiente"]);
    expect(provider.deleted).toEqual([]);
  });

  it("no toca a las demás escuelas", async () => {
    const target = await schoolWithData("del-aislada-a");
    const other = await schoolWithData("del-aislada-b", { suspend: false });
    const provider = new FakeVideoProvider();

    expect((await remove(provider, target)).ok).toBe(true);

    expect(await schoolExists(other.school.id)).toBe(true);
    expect(await userExists(other.schoolAdmin.id)).toBe(true);
    const gk = await admin.from("goalkeeper").select("id").eq("school_id", other.school.id);
    expect(gk.data).toHaveLength(1);
    const videos = await admin.from("video").select("id").eq("school_id", other.school.id);
    expect(videos.data).toHaveLength(1);
    expect(provider.deleted).not.toContain(other.assetId);
  });
});

describe("la función de la base", () => {
  it("es atómica: sobre una escuela activa falla y no encola nada para el proveedor", async () => {
    const f = await schoolWithData("del-atomica", { suspend: false });
    const { error } = await admin.rpc("delete_school_permanently", { p_school_id: f.school.id });
    expect(error?.message).toContain("school_not_suspended");

    expect(await schoolExists(f.school.id)).toBe(true);
    const queue = await admin
      .from("video_provider_cleanup")
      .select("id")
      .eq("school_id", f.school.id);
    expect(queue.data).toEqual([]);
  });

  it("solo el servidor puede llamarla: ni anónimos ni usuarios autenticados", async () => {
    const f = await schoolWithData("del-permisos");
    const anon = await createAnonClient().rpc("delete_school_permanently", {
      p_school_id: f.school.id,
    });
    expect(anon.error).not.toBeNull();

    const asAdmin = await signIn(f.schoolAdmin);
    const own = await asAdmin.rpc("delete_school_permanently", { p_school_id: f.school.id });
    expect(own.error).not.toBeNull();

    expect(await schoolExists(f.school.id)).toBe(true);
  });
});
