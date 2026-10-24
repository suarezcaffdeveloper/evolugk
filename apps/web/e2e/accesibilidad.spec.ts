import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { expect, test, type Page } from "@playwright/test";
import {
  completeFirstLogin,
  createGoalkeeperViaUi,
  createWorld,
  destroyWorld,
  loginFamily,
  loginStaff,
  type Credentials,
  type World,
} from "./helpers";

/**
 * Accesibilidad (hito 7, docs/17-accesibilidad.md): las pantallas clave no tienen violaciones de
 * axe-core (WCAG 2.1 A y AA) en modo claro ni oscuro, y todas ofrecen el enlace para saltar al
 * contenido. Es una red de seguridad: si un cambio de color o de estructura rompe el contraste o
 * la navegación, esta prueba lo avisa antes de llegar a las familias.
 *
 * Las pantallas están elegidas por tipo (ingreso, lista, formulario, ficha, portal): cubrir una de
 * cada tipo detecta los problemas de los componentes compartidos.
 */
const AXE = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");

let world: World;
let credentials: Credentials;
let staffState: string;
let familyState: string;

type Violation = { id: string; impact: string | null; nodes: string[] };

async function violations(page: Page): Promise<Violation[]> {
  await page.addScriptTag({ content: AXE });
  return page.evaluate(async () => {
    // @ts-expect-error axe se inyecta arriba
    const result = await window.axe.run(document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"],
      },
    });
    return result.violations.map(
      (v: { id: string; impact: string | null; nodes: { target: string[] }[] }) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => n.target.join(" ")),
      }),
    );
  });
}

test.beforeAll(async ({ browser }, testInfo) => {
  world = await createWorld("a11y");
  const slug = world.school.slug;
  staffState = testInfo.outputPath("staff.json");
  familyState = testInfo.outputPath("family.json");

  const staff = await browser.newContext();
  const page = await staff.newPage();
  await loginStaff(page, slug, world.admin);
  credentials = (await createGoalkeeperViaUi(page, slug, { firstName: "Accesi" })) as Credentials;
  await staff.storageState({ path: staffState });
  await staff.close();

  const family = await browser.newContext();
  const fp = await family.newPage();
  await loginFamily(fp, slug, credentials.code, credentials.pin);
  await completeFirstLogin(fp, credentials.pin);
  await family.storageState({ path: familyState });
  await family.close();
});

test.afterAll(async () => {
  await destroyWorld(world);
});

const SCREENS: {
  name: string;
  path: (s: string, gk: string) => string;
  who: "none" | "staff" | "family";
}[] = [
  { name: "ingreso de familias", path: (s) => `/${s}`, who: "none" },
  { name: "ingreso del equipo", path: (s) => `/${s}/login`, who: "none" },
  { name: "privacidad", path: () => "/privacidad", who: "none" },
  { name: "panel", path: (s) => `/${s}/panel`, who: "staff" },
  { name: "lista de arqueros", path: (s) => `/${s}/panel/arqueros`, who: "staff" },
  { name: "alta de arquero", path: (s) => `/${s}/panel/arqueros/nuevo`, who: "staff" },
  { name: "ficha del arquero", path: (s, g) => `/${s}/panel/arqueros/${g}`, who: "staff" },
  {
    name: "nueva evaluación",
    path: (s, g) => `/${s}/panel/arqueros/${g}/evaluaciones/nueva`,
    who: "staff",
  },
  { name: "asistencia", path: (s) => `/${s}/panel/asistencia`, who: "staff" },
  { name: "cuotas", path: (s) => `/${s}/panel/cuotas`, who: "staff" },
  { name: "Mi plan", path: (s) => `/${s}/panel/plan`, who: "staff" },
  { name: "portal: inicio", path: (s, g) => `/${s}/familia/${g}`, who: "family" },
  { name: "portal: asistencia", path: (s, g) => `/${s}/familia/${g}/asistencia`, who: "family" },
  { name: "portal: cuota", path: (s, g) => `/${s}/familia/${g}/cuotas`, who: "family" },
];

for (const theme of ["light", "dark"] as const) {
  test.describe(`modo ${theme === "light" ? "claro" : "oscuro"}`, () => {
    for (const screen of SCREENS) {
      test(`${screen.name}: sin violaciones y con enlace para saltar`, async ({ browser }) => {
        const storageState =
          screen.who === "staff" ? staffState : screen.who === "family" ? familyState : undefined;
        const context = await browser.newContext({ storageState });
        await context.addInitScript((t) => localStorage.setItem("evolugk-theme", t), theme);
        const page = await context.newPage();

        await page.goto(screen.path(world.school.slug, credentials.goalkeeperId), {
          waitUntil: "networkidle",
        });
        // El esqueleto de carga no es la pantalla: se espera al contenido real.
        await expect(page.locator("#contenido")).toBeVisible();
        await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
        await page.waitForTimeout(600); // termina la animación de entrada de las tarjetas

        const found = await violations(page);
        expect(found, JSON.stringify(found, null, 1)).toEqual([]);

        // El enlace para saltar es lo primero de la página (antes del encabezado) y lleva al contenido.
        const skip = page.locator("body > a").first();
        await expect(skip).toHaveText("Saltar al contenido");
        await expect(skip).toHaveAttribute("href", "#contenido");
        await expect(page.locator("main#contenido")).toHaveCount(1);

        await context.close();
      });
    }
  });
}
