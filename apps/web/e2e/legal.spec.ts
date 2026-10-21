import { expect, test } from "@playwright/test";
import { createWorld, destroyWorld, type World } from "./helpers";

/** Textos legales: se leen sin sesión y están enlazados desde el portal (spec 04, RF-07 y RF-31). */
let world: World;

test.beforeAll(async () => {
  world = await createWorld("legal");
});
test.afterAll(async () => {
  await destroyWorld(world);
});

test("la política de privacidad y los términos son públicos y navegables", async ({ page }) => {
  await page.goto("/privacidad");
  await expect(
    page.getByRole("heading", { name: "Política de privacidad", level: 1 }),
  ).toBeVisible();
  await expect(page.getByText("borrador y todavía está pendiente de revisión legal")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "6. Fotos y videos: el consentimiento" }),
  ).toBeVisible();

  // El índice lleva a cada sección.
  await page.getByRole("link", { name: "8. Cuánto tiempo guardamos los datos" }).click();
  await expect(page).toHaveURL(/#conservacion$/);

  await page.getByRole("link", { name: "Ver los términos y condiciones" }).click();
  await expect(page).toHaveURL(/\/terminos$/);
  await expect(
    page.getByRole("heading", { name: "Términos y condiciones", level: 1 }),
  ).toBeVisible();
});

test("el ingreso de familias enlaza a los dos textos", async ({ page }) => {
  await page.goto(`/${world.school.slug}`);
  await page.getByRole("link", { name: "Política de privacidad" }).click();
  await expect(page).toHaveURL(/\/privacidad$/);

  await page.goto(`/${world.school.slug}`);
  await page.getByRole("link", { name: "Términos y condiciones" }).click();
  await expect(page).toHaveURL(/\/terminos$/);
});
