import { expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  cleanup,
  createAdminClient,
  createProfile,
  type TestSchool,
  type TestUser,
} from "../src/test/db";

/** Una escuela de prueba con una administradora y un profesor, y cómo borrarla al terminar. */
export type World = {
  school: TestSchool;
  admin: TestUser;
  coach: TestUser;
  created: { schoolIds: string[]; userIds: string[] };
};

export const db = createAdminClient();

/**
 * Las escuelas y usuarios de los e2e llevan otro prefijo (`e2e-`) que el de las pruebas de base de
 * datos (`test-iso-`): así, si alguien corre `pnpm test:db` a la vez, su limpieza inicial no borra
 * la escuela de una corrida e2e en curso.
 */
const SLUG_PREFIX = "e2e-";
const EMAIL_PREFIX = "e2e-test-";
const unique = () => randomUUID().replace(/-/g, "").slice(0, 10);

async function createE2eUser(label: string, role: "school_admin" | "coach", school: TestSchool) {
  const email = `${EMAIL_PREFIX}${label}-${unique()}@example.com`;
  const password = `Aa1-${randomUUID()}`;
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`No se pudo crear el usuario: ${error?.message}`);
  const profile = await createProfile(db, {
    userId: data.user.id,
    schoolId: school.id,
    role,
    label,
  });
  if (profile.error) throw new Error(`No se pudo crear el perfil: ${profile.error.message}`);
  return { id: data.user.id, email, password };
}

export async function createWorld(label: string): Promise<World> {
  const slug = `${SLUG_PREFIX}${label}-${unique()}`.slice(0, 30);
  const { data, error } = await db
    .from("school")
    .insert({ name: `Escuela e2e ${label}`, slug })
    .select("id, slug")
    .single();
  if (error || !data) throw new Error(`No se pudo crear la escuela: ${error?.message}`);
  const school: TestSchool = data;
  const sub = await db.from("subscription").insert({
    school_id: school.id,
    monthly_price_ars: 10000,
    goalkeeper_limit: 50,
    video_minutes_limit: 600,
    trial_until: "2099-01-01",
    covered_until: "2099-01-01",
  });
  if (sub.error) throw new Error(`No se pudo crear la suscripción: ${sub.error.message}`);

  const admin = await createE2eUser(`admin-${label}`, "school_admin", school);
  const coach = await createE2eUser(`coach-${label}`, "coach", school);
  return {
    school,
    admin,
    coach,
    created: { schoolIds: [school.id], userIds: [admin.id, coach.id] },
  };
}

/** Borra los restos de corridas e2e anteriores que se hayan cortado (solo las propias). */
export async function purgeE2eLeftovers(): Promise<void> {
  const { data: schools } = await db.from("school").select("id").like("slug", `${SLUG_PREFIX}%`);
  const userIds: string[] = [];
  const { data } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
  for (const u of data?.users ?? []) if (u.email?.startsWith(EMAIL_PREFIX)) userIds.push(u.id);
  await cleanup(db, { schoolIds: (schools ?? []).map((x) => x.id as string), userIds });
}

export async function destroyWorld(world: World): Promise<void> {
  await cleanup(db, world.created);
}

/** Ingreso del equipo (administración o profesor) por la pantalla real. */
export async function loginStaff(page: Page, slug: string, user: TestUser): Promise<void> {
  await page.goto(`/${slug}/login`);
  await page.getByLabel("Mail").fill(user.email);
  await page.getByLabel("Contraseña").fill(user.password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(new RegExp(`/${slug}/panel$`));
}

export type Credentials = { goalkeeperId: string; code: string; pin: string };

/**
 * Da de alta un arquero con su tutor desde el panel de la administración (como lo haría una
 * persona) y devuelve el código y el PIN que muestra la pantalla. Hay que haber ingresado antes
 * como administración. Con `existingGuardianCode` vincula al arquero a un tutor que ya existe.
 */
export async function createGoalkeeperViaUi(
  page: Page,
  slug: string,
  input: {
    firstName: string;
    lastName?: string;
    guardianPhone?: string;
    existingGuardianCode?: string;
    groupNames?: string[];
  },
): Promise<Credentials | { goalkeeperId: string }> {
  let url = `/${slug}/panel/arqueros/nuevo`;
  if (input.existingGuardianCode) {
    const { data } = await db
      .from("guardian")
      .select("id")
      .eq("access_code", input.existingGuardianCode.replace(/-/g, ""))
      .single();
    url += `?tutor=${data?.id}`;
  }
  await page.goto(url);

  await page.locator("#firstName").fill(input.firstName);
  await page.locator("#lastName").fill(input.lastName ?? "Prueba");
  await page.locator("#birthDate").fill("2014-06-15");
  await page.locator("#joinedOn").fill("2025-03-01");
  if (!input.existingGuardianCode) {
    await page.locator("#guardianFirstName").fill("Laura");
    await page.locator("#guardianLastName").fill("Prueba");
    await page.locator("#guardianPhone").fill(input.guardianPhone ?? "11 5555-0000");
  }
  for (const group of input.groupNames ?? []) await page.getByLabel(group).check();
  await page.locator("#relationship").selectOption("mother");
  await page.getByRole("button", { name: "Dar de alta" }).click();

  // La pantalla de resultado muestra el código y el PIN una sola vez.
  const goalkeeperId = await page
    .getByRole("link", { name: "Ir a la ficha" })
    .getAttribute("href")
    .then((href) => href?.split("/").pop() ?? "");

  if (input.existingGuardianCode) return { goalkeeperId };
  const code = (
    await page
      .getByText("Código", { exact: true })
      .locator("xpath=following-sibling::dd")
      .innerText()
  ).replace("-", "");
  const pin = await page
    .getByText("PIN inicial", { exact: true })
    .locator("xpath=following-sibling::dd")
    .innerText();
  return { goalkeeperId, code, pin };
}

/** Ingreso de un tutor con código y PIN por la pantalla real de familias. */
export async function loginFamily(page: Page, slug: string, code: string, pin: string) {
  await page.goto(`/${slug}`);
  await page.getByLabel("Código de acceso").fill(code);
  await page.getByLabel("PIN", { exact: true }).fill(pin);
  // Se espera la respuesta de la acción: así los intentos seguidos son realmente secuenciales.
  const answered = page.waitForResponse(
    (r) => r.request().method() === "POST" && new URL(r.url()).pathname === `/${slug}`,
  );
  await page.getByRole("button", { name: "Ingresar" }).click();
  await answered;
}

/** Resuelve el primer ingreso: cambia el PIN y deja el consentimiento como esté (sin tildar). */
export async function completeFirstLogin(
  page: Page,
  currentPin: string,
  newPin = "482916",
  acceptFor: string[] = [],
): Promise<string> {
  await expect(page).toHaveURL(/primer-ingreso$/);
  await page.getByLabel("PIN que te dio la escuela").fill(currentPin);
  await page.getByLabel("PIN nuevo", { exact: true }).fill(newPin);
  await page.getByLabel("Repetí el PIN nuevo").fill(newPin);
  await page.getByRole("button", { name: "Guardar y seguir" }).click();

  await expect(
    page.getByRole("heading", { name: "Consentimiento de imagen y video" }),
  ).toBeVisible();
  for (const name of acceptFor) await page.getByLabel(name).check();
  await page.getByRole("button", { name: "Continuar" }).click();
  return newPin;
}
