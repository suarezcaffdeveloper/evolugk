import { expect, test, type Page } from "@playwright/test";
import {
  createGoalkeeperViaUi,
  createWorld,
  destroyWorld,
  loginStaff,
  type Credentials,
  type World,
} from "./helpers";

/**
 * Política de contenido (hito 7, docs/15-seguridad.md): la cabecera existe y cierra lo importante, y
 * las pantallas principales funcionan SIN que el navegador reporte ninguna violación. Si alguien
 * agrega un script, imagen o conexión a un origen nuevo, esta prueba avisa antes de que el
 * navegador lo bloquee en producción.
 */
let world: World;
let gk: string;

test.beforeAll(async ({ browser }) => {
  world = await createWorld("csp");
  const page = await browser.newPage();
  await loginStaff(page, world.school.slug, world.admin);
  gk = (
    (await createGoalkeeperViaUi(page, world.school.slug, { firstName: "Cespi" })) as Credentials
  ).goalkeeperId;
  await page.close();
});
test.afterAll(async () => destroyWorld(world));

async function violationsOn(page: Page, path: string) {
  await page.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener("securitypolicyviolation", (e) =>
      (window as unknown as { __csp: string[] }).__csp.push(
        `${e.effectiveDirective} ${e.blockedURI}`,
      ),
    );
  });
  await page.goto(path, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  return page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
}

test("la cabecera cierra orígenes, formularios, base, objetos e incrustación", async ({
  request,
}) => {
  const response = await request.get(`/${world.school.slug}`);
  const csp = response.headers()["content-security-policy"];
  expect(csp).toBeTruthy();
  for (const directive of [
    "default-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ]) {
    expect(csp, directive).toContain(directive);
  }
  expect(csp).toContain("https://*.mux.com");
  // Sin eval en producción (zod va sin JIT) y sin comodines que abran cualquier origen.
  expect(csp).not.toContain("unsafe-eval");
  expect(csp).not.toMatch(/(?:^|[ ;])\*(?:[ ;]|$)/);
});

test("el ingreso, el panel y el portal no generan violaciones", async ({ browser }) => {
  const slug = world.school.slug;
  for (const path of [`/${slug}`, `/${slug}/login`, "/privacidad"]) {
    const page = await browser.newPage();
    expect(await violationsOn(page, path), path).toEqual([]);
    await page.close();
  }
  const staff = await browser.newContext();
  const sp = await staff.newPage();
  await loginStaff(sp, slug, world.admin);
  for (const path of [
    `/${slug}/panel`,
    `/${slug}/panel/arqueros`,
    `/${slug}/panel/arqueros/nuevo`,
    `/${slug}/panel/arqueros/${gk}`,
    `/${slug}/panel/asistencia`,
    `/${slug}/panel/arqueros/${gk}/videos/nuevo`,
  ]) {
    expect(await violationsOn(sp, path), path).toEqual([]);
  }
  await staff.close();
});
