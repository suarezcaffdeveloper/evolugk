import {
  ageOn,
  ADULT_AGE,
  goalkeeperSchema,
  guardianSchema,
  type GoalkeeperInput,
  type GuardianInput,
  type Relationship,
} from "./goalkeeper-schemas";

/**
 * Importación masiva de arqueros desde Excel/CSV (spec 01, RF-35 a RF-39). Este módulo es puro:
 * ordena las columnas, interpreta cada celda y valida cada fila. Guardar en la base es tarea de
 * `server/goalkeeper-import.ts`.
 */

/** Tope de filas por archivo (la spec 01 lo deja abierto; se define acá y se puede subir). */
export const MAX_IMPORT_ROWS = 500;
export const MAX_IMPORT_BYTES = 1024 * 1024;

export const IMPORT_COLUMNS = [
  { key: "firstName", header: "Nombre", required: true, aliases: [] },
  { key: "lastName", header: "Apellido", required: true, aliases: [] },
  { key: "birthDate", header: "Fecha de nacimiento", required: true, aliases: ["nacimiento"] },
  { key: "joinedOn", header: "Fecha de ingreso", required: true, aliases: ["ingreso"] },
  {
    key: "guardianFirstName",
    header: "Tutor: nombre",
    required: true,
    aliases: ["nombre del tutor", "nombre tutor"],
  },
  {
    key: "guardianLastName",
    header: "Tutor: apellido",
    required: true,
    aliases: ["apellido del tutor", "apellido tutor"],
  },
  {
    key: "guardianPhone",
    header: "Tutor: teléfono",
    required: true,
    aliases: ["telefono del tutor", "telefono tutor", "tutor celular"],
  },
  { key: "guardianEmail", header: "Tutor: mail", required: false, aliases: ["tutor email"] },
  { key: "relationship", header: "Parentesco", required: false, aliases: [] },
  { key: "level", header: "Nivel", required: false, aliases: [] },
  { key: "preferredFoot", header: "Pie hábil", required: false, aliases: ["pie"] },
  { key: "currentClub", header: "Club actual", required: false, aliases: ["club"] },
  { key: "category", header: "Categoría", required: false, aliases: [] },
  { key: "goal", header: "Objetivo", required: false, aliases: [] },
  { key: "groups", header: "Grupos", required: false, aliases: ["grupo"] },
  {
    key: "emergencyName",
    header: "Contacto de emergencia: nombre",
    required: false,
    aliases: ["emergencia nombre"],
  },
  {
    key: "emergencyPhone",
    header: "Contacto de emergencia: teléfono",
    required: false,
    aliases: ["emergencia telefono"],
  },
  {
    key: "emergencyRelationship",
    header: "Contacto de emergencia: parentesco",
    required: false,
    aliases: ["emergencia parentesco"],
  },
] as const;

export type ImportKey = (typeof IMPORT_COLUMNS)[number]["key"];
export type RawImportRow = { line: number; values: Record<ImportKey, string> };

/** "Tutor: teléfono" y "tutor telefono" son la misma columna. */
export function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const HEADER_TO_KEY = new Map<string, ImportKey>(
  IMPORT_COLUMNS.flatMap((c) =>
    [c.header, ...c.aliases].map((h) => [normalizeHeader(h), c.key] as const),
  ),
);

export type SheetResult = { ok: true; rows: RawImportRow[] } | { ok: false; message: string };

/** Una celda de Excel (texto, número, fecha) como texto. Las fechas se leen en UTC: son de calendario. */
export function cellToText(cell: unknown): string {
  if (cell === null || cell === undefined) return "";
  if (cell instanceof Date) {
    return Number.isNaN(cell.getTime()) ? "" : cell.toISOString().slice(0, 10);
  }
  return String(cell).trim();
}

/**
 * Convierte las filas de la planilla (la primera es el encabezado) en filas con nombre de columna.
 * Rechaza el archivo entero si faltan columnas obligatorias o si pasa el tope de filas.
 */
export function readSheetRows(table: unknown[][]): SheetResult {
  const headerIndex = table.findIndex((row) => row.some((c) => cellToText(c) !== ""));
  if (headerIndex === -1) return { ok: false, message: "El archivo está vacío." };

  const columns = table[headerIndex].map((c) => HEADER_TO_KEY.get(normalizeHeader(cellToText(c))));
  const missing = IMPORT_COLUMNS.filter((c) => c.required && !columns.includes(c.key));
  if (missing.length > 0) {
    return {
      ok: false,
      message: `Faltan columnas obligatorias: ${missing.map((c) => c.header).join(", ")}. Descargá la plantilla y usala tal cual.`,
    };
  }

  const rows: RawImportRow[] = [];
  for (let i = headerIndex + 1; i < table.length; i += 1) {
    const cells = table[i];
    if (cells.every((c) => cellToText(c) === "")) continue;
    const values = Object.fromEntries(IMPORT_COLUMNS.map((c) => [c.key, ""])) as Record<
      ImportKey,
      string
    >;
    columns.forEach((key, index) => {
      if (key && values[key] === "") values[key] = cellToText(cells[index]);
    });
    rows.push({ line: i + 1, values });
  }

  if (rows.length === 0) return { ok: false, message: "El archivo no tiene filas para importar." };
  if (rows.length > MAX_IMPORT_ROWS) {
    return {
      ok: false,
      message: `El archivo tiene ${rows.length} filas y el máximo es ${MAX_IMPORT_ROWS}. Dividilo en partes.`,
    };
  }
  return { ok: true, rows };
}

// ───────────────────────────── interpretación de celdas ─────────────────────────────

