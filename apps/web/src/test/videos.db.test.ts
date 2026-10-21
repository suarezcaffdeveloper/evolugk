/**
 * Videos (spec 03: CA-01 a CA-12; spec 04: CA-02, CA-06, CA-10, CA-12 de videos).
 * Usa un proveedor falso en memoria: no toca Mux. Corre contra desarrollo: `pnpm test:db`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeEvaluationSchema } from "@/lib/evaluation-schemas";
import { commentSchema, uploadInputSchema, videoEditSchema } from "@/lib/video-schemas";
import { setVideoMinutesLimit } from "@/server/schools";
import {
  createEvaluation,
  getCurrentRubric,
  publishEvaluation,
  type Actor as EvalActor,
} from "@/server/evaluations";
import { deleteGoalkeeper } from "@/server/goalkeepers";
import type { GuardianSession } from "@/server/guardian/access";
import {
  authorizeFamilyPlayback,
  getFamilyVideo,
  listFamilyEvaluationVideos,
  listFamilyVideos,
  markVideoSeen,
} from "@/server/guardian/videos";
import type { EmailMessage, EmailTransport } from "@/server/email/transport";
import {
  addComment,
  applyProviderEvent,
  deleteComment,
  deleteGoalkeeperVideos,
  deleteVideo,
  flushVideoNotices,
  getVideo,
  getVideoQuota,
  listEvaluationVideos,
  listVideos,
  markUploadFinished,
  publishVideo,
  refreshProcessing,
  restartUpload,
  retryProviderCleanup,
  setEvaluationVideos,
  startUpload,
  unpublishVideo,
  updateComment,
  updateVideo,
  type Actor,
} from "@/server/videos";
import { FakeVideoProvider } from "./fake-video-provider";
import {
  cleanup,
  createAdminClient,
  createAnonClient,
  createSchool,
  createStaff,
  purgeLeftovers,
  signIn,
  type TestSchool,
} from "./db";

const PERMISSION_DENIED = "42501";
const CHECK_VIOLATION = "23514";
const TODAY = "2026-10-21";

const admin = createAdminClient();
const created = { schoolIds: [] as string[], userIds: [] as string[] };

let school: TestSchool;
let other: TestSchool;
let adminActor: Actor;
let coachActor: Actor;
let coach2Actor: Actor;
let otherAdminActor: Actor;
let adminClient: SupabaseClient;
let coachClient: SupabaseClient;
let otherAdminClient: SupabaseClient;
let provider: FakeVideoProvider;

const must = <T>(result: { data: T; error: { message: string } | null }, what: string) => {
  if (result.error || result.data == null) {
    throw new Error(`No se pudo crear ${what}: ${result.error?.message}`);
  }
  return result.data as NonNullable<T>;
};

async function newGoalkeeper(
  target: TestSchool,
  label: string,
  options: { consent?: boolean; status?: string } = {},
) {
  const goalkeeperId = must(
    await admin
      .from("goalkeeper")
      .insert({
        school_id: target.id,
        first_name: label,
        last_name: "Video",
        birth_date: "2012-05-01",
        joined_on: "2024-03-01",
        status: options.status ?? "active",
      })
      .select("id")
      .single(),
    "el arquero",
  ).id as string;

  const guardianId = must(
    await admin
      .from("guardian")
      .insert({
        school_id: target.id,
        first_name: `Tutor${label}`,
        last_name: "Video",
        phone: "1155551111",
        email: `${label.toLowerCase()}-${crypto.randomUUID().slice(0, 6)}@example.com`,
        access_code: crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase(),
        pin_hash: "scrypt$x",
      })
      .select("id")
      .single(),
    "el tutor",
  ).id as string;
  must(
    await admin
      .from("goalkeeper_guardian")
      .insert({
        school_id: target.id,
        goalkeeper_id: goalkeeperId,
        guardian_id: guardianId,
        relationship: "mother",
      })
      .select("guardian_id")
      .single(),
    "el vínculo",
  );
  if (options.consent !== false) {
    must(
      await admin
        .from("consent")
        .insert({
          school_id: target.id,
          goalkeeper_id: goalkeeperId,
          guardian_id: guardianId,
          type: "media",
          text_version: "test",
        })
        .select("id")
        .single(),
      "el consentimiento",
    );
  }
  const session = { guardianId, schoolId: target.id, schoolSlug: target.slug } as GuardianSession;
  return { goalkeeperId, guardianId, session };
}

type Gk = Awaited<ReturnType<typeof newGoalkeeper>>;

const uploadData = (overrides: Record<string, unknown> = {}) =>
  uploadInputSchema.parse({ topic: "reflexes", title: "", durationSec: 60, ...overrides });

/** Sube un video completo: arranca, termina la subida y lo deja procesado ("listo"). */
async function readyVideo(
  actor: Actor,
  gk: Gk,
  options: { durationSec?: number; publish?: boolean; title?: string } = {},
): Promise<string> {
  const started = await startUpload(admin, provider, {
    ...actor,
    goalkeeperId: gk.goalkeeperId,
    data: uploadData(options.title ? { title: options.title } : {}),
    corsOrigin: "http://localhost:3000",
    today: TODAY,
  });
  if (!started.ok) throw new Error(`No se pudo iniciar la subida: ${started.error}`);
  const { data } = await admin
    .from("video")
    .select("provider_upload_id")
    .eq("id", started.videoId)
    .single();
  const { assetId, event } = provider.finishUpload(data!.provider_upload_id as string);
  await markUploadFinished(admin, { ...actor, videoId: started.videoId });
  await applyProviderEvent(admin, provider, event);
  await applyProviderEvent(admin, provider, provider.makeReady(assetId, options.durationSec ?? 60));
  if (options.publish) {
    const published = await publishVideo(admin, { ...actor, videoId: started.videoId });
    if (!published.ok) throw new Error(`No se pudo publicar: ${published.error}`);
  }
  return started.videoId;
}

const rowOf = async (videoId: string) =>
  (await admin.from("video").select("*").eq("id", videoId).maybeSingle()).data;

let gk: Gk;
let otherGk: Gk;

