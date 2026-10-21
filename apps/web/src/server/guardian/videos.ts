import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isNewItem } from "@/lib/evolution";
import type { VideoTopic } from "@/lib/video-schemas";
import { consentStatusOf, type ConsentStatus } from "../goalkeepers";
import type { GuardianSession } from "./access";

/**
 * Videos para la familia (spec 04, RF-19 a RF-21; spec 03, RF-22 a RF-24 y RF-32). El cliente con
 * clave secreta se saltea RLS: acá solo se leen videos publicados y ya procesados, de arqueros
 * vinculados al tutor y con consentimiento vigente. Los identificadores del proveedor no salen.
 */

type Db = SupabaseClient;

export type FamilyVideo = {
  id: string;
  title: string;
  topic: VideoTopic;
  durationSec: number | null;
  publishedAt: string;
  authorName: string | null;
  isNew: boolean;
};

export type FamilyComment = {
  id: string;
  second: number | null;
  body: string;
  authorName: string | null;
};

async function consentOf(
  db: Db,
  session: GuardianSession,
  goalkeeperId: string,
): Promise<ConsentStatus> {
  const { data } = await db
    .from("consent")
    .select("revoked_at")
    .eq("school_id", session.schoolId)
    .eq("goalkeeper_id", goalkeeperId)
    .eq("type", "media");
  return consentStatusOf((data ?? []) as { revoked_at: string | null }[]);
}

async function isLinked(db: Db, session: GuardianSession, goalkeeperId: string): Promise<boolean> {
  const { data } = await db
    .from("goalkeeper_guardian")
    .select("goalkeeper_id")
    .eq("school_id", session.schoolId)
    .eq("guardian_id", session.guardianId)
    .eq("goalkeeper_id", goalkeeperId)
    .limit(1);
  return Boolean(data?.length);
}

