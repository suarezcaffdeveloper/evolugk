import type { SupabaseClient } from "@supabase/supabase-js";
import {
  defaultVideoTitle,
  isStaleUpload,
  MAX_VIDEO_SECONDS,
  NOTICE_WINDOW_MINUTES,
  quotaOf,
  type CommentInput,
  type ProcessingStatus,
  type PublicationStatus,
  type Quota,
  type UploadInput,
  type VideoEditInput,
  type VideoTopic,
} from "@/lib/video-schemas";
import { getAppUrl } from "./config";
import { videosPublishedEmail } from "./email/templates";
import type { EmailTransport } from "./email/transport";
import type { StaffRole } from "./evaluations";
import type { ProviderEvent, VideoProvider } from "./video/provider";

/**
 * Videos del staff (spec 03). Toda función recibe la escuela y filtra por ella: el cliente con
 * clave secreta se saltea RLS, así que el aislamiento depende de este código. El proveedor de
 * video entra por parámetro (`VideoProvider`), de modo que se puede probar sin red.
 */

type Db = SupabaseClient;
export type Actor = { schoolId: string; actorId: string; role: StaffRole };

const PG_CHECK = "23514";

async function audit(
  db: Db,
  actor: Pick<Actor, "schoolId" | "actorId">,
  action: string,
  entityId: string,
  details: Record<string, unknown> = {},
) {
  // De mejor esfuerzo: la auditoría no debe impedir la acción ya realizada.
  await db.from("audit_log").insert({
    school_id: actor.schoolId,
    actor_id: actor.actorId,
    action,
    entity: "video",
    entity_id: entityId,
    details,
  });
}

// ───────────────────────────── cuota de minutos ─────────────────────────────

/**
 * Minutos usados por la escuela (RF-29): la suma de la duración de todos sus videos, borradores
 * incluidos. Un video con error no cuenta (RN-03); uno que todavía se procesa no tiene duración.
 */
export async function getVideoQuota(db: Db, schoolId: string): Promise<Quota> {
  const [{ data: videos }, { data: subscription }] = await Promise.all([
    db
      .from("video")
      .select("duration_sec")
      .eq("school_id", schoolId)
      .neq("processing_status", "error"),
    db.from("subscription").select("video_minutes_limit").eq("school_id", schoolId).maybeSingle(),
  ]);
  const usedSeconds = (videos ?? []).reduce((sum, v) => sum + Number(v.duration_sec ?? 0), 0);
  return quotaOf(usedSeconds, Number(subscription?.video_minutes_limit ?? 0));
}

// ───────────────────────────── cola de borrados en el proveedor ─────────────────────────────

/**
 * El video deja de existir en la aplicación y su archivo se borra en el proveedor. Si el proveedor
 * falla, el borrado queda en una cola y se reintenta (spec 03, caso borde): nunca queda un archivo
 * huérfano sin que alguien lo sepa.
 */
async function removeFromProvider(
  db: Db,
  provider: VideoProvider,
  target: { schoolId: string | null; assetId: string | null; uploadId: string | null },
): Promise<boolean> {
  if (!target.assetId && !target.uploadId) return true;
  const { data: queued } = await db
    .from("video_provider_cleanup")
    .insert({
      school_id: target.schoolId,
      provider: provider.name,
      asset_id: target.assetId,
      upload_id: target.uploadId,
    })
    .select("id")
    .single();

  try {
    if (target.assetId) await provider.deleteAsset(target.assetId);
    else if (target.uploadId) await provider.cancelUpload(target.uploadId);
    if (queued) await db.from("video_provider_cleanup").delete().eq("id", queued.id);
    return true;
  } catch (error) {
    if (queued) {
      await db
        .from("video_provider_cleanup")
        .update({
          attempts: 1,
          last_error: error instanceof Error ? error.message.slice(0, 300) : "error desconocido",
        })
        .eq("id", queued.id);
    }
    return false;
  }
}

/** Reintenta los borrados pendientes en el proveedor. Devuelve cuántos se confirmaron. */
export async function retryProviderCleanup(
  db: Db,
  provider: VideoProvider,
  limit = 25,
): Promise<{ done: number; pending: number }> {
  const { data } = await db
    .from("video_provider_cleanup")
    .select("id, asset_id, upload_id, attempts")
    .eq("provider", provider.name)
    .order("created_at", { ascending: true })
    .limit(limit);

  let done = 0;
  for (const row of data ?? []) {
    try {
      if (row.asset_id) await provider.deleteAsset(row.asset_id as string);
      else if (row.upload_id) await provider.cancelUpload(row.upload_id as string);
      await db.from("video_provider_cleanup").delete().eq("id", row.id);
      done += 1;
    } catch (error) {
      await db
        .from("video_provider_cleanup")
        .update({
          attempts: (row.attempts as number) + 1,
          last_error: error instanceof Error ? error.message.slice(0, 300) : "error desconocido",
        })
        .eq("id", row.id);
    }
  }
  const { count } = await db
    .from("video_provider_cleanup")
    .select("id", { count: "exact", head: true })
    .eq("provider", provider.name);
  return { done, pending: count ?? 0 };
}