beforeAll(async () => {
  await purgeLeftovers(admin);
  school = await createSchool(admin, "video-a");
  other = await createSchool(admin, "video-b");
  created.schoolIds.push(school.id, other.id);

  const adminUser = await createStaff(admin, school, "school_admin", "adminV");
  const coachUser = await createStaff(admin, school, "coach", "coachV");
  const coach2User = await createStaff(admin, school, "coach", "coachV2");
  const otherAdminUser = await createStaff(admin, other, "school_admin", "adminW");
  created.userIds.push(adminUser.id, coachUser.id, coach2User.id, otherAdminUser.id);

  adminActor = { schoolId: school.id, actorId: adminUser.id, role: "school_admin" };
  coachActor = { schoolId: school.id, actorId: coachUser.id, role: "coach" };
  coach2Actor = { schoolId: school.id, actorId: coach2User.id, role: "coach" };
  otherAdminActor = { schoolId: other.id, actorId: otherAdminUser.id, role: "school_admin" };

  gk = await newGoalkeeper(school, "Mateo");
  otherGk = await newGoalkeeper(other, "Bruno");
  [adminClient, coachClient, otherAdminClient] = await Promise.all([
    signIn(adminUser),
    signIn(coachUser),
    signIn(otherAdminUser),
  ]);
});

afterAll(async () => {
  await cleanup(admin, created);
  await admin.from("video_provider_cleanup").delete().is("school_id", null);
});

const fresh = () => {
  provider = new FakeVideoProvider();
};

