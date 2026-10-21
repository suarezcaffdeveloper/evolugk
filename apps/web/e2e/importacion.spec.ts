import { expect, test } from "@playwright/test";
import writeXlsxFile from "write-excel-file/node";
import { IMPORT_COLUMNS } from "../src/lib/goalkeeper-import";
import {
  completeFirstLogin,
  createWorld,
  destroyWorld,
  loginFamily,
  loginStaff,
  type World,
} from "./helpers";

/** Importación masiva por Excel/CSV (spec 01, RF-35 a RF-38). */
let world: World;

test.beforeAll(async () => {
  world = await createWorld("importar");
});
test.afterAll(async () => {
  await destroyWorld(world);
});

const HEADER = IMPORT_COLUMNS.map((c) => c.header).join(";");
const CSV = [
  HEADER,
  // Dos hermanos con el mismo tutor (mismo teléfono escrito distinto), una fecha imposible y un nivel inválido.
  "Tomás;Pérez;12/03/2013;01/03/2025;Marta;Pérez;11 5000-1111;;Madre;Inicial;;;;;;;;;",
  "Julián;Pérez;05/09/2015;01/03/2025;Marta;Pérez;(11) 5000 1111;;Madre;;;;;;;;;;",
  "Sofía;Díaz;31/02/2014;01/03/2025;Raúl;Díaz;11 5000-2222;;Padre;;;;;;;;;;",
  "Bruno;Gómez;10/10/2012;01/03/2025;Elena;Gómez;11 5000-3333;;Abuela;Experto;;;;;;;;;",
].join("\r\n");

test("la plantilla se descarga en Excel y en CSV", async ({ page }) => {
  const slug = world.school.slug;
  await loginStaff(page, slug, world.admin);

  const xlsx = await page.request.get(`/${slug}/panel/arqueros/importar/plantilla?formato=xlsx`);
  expect(xlsx.status()).toBe(200);
  const bytes = await xlsx.body();
  expect(bytes.subarray(0, 2).toString()).toBe("PK"); // un .xlsx es un zip

  const csv = await page.request.get(`/${slug}/panel/arqueros/importar/plantilla?formato=csv`);
  expect(csv.status()).toBe(200);
  const text = await csv.text();
  for (const column of IMPORT_COLUMNS) expect(text).toContain(column.header);
});

test("importa un CSV, reporta las filas fallidas y entrega los accesos", async ({ page }) => {
  const slug = world.school.slug;
  await loginStaff(page, slug, world.admin);
  await page.goto(`/${slug}/panel/arqueros/importar`);

  await page.locator("#file").setInputFiles({
    name: "arqueros.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(CSV, "utf8"),
  });
  await page.getByRole("button", { name: "Importar" }).click();

  await expect(page.getByText("Se importaron 2 de 4 filas")).toBeVisible();
  // Los dos hermanos comparten un solo tutor.
  await expect(page.getByText("Accesos de 1 tutor nuevo")).toBeVisible();
  await expect(page.getByText("Fila 4 · Sofía Díaz")).toBeVisible();
  await expect(page.getByText("fecha de nacimiento no es válida")).toBeVisible();
  await expect(page.getByText("Fila 5 · Bruno Gómez")).toBeVisible();
  await expect(page.getByText("El nivel tiene que ser")).toBeVisible();

  // Reporte de errores descargable.
  const [report] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Descargar reporte (CSV)" }).click(),
  ]);
  const reportText = (await streamToString(await report.createReadStream())).replace("﻿", "");
  expect(reportText).toContain("Fila;Arquero;Motivo");
  expect(reportText).toContain("Sofía Díaz");

  // Accesos descargables: con ellos el tutor ingresa y ve a sus dos hijos.
  const [access] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Descargar accesos (CSV)" }).click(),
  ]);
  const lines = (await streamToString(await access.createReadStream()))
    .replace("﻿", "")
    .trim()
    .split(/\r?\n/);
  expect(lines[0]).toBe("Tutor;Teléfono;Arqueros;Código de acceso;PIN inicial");
  const [, , goalkeepers, code, pin] = lines[1].split(";");
  expect(goalkeepers).toBe("Tomás Pérez / Julián Pérez");

  // Listado: los dos importados, con su nivel.
  await page.goto(`/${slug}/panel/arqueros`);
  await expect(page.getByRole("listitem").filter({ hasText: "Pérez, Tomás" })).toContainText(
    "Inicial",
  );
  await expect(page.getByRole("listitem").filter({ hasText: "Pérez, Julián" })).toBeVisible();
  await expect(page.getByText("Díaz, Sofía")).toHaveCount(0);

  // Volver a subir el mismo archivo no duplica a nadie.
  await page.goto(`/${slug}/panel/arqueros/importar`);
  await page.locator("#file").setInputFiles({
    name: "arqueros.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(CSV, "utf8"),
  });
  await page.getByRole("button", { name: "Importar" }).click();
  await expect(page.getByText("Se importaron 0 de 4 filas")).toBeVisible();
  await expect(page.getByText("Ya existe un arquero con el mismo nombre").first()).toBeVisible();

  // El tutor importado entra al portal con el código y el PIN descargados.
  await page.context().clearCookies();
  await loginFamily(page, slug, code, pin);
  await completeFirstLogin(page, pin, "482916", ["Tomás Pérez", "Julián Pérez"]);
  await expect(page.getByRole("form", { name: "Elegir arquero" }).getByRole("button")).toHaveText([
    "Julián",
    "Tomás",
  ]);
});

test("importa un archivo Excel (.xlsx)", async ({ page }) => {
  const slug = world.school.slug;
  const headers = IMPORT_COLUMNS.map((c) => c.header);
  const row = ["Camila", "Ríos", "03/04/2014", "01/03/2025", "Ana", "Ríos", "11 5000-4444"];
  // (las columnas opcionales que faltan al final se toman como vacías)
  const buffer = await writeXlsxFile([headers, row]).toBuffer();

  await loginStaff(page, slug, world.admin);
  await page.goto(`/${slug}/panel/arqueros/importar`);
  await page.locator("#file").setInputFiles({
    name: "arqueros.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer,
  });
  await page.getByRole("button", { name: "Importar" }).click();
  await expect(page.getByText("Se importaron 1 de 1 fila")).toBeVisible();
});

test("rechaza archivos con formato incorrecto con un mensaje claro", async ({ page }) => {
  const slug = world.school.slug;
  await loginStaff(page, slug, world.admin);
  await page.goto(`/${slug}/panel/arqueros/importar`);
  const upload = async (file: { name: string; mimeType: string; buffer: Buffer }) => {
    await page.locator("#file").setInputFiles(file);
    await page.getByRole("button", { name: "Importar" }).click();
  };

  // Sin las columnas obligatorias.
  await upload({
    name: "malo.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Nombre;Apellido\nA;B"),
  });
  await expect(page.getByText("Faltan columnas obligatorias")).toBeVisible();

  // CSV en otra codificación (Latin-1): las tildes se verían rotas.
  await upload({
    name: "latin1.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Nombre;Apellido\nJos\xe9;B", "latin1"),
  });
  await expect(page.getByText("no está en UTF-8")).toBeVisible();

  // Ni Excel ni CSV.
  await upload({ name: "foto.png", mimeType: "image/png", buffer: Buffer.from("no soy un csv") });
  await expect(page.getByText("tiene que ser un Excel (.xlsx) o un CSV")).toBeVisible();
});

async function streamToString(stream: NodeJS.ReadableStream | null): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream ?? []) chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks).toString("utf8");
}
