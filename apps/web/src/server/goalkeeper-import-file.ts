import "server-only";
import { readSheet } from "read-excel-file/node";
import writeXlsxFile from "write-excel-file/node";
import { decodeCsv, parseCsv, toCsv } from "@/lib/csv";
import {
  IMPORT_COLUMNS,
  MAX_IMPORT_BYTES,
  readSheetRows,
  type SheetResult,
} from "@/lib/goalkeeper-import";

/** Un .xlsx es un zip: empieza con "PK". Se mira el contenido y no solo la extensión. */
const isXlsx = (bytes: Uint8Array) => bytes[0] === 0x50 && bytes[1] === 0x4b;

/** Lee el archivo subido (.xlsx o .csv) y lo convierte en filas listas para validar (spec 01, RF-35). */
export async function readImportFile(file: File): Promise<SheetResult> {
  if (file.size === 0) return { ok: false, message: "El archivo está vacío." };
  if (file.size > MAX_IMPORT_BYTES) {
    return { ok: false, message: "El archivo pesa más de 1 MB. Dividilo en partes." };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const name = file.name.toLowerCase();

  if (isXlsx(bytes) || name.endsWith(".xlsx")) {
    if (!isXlsx(bytes)) return { ok: false, message: "El archivo no es un Excel (.xlsx) válido." };
    try {
      return readSheetRows(await readSheet(Buffer.from(bytes)));
    } catch {
      return {
        ok: false,
        message: "No pudimos leer el Excel. Revisá que no esté dañado ni protegido.",
      };
    }
  }

  if (name.endsWith(".csv") || name.endsWith(".txt")) {
    const decoded = decodeCsv(bytes);
    if (!decoded.ok) {
      return {
        ok: false,
        message:
          "El CSV no está en UTF-8, así que las tildes se verían mal. Guardalo como «CSV UTF-8» o subí la plantilla en Excel (.xlsx).",
      };
    }
    return readSheetRows(parseCsv(decoded.text));
  }

  return { ok: false, message: "El archivo tiene que ser un Excel (.xlsx) o un CSV." };
}

const HEADERS = IMPORT_COLUMNS.map((c) => c.header);

/** Plantilla en blanco: solo el encabezado, para que nadie importe filas de ejemplo por error. */
export async function buildTemplate(
  format: "xlsx" | "csv",
): Promise<{ body: Buffer; type: string }> {
  if (format === "csv") {
    return { body: Buffer.from(toCsv([HEADERS])), type: "text/csv; charset=utf-8" };
  }
  const buffer = await writeXlsxFile(
    [HEADERS.map((value) => ({ value, fontWeight: "bold" as const, type: String }))],
    {
      sheet: "Arqueros",
      columns: HEADERS.map((header) => ({ width: Math.max(16, header.length + 4) })),
    },
  ).toBuffer();
  return {
    body: buffer,
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
}