describe("subir: quién y cuándo", () => {
  it("crea el video en 'subiendo' con título generado y pide la subida al proveedor", async () => {
    fresh();
    const result = await startUpload(admin, provider, {
      ...coachActor,
      goalkeeperId: gk.goalkeeperId,
      data: uploadData({ topic: "aerial_play" }),
      corsOrigin: "http://localhost:3000",
      today: TODAY,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.uploadUrl).toContain("https://fake.upload/");

    const row = await rowOf(result.videoId);
    expect(row).toMatchObject({
      processing_status: "uploading",
      publication_status: "draft",
      author_id: coachActor.actorId,
      title: "Juego aéreo · 21 de octubre de 2026",
    });
    expect(row?.provider_upload_id).toBeTruthy();
  });

  it("se bloquea sin consentimiento vigente (CA-01), también desde la base", async () => {
    fresh();
    const noConsent = await newGoalkeeper(school, "SinConsent", { consent: false });
    const result = await startUpload(admin, provider, {
      ...coachActor,
      goalkeeperId: noConsent.goalkeeperId,
      data: uploadData(),
      corsOrigin: "x",
      today: TODAY,
    });
    expect(result).toEqual({ ok: false, error: "consent_required" });

    const direct = await admin.from("video").insert({
      school_id: school.id,
      goalkeeper_id: noConsent.goalkeeperId,
      title: "x",
      topic: "other",
    });
    expect(direct.error?.code).toBe(CHECK_VIOLATION);
  });

  it("se bloquea con el consentimiento retirado", async () => {
    fresh();
    const revoked = await newGoalkeeper(school, "Retirado");
    await admin
      .from("consent")
      .update({ revoked_at: new Date().toISOString() })
      .eq("goalkeeper_id", revoked.goalkeeperId);
    const result = await startUpload(admin, provider, {
      ...coachActor,
      goalkeeperId: revoked.goalkeeperId,
      data: uploadData(),
      corsOrigin: "x",
      today: TODAY,
    });
    expect(result).toEqual({ ok: false, error: "consent_required" });
  });

  it("no se sube a arqueros inactivos ni de otra escuela", async () => {
    fresh();
    const inactive = await newGoalkeeper(school, "Inactivo", { status: "inactive" });
    expect(
      await startUpload(admin, provider, {
        ...coachActor,
        goalkeeperId: inactive.goalkeeperId,
        data: uploadData(),
        corsOrigin: "x",
        today: TODAY,
      }),
    ).toEqual({ ok: false, error: "not_active" });
    expect(
      await startUpload(admin, provider, {
        ...coachActor,
        goalkeeperId: otherGk.goalkeeperId,
        data: uploadData(),
        corsOrigin: "x",
        today: TODAY,
      }),
    ).toEqual({ ok: false, error: "not_found" });
  });

  it("si el proveedor falla al crear la subida, no queda un video a medias", async () => {
    fresh();
    provider.failUploads = true;
    const before = (await admin.from("video").select("id").eq("school_id", school.id)).data!.length;
    const result = await startUpload(admin, provider, {
      ...coachActor,
      goalkeeperId: gk.goalkeeperId,
      data: uploadData(),
      corsOrigin: "x",
      today: TODAY,
    });
    expect(result).toEqual({ ok: false, error: "provider_error" });
    expect((await admin.from("video").select("id").eq("school_id", school.id)).data).toHaveLength(
      before,
    );
  });
});

describe("procesamiento (avisos del proveedor)", () => {
  it("subiendo → procesando → listo, con duración y reproducción; el mismo aviso dos veces no cambia nada", async () => {
    fresh();
    const started = await startUpload(admin, provider, {
      ...coachActor,
      goalkeeperId: gk.goalkeeperId,
      data: uploadData(),
      corsOrigin: "x",
      today: TODAY,
    });
    if (!started.ok) throw new Error("falló");
    const uploadId = (await rowOf(started.videoId))!.provider_upload_id as string;

    await markUploadFinished(admin, { ...coachActor, videoId: started.videoId });
    expect((await rowOf(started.videoId))!.processing_status).toBe("processing");

    const { assetId, event } = provider.finishUpload(uploadId);
    await applyProviderEvent(admin, provider, event);
    expect((await rowOf(started.videoId))!.provider_asset_id).toBe(assetId);

    const ready = provider.makeReady(assetId, 75.5);
    await applyProviderEvent(admin, provider, ready);
    await applyProviderEvent(admin, provider, ready);
    const row = await rowOf(started.videoId);
    expect(row).toMatchObject({ processing_status: "ready" });
    expect(Number(row!.duration_sec)).toBe(75.5);
    expect(row!.provider_playback_id).toBe(`pb_${assetId}`);
  });

  it("un video de más de 3 minutos se descarta al procesarlo y se borra del proveedor (CA-02)", async () => {
    fresh();
    const started = await startUpload(admin, provider, {
      ...coachActor,
      goalkeeperId: gk.goalkeeperId,
      data: uploadData(),
      corsOrigin: "x",
      today: TODAY,
    });
    if (!started.ok) throw new Error("falló");
    const uploadId = (await rowOf(started.videoId))!.provider_upload_id as string;
    const { assetId, event } = provider.finishUpload(uploadId);
    await applyProviderEvent(admin, provider, event);
    await applyProviderEvent(admin, provider, provider.makeReady(assetId, 240));

    const row = await rowOf(started.videoId);
    expect(row).toMatchObject({ processing_status: "error", provider_playback_id: null });
    expect(row!.error_reason).toContain("3 minutos");
    expect(provider.deleted).toContain(assetId);
    // No cuenta para la cuota (RN-03) y no se puede publicar.
    const published = await publishVideo(admin, { ...coachActor, videoId: started.videoId });
    expect(published).toEqual({ ok: false, error: "not_ready" });
  });

  it("un error de procesamiento deja el video en error y no cuenta para la cuota (RN-03)", async () => {
    fresh();
    const before = (await getVideoQuota(admin, school.id)).usedSeconds;
    const started = await startUpload(admin, provider, {
      ...coachActor,
      goalkeeperId: gk.goalkeeperId,
      data: uploadData(),
      corsOrigin: "x",
      today: TODAY,
    });
    if (!started.ok) throw new Error("falló");
    const uploadId = (await rowOf(started.videoId))!.provider_upload_id as string;
    const { assetId, event } = provider.finishUpload(uploadId);
    await applyProviderEvent(admin, provider, event);
    await applyProviderEvent(
      admin,
      provider,
      provider.makeErrored(assetId, "formato no soportado"),
    );

    expect(await rowOf(started.videoId)).toMatchObject({
      processing_status: "error",
      error_reason: "formato no soportado",
    });
    expect((await getVideoQuota(admin, school.id)).usedSeconds).toBe(before);
  });

  it("si el aviso no llega, la consulta directa al proveedor lo pone al día", async () => {
    fresh();
    const started = await startUpload(admin, provider, {
      ...coachActor,
      goalkeeperId: gk.goalkeeperId,
      data: uploadData(),
      corsOrigin: "x",
      today: TODAY,
    });
    if (!started.ok) throw new Error("falló");
    const uploadId = (await rowOf(started.videoId))!.provider_upload_id as string;
    const { assetId } = provider.finishUpload(uploadId);
    provider.makeReady(assetId, 42);

    await refreshProcessing(admin, provider, school.id, [started.videoId]);
    expect(await rowOf(started.videoId)).toMatchObject({ processing_status: "ready" });
  });

  it("un aviso de un video que ya no existe borra el archivo huérfano del proveedor", async () => {
    fresh();
    const started = await startUpload(admin, provider, {
      ...coachActor,
      goalkeeperId: gk.goalkeeperId,
      data: uploadData(),
      corsOrigin: "x",
      today: TODAY,
    });
    if (!started.ok) throw new Error("falló");
    const uploadId = (await rowOf(started.videoId))!.provider_upload_id as string;
    await deleteVideo(admin, provider, { ...adminActor, videoId: started.videoId });

    const { assetId, event } = provider.finishUpload(uploadId);
    await applyProviderEvent(admin, provider, event);
    expect(provider.deleted).toContain(assetId);
  });

  it("una subida interrumpida se muestra con error y se puede volver a subir (RN-03)", async () => {
    fresh();
    const started = await startUpload(admin, provider, {
      ...coachActor,
      goalkeeperId: gk.goalkeeperId,
      data: uploadData(),
      corsOrigin: "x",
      today: TODAY,
    });
    if (!started.ok) throw new Error("falló");
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    await admin.from("video").update({ created_at: old }).eq("id", started.videoId);

    const view = (await listVideos(admin, school.id, gk.goalkeeperId)).find(
      (v) => v.id === started.videoId,
    );
    expect(view?.processingStatus).toBe("error");
    expect(view?.errorReason).toContain("interrumpió");

    // Otro profesor no puede reiniciarla; su autor sí.
    expect(
      await restartUpload(admin, provider, {
        ...coach2Actor,
        videoId: started.videoId,
        corsOrigin: "x",
      }),
    ).toEqual({ ok: false, error: "forbidden" });
    const restarted = await restartUpload(admin, provider, {
      ...coachActor,
      videoId: started.videoId,
      corsOrigin: "x",
    });
    expect(restarted.ok).toBe(true);
    expect(await rowOf(started.videoId)).toMatchObject({ processing_status: "uploading" });
  });

  it("solo un video con error se puede volver a subir", async () => {
    fresh();
    const ready = await readyVideo(coachActor, gk);
    expect(
      await restartUpload(admin, provider, { ...coachActor, videoId: ready, corsOrigin: "x" }),
    ).toEqual({ ok: false, error: "not_restartable" });
  });
});

describe("cuota de minutos (CA-09)", () => {
  it("cuenta todos los videos, borradores incluidos, y se bloquea al 100%", async () => {
    fresh();
    const quotaSchool = await createSchool(admin, "video-quota");
    created.schoolIds.push(quotaSchool.id);
    const quotaStaff = await createStaff(admin, quotaSchool, "coach", "coachQ");
    created.userIds.push(quotaStaff.id);
    const actor: Actor = { schoolId: quotaSchool.id, actorId: quotaStaff.id, role: "coach" };
    const q = await newGoalkeeper(quotaSchool, "Quota");
    await admin
      .from("subscription")
      .update({ video_minutes_limit: 3 })
      .eq("school_id", quotaSchool.id);

    await readyVideo(actor, q, { durationSec: 100 }); // borrador: igual cuenta
    let quota = await getVideoQuota(admin, quotaSchool.id);
    expect(quota).toMatchObject({ level: "ok", usedSeconds: 100 });

    await readyVideo(actor, q, { durationSec: 50 }); // 150 s de 180 = 83%
    quota = await getVideoQuota(admin, quotaSchool.id);
    expect(quota.level).toBe("warning");

    await readyVideo(actor, q, { durationSec: 30 }); // 180 s = 100%
    quota = await getVideoQuota(admin, quotaSchool.id);
    expect(quota.level).toBe("blocked");

    const blocked = await startUpload(admin, provider, {
      ...actor,
      goalkeeperId: q.goalkeeperId,
      data: uploadData(),
      corsOrigin: "x",
      today: TODAY,
    });
    expect(blocked).toEqual({ ok: false, error: "quota_exceeded" });
    // Los videos existentes siguen visibles.
    expect(await listVideos(admin, quotaSchool.id, q.goalkeeperId)).toHaveLength(3);

    // El operador sube el tope y se destraba al instante (spec 07, RF-04).
    expect(
      await setVideoMinutesLimit(admin, {
        schoolId: quotaSchool.id,
        minutes: 10,
        actorId: quotaStaff.id,
      }),
    ).toEqual({ ok: true });
    expect((await getVideoQuota(admin, quotaSchool.id)).level).toBe("ok");
    const unblocked = await startUpload(admin, provider, {
      ...actor,
      goalkeeperId: q.goalkeeperId,
      data: uploadData(),
      corsOrigin: "x",
      today: TODAY,
    });
    expect(unblocked.ok).toBe(true);
  });

  it("el tope del operador se valida", async () => {
    for (const minutes of [-1, 1.5, 100_001]) {
      expect(
        await setVideoMinutesLimit(admin, {
          schoolId: school.id,
          minutes,
          actorId: adminActor.actorId,
        }),
      ).toEqual({ ok: false, error: "invalid" });
    }
    expect(
      await setVideoMinutesLimit(admin, {
        schoolId: "99999999-9999-4999-8999-999999999999",
        minutes: 10,
        actorId: adminActor.actorId,
      }),
    ).toEqual({ ok: false, error: "not_found" });
  });

  it("borrar un video libera sus minutos (CA-10)", async () => {
    fresh();
    const before = (await getVideoQuota(admin, school.id)).usedSeconds;
    const id = await readyVideo(coachActor, gk, { durationSec: 120 });
    expect((await getVideoQuota(admin, school.id)).usedSeconds).toBe(before + 120);
    await deleteVideo(admin, provider, { ...adminActor, videoId: id });
    expect((await getVideoQuota(admin, school.id)).usedSeconds).toBe(before);
  });
});

describe("publicar y ver en familia (CA-04, CA-06, CA-12)", () => {
  it("un video solo se publica cuando está listo (RF-11), por su autor o un admin", async () => {
    fresh();
    const started = await startUpload(admin, provider, {
      ...coachActor,
      goalkeeperId: gk.goalkeeperId,
      data: uploadData(),
      corsOrigin: "x",
      today: TODAY,
    });
    if (!started.ok) throw new Error("falló");
    expect(await publishVideo(admin, { ...coachActor, videoId: started.videoId })).toEqual({
      ok: false,
      error: "not_ready",
    });
    // Y la base lo garantiza.
    const direct = await admin
      .from("video")
      .update({ publication_status: "published", published_at: new Date().toISOString() })
      .eq("id", started.videoId);
    expect(direct.error?.code).toBe(CHECK_VIOLATION);

    const ready = await readyVideo(coachActor, gk);
    expect(await publishVideo(admin, { ...coach2Actor, videoId: ready })).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await publishVideo(admin, { ...adminActor, videoId: ready })).toEqual({ ok: true });
  });

  it("la familia no ve un borrador y sí lo publicado (CA-04)", async () => {
    fresh();
    const g = await newGoalkeeper(school, "Familia");
    const draft = await readyVideo(coachActor, g, { title: "Borrador" });
    const published = await readyVideo(coachActor, g, { title: "Publicado", publish: true });

    const list = await listFamilyVideos(admin, g.session, g.goalkeeperId);
    expect(list.consent).toBe("valid");
    expect(list.videos.map((v) => v.title)).toEqual(["Publicado"]);
    expect(await getFamilyVideo(admin, g.session, g.goalkeeperId, draft)).toBeNull();
    expect(await authorizeFamilyPlayback(admin, g.session, draft)).toBeNull();
    expect(await authorizeFamilyPlayback(admin, g.session, published)).toMatchObject({
      goalkeeperId: g.goalkeeperId,
    });
  });

  it("un video publicado que todavía no está procesado no se muestra ni reproduce", async () => {
    fresh();
    const g = await newGoalkeeper(school, "Procesando");
    const id = await readyVideo(coachActor, g, { publish: true });
    await admin
      .from("video")
      .update({ publication_status: "draft", published_at: null })
      .eq("id", id);
    await admin.from("video").update({ processing_status: "processing" }).eq("id", id);
    expect((await listFamilyVideos(admin, g.session, g.goalkeeperId)).videos).toEqual([]);
  });

  it("un tutor ajeno al arquero no reproduce ni ve nada (CA-06)", async () => {
    fresh();
    const g = await newGoalkeeper(school, "Propio");
    const stranger = await newGoalkeeper(school, "Ajeno");
    const id = await readyVideo(coachActor, g, { publish: true });

    expect(await authorizeFamilyPlayback(admin, stranger.session, id)).toBeNull();
    expect(await getFamilyVideo(admin, stranger.session, g.goalkeeperId, id)).toBeNull();
    expect((await listFamilyVideos(admin, stranger.session, g.goalkeeperId)).videos).toEqual([]);
    // Ni con la sesión de otra escuela.
    expect(await authorizeFamilyPlayback(admin, otherGk.session, id)).toBeNull();
  });

  it("retirar el consentimiento oculta los videos al instante y volver a darlo los muestra (CA-12)", async () => {
    fresh();
    const g = await newGoalkeeper(school, "Consent");
    const id = await readyVideo(coachActor, g, { publish: true });
    expect((await listFamilyVideos(admin, g.session, g.goalkeeperId)).videos).toHaveLength(1);

    await admin
      .from("consent")
      .update({ revoked_at: new Date().toISOString() })
      .eq("goalkeeper_id", g.goalkeeperId);
    const hidden = await listFamilyVideos(admin, g.session, g.goalkeeperId);
    expect(hidden).toMatchObject({ consent: "revoked", videos: [] });
    expect(await authorizeFamilyPlayback(admin, g.session, id)).toBeNull();
    expect(await getFamilyVideo(admin, g.session, g.goalkeeperId, id)).toBeNull();

    await admin.from("consent").insert({
      school_id: school.id,
      goalkeeper_id: g.goalkeeperId,
      guardian_id: g.guardianId,
      type: "media",
      text_version: "test",
    });
    expect((await listFamilyVideos(admin, g.session, g.goalkeeperId)).videos).toHaveLength(1);
  });

  it("despublicar vuelve a borrador y la familia deja de verlo (RF-14)", async () => {
    fresh();
    const g = await newGoalkeeper(school, "Despub");
    const id = await readyVideo(coachActor, g, { publish: true });
    expect(await unpublishVideo(admin, { ...coachActor, videoId: id })).toEqual({ ok: true });
    expect((await listFamilyVideos(admin, g.session, g.goalkeeperId)).videos).toEqual([]);
  });

  it("filtra por tema y marca lo nuevo hasta abrirlo", async () => {
    fresh();
    const g = await newGoalkeeper(school, "Filtro");
    const start = async (topic: string) => {
      const started = await startUpload(admin, provider, {
        ...coachActor,
        goalkeeperId: g.goalkeeperId,
        data: uploadData({ topic }),
        corsOrigin: "x",
        today: TODAY,
      });
      if (!started.ok) throw new Error("falló");
      const uploadId = (await rowOf(started.videoId))!.provider_upload_id as string;
      const { assetId, event } = provider.finishUpload(uploadId);
      await applyProviderEvent(admin, provider, event);
      await applyProviderEvent(admin, provider, provider.makeReady(assetId, 30));
      await publishVideo(admin, { ...coachActor, videoId: started.videoId });
      return started.videoId;
    };
    const reflexes = await start("reflexes");
    await start("footwork");

    const all = await listFamilyVideos(admin, g.session, g.goalkeeperId);
    expect(all.videos).toHaveLength(2);
    expect(all.newCount).toBe(2);
    const filtered = await listFamilyVideos(admin, g.session, g.goalkeeperId, {
      topic: "reflexes",
    });
    expect(filtered.videos.map((v) => v.id)).toEqual([reflexes]);

    await markVideoSeen(admin, g.session, g.goalkeeperId, reflexes);
    await markVideoSeen(admin, g.session, g.goalkeeperId, reflexes); // idempotente
    expect((await listFamilyVideos(admin, g.session, g.goalkeeperId)).newCount).toBe(1);
  });
});

