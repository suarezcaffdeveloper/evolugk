import { expect, test } from "@playwright/test";
import {
  createGoalkeeperViaUi,
  createWorld,
  destroyWorld,
  loginStaff,
  type World,
} from "./helpers";

/** El profesor ve las fichas y registra medidas, pero no da de alta, edita ni importa (spec 01, CA-08). */
let world: World;
let goalkeeperId: string;

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000);
  world = await createWorld("permisos");
  const context = await browser.newContext({ baseURL: "http://localhost:3000" });
  const page = await context.newPage();
  await loginStaff(page, world.school.slug, world.admin);
  ({ goalkeeperId } = await createGoalkeeperViaUi(page, world.school.slug, {
    firstName: "Fichada",
    lastName: "Permisos",
  }));
  await context.close();
});
test.afterAll(async () => {
  await destroyWorld(world);
});

test("el profesor ve la lista y la ficha, pero sin acciones de administración", async ({
  page,
}) => {
  const slug = world.school.slug;
  await loginStaff(page, slug, world.coach);

  await page.goto(`/${slug}/panel/arqueros`);
  await expect(page.getByRole("listitem").filter({ hasText: "Permisos, Fichada" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Nuevo arquero" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Importar" })).toHaveCount(0);

  await page.goto(`/${slug}/panel/arqueros/${goalkeeperId}`);
  await expect(page.getByRole("heading", { name: "Fichada Permisos" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Editar" })).toHaveCount(0);
});

test("el profesor no entra por URL a alta, edición, importación ni grupos", async ({ page }) => {
  const slug = world.school.slug;
  await loginStaff(page, slug, world.coach);

  for (const path of [
    `/panel/arqueros/nuevo`,
    `/panel/arqueros/importar`,
    `/panel/arqueros/${goalkeeperId}/editar`,
    `/panel/grupos`,
    `/panel/equipo`,
  ]) {
    await page.goto(`/${slug}${path}`);
    await expect(page).toHaveURL(new RegExp(`/${slug}/panel$`));
  }

  // La plantilla de importación tampoco se le entrega.
  const template = await page.request.get(`/${slug}/panel/arqueros/importar/plantilla`);
  expect(template.url()).toMatch(new RegExp(`/${slug}/panel$`));
});

test("el profesor sí registra altura y peso", async ({ page }) => {
  const slug = world.school.slug;
  await loginStaff(page, slug, world.coach);
  await page.goto(`/${slug}/panel/arqueros/${goalkeeperId}`);

  await page.locator("#heightCm").fill("151,5");
  await page.locator("#weightKg").fill("44");
  await page.getByRole("button", { name: "Registrar medida" }).click();
  await expect(page.getByText("Medida registrada.")).toBeVisible();
  await expect(page.getByRole("cell", { name: "151.5 cm" })).toBeVisible();
});

test("sin sesión, el panel lleva al ingreso del equipo", async ({ page }) => {
  const slug = world.school.slug;
  await page.goto(`/${slug}/panel/arqueros`);
  await expect(page).toHaveURL(new RegExp(`/${slug}/login$`));
});
