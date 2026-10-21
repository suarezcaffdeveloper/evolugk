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
 * Flujo principal del hito 3: el profesor carga una evaluación en borrador y la familia no la ve;
 * al publicarla la familia la ve (puntajes, "sin evaluar", indicador "nuevo"); con la segunda
 * evaluación aparece la evolución; las notas internas no llegan a la familia.
 */
let world: World;
let credentials: Credentials;
let newPin: string;

test.beforeAll(async () => {
  world = await createWorld("eval");
});
test.afterAll(async () => {
  await destroyWorld(world);
});

/** Puntúa una categoría con un toque en el botón de su número (los botones son radios ocultos). */
const score = (page: Page, category: string, value: number) =>
  page.getByLabel(`${category}: ${value}`).check({ force: true });

async function familyEntersPortal(page: Page, firstTime: boolean) {
  const slug = world.school.slug;
  await page.context().clearCookies();
  await loginFamily(page, slug, credentials.code, firstTime ? credentials.pin : newPin);
  if (firstTime) {
    newPin = await completeFirstLogin(page, credentials.pin, "482916", ["Valentina Suárez"]);
  }
  await expect(page).toHaveURL(new RegExp(`/familia/${credentials.goalkeeperId}$`));
}

test("evaluación en borrador, publicación, evolución y notas", async ({ page }) => {
  // Es un recorrido largo (cuatro ingresos distintos) y el servidor de desarrollo compila al vuelo.
  test.setTimeout(300_000);
  const slug = world.school.slug;
  const base = `/${slug}/panel/arqueros`;

  // La administración da de alta al arquero (hito 2); el resto lo hace el profesor.
  await loginStaff(page, slug, world.admin);
  credentials = (await createGoalkeeperViaUi(page, slug, {
    firstName: "Valentina",
    lastName: "Suárez",
  })) as Credentials;

  // 1) El profesor ve al arquero con evaluación pendiente y la carga en menos de un minuto.
  await page.context().clearCookies();
  await loginStaff(page, slug, world.coach);
  await expect(page.getByText("Evaluaciones pendientes")).toBeVisible();
  await expect(page.getByText("Suárez, Valentina")).toBeVisible();

  await page.goto(`${base}/${credentials.goalkeeperId}`);
  await expect(page.getByText("Evaluación pendiente")).toBeVisible();

  const started = Date.now();
  await page.getByRole("link", { name: "Nueva evaluación" }).click();
  // Es la primera evaluación: se sugiere la de ingreso.
  await expect(page.getByText("la cargamos como evaluación de ingreso")).toBeVisible();
  await expect(page.getByLabel("De ingreso", { exact: true })).toBeChecked();
  await score(page, "Atajada", 4);
  await score(page, "Reflejos", 8);
  await score(page, "Comunicación", 6);
  await page.getByRole("button", { name: "Guardar borrador" }).click();
  await expect(page).toHaveURL(/\/evaluaciones\/[0-9a-f-]{36}$/);
  expect(Date.now() - started).toBeLessThan(60_000);
  await expect(page.getByText("Borrador", { exact: true }).first()).toBeVisible();
  // Las categorías no puntuadas quedan "sin evaluar".
  await expect(page.getByText("Sin evaluar").first()).toBeVisible();
  const entryUrl = page.url();

  // Guardar sin puntuar nada se rechaza.
  await page.goto(`${base}/${credentials.goalkeeperId}/evaluaciones/nueva`);
  await page.getByRole("button", { name: "Guardar borrador" }).click();
  await expect(page.getByText("Puntuá al menos una categoría")).toBeVisible();
  // Y una segunda de ingreso no se ofrece (CA-05).
  await expect(page.getByLabel("De ingreso", { exact: true })).toBeDisabled();

  // 2) La familia no ve el borrador (CA-01).
  await familyEntersPortal(page, true);
  await page.getByRole("link", { name: "Evolución", exact: true }).click();
  await expect(page.getByText("Todavía no hay evaluaciones")).toBeVisible();

  // 3) El profesor publica.
  await page.context().clearCookies();
  await loginStaff(page, slug, world.coach);
  await page.goto(entryUrl);
  await page.getByRole("button", { name: "Publicar" }).click();
  await expect(page.getByText("Evaluación publicada: la familia ya puede verla.")).toBeVisible();
  // El tutor de este alta no tiene mail cargado: no hay aviso.
  await expect(page.getByText("Ningún tutor tiene mail cargado")).toBeVisible();

  // 4) La familia la ve, con el indicador "nuevo" (CA-02, CA-03 y CA-09).
  await familyEntersPortal(page, false);
  await expect(page.getByText("Hay 1 novedad para ver.")).toBeVisible();
  await page.getByRole("link", { name: "Evolución", exact: true }).click();
  await expect(
    page.getByRole("img", { name: /Gráfico radar.*Mentalidad: sin evaluar/ }),
  ).toBeVisible();
  // Con una sola evaluación: radar e historial, y un aviso de que la evolución llega con la próxima (CA-06).
  await expect(
    page.getByText("Con una sola evaluación todavía no se puede ver la evolución"),
  ).toBeVisible();
  await expect(page.getByText("Evolución por categoría")).toHaveCount(0);
  const historyItem = page.getByRole("link", { name: /Evaluación del/ });
  await expect(historyItem.getByText("Nuevo")).toBeVisible();

  await historyItem.click();
  await expect(page.getByText("8/10")).toBeVisible(); // Reflejos
  await expect(page.getByText("Sin evaluar").first()).toBeVisible();
  await page.getByRole("link", { name: "← Evolución" }).click();
  await expect(page.getByRole("link", { name: /Evaluación del/ }).getByText("Nuevo")).toHaveCount(
    0,
  );

  // 5) Una segunda evaluación (periódica) hace aparecer el comparativo y la línea de tiempo.
  await page.context().clearCookies();
  await loginStaff(page, slug, world.coach);
  await page.goto(`${base}/${credentials.goalkeeperId}/evaluaciones/nueva`);
  await expect(page.getByLabel("Periódica", { exact: true })).toBeChecked();
  await score(page, "Atajada", 7);
  await score(page, "Reflejos", 9);
  await page.getByRole("button", { name: "Publicar" }).click();
  await expect(page.getByText("Evaluación publicada: la familia ya puede verla.")).toBeVisible();

  // 6) Notas: una interna y una visible.
  await page.goto(`${base}/${credentials.goalkeeperId}`);
  await page.getByLabel("Nueva nota").fill("Llegó tarde al entrenamiento");
  await page.getByRole("button", { name: "Guardar nota" }).click();
  // Se espera a que la nota aparezca en la lista: aviso de "guardada" solo no alcanza.
  await expect(page.getByText("Llegó tarde al entrenamiento")).toBeVisible();
  await page.getByLabel("Nueva nota").fill("Muy buen trabajo con los centros");
  await page.getByLabel("Visible para la familia").check();
  await page.getByRole("button", { name: "Guardar nota" }).click();
  await expect(page.getByText("Muy buen trabajo con los centros")).toBeVisible();
  await expect(page.getByText("Interna", { exact: true })).toBeVisible();

  // 7) La familia ve la evolución completa y solo la nota visible (CA-04 y CA-10).
  await familyEntersPortal(page, false);
  await page.getByRole("link", { name: "Evolución", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ingreso vs. hoy" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Evolución por categoría" })).toBeVisible();
  await expect(page.getByText("Muy buen trabajo con los centros")).toBeVisible();
  await expect(page.getByText("Llegó tarde")).toHaveCount(0);
  await expect(page.getByRole("radio", { name: "Ingreso vs. hoy" })).toBeVisible();
});