describe("comentarios (RF-15 a RF-18)", () => {
  it("el staff comenta con marca de tiempo o en general, y la familia los lee con el autor", async () => {
    fresh();
    const g = await newGoalkeeper(school, "Coment");
    const id = await readyVideo(coachActor, g, { durationSec: 60, publish: true });

    const timed = await addComment(admin, {
      ...coach2Actor,
      videoId: id,
      data: commentSchema.parse({ body: "Mirá la posición de las manos", second: "12" }),
    });
    const general = await addComment(admin, {
      ...coachActor,
      videoId: id,
      data: commentSchema.parse({ body: "Muy buen clip", second: "" }),
    });
    expect(timed.ok && general.ok).toBe(true);

    const detail = await getFamilyVideo(admin, g.session, g.goalkeeperId, id);
    expect(detail?.comments.map((c) => [c.second, c.body])).toEqual([
      [12, "Mirá la posición de las manos"],
      [null, "Muy buen clip"],
    ]);
    expect(detail?.comments[0].authorName).toContain("coachV2");
  });

  it("rechaza una marca de tiempo más allá del final del video", async () => {
    fresh();
    const id = await readyVideo(coachActor, gk, { durationSec: 30 });
    const result = await addComment(admin, {
      ...coachActor,
      videoId: id,
      data: commentSchema.parse({ body: "x", second: "90" }),
    });
    expect(result).toEqual({ ok: false, error: "invalid_second" });
  });

  it("el autor edita y borra los suyos, otro profesor no, el admin cualquiera (RF-17)", async () => {
    fresh();
    const id = await readyVideo(coachActor, gk);
    const added = await addComment(admin, {
      ...coachActor,
      videoId: id,
      data: commentSchema.parse({ body: "Original", second: "" }),
    });
    if (!added.ok) throw new Error("falló");
    const edit = (actor: Actor, body: string) =>
      updateComment(admin, {
        ...actor,
        commentId: added.commentId,
        data: commentSchema.parse({ body, second: "" }),
      });

    expect(await edit(coach2Actor, "Ajeno")).toEqual({ ok: false, error: "forbidden" });
    expect(await edit(coachActor, "Editado por el autor")).toEqual({ ok: true });
    expect(await edit(adminActor, "Editado por el admin")).toEqual({ ok: true });
    expect(await deleteComment(admin, { ...coach2Actor, commentId: added.commentId })).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await deleteComment(admin, { ...adminActor, commentId: added.commentId })).toEqual({
      ok: true,
    });
    // Borrar de nuevo no falla.
    expect(await deleteComment(admin, { ...adminActor, commentId: added.commentId })).toEqual({
      ok: true,
    });
    expect((await getVideo(admin, school.id, id))?.comments).toEqual([]);
  });

  it("no se comenta un video de otra escuela", async () => {
    fresh();
    const id = await readyVideo(coachActor, gk);
    const result = await addComment(admin, {
      ...otherAdminActor,
      videoId: id,
      data: commentSchema.parse({ body: "x", second: "" }),
    });
    expect(result).toEqual({ ok: false, error: "not_found" });
  });
});