// ───────────────────────────── lectura ─────────────────────────────

export type VideoView = {
  id: string;
  goalkeeperId: string;
  authorId: string | null;
  authorName: string | null;
  title: string;
  topic: VideoTopic;
  durationSec: number | null;
  /** Estado efectivo: una subida que lleva demasiado sin avanzar se muestra con error. */
  processingStatus: ProcessingStatus;
  errorReason: string | null;
  publicationStatus: PublicationStatus;
  publishedAt: string | null;
  createdAt: string;
  /** Se puede reproducir (ya procesado). Los identificadores del proveedor no salen del servidor. */
  playable: boolean;
};

type VideoRow = {
  id: string;
  goalkeeper_id: string;
  author_id: string | null;
  provider_upload_id: string | null;
  provider_asset_id: string | null;
  provider_playback_id: string | null;
  title: string;
  topic: VideoTopic;
  duration_sec: number | null;
  processing_status: ProcessingStatus;
  error_reason: string | null;
  publication_status: PublicationStatus;
  published_at: string | null;
  created_at: string;
};

const VIDEO_COLUMNS =
  "id, goalkeeper_id, author_id, provider_upload_id, provider_asset_id, provider_playback_id, title, topic, duration_sec, processing_status, error_reason, publication_status, published_at, created_at";

async function staffNames(
  db: Db,
  schoolId: string,
  userIds: (string | null)[],
): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return new Map();
  const { data } = await db
    .from("profile")
    .select("user_id, first_name, last_name")
    .eq("school_id", schoolId)
    .in("user_id", ids);
  return new Map(
    (data ?? []).map((p) => [p.user_id as string, `${p.first_name} ${p.last_name}`.trim()]),
  );
}

function toView(row: VideoRow, names: Map<string, string>, now: Date): VideoView {
  const stale = isStaleUpload(row.processing_status, row.created_at, now);
  return {
    id: row.id,
    goalkeeperId: row.goalkeeper_id,
    authorId: row.author_id,
    authorName: row.author_id ? (names.get(row.author_id) ?? null) : null,
    title: row.title,
    topic: row.topic,
    durationSec: row.duration_sec === null ? null : Number(row.duration_sec),
    processingStatus: stale ? "error" : row.processing_status,
    errorReason: stale ? "Se interrumpió la subida antes de terminar." : row.error_reason,
    publicationStatus: row.publication_status,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    playable: row.processing_status === "ready" && Boolean(row.provider_playback_id),
  };
}

/** Videos de un arquero (RF-25 y RF-33): todos, de la más reciente a la más antigua, con filtro por tema. */
export async function listVideos(
  db: Db,
  schoolId: string,
  goalkeeperId: string,
  filters: { topic?: VideoTopic } = {},
  now: Date = new Date(),
): Promise<VideoView[]> {
  let query = db
    .from("video")
    .select(VIDEO_COLUMNS)
    .eq("school_id", schoolId)
    .eq("goalkeeper_id", goalkeeperId)
    .order("created_at", { ascending: false });
  if (filters.topic) query = query.eq("topic", filters.topic);

  const { data } = await query;
  const rows = (data ?? []) as unknown as VideoRow[];
  const names = await staffNames(
    db,
    schoolId,
    rows.map((r) => r.author_id),
  );
  return rows.map((r) => toView(r, names, now));
}

export type CommentView = {
  id: string;
  authorId: string | null;
  authorName: string | null;
  second: number | null;
  body: string;
  createdAt: string;
};

export type VideoDetail = VideoView & {
  comments: CommentView[];
  /** Evaluaciones a las que este video sirve de respaldo. */
  evaluationIds: string[];
};

