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
 * Flujo principal del hito 4, sin subir archivos reales a Mux (eso se prueba a mano con un
 * celular): los videos ya procesados se cargan directo en la base y se recorre lo que ve el
 * equipo y lo que ve la familia: lista, filtro, comentarios, publicación, borradores ocultos,
 * cuota de minutos y retiro del consentimiento. La reproducción en sí necesita las claves de
 * firma de Mux, por eso acá solo se verifica la autorización del pedido.
 */
let world: World;
let credentials: Credentials;
let newPin: string;
let publishedId: string;
let draftId: string;

test.beforeAll(async () => {
  world = await createWorld("video");
});
test.afterAll(async () => {
  await destroyWorld(world);
});

async function familyEnters(page: Page, firstTime: boolean) {
  await page.context().clearCookies();
  await loginFamily(
    page,
    world.school.slug,
    credentials.code,
    firstTime ? credentials.pin : newPin,
  );
  if (firstTime) {
    newPin = await completeFirstLogin(page, credentials.pin, "482916", ["Valentina Suárez"]);
  }
  await expect(page).toHaveURL(new RegExp(`/familia/${credentials.goalkeeperId}$`));
}

async function insertVideo(fields: {
  title: string;
  topic: string;
  published: boolean;
  duration: number;
  authorId: string;
}) {
  const { data, error } = await db
    .from("video")
    .insert({
      school_id: world.school.id,
      goalkeeper_id: credentials.goalkeeperId,
      author_id: fields.authorId,
      title: fields.title,
      topic: fields.topic,
      duration_sec: fields.duration,
      processing_status: "ready",
      provider_asset_id: `asset-${crypto.randomUUID()}`,
      provider_playback_id: `playback-${crypto.randomUUID()}`,
      publication_status: fields.published ? "published" : "draft",
      published_at: fields.published ? new Date().toISOString() : null,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`No se pudo crear el video: ${error?.message}`);
  return data.id as string;
}

test("videos: lista, comentarios, publicación, cuota y consentimiento", async ({ page }) => {
  // Recorrido largo (varios ingresos) y el servidor de desarrollo compila al vuelo.
  test.setTimeout(300_000);
  const slug = world.school.slug;
  const base = `/${slug}/panel/arqueros`;

  // La administración da de alta al arquero y la familia entra y acepta el consentimiento.
  await loginStaff(page, slug, world.admin);
  credentials = (await createGoalkeeperViaUi(page, slug, {
    firstName: "Valentina",
    lastName: "Suárez",
  })) as Credentials;
  await familyEnters(page, true);

  publishedId = await insertVideo({
    title: "Atajadas a media altura",
    topic: "save_technique",
    published: true,
    duration: 75,
    authorId: world.coach.id,
  });
  draftId = await insertVideo({
    title: "Salida en centros",
    topic: "aerial_play",
    published: false,
    duration: 50,
    authorId: world.coach.id,
  });
  await db.from("video_comment").insert({
    school_id: world.school.id,
    video_id: publishedId,
    author_id: world.coach.id,
    second: 12,
    body: "Mirá la posición de las manos",
  });

  // 1) El profesor ve la ficha con el bloque de videos y la lista con ambos.
  await page.context().clearCookies();
  await loginStaff(page, slug, world.coach);
  await page.goto(`${base}/${credentials.goalkeeperId}`);
  await expect(page.getByRole("heading", { name: "Videos", exact: true })).toBeVisible();
  await expect(page.getByText("2 videos: 1 publicados.")).toBeVisible();
  await page.getByRole("link", { name: "Ver videos" }).click();

  await expect(page.getByText("Atajadas a media altura")).toBeVisible();
  await expect(page.getByText("Salida en centros")).toBeVisible();
  await expect(page.getByText("Borrador", { exact: true })).toBeVisible();

  // Filtro por tema.
  await page.getByLabel("Tema").selectOption("save_technique");
  await page.getByRole("button", { name: "Filtrar" }).click();
  await expect(page.getByText("Atajadas a media altura")).toBeVisible();
  await expect(page.getByText("Salida en centros")).toHaveCount(0);

  // 2) El profesor abre el borrador, comenta y lo publica.
  await page.goto(`${base}/${credentials.goalkeeperId}/videos/${draftId}`);
  await expect(page.getByRole("heading", { name: "Salida en centros" })).toBeVisible();
  await page.getByLabel("Nuevo comentario").fill("Muy buena salida, falta decidir antes");
  await page.getByRole("button", { name: "Agregar comentario" }).click();
  await expect(page.getByText("Muy buena salida, falta decidir antes")).toBeVisible();
  await page.getByRole("button", { name: "Publicar", exact: true }).click();
  await expect(page.getByText("Publicado", { exact: true })).toBeVisible();

  // Un profesor no ve el botón de borrar (solo la administración).
  await expect(page.getByRole("button", { name: "Borrar video" })).toHaveCount(0);

  // 3) La cuota llena bloquea nuevas subidas, pero los videos siguen visibles.
  await db.from("subscription").update({ video_minutes_limit: 1 }).eq("school_id", world.school.id);
  await page.goto(`${base}/${credentials.goalkeeperId}/videos/nuevo`);
  await expect(page.getByText("alcanzó su tope de minutos de video")).toBeVisible();
  await page.goto(`${base}/${credentials.goalkeeperId}/videos`);
  await expect(page.getByText("Atajadas a media altura")).toBeVisible();
  await db
    .from("subscription")
    .update({ video_minutes_limit: 600 })
    .eq("school_id", world.school.id);

  // 4) Subida: no se puede enviar sin elegir un video, y un archivo que no es video se rechaza.
  await page.goto(`${base}/${credentials.goalkeeperId}/videos/nuevo`);
  await expect(page.getByRole("button", { name: "Subir", exact: true })).toBeDisabled();
  await page.getByLabel("Elegir un video de la galería").setInputFiles({
    name: "no-es-video.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("esto no es un video"),
  });
  await expect(page.getByText("No pudimos leer este video")).toBeVisible();
  await expect(page.getByRole("button", { name: "Subir", exact: true })).toBeDisabled();

  // 5) La familia ve la lista (con "nuevo"), no ve borradores y abre un video con su comentario.
  await familyEnters(page, false);
  await page.getByRole("link", { name: "Videos", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Videos de Valentina" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Atajadas a media altura/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Salida en centros/ })).toBeVisible(); // ya se publicó en el paso 2
  await expect(page.getByText("Nuevo").first()).toBeVisible();

  await page.getByRole("link", { name: /Atajadas a media altura/ }).click();
  await expect(page.getByRole("heading", { name: "Atajadas a media altura" })).toBeVisible();
  await expect(page.getByText("Mirá la posición de las manos")).toBeVisible();
  await expect(page.getByRole("button", { name: /Ir al minuto 0:12/ })).toBeVisible();
  // La familia no comenta ni administra nada.
  await expect(page.getByLabel("Nuevo comentario")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Publicar" })).toHaveCount(0);

  // El pedido de reproducción autoriza al tutor del arquero.
  const okToken = await page.request.get(`/${slug}/video-token/${publishedId}`);
  expect(okToken.status()).not.toBe(404);

  // 6) Un borrador (despublicado) no se ve ni se reproduce.
  await db
    .from("video")
    .update({ publication_status: "draft", published_at: null })
    .eq("id", draftId);
  await page.goto(`/${slug}/familia/${credentials.goalkeeperId}/videos`);
  await expect(page.getByRole("link", { name: /Salida en centros/ })).toHaveCount(0);
  await page.goto(`/${slug}/familia/${credentials.goalkeeperId}/videos/${draftId}`);
  await expect(page.getByRole("heading", { name: "No encontramos esta página" })).toBeVisible();
  expect((await page.request.get(`/${slug}/video-token/${draftId}`)).status()).toBe(404);

  // 7) Sin sesión no se reproduce nada.
  await page.context().clearCookies();
  expect((await page.request.get(`/${slug}/video-token/${publishedId}`)).status()).toBe(404);

  // 8) Si la familia retira el consentimiento, los videos se ocultan al instante (CA-12).
  await loginFamily(page, slug, credentials.code, newPin);
  await page.goto(`/${slug}/familia/${credentials.goalkeeperId}/privacidad`);
  await page.getByRole("button", { name: "Retirar el consentimiento" }).click();
  await page.getByRole("button", { name: "Sí, retirar el consentimiento" }).click();
  await expect(page.getByText("Retirado")).toBeVisible();

  await page.goto(`/${slug}/familia/${credentials.goalkeeperId}/videos`);
  await expect(page.getByText("Retiraste el consentimiento")).toBeVisible();
  await expect(page.getByRole("link", { name: /Atajadas a media altura/ })).toHaveCount(0);
  await page.goto(`/${slug}/familia/${credentials.goalkeeperId}/videos/${publishedId}`);
  await expect(page.getByRole("heading", { name: "No encontramos esta página" })).toBeVisible();
  expect((await page.request.get(`/${slug}/video-token/${publishedId}`)).status()).toBe(404);

  // 9) El profesor ya no puede subir videos de ese arquero.
  await page.context().clearCookies();
  await loginStaff(page, slug, world.coach);
  await page.goto(`${base}/${credentials.goalkeeperId}/videos/nuevo`);
  await expect(page.getByText("retiró el consentimiento de imagen y video")).toBeVisible();

  // 10) La administración puede borrar los videos del arquero.
  await page.context().clearCookies();
  await loginStaff(page, slug, world.admin);
  await page.goto(`${base}/${credentials.goalkeeperId}`);
  await expect(page.getByText("estos videos ya están ocultos para ella")).toBeVisible();
});