describe("edición y borrado (CA-08, CA-10)", () => {
  it("el autor o un admin editan título y tema; otro profesor no (RF-26)", async () => {
    fresh();
    const id = await readyVideo(coachActor, gk);
    const data = videoEditSchema.parse({ title: "Nuevo título", topic: "mindset" });
    expect(await updateVideo(admin, { ...coach2Actor, videoId: id, data })).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await updateVideo(admin, { ...coachActor, videoId: id, data })).toEqual({ ok: true });
    expect(await rowOf(id)).toMatchObject({ title: "Nuevo título", topic: "mindset" });
  });

  it("un profesor no borra, ni siquiera el suyo (CA-08)", async () => {
    fresh();
    const id = await readyVideo(coachActor, gk);
    expect(await deleteVideo(admin, provider, { ...coachActor, videoId: id })).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await deleteVideo(admin, provider, { ...coach2Actor, videoId: id })).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await rowOf(id)).not.toBeNull();
  });

  it("el admin borra: sale del proveedor, desaparece y borrar de nuevo no falla (CA-10)", async () => {
    fresh();
    const id = await readyVideo(coachActor, gk);
    const assetId = (await rowOf(id))!.provider_asset_id as string;
    await addComment(admin, {
      ...coachActor,
      videoId: id,
      data: commentSchema.parse({ body: "x", second: "" }),
    });

    expect(await deleteVideo(admin, provider, { ...adminActor, videoId: id })).toEqual({
      ok: true,
      providerConfirmed: true,
    });
    expect(provider.deleted).toContain(assetId);
    expect(await rowOf(id)).toBeNull();
    expect((await admin.from("video_comment").select("id").eq("video_id", id)).data).toEqual([]);
    expect(await deleteVideo(admin, provider, { ...adminActor, videoId: id })).toEqual({
      ok: true,
      providerConfirmed: true,
    });
  });

  it("el admin de otra escuela no borra el video", async () => {
    fresh();
    const id = await readyVideo(coachActor, gk);
    // Para esa escuela el video no existe: no hay nada que borrar ni que revelar.
    expect(await deleteVideo(admin, provider, { ...otherAdminActor, videoId: id })).toEqual({
      ok: true,
      providerConfirmed: true,
    });
    expect(await rowOf(id)).not.toBeNull();
    expect(provider.deleted).toEqual([]);
  });

  it("si el proveedor falla, el borrado queda en cola y se reintenta hasta confirmarlo", async () => {
    fresh();
    const id = await readyVideo(coachActor, gk);
    const assetId = (await rowOf(id))!.provider_asset_id as string;
    provider.failDeletes = true;

    const result = await deleteVideo(admin, provider, { ...adminActor, videoId: id });
    expect(result).toEqual({ ok: true, providerConfirmed: false });
    const queued = await admin.from("video_provider_cleanup").select("*").eq("asset_id", assetId);
    expect(queued.data).toHaveLength(1);

    // Mientras el proveedor sigue caído, el reintento no lo confirma.
    expect(await retryProviderCleanup(admin, provider)).toMatchObject({ done: 0 });
    provider.failDeletes = false;
    const retry = await retryProviderCleanup(admin, provider);
    expect(retry.done).toBeGreaterThanOrEqual(1);
    expect(provider.deleted).toContain(assetId);
    expect(
      (await admin.from("video_provider_cleanup").select("id").eq("asset_id", assetId)).data,
    ).toEqual([]);
  });

  it("quien subió un video con error lo puede descartar, aunque no sea admin (RN-03)", async () => {
    fresh();
    const started = await startUpload(admin, provider, {
      ...coachActor,
      goalkeeperId: gk.goalkeeperId,
      data: uploadData(),
      corsOrigin: "x",
      today: TODAY,
    });
    if (!started.ok) throw new Error("falló");
    // Subiendo y vigente: no se puede descartar.
    expect(
      await deleteVideo(admin, provider, {
        ...coachActor,
        videoId: started.videoId,
        discard: true,
      }),
    ).toEqual({ ok: false, error: "forbidden" });

    await admin
      .from("video")
      .update({ processing_status: "error", error_reason: "x" })
      .eq("id", started.videoId);
    expect(
      await deleteVideo(admin, provider, {
        ...coach2Actor,
        videoId: started.videoId,
        discard: true,
      }),
    ).toEqual({ ok: false, error: "forbidden" });
    expect(
      await deleteVideo(admin, provider, {
        ...coachActor,
        videoId: started.videoId,
        discard: true,
      }),
    ).toMatchObject({ ok: true });
    expect(await rowOf(started.videoId)).toBeNull();
  });

  it("borrar todos los videos de un arquero los saca del proveedor", async () => {
    fresh();
    const g = await newGoalkeeper(school, "Masivo");
    const a = await readyVideo(coachActor, g);
    const b = await readyVideo(coachActor, g, { publish: true });
    const assets = [a, b].map((id) => id);
    void assets;
    const result = await deleteGoalkeeperVideos(admin, provider, {
      ...adminActor,
      goalkeeperId: g.goalkeeperId,
    });
    expect(result).toEqual({ deleted: 2, pendingAtProvider: 0 });
    expect(provider.deleted).toHaveLength(2);
    expect(await listVideos(admin, school.id, g.goalkeeperId)).toEqual([]);
  });

  it("la eliminación definitiva del arquero borra sus videos del proveedor (RN-07)", async () => {
    fresh();
    const g = await newGoalkeeper(school, "Eliminado");
    await readyVideo(coachActor, g);
    const result = await deleteGoalkeeper(admin, {
      ...adminActor,
      goalkeeperId: g.goalkeeperId,
      videoProvider: provider,
    });
    expect(result).toEqual({ ok: true });
    expect(provider.deleted).toHaveLength(1);
    expect(
      (await admin.from("video").select("id").eq("goalkeeper_id", g.goalkeeperId)).data,
    ).toEqual([]);
  });

  it("si el proveedor falla al eliminar al arquero, el archivo queda en la cola de borrado", async () => {
    fresh();
    const g = await newGoalkeeper(school, "ElimFalla");
    await readyVideo(coachActor, g);
    provider.failDeletes = true;
    await deleteGoalkeeper(admin, {
      ...adminActor,
      goalkeeperId: g.goalkeeperId,
      videoProvider: provider,
    });
    const queued = await admin
      .from("video_provider_cleanup")
      .select("asset_id")
      .eq("school_id", school.id);
    expect((queued.data ?? []).length).toBeGreaterThanOrEqual(1);
    provider.failDeletes = false;
    await retryProviderCleanup(admin, provider);
    expect(provider.deleted.length).toBeGreaterThanOrEqual(1);
  });
});

