"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { fieldErrorsFrom, type FieldErrors } from "@/lib/auth-schemas";
import { argentinaDate } from "@/lib/dates";
import {
  commentSchema,
  uploadInputSchema,
  videoEditSchema,
  type ProcessingStatus,
} from "@/lib/video-schemas";
import { requireStaff, type StaffSession } from "@/server/auth/guards";
import { getAppUrl } from "@/server/config";
import { createServiceClient } from "@/server/supabase";
import { getVideoProvider } from "@/server/video";
import {
  addComment,
  deleteComment,
  deleteGoalkeeperVideos,
  deleteVideo,
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
  type UploadError,
} from "@/server/videos";

/**
 * Cada acción vuelve a verificar, en el servidor y en vivo, la sesión y el rol. Los permisos finos
 * (autor, admin) los aplica la capa de servidor de videos.
 */

const actorOf = (session: StaffSession): Actor => ({
  schoolId: session.school.id,
  actorId: session.user.id,
  role: session.role,
});

const base = (slug: string, goalkeeperId: string) => `/${slug}/panel/arqueros/${goalkeeperId}`;

function refresh(slug: string, goalkeeperId: string, videoId?: string) {
  revalidatePath(base(slug, goalkeeperId));
  revalidatePath(`${base(slug, goalkeeperId)}/videos`);
  if (videoId) revalidatePath(`${base(slug, goalkeeperId)}/videos/${videoId}`);
  revalidatePath(`/${slug}/panel`);
}

const UPLOAD_ERRORS: Record<UploadError, string> = {
  not_found: "No encontramos al arquero.",
  not_active: "Solo se pueden subir videos de arqueros activos.",
  consent_required:
    "Este arquero no tiene el consentimiento de imagen y video vigente. Pedile a la familia que lo acepte desde el portal.",
  quota_exceeded:
    "La escuela alcanzó su tope de minutos de video. La administración puede borrar videos para liberar espacio, o pedir un tope mayor.",
  provider_error: "No pudimos preparar la subida. Probá de nuevo en un momento.",
  forbidden: "Solo quien subió el video o un administrador pueden hacer esto.",
  not_restartable: "Este video no necesita volver a subirse.",
  failed: "No pudimos guardar los cambios. Intentá de nuevo.",
};

/**
 * El origen desde el que el navegador sube el archivo: Mux lo necesita para permitir la subida
 * directa. Se toma del pedido (así funciona en cualquier puerto o dominio) y, si no viene, de APP_URL.
 */
async function requestOrigin(): Promise<string> {
  const origin = (await headers()).get("origin");
  if (origin && /^https?:\/\/[^/]+$/.test(origin)) return origin;
  return new URL(getAppUrl()).origin;
}

// ───────────────────────────── subida ─────────────────────────────

export type StartUploadState =
  | { ok: true; videoId: string; uploadUrl: string }
  | { ok: false; message: string; errors?: FieldErrors };

export async function startUploadAction(
  slug: string,
  goalkeeperId: string,
  input: { topic: string; title: string; durationSec: number },
): Promise<StartUploadState> {
  const session = await requireStaff(slug);
  const parsed = uploadInputSchema.safeParse(input);
  if (!parsed.success) {
    const errors = fieldErrorsFrom(parsed.error);
    return { ok: false, message: Object.values(errors)[0] ?? "Revisá los datos.", errors };
  }

  const result = await startUpload(createServiceClient(), getVideoProvider(), {
    ...actorOf(session),
    goalkeeperId,
    data: parsed.data,
    corsOrigin: await requestOrigin(),
    today: argentinaDate(new Date()),
  });
  if (!result.ok) return { ok: false, message: UPLOAD_ERRORS[result.error] };

  refresh(session.school.slug, goalkeeperId);
  return { ok: true, videoId: result.videoId, uploadUrl: result.uploadUrl };
}

/** Vuelve a subir un video con error o interrumpido: devuelve una dirección de subida nueva. */
export async function restartUploadAction(
  slug: string,
  goalkeeperId: string,
  videoId: string,
): Promise<StartUploadState> {
  const session = await requireStaff(slug);
  const result = await restartUpload(createServiceClient(), getVideoProvider(), {
    ...actorOf(session),
    videoId,
    corsOrigin: await requestOrigin(),
  });
  if (!result.ok) return { ok: false, message: UPLOAD_ERRORS[result.error] };

  refresh(session.school.slug, goalkeeperId, videoId);
  return { ok: true, videoId: result.videoId, uploadUrl: result.uploadUrl };
}

