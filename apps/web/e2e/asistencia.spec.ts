import { expect, test, type Page } from "@playwright/test";
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
 * Flujos principales del hito 5. El primero recorre la toma de lista con conexión, los informes y
 * lo que ve la familia. El segundo prueba la toma de lista SIN conexión (service worker + marcas
 * guardadas en el celular + sincronización al volver): necesita la aplicación compilada
 * (`E2E_PROD=1`), porque el service worker solo se activa en producción.
 */
let world: World;
let credentials: Credentials;
let groupId: string;

const names = { mateo: "Mateo", luna: "Luna" };

async function seedGoalkeeper(firstName: string, inGroup: string | null) {
  const { data, error } = await db
    .from("goalkeeper")
    .insert({
      school_id: world.school.id,
      first_name: firstName,
      last_name: "Cancha",
      birth_date: "2013-04-02",
      joined_on: "2025-03-01",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`No se pudo crear al arquero: ${error?.message}`);
  if (inGroup) {
    await db
      .from("goalkeeper_group")
      .insert({ school_id: world.school.id, goalkeeper_id: data.id, group_id: inGroup });
  }
  return data.id as string;
}

async function entriesByName() {
  const { data } = await db
    .from("attendance_entry")
    .select("status, is_guest, reason, goalkeeper(first_name)")
    .eq("school_id", world.school.id);
  return Object.fromEntries(
    (data ?? []).map((e) => [
      (e.goalkeeper as unknown as { first_name: string }).first_name,
      {
        status: e.status as string,
        guest: e.is_guest as boolean,
        reason: e.reason as string | null,
      },
    ]),
  );
}

async function openAttendance(page: Page) {
  await page.goto(`/${world.school.slug}/panel/asistencia`);
  await expect(page.getByRole("heading", { name: "Asistencia", exact: true })).toBeVisible();
}

test.beforeAll(async () => {
  world = await createWorld("asistencia");
});
test.afterAll(async () => {
  await destroyWorld(world);
});

test("tomar lista con conexión, informes y lo que ve la familia", async ({ page }) => {
  test.setTimeout(300_000);
  const slug = world.school.slug;

  // La administración arma el grupo, da de alta a Valentina (con acceso para su familia) y suma arqueros.
  await loginStaff(page, slug, world.admin);
  await page.goto(`/${slug}/panel/grupos`);
  await page.locator("#name").fill("Infantil");
  await page.getByRole("button", { name: "Crear grupo" }).click();
  await expect(page.getByText("Infantil").first()).toBeVisible();
  credentials = (await createGoalkeeperViaUi(page, slug, {
    firstName: "Valentina",
    lastName: "Suárez",
    groupNames: ["Infantil"],
  })) as Credentials;

  const { data: group } = await db
    .from("groups")
    .select("id")
    .eq("school_id", world.school.id)
    .eq("name", "Infantil")
    .single();
  groupId = group!.id as string;
  await seedGoalkeeper(names.mateo, groupId);
  await seedGoalkeeper(names.luna, groupId);
  const { data: other } = await db
    .from("groups")
    .insert({ school_id: world.school.id, name: "Juvenil" })
    .select("id")
    .single();
  await seedGoalkeeper("Visitante", other!.id as string);

  // 1) El profesor toma lista: todos presentes, una ausente, una justificada con motivo y un invitado.
  await page.context().clearCookies();
  await loginStaff(page, slug, world.coach);
  await openAttendance(page);
  await expect(page.getByTestId("counts")).toContainText("3 sin marcar");
  await expect(page.getByText("Sin marcar", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Todos presentes" }).click();
  await expect(page.getByTestId("counts")).toContainText("3 presentes");

  const row = (name: string) =>
    page.getByRole("group", { name: new RegExp(`Asistencia de ${name}`) });
  await row(names.mateo).getByRole("button", { name: "Ausente" }).click();
  await row(names.luna).getByRole("button", { name: "Justificada" }).click();
  await page.getByLabel("Motivo (solo lo ve el equipo)").fill("Tenía examen");
  await page.getByLabel("Motivo (solo lo ve el equipo)").blur();
  await expect(page.getByTestId("counts")).toContainText(
    "1 presentes · 1 ausentes · 1 justificadas",
  );

  await page.getByRole("button", { name: "Agregar invitado" }).click();
  await page.getByLabel("Buscar un arquero de otro grupo").fill("Visit");
  await page.getByRole("button", { name: /Cancha, Visitante/ }).click();
  await expect(page.getByText("Invitado", { exact: true })).toBeVisible();
  await row("Visitante").getByRole("button", { name: "Presente" }).click();

  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByTestId("sync-status")).toContainText("Sincronizada");

  // Lo guardado en el servidor coincide con lo marcado (y el invitado no cambió de grupo, RN-05).
  await expect.poll(async () => (await entriesByName()).Visitante?.status).toBe("present");
  const saved = await entriesByName();
  expect(saved.Valentina.status).toBe("present");
  expect(saved.Mateo.status).toBe("absent");
  expect(saved.Luna).toMatchObject({ status: "excused", reason: "Tenía examen" });
  expect(saved.Visitante.guest).toBe(true);
  const { data: memberships } = await db
    .from("goalkeeper_group")
    .select("group_id")
    .eq("school_id", world.school.id)
    .eq(
      "goalkeeper_id",
      (await db.from("goalkeeper").select("id").eq("first_name", "Visitante").single()).data!.id,
    );
  expect(memberships?.map((m) => m.group_id)).not.toContain(groupId);

  // 2) Al volver a abrir, la sesión es la misma y conserva las marcas (CA-02): no se duplica.
  await openAttendance(page);
  await expect(page.getByTestId("counts")).toContainText(
    "2 presentes · 1 ausentes · 1 justificadas",
  );
  const { data: sessions } = await db
    .from("attendance_session")
    .select("id")
    .eq("school_id", world.school.id)
    .eq("group_id", groupId);
  expect(sessions).toHaveLength(1);

  // 3) Suspender la sesión (con motivo): no admite marcas y se refleja en la lista.
  await page.getByRole("link", { name: "Detalle y cambios" }).click();
  await expect(page.getByRole("heading", { name: /Infantil/ })).toBeVisible();
  await expect(page.getByText("Tenía examen")).toBeVisible();
  await page.getByRole("button", { name: "Suspender sesión" }).click();
  await expect(page.getByText("Escribí el motivo de la suspensión")).toBeVisible();
  await page.getByLabel("Motivo", { exact: true }).fill("Lluvia");
  await page.getByRole("button", { name: "Suspender sesión" }).click();
  await expect(page.getByText("Listo, la sesión quedó actualizada.")).toBeVisible();
  await openAttendance(page);
  await expect(page.getByText("Sesión suspendida: Lluvia")).toBeVisible();
  await expect(row(names.mateo).getByRole("button", { name: "Presente" })).toBeDisabled();

  // El registro de cambios muestra quién cambió qué.
  await page.getByRole("link", { name: "Detalle y cambios" }).click();
  await expect(page.getByText("Registro de cambios")).toBeVisible();
  await expect(page.getByText(/Sin marcar → Ausente/)).toBeVisible();
  // El profesor no puede borrar la sesión (CA-11).
  await expect(page.getByRole("button", { name: "Borrar sesión" })).toHaveCount(0);
  await page.getByRole("button", { name: "Reactivar sesión" }).click();
  await expect(page.getByText("Listo, la sesión quedó actualizada.")).toBeVisible();

  // 4) La ficha de Valentina muestra su asistencia y los informes, el resumen del grupo.
  await page.goto(`/${slug}/panel/arqueros/${credentials.goalkeeperId}`);
  await expect(page.getByRole("heading", { name: "Asistencia", exact: true })).toBeVisible();
  await expect(page.getByText("100%").first()).toBeVisible();

  await page.goto(`/${slug}/panel/asistencia/informes`);
  await expect(page.getByRole("heading", { name: /Informes de asistencia/ })).toBeVisible();
  const infantil = page.getByRole("row", { name: /Infantil/ });
  await expect(infantil).toContainText("1");
  await expect(infantil).toContainText("67%"); // 2 presentes de 3 (la justificada no cuenta)

  // El admin sí puede borrar la sesión.
  await page.context().clearCookies();
  await loginStaff(page, slug, world.admin);
  const { data: session } = await db
    .from("attendance_session")
    .select("id")
    .eq("school_id", world.school.id)
    .single();
  await page.goto(`/${slug}/panel/asistencia/sesion/${session!.id}`);
  await expect(page.getByRole("button", { name: "Borrar sesión" })).toBeVisible();

  // 5) La familia ve el porcentaje y el calendario, sin el motivo ni el nombre del grupo.
  await page.context().clearCookies();
  await loginFamily(page, slug, credentials.code, credentials.pin);
  await completeFirstLogin(page, credentials.pin, "482916", ["Valentina Suárez"]);
  await expect(page.getByRole("heading", { name: "Asistencia" })).toBeVisible();
  await page.getByRole("link", { name: "Asistencia", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Asistencia de Valentina" })).toBeVisible();
  await expect(page.getByText("100%").first()).toBeVisible();
  await expect(page.getByText("Asistió a 1 de 1 entrenamientos")).toBeVisible();
  await expect(page.getByText(": Presente").first()).toBeAttached();
  await expect(page.getByText("Tenía examen")).toHaveCount(0);
  await expect(page.getByText("Lluvia")).toHaveCount(0);
});

test("tomar lista sin conexión y sincronizar al volver", async ({ page, context }) => {
  test.skip(
    !process.env.E2E_PROD,
    "El modo sin conexión necesita la aplicación compilada (E2E_PROD=1).",
  );
  test.setTimeout(300_000);
  const slug = world.school.slug;

  // Este flujo arma sus propios datos (si el anterior falló, el mundo se vuelve a crear vacío).
  const { data: offlineGroup } = await db
    .from("groups")
    .insert({ school_id: world.school.id, name: "Sin señal" })
    .select("id")
    .single();
  const offlineGroupId = offlineGroup!.id as string;
  for (const name of ["Nico", "Olga", "Pablo"]) await seedGoalkeeper(name, offlineGroupId);

  await loginStaff(page, slug, world.coach);
  await openAttendance(page);
  // La pantalla guarda lo que necesita para funcionar sin señal.
  await expect(page.getByText("Lista para usar sin conexión")).toBeVisible({ timeout: 30_000 });
  // Si el flujo anterior dejó otros grupos, se elige el de este.
  await page.getByLabel("Grupo").selectOption({ label: "Sin señal" });
  await expect(page.getByTestId("counts")).toContainText("3 sin marcar");
  await expect(page.getByTestId("counts")).toContainText("sin marcar");

  // Se corta la conexión y se vuelve a abrir la pantalla: sale de la copia guardada.
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Asistencia", exact: true })).toBeVisible();
  await expect(page.getByText("Sin conexión", { exact: true })).toBeVisible();
  await expect(page.getByTestId("counts")).toContainText("sin marcar");

  const row = (name: string) =>
    page.getByRole("group", { name: new RegExp(`Asistencia de ${name}`) });
  await page.getByRole("button", { name: "Todos presentes" }).click();
  await row("Nico").getByRole("button", { name: "Ausente" }).click();
  await expect(page.getByTestId("sync-status")).toContainText("Pendiente de sincronizar (3)");
  await expect(page.getByText("Pendientes de sincronizar")).toBeVisible();

  // Las marcas sobreviven a cerrar y abrir la pantalla sin conexión.
  await page.reload();
  await expect(page.getByTestId("sync-status")).toContainText("Pendiente de sincronizar (3)");
  await expect(page.getByTestId("counts")).toContainText("2 presentes · 1 ausentes");
  // Ninguna marca llegó al servidor todavía: la lista existe pero sigue sin marcar.
  const before = await entriesByName();
  expect(["Nico", "Olga", "Pablo"].map((name) => before[name]?.status)).toEqual([
    "unmarked",
    "unmarked",
    "unmarked",
  ]);

  // Vuelve la conexión: se sincroniza sola.
  await context.setOffline(false);
  await expect(page.getByTestId("sync-status")).toContainText("Sincronizada", { timeout: 60_000 });
  await expect(page.getByText("Pendientes de sincronizar")).toHaveCount(0);
  await expect
    .poll(async () => (await entriesByName()).Nico?.status, { timeout: 30_000 })
    .toBe("absent");
  const saved = await entriesByName();
  expect(saved.Olga.status).toBe("present");
  expect(saved.Pablo.status).toBe("present");
});