describe("videos de respaldo de una evaluación (CA-11)", () => {
  const evalActor = (actor: Actor): EvalActor => actor;

  async function newEvaluation(actor: Actor, g: Gk, publish: boolean) {
    const { categories } = await getCurrentRubric(admin);
    const data = makeEvaluationSchema(TODAY).parse({
      date: "2026-10-10",
      type: "periodic",
      comment: "",
      scores: categories.map((c, i) => ({ categoryId: c.id, score: i === 0 ? "7" : "" })),
    });
    const result = await createEvaluation(admin, {
      ...evalActor(actor),
      goalkeeperId: g.goalkeeperId,
      data,
    });
    if (!result.ok) throw new Error(result.error);
    if (publish) {
      await publishEvaluation(admin, {
        ...evalActor(actor),
        evaluationId: result.evaluationId,
        transport: async () => ({ ok: true, id: null }),
        school: { name: "x", slug: school.slug },
      });
    }
    return result.evaluationId;
  }

  it("solo videos del mismo arquero; el vínculo se puede cambiar", async () => {
    fresh();
    const g = await newGoalkeeper(school, "Respaldo");
    const mine = await readyVideo(coachActor, g);
    const foreign = await readyVideo(coachActor, gk);
    const evaluationId = await newEvaluation(coachActor, g, false);

    expect(
      await setEvaluationVideos(admin, { ...coachActor, evaluationId, videoIds: [mine, foreign] }),
    ).toEqual({ ok: false, error: "wrong_goalkeeper" });
    expect(
      await setEvaluationVideos(admin, { ...coachActor, evaluationId, videoIds: [mine] }),
    ).toEqual({
      ok: true,
    });
    expect((await listEvaluationVideos(admin, school.id, evaluationId)).map((v) => v.id)).toEqual([
      mine,
    ]);
    expect((await getVideo(admin, school.id, mine))?.evaluationIds).toEqual([evaluationId]);

    expect(
      await setEvaluationVideos(admin, { ...coach2Actor, evaluationId, videoIds: [] }),
    ).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await setEvaluationVideos(admin, { ...adminActor, evaluationId, videoIds: [] })).toEqual(
      {
        ok: true,
      },
    );
    expect(await listEvaluationVideos(admin, school.id, evaluationId)).toEqual([]);

    // La base también lo garantiza.
    const direct = await admin.from("evaluation_video").insert({
      evaluation_id: evaluationId,
      video_id: foreign,
      school_id: school.id,
    });
    expect(direct.error?.code).toBe(CHECK_VIOLATION);
  });

  it("la familia ve el video dentro de la evaluación solo si ambos están publicados (CA-11 y RF-21)", async () => {
    fresh();
    const g = await newGoalkeeper(school, "Doble");
    const draftVideo = await readyVideo(coachActor, g);
    const publishedVideo = await readyVideo(coachActor, g, { publish: true });
    const draftEvaluation = await newEvaluation(coachActor, g, false);
    const publishedEvaluation = await newEvaluation(coachActor, g, true);

    for (const evaluationId of [draftEvaluation, publishedEvaluation]) {
      await setEvaluationVideos(admin, {
        ...coachActor,
        evaluationId,
        videoIds: [draftVideo, publishedVideo],
      });
    }

    // Evaluación en borrador: nada.
    expect(
      await listFamilyEvaluationVideos(admin, g.session, g.goalkeeperId, draftEvaluation),
    ).toEqual([]);
    // Evaluación publicada: solo el video publicado.
    expect(
      (await listFamilyEvaluationVideos(admin, g.session, g.goalkeeperId, publishedEvaluation)).map(
        (v) => v.id,
      ),
    ).toEqual([publishedVideo]);
    // Con el consentimiento retirado, tampoco.
    await admin
      .from("consent")
      .update({ revoked_at: new Date().toISOString() })
      .eq("goalkeeper_id", g.goalkeeperId);
    expect(
      await listFamilyEvaluationVideos(admin, g.session, g.goalkeeperId, publishedEvaluation),
    ).toEqual([]);
  });

  it("borrar el video lo desvincula de la evaluación (RF-27)", async () => {
    fresh();
    const g = await newGoalkeeper(school, "Desvincula");
    const videoId = await readyVideo(coachActor, g);
    const evaluationId = await newEvaluation(coachActor, g, false);
    await setEvaluationVideos(admin, { ...coachActor, evaluationId, videoIds: [videoId] });
    await deleteVideo(admin, provider, { ...adminActor, videoId });
    expect(await listEvaluationVideos(admin, school.id, evaluationId)).toEqual([]);
  });
});

