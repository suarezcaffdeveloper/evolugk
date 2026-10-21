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
 * Flujo principal del hito 2: la administración da de alta a un arquero, el tutor entra por
 * primera vez (PIN y consentimiento), mira la ficha y retira el consentimiento, y la
 * administración lo ve reflejado.
 */
let world: World;

test.beforeAll(async () => {
  world = await createWorld("alta");
});
test.afterAll(async () => {
  await destroyWorld(world);
});

test("alta de arquero, primer ingreso del tutor, consentimiento y retiro", async ({
  page,
  context,
}) => {
  const slug = world.school.slug;

  // 1) La administración crea un grupo y da de alta al arquero en él.
  await loginStaff(page, slug, world.admin);
  await page.goto(`/${slug}/panel/grupos`);
  await page.locator("#name").fill("Infantil");
  await page.getByRole("button", { name: "Crear grupo" }).click();
  await expect(page.getByText("Infantil").first()).toBeVisible();

  const credentials = (await createGoalkeeperViaUi(page, slug, {
    firstName: "Valentina",
    lastName: "Suárez",
    groupNames: ["Infantil"],
  })) as Credentials;
  expect(credentials.code).toMatch(/^[A-Z0-9]{8}$/);
  expect(credentials.pin).toMatch(/^\d{6}$/);

  // La ficha del arquero queda con el consentimiento pendiente.
  await page.goto(`/${slug}/panel/arqueros`);
  const row = page.getByRole("listitem").filter({ hasText: "Suárez, Valentina" });
  await expect(row).toContainText("Consentimiento pendiente");

  // 2) El tutor entra (sin la sesión de la administración).
  await context.clearCookies();
  await loginFamily(page, slug, credentials.code, credentials.pin);

  // No puede llegar al portal sin cambiar el PIN (CA-01): primero el paso 1.
  await expect(page).toHaveURL(/primer-ingreso$/);
  await expect(page.getByText("Paso 1 de 2")).toBeVisible();
  await page.goto(`/${slug}/familia`);
  await expect(page).toHaveURL(/primer-ingreso$/);

  // Un PIN débil se rechaza con un mensaje claro.
  await page.getByLabel("PIN que te dio la escuela").fill(credentials.pin);
  await page.getByLabel("PIN nuevo", { exact: true }).fill("123456");
  await page.getByLabel("Repetí el PIN nuevo").fill("123456");
  await page.getByRole("button", { name: "Guardar y seguir" }).click();
  await expect(page.getByText("no puede ser una secuencia")).toBeVisible();

  // PIN válido y consentimiento aceptado.
  await completeFirstLogin(page, credentials.pin, "482916", ["Valentina Suárez"]);
  await expect(page).toHaveURL(new RegExp(`/familia/${credentials.goalkeeperId}$`));
  await expect(page.getByRole("heading", { name: "Valentina Suárez" })).toBeVisible();
  await expect(page.getByText("Infantil")).toBeVisible();
  // El contacto de emergencia no se muestra en el portal.
  await expect(page.getByText("emergencia", { exact: false })).toHaveCount(0);

  // 3) Privacidad: el consentimiento figura vigente y se puede retirar con confirmación.
  await page.getByRole("link", { name: "Privacidad", exact: true }).click();
  await expect(page.getByText("Vigente")).toBeVisible();
  await page.getByRole("button", { name: "Retirar el consentimiento" }).click();
  await expect(page.getByText("se ocultan al instante", { exact: false }).first()).toBeVisible();
  await page.getByRole("button", { name: "Sí, retirar el consentimiento" }).click();
  await expect(page.getByText("Retirado")).toBeVisible();

  // En el inicio aparece el aviso de que no se muestran videos ni fotos.
  await page.getByRole("link", { name: "Inicio" }).click();
  await expect(page.getByText("Retiraste el consentimiento")).toBeVisible();

  // 4) Volver a ingresar con el PIN nuevo funciona; con el inicial ya no.
  await context.clearCookies();
  await loginFamily(page, slug, credentials.code, credentials.pin);
  await expect(page.getByText("no son correctos")).toBeVisible();
  await loginFamily(page, slug, credentials.code, "482916");
  await expect(page).toHaveURL(new RegExp(`/familia/${credentials.goalkeeperId}$`));

  // 5) La administración ve el retiro en el listado.
  await context.clearCookies();
  await loginStaff(page, slug, world.admin);
  await page.goto(`/${slug}/panel/arqueros`);
  await expect(page.getByRole("listitem").filter({ hasText: "Suárez, Valentina" })).toContainText(
    "Consentimiento retirado",
  );
});
