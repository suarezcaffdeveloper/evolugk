/**
 * Importación masiva (spec 01: RF-35 a RF-38; CA-05 y CA-06; casos borde de unificación por
 * teléfono). Corre contra el proyecto de desarrollo: `pnpm test:db`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/csv";
import { IMPORT_COLUMNS, readSheetRows, type RawImportRow } from "@/lib/goalkeeper-import";
import { importGoalkeepers } from "@/server/goalkeeper-import";
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
let actorId: string;

const HEADER = IMPORT_COLUMNS.map((c) => c.header).join(";");

/** Una fila de CSV con los datos básicos; el resto de las columnas queda vacío. */
function csvRow(fields: {
  first: string;
  last?: string;
  birth?: string;
  joined?: string;
  gFirst?: string;
  gLast?: string;
  phone: string;
  extra?: Partial<Record<(typeof IMPORT_COLUMNS)[number]["key"], string>>;
}): string {
  const values: Record<string, string> = {
    firstName: fields.first,
    lastName: fields.last ?? "Importado",
    birthDate: fields.birth ?? "01/05/2012",
    joinedOn: fields.joined ?? "01/03/2024",
    guardianFirstName: fields.gFirst ?? "Tutor",
    guardianLastName: fields.gLast ?? "Importado",
    guardianPhone: fields.phone,
    ...fields.extra,
  };
  return IMPORT_COLUMNS.map((c) => values[c.key] ?? "").join(";");
}

function rowsFrom(lines: string[]): RawImportRow[] {
  const sheet = readSheetRows(parseCsv([HEADER, ...lines].join("\n")));
  if (!sheet.ok) throw new Error(sheet.message);
  return sheet.rows;
}

const run = (school: TestSchool, rows: RawImportRow[]) =>
  importGoalkeepers(admin, { schoolId: school.id, actorId, rows, today: TODAY });

async function countIn(table: string, target: TestSchool) {
  const { count } = await admin
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("school_id", target.id);
  return count ?? 0;
}

beforeAll(async () => {
  await purgeLeftovers(admin);
  school = await createSchool(admin, "imp-a");
  other = await createSchool(admin, "imp-b");
  created.schoolIds.push(school.id, other.id);
  const staff = await createStaff(admin, school, "school_admin", "imp-admin");
  created.userIds.push(staff.id);
  actorId = staff.id;
});

afterAll(async () => {
  await cleanup(admin, created);
});

