import { expect, test } from "@playwright/test";
import { addDays, argentinaDate } from "../src/lib/dates";
import {
  completeFirstLogin,
  createGoalkeeperViaUi,
  createWorld,
  db,
  destroyWorld,
  loginFamily,
  loginStaff,
  type Credentials,
  type World,
} from "./helpers";

/**
 * Flujo principal del hito 6: un arquero con una cuota vencida aparece en el panel de cuotas, la
 * administración la marca pagada con un toque y la familia ve el estado sin montos. El profesor no
 * puede abrir cuotas ni "Mi plan".
 */
let world: World;
const today = argentinaDate(new Date());

test.beforeAll(async () => {
  world = await createWorld("cuotas");
});

test.afterAll(async () => {
  await destroyWorld(world);
});

test("cuota vencida: panel, pago de un toque y portal de la familia", async ({ page }) => {
  await loginStaff(page, world.school.slug, world.admin);
  const credentials = (await createGoalkeeperViaUi(page, world.school.slug, {
    firstName: "Cuotín",
  })) as Credentials;

  // El alta crea el ciclo: la cuota del ciclo vigente ya figura pagada.
  await page.goto(`/${world.school.slug}/panel/arqueros/${credentials.goalkeeperId}/cuotas`);
  await expect(page.getByRole("heading", { name: "Cuotas", exact: true }).first()).toBeVisible();
  await expect(page.getByText("Pagada").first()).toBeVisible();

  // Se simula una cuota que quedó sin pagar hace más de 10 días.
  const { data: start } = await db
    .from("goalkeeper")
    .select("fees_start_on")
    .eq("id", credentials.goalkeeperId)
    .single();
  const dueOn = addDays(today, -20);
  const { data: highest } = await db
    .from("fee")
    .select("number")
    .eq("goalkeeper_id", credentials.goalkeeperId)
    .order("number", { ascending: false })
    .limit(1)
    .single();
  const { data: overdue } = await db
    .from("fee")
    .insert({
      school_id: world.school.id,
      goalkeeper_id: credentials.goalkeeperId,
      series_start_on: start?.fees_start_on,
      number: (highest?.number ?? 0) + 1,
      due_on: dueOn,
      grace_until: addDays(dueOn, 10),
    })
    .select("id")
    .single();

  await page.goto(`/${world.school.slug}/panel/cuotas`);
  const row = page.getByRole("listitem").filter({ hasText: "Prueba, Cuotín" }).first();
  await expect(row).toContainText("Vencida hace 10 días");
  await row.getByRole("button", { name: "Marcar pagada" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Prueba, Cuotín" })).toHaveCount(0);
  const { data: paid } = await db
    .from("fee")
    .select("status, paid_on")
    .eq("id", overdue?.id)
    .single();
  expect(paid).toEqual({ status: "paid", paid_on: today });

  // El resumen de cobranza cuenta el mes y la lista de deudores queda vacía.
  await page.goto(`/${world.school.slug}/panel/cuotas/resumen`);
  await expect(page.getByRole("heading", { name: "Quién debe" })).toBeVisible();
  await expect(page.getByText("Nadie tiene cuotas vencidas.")).toBeVisible();

  // La familia ve el estado y el historial, y ningún monto.
  await db.from("fee").update({ status: "open", paid_on: null }).eq("id", overdue?.id);
  const familyPage = await page.context().newPage();
  await loginFamily(familyPage, world.school.slug, credentials.code, credentials.pin);
  await completeFirstLogin(familyPage, credentials.pin);
  await familyPage.goto(`/${world.school.slug}/familia/${credentials.goalkeeperId}/cuotas`);
  await expect(familyPage.getByText("Vencida", { exact: true }).first()).toBeVisible();
  await expect(familyPage.getByText("Cuotas pagadas")).toBeVisible();
  expect(await familyPage.locator("body").innerText()).not.toMatch(/\$|ARS|pesos/);
});

test("el profesor no accede a cuotas ni a Mi plan", async ({ page }) => {
  await loginStaff(page, world.school.slug, world.coach);
  for (const path of ["cuotas", "cuotas/resumen", "plan"]) {
    await page.goto(`/${world.school.slug}/panel/${path}`);
    await expect(page).toHaveURL(new RegExp(`/${world.school.slug}/panel$`));
  }
  // Primero se espera a que el panel del profesor termine de cargar: comprobar una ausencia antes
  // pasaría vacío, con la pantalla todavía en su esqueleto. Los nombres son exactos porque el
  // saludo ("Hola, coach-cuotas") también contiene la palabra.
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Hola");
  await expect(page.getByRole("heading", { name: "Cuotas", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Mi plan", exact: true })).toHaveCount(0);
});

test("Mi plan muestra el uso y el vencimiento, sin precio ni pagos", async ({ page }) => {
  await loginStaff(page, world.school.slug, world.admin);
  await page.goto(`/${world.school.slug}/panel/plan`);
  await expect(page.getByRole("heading", { name: "Mi plan" })).toBeVisible();
  await expect(page.getByText("Arqueros activos")).toBeVisible();
  await expect(page.getByText("Minutos de video").first()).toBeVisible();
  const text = await page.locator("main").innerText();
  expect(text).not.toMatch(/\$|ARS|precio|pago/i);
});