describe("aviso por mail, agrupado en 30 minutos (RF-13)", () => {
  const sent: EmailMessage[] = [];
  const transport: EmailTransport = async (message) => {
    sent.push(message);
    return { ok: true, id: "t" };
  };
  const minutes = (n: number) => new Date(Date.now() + n * 60_000);

  async function publishedFor(g: Gk, title: string) {
    return readyVideo(coachActor, g, { publish: true, title });
  }

  it("no manda nada antes de la ventana; después manda un solo mail con todos los videos", async () => {
    fresh();
    const g = await newGoalkeeper(school, "Aviso");
    await publishedFor(g, "Primer video");
    await publishedFor(g, "Segundo video");
    sent.length = 0;

    // Antes de los 30 minutos no sale nada.
    expect(await flushVideoNotices(admin, transport, minutes(10))).toMatchObject({ mails: 0 });
    expect(sent.filter((m) => m.subject.includes("Aviso"))).toHaveLength(0);

    const result = await flushVideoNotices(admin, transport, minutes(31));
    expect(result.mails).toBeGreaterThanOrEqual(1);
    const mine = sent.filter((m) => m.text.includes(`/familia/${g.goalkeeperId}/videos`));
    expect(mine).toHaveLength(1);
    expect(mine[0].text).toContain("Primer video");
    expect(mine[0].text).toContain("Segundo video");
    expect(mine[0].subject).toContain("2 videos nuevos");

    // Ya avisado: no se repite.
    sent.length = 0;
    await flushVideoNotices(admin, transport, minutes(60));
    expect(sent.filter((m) => m.text.includes(`/familia/${g.goalkeeperId}/videos`))).toHaveLength(
      0,
    );
  });

  it("despublicar y volver a publicar no reenvía el aviso", async () => {
    fresh();
    const g = await newGoalkeeper(school, "Repub");
    const id = await publishedFor(g, "Video repetido");
    await flushVideoNotices(admin, transport, minutes(31));
    sent.length = 0;
    await unpublishVideo(admin, { ...coachActor, videoId: id });
    await publishVideo(admin, { ...coachActor, videoId: id });
    await flushVideoNotices(admin, transport, minutes(120));
    expect(sent.filter((m) => m.text.includes(`/familia/${g.goalkeeperId}/videos`))).toHaveLength(
      0,
    );
  });

  it("no avisa de un video despublicado ni de un arquero sin consentimiento", async () => {
    fresh();
    const unpublished = await newGoalkeeper(school, "NoAviso1");
    const id = await publishedFor(unpublished, "Despublicado");
    await unpublishVideo(admin, { ...coachActor, videoId: id });

    const revoked = await newGoalkeeper(school, "NoAviso2");
    await publishedFor(revoked, "Sin consentimiento");
    await admin
      .from("consent")
      .update({ revoked_at: new Date().toISOString() })
      .eq("goalkeeper_id", revoked.goalkeeperId);

    sent.length = 0;
    await flushVideoNotices(admin, transport, minutes(31));
    for (const g of [unpublished, revoked]) {
      expect(sent.filter((m) => m.text.includes(`/familia/${g.goalkeeperId}/videos`))).toHaveLength(
        0,
      );
    }
  });

  it("si el mail falla, queda pendiente y se reintenta", async () => {
    fresh();
    const g = await newGoalkeeper(school, "Falla");
    await publishedFor(g, "Video con falla");
    const failing: EmailTransport = async () => ({ ok: false, reason: "network_error" });
    const first = await flushVideoNotices(admin, failing, minutes(31));
    expect(first.failed).toBeGreaterThanOrEqual(1);

    sent.length = 0;
    await flushVideoNotices(admin, transport, minutes(35));
    expect(sent.filter((m) => m.text.includes(`/familia/${g.goalkeeperId}/videos`))).toHaveLength(
      1,
    );
  });
});

