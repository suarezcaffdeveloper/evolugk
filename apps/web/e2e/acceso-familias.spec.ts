import { devices, expect, test } from "@playwright/test";
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
 * Acceso de las familias (spec 00 y 04): bloqueo por intentos, aislamiento entre tutores, varios
 * hijos, sesiones y separación entre el portal y el panel.
 */
const MOTHER_PIN = "482916";
let world: World;
let mother: Credentials;
let stranger: Credentials;
let siblingId: string;

test.beforeAll(async ({ browser }) => {
  // Preparar la escuela y tres altas por la pantalla lleva más que una prueba normal.
  test.setTimeout(240_000);
  world = await createWorld("familias");
  const slug = world.school.slug;
  // Los datos se preparan por el panel, con un contexto propio para no mezclar cookies.
  const context = await browser.newContext({ baseURL: "http://localhost:3000" });
  const page = await context.newPage();
  await loginStaff(page, slug, world.admin);
  mother = (await createGoalkeeperViaUi(page, slug, {
    firstName: "Lucas",
    lastName: "Hermanos",
    guardianPhone: "11 5000-0001",
  })) as Credentials;
  const sibling = await createGoalkeeperViaUi(page, slug, {
    firstName: "Mateo",
    lastName: "Hermanos",
    existingGuardianCode: mother.code,
  });
  siblingId = sibling.goalkeeperId;
  stranger = (await createGoalkeeperViaUi(page, slug, {
    firstName: "Ajeno",
    lastName: "Otra familia",
    guardianPhone: "11 5000-0002",
  })) as Credentials;
  // La madre completa su primer ingreso una sola vez, para que cada prueba sea independiente.
  await context.clearCookies();
  await loginFamily(page, slug, mother.code, mother.pin);
  await completeFirstLogin(page, mother.pin, MOTHER_PIN, ["Lucas Hermanos", "Mateo Hermanos"]);
  await context.close();
});
test.afterAll(async () => {
  await destroyWorld(world);
});

test("un código inexistente y un PIN incorrecto dan el mismo mensaje", async ({ page }) => {
  const slug = world.school.slug;
  const error = page.locator("form p[role=alert]");
  await loginFamily(page, slug, "ABCDEFGH", "482916");
  await expect(error).toBeVisible();
  const unknownCode = await error.innerText();
  await loginFamily(page, slug, mother.code, "999111");
  await expect(error).toBeVisible();
  const wrongPin = await error.innerText();
  expect(wrongPin).toBe(unknownCode);
  expect(wrongPin).toContain("no son correctos");
});

test("tras 5 intentos fallidos el acceso se bloquea aunque el PIN sea el correcto", async ({
  page,
}) => {
  const slug = world.school.slug;
  const error = page.locator("form p[role=alert]");
  for (let i = 0; i < 5; i += 1) {
    await loginFamily(page, slug, stranger.code, "999111");
    await expect(error).toBeVisible();
  }
  await expect(error).toContainText("demasiados intentos");
  await loginFamily(page, slug, stranger.code, stranger.pin);
  await expect(error).toContainText("demasiados intentos");
  await expect(page).not.toHaveURL(/\/familia(\/|$)/);
});

test("con dos hijos: selector, datos de cada uno y último elegido recordado", async ({ page }) => {
  const slug = world.school.slug;
  await loginFamily(page, slug, mother.code, MOTHER_PIN);

  // Entra al primero (orden alfabético) y el selector ofrece a los dos.
  await expect(page.getByRole("heading", { name: "Lucas Hermanos" })).toBeVisible();
  const selector = page.getByRole("form", { name: "Elegir arquero" });
  await expect(selector.getByRole("button")).toHaveText(["Lucas", "Mateo"]);

  await selector.getByRole("button", { name: "Mateo" }).click();
  await expect(page.getByRole("heading", { name: "Mateo Hermanos" })).toBeVisible();
  // (Next conserva oculta la pantalla anterior: se verifica que ya no se vea, no que no exista.)
  await expect(page.getByRole("heading", { name: "Lucas Hermanos" })).toBeHidden();

  // Al volver a /familia recuerda al último elegido.
  await page.goto(`/${slug}/familia`);
  await expect(page).toHaveURL(new RegExp(`/familia/${siblingId}$`));
});

test("un tutor no puede abrir a un arquero que no es suyo", async ({ page }) => {
  const slug = world.school.slug;
  await loginFamily(page, slug, mother.code, MOTHER_PIN);
  await expect(page).toHaveURL(/familia\//);

  for (const path of [
    `/${slug}/familia/${stranger.goalkeeperId}`,
    `/${slug}/familia/${stranger.goalkeeperId}/privacidad`,
  ]) {
    await page.goto(path);
    await expect(page.getByText("No encontramos esta página")).toBeVisible();
  }
});

test("la sesión de familia no abre el panel del equipo", async ({ page }) => {
  const slug = world.school.slug;
  await loginFamily(page, slug, mother.code, MOTHER_PIN);
  await expect(page).toHaveURL(/familia\//);
  await page.goto(`/${slug}/panel/arqueros`);
  await expect(page).toHaveURL(new RegExp(`/${slug}/login$`));
});

test("cerrar sesión en todos los dispositivos cierra también el otro dispositivo", async ({
  page,
  browser,
}) => {
  const slug = world.school.slug;
  const other = await browser.newContext({
    ...devices["Desktop Chrome"],
    baseURL: "http://localhost:3000",
  });
  const otherPage = await other.newPage();

  await loginFamily(page, slug, mother.code, MOTHER_PIN);
  await loginFamily(otherPage, slug, mother.code, MOTHER_PIN);
  await expect(otherPage).toHaveURL(/familia\//);

  await page.getByRole("button", { name: "Cerrar sesión en todos mis dispositivos" }).click();
  await expect(page).toHaveURL(new RegExp(`/${slug}$`));

  // El otro dispositivo vuelve al ingreso al recargar (CA-11).
  await otherPage.goto(`/${slug}/familia`);
  await expect(otherPage.getByRole("heading", { name: "Ingreso de familias" })).toBeVisible();
  await other.close();
});

test("cerrar sesión solo en este dispositivo deja abierto el otro", async ({ page, browser }) => {
  const slug = world.school.slug;
  const other = await browser.newContext({
    ...devices["Desktop Chrome"],
    baseURL: "http://localhost:3000",
  });
  const otherPage = await other.newPage();

  await loginFamily(page, slug, mother.code, MOTHER_PIN);
  await loginFamily(otherPage, slug, mother.code, MOTHER_PIN);

  await page.getByRole("button", { name: "Cerrar sesión", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${slug}$`));

  await otherPage.goto(`/${slug}/familia`);
  await expect(otherPage).toHaveURL(/familia\//);
  await other.close();
});