describe("importación masiva", () => {
  it("100 filas con 5 errores: importa 95 y reporta las 5 con su motivo (CA-05)", async () => {
    const lines: string[] = [];
    for (let i = 1; i <= 100; i += 1) {
      // Cada arquero con su propio tutor (teléfono distinto).
      const phone = `11 ${String(4000 + i).padStart(4, "0")}-${String(1000 + i)}`;
      const bad = i % 20 === 0; // filas 20, 40, 60, 80 y 100
      lines.push(
        csvRow({
          first: `Masivo${i}`,
          phone,
          birth: bad ? "31/02/2012" : "01/05/2012",
        }),
      );
    }
    const report = await run(school, rowsFrom(lines));

    expect(report.total).toBe(100);
    expect(report.imported).toBe(95);
    expect(report.failed).toHaveLength(5);
    expect(report.failed.map((f) => f.line)).toEqual([21, 41, 61, 81, 101]);
    expect(report.failed[0].reasons[0]).toContain("fecha de nacimiento");
    expect(report.credentials).toHaveLength(95);
    expect(await countIn("goalkeeper", school)).toBe(95);

    // Los accesos generados sirven para ingresar.
    const credential = report.credentials[0];
    const login = await loginGuardian(admin, {
      slug: school.slug,
      code: credential.accessCode,
      pin: credential.pin,
    });
    expect(login.ok).toBe(true);
  }, 240_000);

  it("el mismo teléfono en dos filas crea un solo tutor vinculado a ambos (CA-06)", async () => {
    const report = await run(
      school,
      rowsFrom([
        csvRow({
          first: "Hermano1",
          last: "Gomez",
          gFirst: "Ana",
          gLast: "Gomez",
          phone: "11 6000-0001",
        }),
        csvRow({
          first: "Hermano2",
          last: "Gomez",
          gFirst: "Ana",
          gLast: "Gomez",
          phone: "(11) 6000 0001",
        }),
      ]),
    );
    expect(report.imported).toBe(2);
    expect(report.credentials).toHaveLength(1);
    expect(report.credentials[0].goalkeepers).toEqual(["Hermano1 Gomez", "Hermano2 Gomez"]);
    expect(report.warnings).toHaveLength(0);

    const { data } = await admin
      .from("goalkeeper_guardian")
      .select("goalkeeper_id")
      .eq("guardian_id", (await guardianIdByCode(report.credentials[0].accessCode)) ?? "");
    expect(data).toHaveLength(2);
  });

  it("mismo teléfono con distinto nombre: unifica y avisa en el reporte", async () => {
    const report = await run(
      school,
      rowsFrom([
        csvRow({ first: "Aviso1", gFirst: "Marta", gLast: "Sosa", phone: "11 6100-0001" }),
        csvRow({ first: "Aviso2", gFirst: "Jorge", gLast: "Sosa", phone: "11 6100-0001" }),
      ]),
    );
    expect(report.imported).toBe(2);
    expect(report.credentials).toHaveLength(1);
    expect(report.warnings).toHaveLength(1);
    expect(report.warnings[0].line).toBe(3);
    expect(report.warnings[0].message).toContain("Marta Sosa");
  });

  it("se vincula a un tutor que ya existía en la escuela, sin generar acceso nuevo", async () => {
    const first = await run(
      school,
      rowsFrom([csvRow({ first: "Previo", gFirst: "Rosa", gLast: "Paz", phone: "11 6200-0001" })]),
    );
    expect(first.credentials).toHaveLength(1);

    const second = await run(
      school,
      rowsFrom([
        csvRow({ first: "Posterior", gFirst: "Rosa", gLast: "Paz", phone: "11 6200 0001" }),
      ]),
    );
    expect(second.imported).toBe(1);
    expect(second.credentials).toHaveLength(0);
    expect(second.linkedToExistingGuardians).toBe(1);
  });

  it("volver a subir el mismo archivo no duplica arqueros", async () => {
    const lines = [csvRow({ first: "Repetido", phone: "11 6300-0001" })];
    expect((await run(school, rowsFrom(lines))).imported).toBe(1);
    const again = await run(school, rowsFrom(lines));
    expect(again.imported).toBe(0);
    expect(again.failed[0].reasons[0]).toContain("Ya existe");
  });

  it("un arquero repetido dentro del archivo se importa una sola vez", async () => {
    const report = await run(
      school,
      rowsFrom([
        csvRow({ first: "Doble", phone: "11 6400-0001" }),
        csvRow({ first: "Doble", phone: "11 6400-0002" }),
      ]),
    );
    expect(report.imported).toBe(1);
    expect(report.failed[0].line).toBe(3);
    expect(report.failed[0].reasons[0]).toContain("fila 2");
  });

  it("asigna grupos vigentes y rechaza los que no existen o están archivados", async () => {
    const { data: group } = await admin
      .from("groups")
      .insert({ school_id: school.id, name: "Infantil" })
      .select("id")
      .single();
    await admin.from("groups").insert({ school_id: school.id, name: "Viejo", archived: true });

    const report = await run(
      school,
      rowsFrom([
        csvRow({ first: "ConGrupo", phone: "11 6500-0001", extra: { groups: "infantil" } }),
        csvRow({ first: "GrupoViejo", phone: "11 6500-0002", extra: { groups: "Viejo" } }),
      ]),
    );
    expect(report.imported).toBe(1);
    expect(report.failed).toHaveLength(1);
    expect(report.failed[0].reasons[0]).toContain("Viejo");

    const { data: memberships } = await admin
      .from("goalkeeper_group")
      .select("group_id")
      .eq("school_id", school.id);
    expect(memberships?.map((m) => m.group_id)).toContain(group?.id);
  });

  it("no mezcla escuelas: los tutores y arqueros de otra escuela no cuentan", async () => {
    await run(
      other,
      rowsFrom([csvRow({ first: "Ajeno", gFirst: "Otro", gLast: "Tutor", phone: "11 6600-0001" })]),
    );
    const report = await run(
      school,
      rowsFrom([csvRow({ first: "Ajeno", gFirst: "Otro", gLast: "Tutor", phone: "11 6600-0001" })]),
    );
    // Mismo nombre y teléfono, pero en otra escuela: acá es un alta nueva con tutor nuevo.
    expect(report.imported).toBe(1);
    expect(report.credentials).toHaveLength(1);
  });

  it("deja una auditoría sin datos personales", async () => {
    const { data } = await admin
      .from("audit_log")
      .select("details")
      .eq("school_id", school.id)
      .eq("action", "goalkeeper.imported");
    expect((data ?? []).length).toBeGreaterThan(0);
    for (const entry of data ?? []) {
      expect(Object.keys(entry.details).sort()).toEqual(["failed", "imported", "total"]);
    }
  });
});

async function guardianIdByCode(code: string): Promise<string | null> {
  const { data } = await admin.from("guardian").select("id").eq("access_code", code).maybeSingle();
  return data?.id ?? null;
}