export async function getVideo(
  db: Db,
  schoolId: string,
  videoId: string,
  now: Date = new Date(),
): Promise<VideoDetail | null> {
  const { data } = await db
    .from("video")
    .select(VIDEO_COLUMNS)
    .eq("school_id", schoolId)
    .eq("id", videoId)
    .maybeSingle();
  const row = data as unknown as VideoRow | null;
  if (!row) return null;

  const [{ data: comments }, { data: links }] = await Promise.all([
    db
      .from("video_comment")
      .select("id, author_id, second, body, created_at")
      .eq("school_id", schoolId)
      .eq("video_id", videoId)
      // Primero los que tienen marca, en orden de aparición; los generales al final.
      .order("second", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
    db
      .from("evaluation_video")
      .select("evaluation_id")
      .eq("school_id", schoolId)
      .eq("video_id", videoId),
  ]);
  const names = await staffNames(db, schoolId, [
    row.author_id,
    ...(comments ?? []).map((c) => c.author_id as string | null),
  ]);

  return {
    ...toView(row, names, now),
    comments: (comments ?? []).map((c) => ({
      id: c.id as string,
      authorId: c.author_id as string | null,
      authorName: c.author_id ? (names.get(c.author_id as string) ?? null) : null,
      second: c.second as number | null,
      body: c.body as string,
      createdAt: c.created_at as string,
    })),
    evaluationIds: (links ?? []).map((l) => l.evaluation_id as string),
  };
}

/** Lo que necesita la reproducción: el id de reproducción del proveedor de un video de la escuela. */
export async function getPlaybackTarget(
  db: Db,
  schoolId: string,
  videoId: string,
): Promise<{ playbackId: string; goalkeeperId: string } | null> {
  const { data } = await db
    .from("video")
    .select("provider_playback_id, goalkeeper_id, processing_status")
    .eq("school_id", schoolId)
    .eq("id", videoId)
    .maybeSingle();
  if (!data || data.processing_status !== "ready" || !data.provider_playback_id) return null;
  return {
    playbackId: data.provider_playback_id as string,
    goalkeeperId: data.goalkeeper_id as string,
  };
}

// ───────────────────────────── subida ─────────────────────────────

export type UploadError =
  | "not_found"
  | "not_active"
  | "consent_required"
  | "quota_exceeded"
  | "provider_error"
  | "forbidden"
  | "not_restartable"
  | "failed";

export type StartUploadResult =
  { ok: true; videoId: string; uploadUrl: string } | { ok: false; error: UploadError };

/**
 * Valida que se pueda subir un video de este arquero: activo (RN-05), con consentimiento vigente
 * (RF-03) y con cuota disponible (RF-30). Una subida en curso cuando se llega al tope se acepta;
 * las nuevas se bloquean (spec 03, casos borde).
 */
async function checkUploadAllowed(
  db: Db,
  schoolId: string,
  goalkeeperId: string,
): Promise<UploadError | null> {
  const { data: goalkeeper } = await db
    .from("goalkeeper")
    .select("status")
    .eq("id", goalkeeperId)
    .eq("school_id", schoolId)
    .maybeSingle();
  if (!goalkeeper) return "not_found";
  if (goalkeeper.status !== "active") return "not_active";

  const { data: consent } = await db
    .from("consent")
    .select("id")
    .eq("school_id", schoolId)
    .eq("goalkeeper_id", goalkeeperId)
    .eq("type", "media")
    .is("revoked_at", null)
    .limit(1);
  if (!consent?.length) return "consent_required";

  if ((await getVideoQuota(db, schoolId)).level === "blocked") return "quota_exceeded";
  return null;
}

export async function startUpload(
  db: Db,
  provider: VideoProvider,
  input: Actor & { goalkeeperId: string; data: UploadInput; corsOrigin: string; today: string },
): Promise<StartUploadResult> {
  const blocked = await checkUploadAllowed(db, input.schoolId, input.goalkeeperId);
  if (blocked) return { ok: false, error: blocked };

  const videoId = crypto.randomUUID();
  const { error } = await db.from("video").insert({
    id: videoId,
    school_id: input.schoolId,
    goalkeeper_id: input.goalkeeperId,
    author_id: input.actorId,
    provider: provider.name,
    title: input.data.title ?? defaultVideoTitle(input.data.topic, input.today),
    topic: input.data.topic,
  });
  if (error) return { ok: false, error: error.code === PG_CHECK ? "consent_required" : "failed" };

  try {
    const upload = await provider.createUpload({ videoId, corsOrigin: input.corsOrigin });
    await db
      .from("video")
      .update({ provider_upload_id: upload.uploadId })
      .eq("id", videoId)
      .eq("school_id", input.schoolId);
    await audit(db, input, "video.upload_started", videoId, { goalkeeperId: input.goalkeeperId });
    return { ok: true, videoId, uploadUrl: upload.uploadUrl };
  } catch {
    await db.from("video").delete().eq("id", videoId).eq("school_id", input.schoolId);
    return { ok: false, error: "provider_error" };
  }
}

type Existing = VideoRow & { school_id: string };

async function loadVideo(db: Db, schoolId: string, videoId: string): Promise<Existing | null> {
  const { data } = await db
    .from("video")
    .select(`${VIDEO_COLUMNS}, school_id`)
    .eq("school_id", schoolId)
    .eq("id", videoId)
    .maybeSingle();
  return (data as unknown as Existing | null) ?? null;
}

/** Lo puede tocar quien lo subió y cualquier admin (RF-26). */
const canManage = (actor: Actor, row: Pick<VideoRow, "author_id">) =>
  actor.role === "school_admin" || row.author_id === actor.actorId;

/**
 * Vuelve a subir un video que quedó con error o se interrumpió: se reutilizan el tema y el título,
 * se descarta lo que hubiera quedado en el proveedor y se crea una subida nueva (RN-03).
 */
export async function restartUpload(
  db: Db,
  provider: VideoProvider,
  input: Actor & { videoId: string; corsOrigin: string },
  now: Date = new Date(),
): Promise<StartUploadResult> {
  const row = await loadVideo(db, input.schoolId, input.videoId);
  if (!row) return { ok: false, error: "not_found" };
  if (!canManage(input, row)) return { ok: false, error: "forbidden" };
  const view = toView(row, new Map(), now);
  if (view.processingStatus !== "error") return { ok: false, error: "not_restartable" };

  const blocked = await checkUploadAllowed(db, input.schoolId, row.goalkeeper_id);
  if (blocked) return { ok: false, error: blocked };

  try {
    const upload = await provider.createUpload({ videoId: row.id, corsOrigin: input.corsOrigin });
    await removeFromProvider(db, provider, {
      schoolId: input.schoolId,
      assetId: row.provider_asset_id,
      uploadId: row.provider_asset_id ? null : row.provider_upload_id,
    });
    await db
      .from("video")
      .update({
        provider_upload_id: upload.uploadId,
        provider_asset_id: null,
        provider_playback_id: null,
        duration_sec: null,
        processing_status: "uploading",
        error_reason: null,
        // Reinicia el reloj de la subida interrumpida.
        created_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("school_id", input.schoolId);
    await audit(db, input, "video.upload_restarted", row.id);
    return { ok: true, videoId: row.id, uploadUrl: upload.uploadUrl };
  } catch {
    return { ok: false, error: "provider_error" };
  }
}

// ───────────────────────────── avisos del proveedor ─────────────────────────────

/** Marca el video como en proceso cuando el celular terminó de subirlo (RF-05). */
export async function markUploadFinished(
  db: Db,
  input: Pick<Actor, "schoolId" | "actorId"> & { videoId: string },
): Promise<void> {
  await db
    .from("video")
    .update({ processing_status: "processing" })
    .eq("id", input.videoId)
    .eq("school_id", input.schoolId)
    .eq("processing_status", "uploading");
}

async function findForEvent(
  db: Db,
  ref: { videoId?: string | null; assetId?: string | null; uploadId?: string | null },
): Promise<Existing | null> {
  const attempts: [string, string][] = [];
  if (ref.videoId) attempts.push(["id", ref.videoId]);
  if (ref.assetId) attempts.push(["provider_asset_id", ref.assetId]);
  if (ref.uploadId) attempts.push(["provider_upload_id", ref.uploadId]);
  for (const [column, value] of attempts) {
    const { data } = await db
      .from("video")
      .select(`${VIDEO_COLUMNS}, school_id`)
      .eq(column, value)
      .maybeSingle();
    if (data) return data as unknown as Existing;
  }
  return null;
}

/**
 * Aplica un aviso del proveedor (o lo que se consultó directamente). Es idempotente: el mismo aviso
 * dos veces, o fuera de orden, no cambia el resultado. Si el video ya no existe (se borró mientras
 * se procesaba), el archivo que acaba de aparecer en el proveedor se borra.
 */
export async function applyProviderEvent(
  db: Db,
  provider: VideoProvider,
  event: ProviderEvent,
): Promise<{ handled: boolean }> {
  switch (event.type) {
    case "ignored":
      return { handled: false };

    case "upload_asset_created": {
      const row = await findForEvent(db, { videoId: event.videoId, uploadId: event.uploadId });
      if (!row) {
        await removeFromProvider(db, provider, {
          schoolId: null,
          assetId: event.assetId,
          uploadId: null,
        });
        return { handled: true };
      }
      if (row.processing_status === "uploading" || row.processing_status === "processing") {
        await db
          .from("video")
          .update({ provider_asset_id: event.assetId, processing_status: "processing" })
          .eq("id", row.id)
          .eq("school_id", row.school_id);
      }
      return { handled: true };
    }

    case "asset_ready": {
      const row = await findForEvent(db, { videoId: event.videoId, assetId: event.assetId });
      if (!row) {
        await removeFromProvider(db, provider, {
          schoolId: null,
          assetId: event.assetId,
          uploadId: null,
        });
        return { handled: true };
      }
      if (row.processing_status === "ready" && row.provider_asset_id === event.assetId) {
        return { handled: true };
      }
      // RF-02: la duración se vuelve a validar acá, con el dato del proveedor (CA-02).
      if (event.durationSec !== null && event.durationSec > MAX_VIDEO_SECONDS + 1) {
        await db
          .from("video")
          .update({
            processing_status: "error",
            error_reason: "El video dura más de 3 minutos.",
            provider_asset_id: null,
            provider_playback_id: null,
          })
          .eq("id", row.id)
          .eq("school_id", row.school_id);
        await removeFromProvider(db, provider, {
          schoolId: row.school_id,
          assetId: event.assetId,
          uploadId: null,
        });
        return { handled: true };
      }
      await db
        .from("video")
        .update({
          provider_asset_id: event.assetId,
          provider_playback_id: event.playbackId,
          duration_sec: event.durationSec,
          processing_status: event.playbackId ? "ready" : "error",
          error_reason: event.playbackId ? null : "El proveedor no generó la reproducción.",
        })
        .eq("id", row.id)
        .eq("school_id", row.school_id);
      return { handled: true };
    }

    case "asset_errored": {
      const row = await findForEvent(db, { videoId: event.videoId, assetId: event.assetId });
      if (!row) {
        await removeFromProvider(db, provider, {
          schoolId: null,
          assetId: event.assetId,
          uploadId: null,
        });
        return { handled: true };
      }
      await db
        .from("video")
        .update({
          processing_status: "error",
          error_reason: event.message.slice(0, 300),
          // Un video con error no se puede publicar.
          publication_status: "draft",
          published_at: null,
        })
        .eq("id", row.id)
        .eq("school_id", row.school_id);
      return { handled: true };
    }

    case "upload_failed": {
      const row = await findForEvent(db, { uploadId: event.uploadId });
      if (row && row.processing_status === "uploading") {
        await db
          .from("video")
          .update({ processing_status: "error", error_reason: event.message.slice(0, 300) })
          .eq("id", row.id)
          .eq("school_id", row.school_id);
      }
      return { handled: true };
    }
  }
}

/**
 * Consulta al proveedor el estado de los videos que todavía no terminaron, por si el aviso no
 * llegó (por ejemplo en desarrollo, donde el proveedor no alcanza la aplicación). Devuelve los
 * videos ya actualizados.
 */
export async function refreshProcessing(
  db: Db,
  provider: VideoProvider,
  schoolId: string,
  videoIds: string[],
): Promise<void> {
  if (videoIds.length === 0) return;
  const { data } = await db
    .from("video")
    .select(`${VIDEO_COLUMNS}, school_id`)
    .eq("school_id", schoolId)
    .in("id", videoIds)
    .in("processing_status", ["uploading", "processing"]);

  for (const row of (data ?? []) as unknown as Existing[]) {
    try {
      let assetId = row.provider_asset_id;
      if (!assetId && row.provider_upload_id) {
        const upload = await provider.getUpload(row.provider_upload_id);
        if (!upload) continue;
        if (upload.status === "asset_created" && upload.assetId) {
          assetId = upload.assetId;
          await applyProviderEvent(db, provider, {
            type: "upload_asset_created",
            uploadId: row.provider_upload_id,
            assetId,
            videoId: row.id,
          });
        } else if (
          upload.status === "errored" ||
          upload.status === "cancelled" ||
          upload.status === "timed_out"
        ) {
          await applyProviderEvent(db, provider, {
            type: "upload_failed",
            uploadId: row.provider_upload_id,
            message: upload.errorMessage ?? "La subida no se completó.",
          });
          continue;
        }
      }
      if (!assetId) continue;
      const asset = await provider.getAsset(assetId);
      if (!asset) continue;
      if (asset.status === "ready") {
        await applyProviderEvent(db, provider, {
          type: "asset_ready",
          assetId,
          videoId: row.id,
          durationSec: asset.durationSec,
          playbackId: asset.playbackId,
        });
      } else if (asset.status === "errored") {
        await applyProviderEvent(db, provider, {
          type: "asset_errored",
          assetId,
          videoId: row.id,
          message: asset.errorMessage ?? "El proveedor no pudo procesar el video.",
        });
      }
    } catch {
      // El proveedor puede estar caído: el video queda como está y se vuelve a consultar.
    }
  }
}

// ───────────────────────────── edición y publicación ─────────────────────────────

export type ChangeResult =
  { ok: true } | { ok: false; error: "not_found" | "forbidden" | "not_ready" | "failed" };

export async function updateVideo(
  db: Db,
  input: Actor & { videoId: string; data: VideoEditInput },
): Promise<ChangeResult> {
  const row = await loadVideo(db, input.schoolId, input.videoId);
  if (!row) return { ok: false, error: "not_found" };
  if (!canManage(input, row)) return { ok: false, error: "forbidden" };

  const { error } = await db
    .from("video")
    .update({ title: input.data.title, topic: input.data.topic })
    .eq("id", input.videoId)
    .eq("school_id", input.schoolId);
  if (error) return { ok: false, error: "failed" };
  await audit(db, input, "video.updated", input.videoId);
  return { ok: true };
}

/**
 * Publica un video ya procesado (RF-11 y RF-12) y deja el aviso en la cola del mail, que se manda
 * agrupado (RF-13). Un video se avisa una sola vez, aunque se despublique y se vuelva a publicar.
 */
export async function publishVideo(
  db: Db,
  input: Actor & { videoId: string },
): Promise<ChangeResult> {
  const row = await loadVideo(db, input.schoolId, input.videoId);
  if (!row) return { ok: false, error: "not_found" };
  if (!canManage(input, row)) return { ok: false, error: "forbidden" };
  if (row.processing_status !== "ready") return { ok: false, error: "not_ready" };
  if (row.publication_status === "published") return { ok: true };

  const { error } = await db
    .from("video")
    .update({ publication_status: "published", published_at: new Date().toISOString() })
    .eq("id", input.videoId)
    .eq("school_id", input.schoolId);
  if (error) return { ok: false, error: "failed" };

  await db.from("video_notice").upsert(
    {
      school_id: input.schoolId,
      goalkeeper_id: row.goalkeeper_id,
      video_id: row.id,
    },
    { onConflict: "video_id", ignoreDuplicates: true },
  );
  await audit(db, input, "video.published", input.videoId);
  return { ok: true };
}

/** Vuelve el video a borrador (RF-14). El mail ya enviado no se retira. */
export async function unpublishVideo(
  db: Db,
  input: Actor & { videoId: string },
): Promise<ChangeResult> {
  const row = await loadVideo(db, input.schoolId, input.videoId);
  if (!row) return { ok: false, error: "not_found" };
  if (!canManage(input, row)) return { ok: false, error: "forbidden" };
  if (row.publication_status === "draft") return { ok: true };

  const { error } = await db
    .from("video")
    .update({ publication_status: "draft", published_at: null })
    .eq("id", input.videoId)
    .eq("school_id", input.schoolId);
  if (error) return { ok: false, error: "failed" };
  await audit(db, input, "video.unpublished", input.videoId);
  return { ok: true };
}

// ───────────────────────────── borrado ─────────────────────────────

export type DeleteResult =
  | { ok: true; providerConfirmed: boolean }
  | { ok: false; error: "not_found" | "forbidden" | "failed" };

/**
 * Borra un video (RF-26 y RF-27): solo el admin (CA-08). Se libera su cuota, se desvincula de las
 * evaluaciones y se borra del proveedor, con reintentos si falla (CA-10). Borrar dos veces el mismo
 * video no falla: la segunda operación lo encuentra ya borrado (spec 03, casos borde).
 *
 * Un video con error, o cuya subida se interrumpió, lo puede descartar también quien lo subió
 * (RN-03): `discard: true`.
 */
export async function deleteVideo(
  db: Db,
  provider: VideoProvider,
  input: Actor & { videoId: string; discard?: boolean },
  now: Date = new Date(),
): Promise<DeleteResult> {
  const row = await loadVideo(db, input.schoolId, input.videoId);
  if (!row) return { ok: true, providerConfirmed: true };

  const isAdmin = input.role === "school_admin";
  const discardable =
    input.discard === true &&
    row.author_id === input.actorId &&
    toView(row, new Map(), now).processingStatus === "error";
  if (!isAdmin && !discardable) return { ok: false, error: "forbidden" };

  const { data, error } = await db
    .from("video")
    .delete()
    .eq("id", input.videoId)
    .eq("school_id", input.schoolId)
    .select("id");
  if (error) return { ok: false, error: "failed" };
  if (!data?.length) return { ok: true, providerConfirmed: true };

  const providerConfirmed = await removeFromProvider(db, provider, {
    schoolId: input.schoolId,
    assetId: row.provider_asset_id,
    uploadId: row.provider_asset_id ? null : row.provider_upload_id,
  });
  await audit(db, input, "video.deleted", input.videoId, {
    goalkeeperId: row.goalkeeper_id,
    providerConfirmed,
  });
  return { ok: true, providerConfirmed };
}

/**
 * Borra todos los videos de un arquero: lo usa el admin cuando la familia retiró el consentimiento
 * y decide eliminarlos (RF-32), y la eliminación definitiva del arquero (RN-07). Devuelve cuántos
 * archivos quedaron pendientes de confirmar en el proveedor.
 */
export async function deleteGoalkeeperVideos(
  db: Db,
  provider: VideoProvider,
  input: Pick<Actor, "schoolId" | "actorId"> & { goalkeeperId: string },
): Promise<{ deleted: number; pendingAtProvider: number }> {
  const { data } = await db
    .from("video")
    .select("id, provider_asset_id, provider_upload_id")
    .eq("school_id", input.schoolId)
    .eq("goalkeeper_id", input.goalkeeperId);

  let pendingAtProvider = 0;
  for (const row of data ?? []) {
    const { data: removed } = await db
      .from("video")
      .delete()
      .eq("id", row.id)
      .eq("school_id", input.schoolId)
      .select("id");
    if (!removed?.length) continue;
    const confirmed = await removeFromProvider(db, provider, {
      schoolId: input.schoolId,
      assetId: row.provider_asset_id as string | null,
      uploadId: row.provider_asset_id ? null : (row.provider_upload_id as string | null),
    });
    if (!confirmed) pendingAtProvider += 1;
  }
  const deleted = (data ?? []).length;
  if (deleted > 0) {
    await audit(db, input, "video.bulk_deleted", input.goalkeeperId, {
      deleted,
      pendingAtProvider,
    });
  }
  return { deleted, pendingAtProvider };
}

// ───────────────────────────── comentarios ─────────────────────────────

export type CommentResult =
  | { ok: true; commentId: string }
  | { ok: false; error: "not_found" | "forbidden" | "invalid_second" | "failed" };

/** Solo el staff comenta (RF-16); un comentario puede ser general (sin marca de tiempo). */
export async function addComment(
  db: Db,
  input: Actor & { videoId: string; data: CommentInput },
): Promise<CommentResult> {
  const row = await loadVideo(db, input.schoolId, input.videoId);
  if (!row) return { ok: false, error: "not_found" };
  if (
    input.data.second !== null &&
    row.duration_sec !== null &&
    input.data.second > Math.ceil(Number(row.duration_sec))
  ) {
    return { ok: false, error: "invalid_second" };
  }

  const { data, error } = await db
    .from("video_comment")
    .insert({
      school_id: input.schoolId,
      video_id: input.videoId,
      author_id: input.actorId,
      second: input.data.second,
      body: input.data.body,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "failed" };
  await audit(db, input, "video.comment_added", input.videoId, { commentId: data.id });
  return { ok: true, commentId: data.id };
}

async function loadComment(db: Db, schoolId: string, commentId: string) {
  const { data } = await db
    .from("video_comment")
    .select("id, video_id, author_id, second")
    .eq("school_id", schoolId)
    .eq("id", commentId)
    .maybeSingle();
  return data as {
    id: string;
    video_id: string;
    author_id: string | null;
    second: number | null;
  } | null;
}

/** El autor edita y borra sus comentarios; el admin, cualquiera (RF-17). */
export async function updateComment(
  db: Db,
  input: Actor & { commentId: string; data: CommentInput },
): Promise<ChangeResult> {
  const comment = await loadComment(db, input.schoolId, input.commentId);
  if (!comment) return { ok: false, error: "not_found" };
  if (!canManage(input, comment)) return { ok: false, error: "forbidden" };

  const { error } = await db
    .from("video_comment")
    .update({ body: input.data.body, second: input.data.second })
    .eq("id", input.commentId)
    .eq("school_id", input.schoolId);
  if (error) return { ok: false, error: "failed" };
  await audit(db, input, "video.comment_updated", comment.video_id, { commentId: input.commentId });
  return { ok: true };
}

export async function deleteComment(
  db: Db,
  input: Actor & { commentId: string },
): Promise<ChangeResult> {
  const comment = await loadComment(db, input.schoolId, input.commentId);
  if (!comment) return { ok: true }; // ya estaba borrado
  if (!canManage(input, comment)) return { ok: false, error: "forbidden" };

  const { error } = await db
    .from("video_comment")
    .delete()
    .eq("id", input.commentId)
    .eq("school_id", input.schoolId);
  if (error) return { ok: false, error: "failed" };
  await audit(db, input, "video.comment_deleted", comment.video_id, { commentId: input.commentId });
  return { ok: true };
}

// ───────────────────────────── videos de respaldo de una evaluación ─────────────────────────────

export type LinkResult =
  { ok: true } | { ok: false; error: "not_found" | "forbidden" | "wrong_goalkeeper" | "failed" };

/**
 * Define qué videos respaldan una evaluación (RF-19). Todos deben ser del mismo arquero que la
 * evaluación. Pueden adjuntarse a una evaluación quien la cargó y los admins. El video sigue siendo
 * independiente y se publica por separado (RF-20).
 */
export async function setEvaluationVideos(
  db: Db,
  input: Actor & { evaluationId: string; videoIds: string[] },
): Promise<LinkResult> {
  const { data: evaluation } = await db
    .from("evaluation")
    .select("id, goalkeeper_id, author_id")
    .eq("school_id", input.schoolId)
    .eq("id", input.evaluationId)
    .maybeSingle();
  if (!evaluation) return { ok: false, error: "not_found" };
  if (input.role !== "school_admin" && evaluation.author_id !== input.actorId) {
    return { ok: false, error: "forbidden" };
  }

  const ids = [...new Set(input.videoIds)];
  if (ids.length > 0) {
    const { data: videos } = await db
      .from("video")
      .select("id")
      .eq("school_id", input.schoolId)
      .eq("goalkeeper_id", evaluation.goalkeeper_id)
      .in("id", ids);
    if ((videos ?? []).length !== ids.length) return { ok: false, error: "wrong_goalkeeper" };
  }

  const { data: current } = await db
    .from("evaluation_video")
    .select("video_id")
    .eq("school_id", input.schoolId)
    .eq("evaluation_id", input.evaluationId);
  const existing = new Set((current ?? []).map((l) => l.video_id as string));
  const toRemove = [...existing].filter((id) => !ids.includes(id));
  const toAdd = ids.filter((id) => !existing.has(id));

  if (toRemove.length > 0) {
    const { error } = await db
      .from("evaluation_video")
      .delete()
      .eq("school_id", input.schoolId)
      .eq("evaluation_id", input.evaluationId)
      .in("video_id", toRemove);
    if (error) return { ok: false, error: "failed" };
  }
  if (toAdd.length > 0) {
    const { error } = await db.from("evaluation_video").insert(
      toAdd.map((videoId) => ({
        evaluation_id: input.evaluationId,
        video_id: videoId,
        school_id: input.schoolId,
      })),
    );
    if (error) return { ok: false, error: "failed" };
  }
  if (toRemove.length + toAdd.length > 0) {
    await audit(db, input, "evaluation.videos_changed", input.evaluationId, {
      added: toAdd.length,
      removed: toRemove.length,
    });
  }
  return { ok: true };
}

/** Videos adjuntos a una evaluación (para el staff: de cualquier estado). */
export async function listEvaluationVideos(
  db: Db,
  schoolId: string,
  evaluationId: string,
): Promise<VideoView[]> {
  const { data: links } = await db
    .from("evaluation_video")
    .select("video_id")
    .eq("school_id", schoolId)
    .eq("evaluation_id", evaluationId);
  const ids = (links ?? []).map((l) => l.video_id as string);
  if (ids.length === 0) return [];

  const { data } = await db
    .from("video")
    .select(VIDEO_COLUMNS)
    .eq("school_id", schoolId)
    .in("id", ids)
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as unknown as VideoRow[];
  const names = await staffNames(
    db,
    schoolId,
    rows.map((r) => r.author_id),
  );
  const now = new Date();
  return rows.map((r) => toView(r, names, now));
}

// ───────────────────────────── aviso por mail, agrupado ─────────────────────────────

export type FlushResult = { groups: number; mails: number; failed: number };

/**
 * Manda los avisos de "video publicado" que ya cumplieron su ventana de 30 minutos (RF-13): los
 * videos publicados seguidos de un mismo arquero salen en un solo mail. Se llama desde una tarea
 * programada y, mientras no la haya, de forma oportunista. Solo avisa de videos que siguen
 * publicados y de arqueros con consentimiento vigente; los demás se descartan del aviso.
 */
export async function flushVideoNotices(
  db: Db,
  transport: EmailTransport,
  now: Date = new Date(),
): Promise<FlushResult> {
  const { data: pending } = await db
    .from("video_notice")
    .select("id, school_id, goalkeeper_id, video_id, created_at")
    .is("sent_at", null)
    .order("created_at", { ascending: true });

  const groups = new Map<string, NonNullable<typeof pending>>();
  for (const notice of pending ?? []) {
    const key = `${notice.school_id}:${notice.goalkeeper_id}`;
    groups.set(key, [...(groups.get(key) ?? []), notice]);
  }

  const result: FlushResult = { groups: 0, mails: 0, failed: 0 };
  const windowMs = NOTICE_WINDOW_MINUTES * 60_000;

  for (const notices of groups.values()) {
    // La ventana se abre con el primer video: el mail sale cuando pasaron 30 minutos desde él.
    if (now.getTime() - new Date(notices[0].created_at).getTime() < windowMs) continue;
    result.groups += 1;

    const schoolId = notices[0].school_id as string;
    const goalkeeperId = notices[0].goalkeeper_id as string;
    const noticeIds = notices.map((n) => n.id as string);
    const markSent = () =>
      db.from("video_notice").update({ sent_at: now.toISOString() }).in("id", noticeIds);

    const [
      { data: videos },
      { data: consent },
      { data: goalkeeper },
      { data: school },
      { data: links },
    ] = await Promise.all([
      db
        .from("video")
        .select("id, title")
        .eq("school_id", schoolId)
        .eq("publication_status", "published")
        .in(
          "id",
          notices.map((n) => n.video_id as string),
        ),
      db
        .from("consent")
        .select("id")
        .eq("school_id", schoolId)
        .eq("goalkeeper_id", goalkeeperId)
        .eq("type", "media")
        .is("revoked_at", null)
        .limit(1),
      db
        .from("goalkeeper")
        .select("first_name")
        .eq("school_id", schoolId)
        .eq("id", goalkeeperId)
        .maybeSingle(),
      db.from("school").select("name, slug, primary_color").eq("id", schoolId).maybeSingle(),
      db
        .from("goalkeeper_guardian")
        .select("guardian(email)")
        .eq("school_id", schoolId)
        .eq("goalkeeper_id", goalkeeperId),
    ]);

    const emails = [
      ...new Set(
        (links ?? [])
          .map((l) => (l.guardian as unknown as { email: string | null } | null)?.email)
          .filter((email): email is string => Boolean(email)),
      ),
    ];
    // Nada que avisar: videos despublicados o borrados, consentimiento retirado o sin mails cargados.
    if (!videos?.length || !consent?.length || !goalkeeper || !school || emails.length === 0) {
      await markSent();
      continue;
    }

    let sent = 0;
    for (const to of emails) {
      const outcome = await transport(
        videosPublishedEmail({
          to,
          schoolName: school.name as string,
          goalkeeperName: goalkeeper.first_name as string,
          titles: videos.map((v) => v.title as string),
          link: `${getAppUrl()}/${school.slug}/familia/${goalkeeperId}/videos`,
          accentColor: school.primary_color as string | null,
        }),
      );
      if (outcome.ok) sent += 1;
      else result.failed += 1;
    }
    result.mails += sent;
    // Si no salió ningún mail, se deja pendiente para reintentar en la próxima pasada.
    if (sent > 0) await markSent();
  }
  return result;
}
