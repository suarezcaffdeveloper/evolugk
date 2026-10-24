import { expect, test } from "@playwright/test";
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
 * App instalable (spec 04, RF-40): cada escuela publica su propio manifest con su nombre y sus
 * íconos, y una vez dentro se sugiere instalarla. En iPhone, que no tiene botón de instalar, se
 * explica el paso a mano; "Ahora no" se recuerda.
 */
let world: World;
let credentials: Credentials;

test.beforeAll(async ({ browser }) => {
  world = await createWorld("pwa");
  const page = await browser.newPage();
  await loginStaff(page, world.school.slug, world.admin);
  credentials = (await createGoalkeeperViaUi(page, world.school.slug, {
    firstName: "Instalín",
  })) as Credentials;
  await page.close();
});

test.afterAll(async () => {
  await destroyWorld(world);
});

test("la portada enlaza el manifest de su escuela, con su nombre y sus íconos", async ({
  page,
  request,
}) => {
  const slug = world.school.slug;
  await page.goto(`/${slug}`);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    `/${slug}/manifest.webmanifest`,
  );
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    "href",
    `/${slug}/icono/180.png`,
  );
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    "content",
    /^#[0-9a-f]{6}$/i,
  );

  const response = await request.get(`/${slug}/manifest.webmanifest`);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/manifest+json");
  const manifest = await response.json();
  expect(manifest).toMatchObject({
    name: "Escuela e2e pwa",
    scope: `/${slug}/`,
    display: "standalone",
  });
  expect(manifest.start_url).toMatch(new RegExp(`^/${slug}`));

  // Cada ícono declarado existe y es una imagen.
  for (const icon of manifest.icons as { src: string; type: string }[]) {
    const image = await request.get(icon.src);
    expect(image.status(), icon.src).toBe(200);
    expect(image.headers()["content-type"]).toBe(icon.type);
  }
});

test("una escuela que no existe no publica manifest ni íconos", async ({ request }) => {
  for (const path of ["no-existe-pwa/manifest.webmanifest", "no-existe-pwa/icono/192.png"]) {
    expect((await request.get(`/${path}`)).status(), path).toBe(404);
  }
  // Ni siquiera en una escuela real se genera un tamaño que no se declaró.
  expect((await request.get(`/${world.school.slug}/icono/64.png`)).status()).toBe(404);
});

test.describe("en un iPhone", () => {
  test.use({
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  });

  test("el portal explica cómo instalar, y 'Ahora no' se recuerda", async ({ page }) => {
    const slug = world.school.slug;
    await loginFamily(page, slug, credentials.code, credentials.pin);
    await completeFirstLogin(page, credentials.pin);
    await page.goto(`/${slug}/familia/${credentials.goalkeeperId}`);

    const hint = page.getByRole("region", { name: "Instalar la app" });
    await expect(hint).toBeVisible();
    await expect(hint).toContainText("Agregar a inicio");
    // En iPhone no hay botón de instalar: no se promete algo que no existe.
    await expect(hint.getByRole("button", { name: "Instalar", exact: true })).toHaveCount(0);

    await hint.getByRole("button", { name: "Ahora no" }).click();
    await expect(hint).toBeHidden();

    await page.reload();
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await expect(page.getByRole("region", { name: "Instalar la app" })).toHaveCount(0);
  });
});
