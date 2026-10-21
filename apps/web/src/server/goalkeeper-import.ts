import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fold,
  goalkeeperKey,
  validateImportRow,
  type RawImportRow,
  type ValidRow,
} from "@/lib/goalkeeper-import";
import { createGoalkeeper, type CreateGoalkeeperResult } from "./goalkeepers";

type Db = SupabaseClient;

/** Cuántos tutores distintos se procesan a la vez: acelera sin saturar la base. */
const CONCURRENCY = 6;

export type ImportFailure = { line: number; name: string; reasons: string[] };
export type ImportWarning = { line: number; message: string };
export type ImportCredential = {
  guardianName: string;
  phone: string;
  goalkeepers: string[];
  accessCode: string;
  /** PIN inicial en claro. Se entrega una sola vez y no se guarda. */
  pin: string;
};

export type ImportReport = {
  total: number;
  imported: number;
  failed: ImportFailure[];
  warnings: ImportWarning[];
  /** Tutores nuevos con su código y PIN. */
  credentials: ImportCredential[];
  /** Arqueros vinculados a un tutor que ya existía en la escuela (no se genera acceso nuevo). */
  linkedToExistingGuardians: number;
};

const FAILURE_REASONS: Record<
  Exclude<Extract<CreateGoalkeeperResult, { ok: false }>["error"], "duplicate">,
  string
> = {
  no_guardian: "Falta el tutor.",
  future_date: "Hay una fecha futura.",
  self_requires_adult: "Solo un arquero mayor de 18 años puede ser su propio tutor.",
  invalid_group: "Uno de los grupos ya no está disponible.",
  invalid_guardian: "El tutor ya no existe.",
  failed: "No se pudo guardar la fila. Probá de nuevo.",
};

const fullName = (first: string, last: string) => `${first} ${last}`.trim();

/**
 * Importa arqueros con su tutor desde filas ya leídas (spec 01, RF-36 a RF-38). Cada fila se valida
 * con los mismos criterios que el alta manual; las válidas se guardan y las demás quedan en el
 * reporte con su motivo. Tutores con el mismo teléfono se unifican en uno solo (RF-37), también con
 * los que ya existían en la escuela. Un arquero igual a uno existente, o repetido en el archivo, no
 * se importa: así subir dos veces el mismo archivo no duplica nada.
 */
export async function importGoalkeepers(
  db: Db,
  input: { schoolId: string; actorId: string; rows: RawImportRow[]; today: string },
): Promise<ImportReport> {
  const { schoolId, actorId, rows, today } = input;

  const [{ data: groups }, { data: existing }, { data: guardians }] = await Promise.all([
    db.from("groups").select("id, name").eq("school_id", schoolId).eq("archived", false),
    db.from("goalkeeper").select("first_name, last_name, birth_date").eq("school_id", schoolId),
    db.from("guardian").select("id, first_name, last_name, phone").eq("school_id", schoolId),
  ]);

  const groupsByName = new Map((groups ?? []).map((g) => [fold(g.name), g.id as string]));
  const taken = new Map<string, number | null>(
    (existing ?? []).map((g) => [goalkeeperKey(g.first_name, g.last_name, g.birth_date), null]),
  );
  const existingGuardians = new Map<string, { id: string; name: string }>();
  for (const g of guardians ?? []) {
    const key = String(g.phone).replace(/\D/g, "");
    if (key && !existingGuardians.has(key)) {
      existingGuardians.set(key, { id: g.id, name: fullName(g.first_name, g.last_name) });
    }
  }

  const report: ImportReport = {
    total: rows.length,
    imported: 0,
    failed: [],
    warnings: [],
    credentials: [],
    linkedToExistingGuardians: 0,
  };

  // 1) Validación fila por fila, sin tocar la base.
  const valid: ValidRow[] = [];
  for (const raw of rows) {
    const name = fullName(raw.values.firstName, raw.values.lastName);
    const result = validateImportRow(raw, { today, groupsByName });
    if (!result.ok) {
      report.failed.push({ line: raw.line, name, reasons: result.reasons });
      continue;
    }
    if (taken.has(result.row.key)) {
      const first = taken.get(result.row.key);
      report.failed.push({
        line: raw.line,
        name,
        reasons: [
          first
            ? `Es el mismo arquero que la fila ${first} (mismo nombre y fecha de nacimiento).`
            : "Ya existe un arquero con el mismo nombre y fecha de nacimiento.",
        ],
      });
      continue;
    }
    taken.set(result.row.key, raw.line);
    valid.push(result.row);
  }

  // 2) Las filas con el mismo teléfono van en orden (la primera crea al tutor y las demás lo
  //    reutilizan); grupos de teléfonos distintos corren en paralelo.
  const chains = new Map<string, ValidRow[]>();
  for (const row of valid) chains.set(row.phoneKey, [...(chains.get(row.phoneKey) ?? []), row]);

  async function runChain(phone: string, chain: ValidRow[]) {
    let guardianId = existingGuardians.get(phone)?.id ?? null;
    let guardianName = existingGuardians.get(phone)?.name ?? null;
    let credential: ImportCredential | null = null;

    for (const row of chain) {
      const name = fullName(row.goalkeeper.firstName, row.goalkeeper.lastName);
      const rowGuardianName = fullName(row.guardian.firstName, row.guardian.lastName);
      const result = await createGoalkeeper(db, {
        schoolId,
        actorId,
        goalkeeper: row.goalkeeper,
        guardians: [
          guardianId
            ? { relationship: row.relationship, existingGuardianId: guardianId }
            : { relationship: row.relationship, data: row.guardian },
        ],
        groupIds: row.groupIds,
        today,
        confirmDuplicate: true,
      });

      if (!result.ok) {
        const reason =
          result.error === "duplicate" ? "Arquero repetido." : FAILURE_REASONS[result.error];
        report.failed.push({ line: row.line, name, reasons: [reason] });
        continue;
      }
      report.imported += 1;

      if (result.credentials.length > 0) {
        const created = result.credentials[0];
        guardianId = created.guardianId;
        guardianName = rowGuardianName;
        credential = {
          guardianName: created.name,
          phone: created.phone,
          goalkeepers: [name],
          accessCode: created.accessCode,
          pin: created.pin,
        };
        report.credentials.push(credential);
        continue;
      }

      // El tutor ya existía: o lo creó una fila anterior de este archivo o ya estaba en la escuela.
      if (credential) credential.goalkeepers.push(name);
      else report.linkedToExistingGuardians += 1;
      if (guardianName && fold(guardianName) !== fold(rowGuardianName)) {
        report.warnings.push({
          line: row.line,
          message: `El teléfono ya pertenece a ${guardianName}: se vinculó a ese tutor, aunque en la fila figura ${rowGuardianName}.`,
        });
      }
    }
  }

  const queue = [...chains.entries()];
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      for (let next = queue.shift(); next; next = queue.shift()) await runChain(...next);
    }),
  );

  report.failed.sort((a, b) => a.line - b.line);
  report.warnings.sort((a, b) => a.line - b.line);

  // Auditoría sin datos personales: solo el resultado (spec 01, sección 10).
  await db.from("audit_log").insert({
    school_id: schoolId,
    actor_id: actorId,
    action: "goalkeeper.imported",
    entity: "school",
    entity_id: schoolId,
    details: { total: report.total, imported: report.imported, failed: report.failed.length },
  });

  return report;
}