export type VideoProgress = {
  id: string;
  processingStatus: ProcessingStatus;
  errorReason: string | null;
};

/** El celular terminó de subir el archivo: pasa a "procesando" y se consulta al proveedor una vez. */
export async function finishUploadAction(
  slug: string,
  goalkeeperId: string,
  videoId: string,
): Promise<VideoProgress | null> {
  const session = await requireStaff(slug);
  const db = createServiceClient();
  await markUploadFinished(db, { ...actorOf(session), videoId });
  const [progress] = await refreshVideosAction(slug, goalkeeperId, [videoId]);
  return progress ?? null;
}

/**
 * Consulta el estado de los videos en proceso. Funciona aunque el aviso del proveedor no llegue
 * (por ejemplo en desarrollo) y es lo que mantiene el estado visible al profesor (RF-05).
 */
export async function refreshVideosAction(
  slug: string,
  goalkeeperId: string,
  videoIds: string[],
): Promise<VideoProgress[]> {
  const session = await requireStaff(slug);
  const db = createServiceClient();
  const provider = getVideoProvider();
  const ids = videoIds.slice(0, 20);
  await refreshProcessing(db, provider, session.school.id, ids);
  // Aprovecha para reintentar borrados pendientes en el proveedor (mejor esfuerzo).
  void retryProviderCleanup(db, provider, 3).catch(() => undefined);

  const { data } = await db
    .from("video")
    .select("id, processing_status, error_reason")
    .eq("school_id", session.school.id)
    .eq("goalkeeper_id", goalkeeperId)
    .in("id", ids);
  const progress = (data ?? []).map((row) => ({
    id: row.id as string,
    processingStatus: row.processing_status as ProcessingStatus,
    errorReason: row.error_reason as string | null,
  }));
  if (progress.some((p) => p.processingStatus === "ready" || p.processingStatus === "error")) {
    refresh(session.school.slug, goalkeeperId);
  }
  return progress;
}

// ───────────────────────────── edición y publicación ─────────────────────────────

export type VideoActionState = { error?: string; errors?: FieldErrors; ok?: boolean };

const CHANGE_ERRORS = {
  not_found: "No encontramos el video.",
  forbidden: "Solo quien subió el video o un administrador pueden hacer esto.",
  not_ready: "El video todavía se está procesando: se puede publicar cuando esté listo.",
  failed: "No pudimos guardar los cambios. Intentá de nuevo.",
} as const;

const text = (formData: FormData, key: string): string => {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
};

export async function updateVideoAction(
  slug: string,
  goalkeeperId: string,
  videoId: string,
  _previous: VideoActionState,
  formData: FormData,
): Promise<VideoActionState> {
  const session = await requireStaff(slug);
  const parsed = videoEditSchema.safeParse({
    title: text(formData, "title"),
    topic: text(formData, "topic"),
  });
  if (!parsed.success) return { errors: fieldErrorsFrom(parsed.error) };

  const result = await updateVideo(createServiceClient(), {
    ...actorOf(session),
    videoId,
    data: parsed.data,
  });
  if (!result.ok) return { error: CHANGE_ERRORS[result.error] };
  refresh(session.school.slug, goalkeeperId, videoId);
  return { ok: true };
}

export async function publishVideoAction(
  slug: string,
  goalkeeperId: string,
  videoId: string,
  _previous: VideoActionState,
): Promise<VideoActionState> {
  const session = await requireStaff(slug);
  const result = await publishVideo(createServiceClient(), { ...actorOf(session), videoId });
  if (!result.ok) return { error: CHANGE_ERRORS[result.error] };
  refresh(session.school.slug, goalkeeperId, videoId);
  return { ok: true };
}

export async function unpublishVideoAction(
  slug: string,
  goalkeeperId: string,
  videoId: string,
  _previous: VideoActionState,
): Promise<VideoActionState> {
  const session = await requireStaff(slug);
  const result = await unpublishVideo(createServiceClient(), { ...actorOf(session), videoId });
  if (!result.ok) return { error: CHANGE_ERRORS[result.error] };
  refresh(session.school.slug, goalkeeperId, videoId);
  return { ok: true };
}