async function authorNames(
  db: Db,
  schoolId: string,
  ids: (string | null)[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return new Map();
  const { data } = await db
    .from("profile")
    .select("user_id, first_name, last_name")
    .eq("school_id", schoolId)
    .in("user_id", unique);
  return new Map(
    (data ?? []).map((p) => [p.user_id as string, `${p.first_name} ${p.last_name}`.trim()]),
  );
}

export type FamilyVideos = {
  /** Sin consentimiento vigente no se muestra ningún video (RN-04). */
  consent: ConsentStatus;
  videos: FamilyVideo[];
  newCount: number;
};

/**
 * Lista de videos publicados del arquero, por fecha, con filtro por tema (RF-19). Quien llama ya
 * verificó que el arquero es del tutor; igual se revisa el vínculo y el consentimiento acá.
 */
export async function listFamilyVideos(
  db: Db,
  session: GuardianSession,
  goalkeeperId: string,
  filters: { topic?: VideoTopic } = {},
  now: Date = new Date(),
): Promise<FamilyVideos> {
  const consent = await consentOf(db, session, goalkeeperId);
  if (consent !== "valid" || !(await isLinked(db, session, goalkeeperId))) {
    return { consent, videos: [], newCount: 0 };
  }

  let query = db
    .from("video")
    .select("id, author_id, title, topic, duration_sec, published_at")
    .eq("school_id", session.schoolId)
    .eq("goalkeeper_id", goalkeeperId)
    .eq("publication_status", "published")
    .eq("processing_status", "ready")
    .order("published_at", { ascending: false });
  if (filters.topic) query = query.eq("topic", filters.topic);

  const [{ data }, { data: seen }] = await Promise.all([
    query,
    db
      .from("guardian_seen")
      .select("ref_id")
      .eq("school_id", session.schoolId)
      .eq("guardian_id", session.guardianId)
      .eq("goalkeeper_id", goalkeeperId)
      .eq("kind", "video"),
  ]);
  const seenIds = new Set((seen ?? []).map((s) => s.ref_id as string));
  const rows = data ?? [];
  const names = await authorNames(
    db,
    session.schoolId,
    rows.map((r) => r.author_id as string | null),
  );

  const videos = rows.map((r) => ({
    id: r.id as string,
    title: r.title as string,
    topic: r.topic as VideoTopic,
    durationSec: r.duration_sec === null ? null : Number(r.duration_sec),
    publishedAt: r.published_at as string,
    authorName: r.author_id ? (names.get(r.author_id as string) ?? null) : null,
    isNew: isNewItem(r.published_at as string, now, seenIds.has(r.id as string)),
  }));
  return { consent, videos, newCount: videos.filter((v) => v.isNew).length };
}

export type FamilyVideoDetail = FamilyVideo & { comments: FamilyComment[] };

/**
 * Un video que el tutor puede ver, o null: ajeno, borrador, sin procesar o sin consentimiento
 * vigente son todos "no encontrado" (CA-06 y CA-12).
 */
export async function getFamilyVideo(
  db: Db,
  session: GuardianSession,
  goalkeeperId: string,
  videoId: string,
  now: Date = new Date(),
): Promise<FamilyVideoDetail | null> {
  const { videos } = await listFamilyVideos(db, session, goalkeeperId, {}, now);
  const video = videos.find((v) => v.id === videoId);
  if (!video) return null;

  const { data } = await db
    .from("video_comment")
    .select("id, author_id, second, body")
    .eq("school_id", session.schoolId)
    .eq("video_id", videoId)
    .order("second", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  const rows = data ?? [];
  const names = await authorNames(
    db,
    session.schoolId,
    rows.map((r) => r.author_id as string | null),
  );
  return {
    ...video,
    comments: rows.map((r) => ({
      id: r.id as string,
      second: r.second as number | null,
      body: r.body as string,
      authorName: r.author_id ? (names.get(r.author_id as string) ?? null) : null,
    })),
  };
}

/**
 * Autoriza la reproducción de un video (RF-22): el vínculo del tutor con el arquero, el
 * consentimiento vigente, la publicación y el procesamiento se verifican en cada pedido, no solo
 * al abrir la página. Devuelve el id de reproducción del proveedor o null si no corresponde.
 */
export async function authorizeFamilyPlayback(
  db: Db,
  session: GuardianSession,
  videoId: string,
): Promise<{ playbackId: string; goalkeeperId: string } | null> {
  const { data: video } = await db
    .from("video")
    .select("goalkeeper_id, provider_playback_id")
    .eq("school_id", session.schoolId)
    .eq("id", videoId)
    .eq("publication_status", "published")
    .eq("processing_status", "ready")
    .maybeSingle();
  if (!video?.provider_playback_id) return null;

  const goalkeeperId = video.goalkeeper_id as string;
  if (!(await isLinked(db, session, goalkeeperId))) return null;
  if ((await consentOf(db, session, goalkeeperId)) !== "valid") return null;
  return { playbackId: video.provider_playback_id as string, goalkeeperId };
}

/** Marca como visto un video que el tutor abrió (RF-39). Solo registra videos que puede ver. */
export async function markVideoSeen(
  db: Db,
  session: GuardianSession,
  goalkeeperId: string,
  videoId: string,
): Promise<void> {
  const { videos } = await listFamilyVideos(db, session, goalkeeperId);
  if (!videos.some((v) => v.id === videoId)) return;
  await db.from("guardian_seen").upsert(
    {
      guardian_id: session.guardianId,
      goalkeeper_id: goalkeeperId,
      school_id: session.schoolId,
      kind: "video",
      ref_id: videoId,
    },
    { onConflict: "guardian_id,kind,ref_id", ignoreDuplicates: true },
  );
}

/**
 * Videos de respaldo de una evaluación para la familia (RF-21): solo si la evaluación y el video
 * están publicados, y con consentimiento vigente.
 */
export async function listFamilyEvaluationVideos(
  db: Db,
  session: GuardianSession,
  goalkeeperId: string,
  evaluationId: string,
): Promise<FamilyVideo[]> {
  const { data: evaluation } = await db
    .from("evaluation")
    .select("id")
    .eq("school_id", session.schoolId)
    .eq("goalkeeper_id", goalkeeperId)
    .eq("id", evaluationId)
    .eq("status", "published")
    .maybeSingle();
  if (!evaluation) return [];

  const { data: links } = await db
    .from("evaluation_video")
    .select("video_id")
    .eq("school_id", session.schoolId)
    .eq("evaluation_id", evaluationId);
  const ids = new Set((links ?? []).map((l) => l.video_id as string));
  if (ids.size === 0) return [];

  const { videos } = await listFamilyVideos(db, session, goalkeeperId);
  return videos.filter((v) => ids.has(v.id));
}
