import { describe, expect, it } from "vitest";
import { decodeCsv, parseCsv, toCsv } from "./csv";
import {
  IMPORT_COLUMNS,
  MAX_IMPORT_ROWS,
  parseImportDate,
  phoneKey,
  readSheetRows,
  validateImportRow,
  type ImportKey,
  type RawImportRow,
} from "./goalkeeper-import";

const HEADERS = IMPORT_COLUMNS.map((c) => c.header);
const TODAY = "2026-10-21";
const groupsByName = new Map([["infantil", "g-1"]]);

function raw(overrides: Partial<Record<ImportKey, string>> = {}, line = 2): RawImportRow {
  const values = Object.fromEntries(IMPORT_COLUMNS.map((c) => [c.key, ""])) as Record<
    ImportKey,
    string
  >;
  Object.assign(values, {
    firstName: "Lucas",
    lastName: "Ríos",
    birthDate: "01/05/2012",
    joinedOn: "01/03/2024",
    guardianFirstName: "Laura",
    guardianLastName: "Ríos",
    guardianPhone: "11 5555-0000",
    ...overrides,
  });
  return { line, values };
}

describe("csv", () => {
  it("lee comillas, separadores y saltos de línea dentro de celdas", () => {
    const rows = parseCsv('a;b;c\r\n"x;1";"di ""hola""";"l1\nl2"\r\n');
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["x;1", 'di "hola"', "l1\nl2"],
    ]);
  });

  it("detecta coma y tabulación como separador", () => {
    expect(parseCsv("a,b\n1,2")[1]).toEqual(["1", "2"]);
    expect(parseCsv("a\tb\n1\t2")[1]).toEqual(["1", "2"]);
  });

  it("rechaza una codificación que no es UTF-8 y quita la marca BOM", () => {
    expect(decodeCsv(new Uint8Array([0x4a, 0x6f, 0x73, 0xe9]))).toEqual({ ok: false });
    const bom = new TextEncoder().encode("﻿Nombre");
    expect(decodeCsv(bom)).toEqual({ ok: true, text: "Nombre" });
  });

  it("escribe un CSV que Excel abre y neutraliza fórmulas", () => {
    const csv = toCsv([
      ["a", "=1+1"],
      ["x;y", 'q"r'],
    ]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("a;'=1+1");
    expect(csv).toContain('"x;y";"q""r"');
  });
});

describe("fechas", () => {
  it("acepta DD/MM/AAAA y AAAA-MM-DD y rechaza fechas inexistentes", () => {
    expect(parseImportDate("21/05/2012")).toBe("2012-05-21");
    expect(parseImportDate("1/5/2012")).toBe("2012-05-01");
    expect(parseImportDate("2012-05-21")).toBe("2012-05-21");
    expect(parseImportDate("31/02/2012")).toBeNull();
    expect(parseImportDate("21/05/12")).toBeNull();
    expect(parseImportDate("mañana")).toBeNull();
  });
});

describe("planilla", () => {
  const header = HEADERS;
  const row = ["Lucas", "Ríos", "01/05/2012", "01/03/2024", "Laura", "Ríos", "1155550000"];

  it("ordena las columnas por encabezado, sin importar el orden ni las tildes", () => {
    const result = readSheetRows([
      [
        "TUTOR TELEFONO",
        "apellido",
        "Nombre",
        "Fecha de Nacimiento",
        "ingreso",
        "tutor nombre",
        "Tutor: Apellido",
      ],
      [
        "1155550000",
        "Ríos",
        "Lucas",
        new Date(Date.UTC(2012, 4, 1)),
        "01/03/2024",
        "Laura",
        "Ríos",
      ],
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows[0].line).toBe(2);
    expect(result.rows[0].values).toMatchObject({
      firstName: "Lucas",
      birthDate: "2012-05-01",
      guardianPhone: "1155550000",
    });
  });

  it("rechaza el archivo si faltan columnas obligatorias", () => {
    const result = readSheetRows([
      ["Nombre", "Apellido"],
      ["Lucas", "Ríos"],
    ]);
    expect(result).toMatchObject({ ok: false });
    expect(!result.ok && result.message).toContain("Tutor: teléfono");
  });

  it("saltea filas vacías y numera según la planilla", () => {
    const result = readSheetRows([header, [], row, ["", ""], row]);
    expect(result.ok && result.rows.map((r) => r.line)).toEqual([3, 5]);
  });

  it("rechaza un archivo vacío, sin filas o con demasiadas", () => {
    expect(readSheetRows([])).toMatchObject({ ok: false });
    expect(readSheetRows([header])).toMatchObject({ ok: false });
    const many = [header, ...Array.from({ length: MAX_IMPORT_ROWS + 1 }, () => row)];
    const result = readSheetRows(many);
    expect(!result.ok && result.message).toContain(String(MAX_IMPORT_ROWS));
  });
});

describe("validación de filas", () => {
  const context = { today: TODAY, groupsByName };

  it("acepta una fila completa y la interpreta", () => {
    const result = validateImportRow(
      raw({
        level: "Intermedio",
        preferredFoot: "Izquierdo",
        relationship: "Madre",
        groups: "Infantil",
        guardianEmail: "Laura@Mail.com",
      }),
      context,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.row).toMatchObject({
      relationship: "mother",
      groupIds: ["g-1"],
      phoneKey: "1155550000",
      goalkeeper: { level: "intermediate", preferredFoot: "left", birthDate: "2012-05-01" },
      guardian: { email: "laura@mail.com" },
    });
  });

  it("usa tutor/a si no se indica el parentesco", () => {
    const result = validateImportRow(raw(), context);
    expect(result.ok && result.row.relationship).toBe("guardian");
  });

  it("junta todos los motivos de una fila", () => {
    const result = validateImportRow(
      raw({ firstName: "", birthDate: "31/02/2012", level: "experto", guardianPhone: "abc" }),
      context,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.length).toBeGreaterThanOrEqual(4);
    expect(result.reasons.join(" ")).toContain("fecha de nacimiento");
    expect(result.reasons.join(" ")).toContain("nivel");
    expect(result.reasons.join(" ")).toContain("Tutor:");
  });

  it("rechaza fechas futuras, ingreso anterior al nacimiento y grupos inexistentes", () => {
    expect(validateImportRow(raw({ birthDate: "01/01/2030" }), context).ok).toBe(false);
    expect(validateImportRow(raw({ joinedOn: "01/01/2010" }), context).ok).toBe(false);
    const missing = validateImportRow(raw({ groups: "Fantasma" }), context);
    expect(!missing.ok && missing.reasons[0]).toContain("Fantasma");
  });

  it("solo un mayor de 18 puede ser su propio tutor", () => {
    expect(validateImportRow(raw({ relationship: "el mismo" }), context).ok).toBe(false);
    expect(
      validateImportRow(raw({ relationship: "el mismo", birthDate: "01/01/2000" }), context).ok,
    ).toBe(true);
  });

  it("unifica teléfonos por sus dígitos", () => {
    expect(phoneKey("+54 (11) 5555-0000")).toBe("541155550000");
    expect(phoneKey("11 5555-0000")).toBe("1155550000");
  });
});