/** Borrar (admin) o descartar un video con error (quien lo subió). Vuelve a la lista de videos. */
export async function deleteVideoAction(
  slug: string,
  goalkeeperId: string,
  videoId: string,
  discard: boolean,
  _previous: VideoActionState,
): Promise<VideoActionState> {
  const session = await requireStaff(slug);
  const result = await deleteVideo(createServiceClient(), getVideoProvider(), {
    ...actorOf(session),
    videoId,
    discard,
  });
  if (!result.ok) return { error: CHANGE_ERRORS[result.error] };
  refresh(session.school.slug, goalkeeperId);
  redirect(`${base(session.school.slug, goalkeeperId)}/videos?borrado=1`);
}

/** El admin borra todos los videos de un arquero (por ejemplo, tras retirarse el consentimiento). */
export async function deleteAllVideosAction(
  slug: string,
  goalkeeperId: string,
  _previous: VideoActionState,
): Promise<VideoActionState> {
  const session = await requireStaff(slug);
  if (session.role !== "school_admin") return { error: CHANGE_ERRORS.forbidden };
  await deleteGoalkeeperVideos(createServiceClient(), getVideoProvider(), {
    schoolId: session.school.id,
    actorId: session.user.id,
    goalkeeperId,
  });
  refresh(session.school.slug, goalkeeperId);
  return { ok: true };
}

// ───────────────────────────── comentarios ─────────────────────────────

const COMMENT_ERRORS = {
  ...CHANGE_ERRORS,
  invalid_second: "La marca de tiempo es posterior al final del video.",
} as const;

export async function addCommentAction(
  slug: string,
  goalkeeperId: string,
  videoId: string,
  input: { body: string; second: number | null },
): Promise<VideoActionState> {
  const session = await requireStaff(slug);
  const parsed = commentSchema.safeParse(input);
  if (!parsed.success) return { errors: fieldErrorsFrom(parsed.error) };

  const result = await addComment(createServiceClient(), {
    ...actorOf(session),
    videoId,
    data: parsed.data,
  });
  if (!result.ok) return { error: COMMENT_ERRORS[result.error] };
  refresh(session.school.slug, goalkeeperId, videoId);
  return { ok: true };
}

export async function updateCommentAction(
  slug: string,
  goalkeeperId: string,
  videoId: string,
  commentId: string,
  input: { body: string; second: number | null },
): Promise<VideoActionState> {
  const session = await requireStaff(slug);
  const parsed = commentSchema.safeParse(input);
  if (!parsed.success) return { errors: fieldErrorsFrom(parsed.error) };

  const result = await updateComment(createServiceClient(), {
    ...actorOf(session),
    commentId,
    data: parsed.data,
  });
  if (!result.ok) return { error: CHANGE_ERRORS[result.error] };
  refresh(session.school.slug, goalkeeperId, videoId);
  return { ok: true };
}

export async function deleteCommentAction(
  slug: string,
  goalkeeperId: string,
  videoId: string,
  commentId: string,
): Promise<VideoActionState> {
  const session = await requireStaff(slug);
  const result = await deleteComment(createServiceClient(), { ...actorOf(session), commentId });
  if (!result.ok) return { error: CHANGE_ERRORS[result.error] };
  refresh(session.school.slug, goalkeeperId, videoId);
  return { ok: true };
}

// ───────────────────────────── videos de respaldo ─────────────────────────────

export async function setEvaluationVideosAction(
  slug: string,
  goalkeeperId: string,
  evaluationId: string,
  _previous: VideoActionState,
  formData: FormData,
): Promise<VideoActionState> {
  const session = await requireStaff(slug);
  const videoIds = formData.getAll("videoIds").filter((v): v is string => typeof v === "string");
  const result = await setEvaluationVideos(createServiceClient(), {
    ...actorOf(session),
    evaluationId,
    videoIds,
  });
  if (!result.ok) {
    return {
      error:
        result.error === "wrong_goalkeeper"
          ? "Alguno de los videos no es de este arquero."
          : result.error === "forbidden"
            ? "Solo quien cargó la evaluación o un administrador pueden adjuntar videos."
            : "No pudimos guardar los videos. Intentá de nuevo.",
    };
  }
  revalidatePath(`${base(session.school.slug, goalkeeperId)}/evaluaciones/${evaluationId}`);
  refresh(session.school.slug, goalkeeperId);
  return { ok: true };
}