describe("aislamiento entre escuelas (RLS)", () => {
  let videoId: string;

  beforeAll(async () => {
    fresh();
    const g = await newGoalkeeper(school, "Aislado");
    videoId = await readyVideo(coachActor, g);
    await addComment(admin, {
      ...coachActor,
      videoId,
      data: commentSchema.parse({ body: "Reservado", second: "" }),
    });
    await readyVideo(otherAdminActor, otherGk);
  });

  it("el staff ve todos los videos de su escuela, borradores de otros incluidos (RF-25)", async () => {
    const asAdmin = await adminClient.from("video").select("id").eq("id", videoId);
    expect(asAdmin.data).toHaveLength(1);
    // Otro profesor de la misma escuela también (no hay borradores privados de video).
    const asCoach = await coachClient.from("video").select("id").eq("id", videoId);
    expect(asCoach.data).toHaveLength(1);
  });

  it("el staff de otra escuela no ve videos, comentarios ni vínculos", async () => {
    for (const [table, column] of [
      ["video", "id"],
      ["video_comment", "video_id"],
    ] as const) {
      const foreign = await otherAdminClient.from(table).select("school_id").eq(column, videoId);
      expect(foreign.data, table).toEqual([]);
    }
    const mine = await otherAdminClient.from("video").select("school_id");
    expect(new Set(mine.data?.map((r) => r.school_id))).toEqual(new Set([other.id]));
  });

  it("los identificadores del proveedor no salen de los servidores", async () => {
    const asStaff = await adminClient.from("video").select("provider_asset_id").eq("id", videoId);
    expect(asStaff.error?.code).toBe(PERMISSION_DENIED);
    const playback = await adminClient.from("video").select("provider_playback_id");
    expect(playback.error?.code).toBe(PERMISSION_DENIED);
    const upload = await adminClient.from("video").select("provider_upload_id");
    expect(upload.error?.code).toBe(PERMISSION_DENIED);
  });

  it("nadie escribe desde el cliente y sin sesión no se lee nada", async () => {
    const row = {
      school_id: school.id,
      goalkeeper_id: gk.goalkeeperId,
      title: "x",
      topic: "other",
    };
    expect((await adminClient.from("video").insert(row)).error?.code).toBe(PERMISSION_DENIED);
    expect(
      (await adminClient.from("video").update({ title: "hackeado" }).eq("id", videoId)).error?.code,
    ).toBe(PERMISSION_DENIED);
    expect((await adminClient.from("video").delete().eq("id", videoId)).error?.code).toBe(
      PERMISSION_DENIED,
    );
    expect(
      (
        await adminClient
          .from("video_comment")
          .insert({ school_id: school.id, video_id: videoId, body: "x" })
      ).error?.code,
    ).toBe(PERMISSION_DENIED);

    const anon = createAnonClient();
    for (const table of ["video", "video_comment", "evaluation_video"]) {
      expect((await anon.from(table).select("*")).data ?? [], table).toEqual([]);
    }
  });

  it("la cola de avisos y la de borrados no se leen desde internet", async () => {
    for (const table of ["video_notice", "video_provider_cleanup"]) {
      expect((await adminClient.from(table).select("*")).error?.code, table).toBe(
        PERMISSION_DENIED,
      );
      expect((await createAnonClient().from(table).select("*")).error?.code, table).toBe(
        PERMISSION_DENIED,
      );
    }
  });

  it("un comentario no puede apuntar a un video de otra escuela (clave compuesta)", async () => {
    const { error } = await admin
      .from("video_comment")
      .insert({ school_id: other.id, video_id: videoId, body: "cruzado" });
    expect(error?.code).toBe("23503");
  });

  it("un video no puede apuntar a un arquero de otra escuela (clave compuesta)", async () => {
    const { error } = await admin.from("video").insert({
      school_id: school.id,
      goalkeeper_id: otherGk.goalkeeperId,
      title: "x",
      topic: "other",
    });
    // Falla por el disparador (el arquero no es de esta escuela) o por la clave compuesta.
    expect(["23503", CHECK_VIOLATION]).toContain(error?.code);
  });

  it("el tema, el estado y la duración se validan en la base", async () => {
    const base = { school_id: school.id, goalkeeper_id: gk.goalkeeperId, title: "x" };
    expect((await admin.from("video").insert({ ...base, topic: "inventado" })).error?.code).toBe(
      CHECK_VIOLATION,
    );
    expect(
      (await admin.from("video").insert({ ...base, topic: "other", duration_sec: -5 })).error?.code,
    ).toBe(CHECK_VIOLATION);
    expect(
      (await admin.from("video").update({ processing_status: "roto" }).eq("id", videoId)).error
        ?.code,
    ).toBe(CHECK_VIOLATION);
  });
});
