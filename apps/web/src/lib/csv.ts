/** CSV mínimo para la importación y los reportes: comillas, separadores y saltos de línea dentro de celdas. */

export type DecodeResult = { ok: true; text: string } | { ok: false };

/**
 * Decodifica los bytes de un CSV como UTF-8 estricto. Un archivo en otra codificación (por ejemplo
 * el "CSV" que guarda Excel en Windows) se rechaza en lugar de mostrar tildes rotas (spec 01, casos borde).
 */
export function decodeCsv(bytes: Uint8Array): DecodeResult {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    // Quita la marca de orden de bytes que agrega Excel al guardar como "CSV UTF-8".
    return { ok: true, text: text.replace(/^﻿/, "") };
  } catch {
    return { ok: false };
  }
}

/** Elige el separador (`;`, `,` o tab) según cuál aparece más en la primera línea. Excel en español usa `;`. */
export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const counts = [";", ",", "\t"].map((d) => [d, firstLine.split(d).length - 1] as const);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ";";
}

/** Separa un CSV en filas de celdas (RFC 4180: `""` dentro de comillas es una comilla). */
export function parseCsv(text: string): string[][] {
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/**
 * Arma un CSV que Excel abre bien en español: separador `;` y marca UTF-8. Las celdas que empiezan
 * con `=`, `+`, `-` o `@` llevan un apóstrofe delante para que Excel no las ejecute como fórmulas.
 */
export function toCsv(rows: string[][]): string {
  const escape = (value: string) => {
    const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return /[";\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return `﻿${rows.map((row) => row.map(escape).join(";")).join("\r\n")}\r\n`;
}