/** "21/05/2012", "2012-05-21" o "1/5/2012" → "2012-05-21"; null si no es una fecha real. */
export function parseImportDate(text: string): string | null {
  const value = text.trim();
  let y: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  const local = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(value);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (local) [d, m, y] = [Number(local[1]), Number(local[2]), Number(local[3])];
  else return null;

  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

/** Minúsculas y sin tildes, para comparar nombres de grupos, niveles y duplicados. */
export const fold = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

const RELATIONSHIPS: Record<string, Relationship> = {
  madre: "mother",
  mama: "mother",
  padre: "father",
  papa: "father",
  tutor: "guardian",
  tutora: "guardian",
  "tutor/a": "guardian",
  abuelo: "grandparent",
  abuela: "grandparent",
  "abuelo/a": "grandparent",
  otro: "other",
  otra: "other",
  "el mismo": "self",
  "ella misma": "self",
};
const LEVELS: Record<string, string> = {
  inicial: "beginner",
  intermedio: "intermediate",
  avanzado: "advanced",
};
const FEET: Record<string, string> = { derecho: "right", izquierdo: "left", ambos: "both" };

/** Clave para unificar tutores: solo los dígitos del teléfono (spec 01, RF-37). */
export function phoneKey(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** Clave de un arquero para detectar repetidos (mismo nombre, apellido y nacimiento, RF-34). */
export function goalkeeperKey(first: string, last: string, birthDate: string): string {
  return `${fold(first)}|${fold(last)}|${birthDate}`;
}

export type ValidRow = {
  line: number;
  goalkeeper: GoalkeeperInput;
  guardian: GuardianInput;
  relationship: Relationship;
  groupIds: string[];
  phoneKey: string;
  key: string;
};

export type RowResult = { ok: true; row: ValidRow } | { ok: false; reasons: string[] };

/**
 * Valida una fila: ficha, tutor y vínculo, con los mismos criterios que el alta manual. Junta todos
 * los motivos de la fila para que se corrijan de una vez. `groupsByName` trae los grupos vigentes
 * (clave en minúsculas y sin tildes).
 */
export function validateImportRow(
  raw: RawImportRow,
  context: { today: string; groupsByName: Map<string, string> },
): RowResult {
  const v = raw.values;
  const reasons: string[] = [];

  const birthDate = parseImportDate(v.birthDate);
  const joinedOn = parseImportDate(v.joinedOn);
  if (!birthDate) reasons.push("La fecha de nacimiento no es válida (usá DD/MM/AAAA).");
  if (!joinedOn) reasons.push("La fecha de ingreso no es válida (usá DD/MM/AAAA).");
  if (birthDate && birthDate > context.today) reasons.push("La fecha de nacimiento es futura.");
  if (joinedOn && joinedOn > context.today) reasons.push("La fecha de ingreso es futura.");

  let level: string | undefined;
  if (v.level) {
    level = LEVELS[fold(v.level)];
    if (!level) reasons.push("El nivel tiene que ser inicial, intermedio o avanzado.");
  }
  let foot: string | undefined;
  if (v.preferredFoot) {
    foot = FEET[fold(v.preferredFoot)];
    if (!foot) reasons.push("El pie hábil tiene que ser derecho, izquierdo o ambos.");
  }
  let relationship: Relationship = "guardian";
  if (v.relationship) {
    const found = RELATIONSHIPS[fold(v.relationship)];
    if (found) relationship = found;
    else
      reasons.push("El parentesco no es válido (madre, padre, tutor/a, abuelo/a, otro, el mismo).");
  }

  const groupIds: string[] = [];
  for (const name of v.groups
    .split(/[|;,]/)
    .map((g) => g.trim())
    .filter(Boolean)) {
    const id = context.groupsByName.get(fold(name));
    if (!id) reasons.push(`El grupo "${name}" no existe o está archivado.`);
    else if (!groupIds.includes(id)) groupIds.push(id);
  }

  const goalkeeper = goalkeeperSchema.safeParse({
    firstName: v.firstName,
    lastName: v.lastName,
    birthDate: birthDate ?? "",
    joinedOn: joinedOn ?? "",
    preferredFoot: foot ?? "",
    level: level ?? "",
    currentClub: v.currentClub,
    category: v.category,
    goal: v.goal,
    emergencyName: v.emergencyName,
    emergencyPhone: v.emergencyPhone,
    emergencyRelationship: v.emergencyRelationship,
  });
  const guardian = guardianSchema.safeParse({
    firstName: v.guardianFirstName,
    lastName: v.guardianLastName,
    phone: v.guardianPhone,
    email: v.guardianEmail,
  });

  // Las fechas ya tienen su propio mensaje; no se repite el genérico del esquema.
  const skip = (path: PropertyKey | undefined) =>
    (path === "birthDate" && !birthDate) || (path === "joinedOn" && !joinedOn);
  if (!goalkeeper.success) {
    for (const issue of goalkeeper.error.issues) {
      if (!skip(issue.path[0])) reasons.push(issue.message);
    }
  }
  if (!guardian.success) {
    for (const issue of guardian.error.issues) reasons.push(`Tutor: ${issue.message}`);
  }

  if (relationship === "self" && birthDate && ageOn(birthDate, context.today) < ADULT_AGE) {
    reasons.push("Solo un arquero mayor de 18 años puede ser su propio tutor.");
  }

  if (reasons.length > 0 || !goalkeeper.success || !guardian.success || !birthDate) {
    return { ok: false, reasons: [...new Set(reasons)] };
  }
  return {
    ok: true,
    row: {
      line: raw.line,
      goalkeeper: goalkeeper.data,
      guardian: guardian.data,
      relationship,
      groupIds,
      phoneKey: phoneKey(guardian.data.phone),
      key: goalkeeperKey(goalkeeper.data.firstName, goalkeeper.data.lastName, birthDate),
    },
  };
}
