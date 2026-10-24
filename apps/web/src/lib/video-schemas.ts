import { z } from "zod";
import "./zod-config";
import { formatCalendarDate } from "./dates";

/** Validaciones y reglas puras de videos (spec 03). Mensajes en español (es-AR). */

/** Tema: una categoría de la rúbrica u "otro" (RF-07). Las claves coinciden con `rubric_category.key`. */
export const VIDEO_TOPICS = [
  "save_technique",
  "aerial_play",
  "footwork",
  "positioning",
  "reflexes",
  "communication",
  "physical_coordination",
  "mindset",
  "other",
] as const;
export type VideoTopic = (typeof VIDEO_TOPICS)[number];

export const VIDEO_TOPIC_LABELS: Record<VideoTopic, string> = {
  save_technique: "Atajada",
  aerial_play: "Juego aéreo",
  footwork: "Juego con los pies",
  positioning: "Posicionamiento",
  reflexes: "Reflejos",
  communication: "Comunicación",
  physical_coordination: "Físico y coordinación",
  mindset: "Mentalidad",
  other: "Otro",
};

export const PROCESSING_STATUSES = ["uploading", "processing", "ready", "error"] as const;
export type ProcessingStatus = (typeof PROCESSING_STATUSES)[number];
export const PROCESSING_LABELS: Record<ProcessingStatus, string> = {
  uploading: "Subiendo",
  processing: "Procesando",
  ready: "Listo",
  error: "Con error",
};

export type PublicationStatus = "draft" | "published";

/** Duración máxima de un clip (RF-02). */
export const MAX_VIDEO_SECONDS = 180;
/** Una subida que no avanza en este tiempo se considera interrumpida (spec 03, casos borde). */
export const STALE_UPLOAD_MINUTES = 30;
/** Ventana en la que los videos publicados seguidos se agrupan en un solo mail (RF-13). */
export const NOTICE_WINDOW_MINUTES = 30;
/** Vigencia de la URL firmada de reproducción (RF-22). */
export const PLAYBACK_TOKEN_SECONDS = 60 * 60;

export function isVideoTopic(value: unknown): value is VideoTopic {
  return VIDEO_TOPICS.includes(value as VideoTopic);
}

/** Título por defecto cuando falta: el tema y la fecha (RF-06). */
export function defaultVideoTitle(topic: VideoTopic, date: string): string {
  return `${VIDEO_TOPIC_LABELS[topic]} · ${formatCalendarDate(date)}`;
}

/** "1:05" para 65 segundos. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export const uploadInputSchema = z.object({
  topic: z.enum(VIDEO_TOPICS, { error: "Elegí el tema del video." }),
  title: z
    .string()
    .trim()
    .max(120, "El título puede tener hasta 120 caracteres.")
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  /** Duración leída en el celular al elegir el archivo (se vuelve a validar en el servidor). */
  durationSec: z
    .number({ error: "No pudimos leer la duración del video." })
    .positive("No pudimos leer la duración del video.")
    .max(MAX_VIDEO_SECONDS, "El video dura más de 3 minutos. Recortalo y volvé a elegirlo."),
});
export type UploadInput = z.output<typeof uploadInputSchema>;

export const videoEditSchema = z.object({
  topic: z.enum(VIDEO_TOPICS, { error: "Elegí el tema del video." }),
  title: z
    .string({ error: "Escribí un título." })
    .trim()
    .min(1, "Escribí un título.")
    .max(120, "El título puede tener hasta 120 caracteres."),
});
export type VideoEditInput = z.output<typeof videoEditSchema>;

export const commentSchema = z.object({
  body: z
    .string({ error: "Escribí el comentario." })
    .trim()
    .min(1, "Escribí el comentario.")
    .max(1000, "El comentario puede tener hasta 1000 caracteres."),
  /** Segundo del video; `null` = comentario general (RF-15). */
  second: z
    .union([z.string().trim(), z.number(), z.null()])
    .optional()
    .transform((value) =>
      value === "" || value === undefined || value === null ? null : Number(value),
    )
    .refine(
      (value) => value === null || (Number.isInteger(value) && value >= 0 && value <= 36_000),
      "La marca de tiempo no es válida.",
    ),
});
export type CommentInput = z.output<typeof commentSchema>;

// ───────────────────────────── cuota de minutos ─────────────────────────────

export const QUOTA_WARNING_RATIO = 0.8;

export type QuotaLevel = "ok" | "warning" | "blocked";

export type Quota = {
  usedSeconds: number;
  usedMinutes: number;
  limitMinutes: number;
  /** Porcentaje usado, sin tope (puede pasar de 100). */
  percent: number;
  level: QuotaLevel;
};

/**
 * Estado de la cuota (RF-28 a RF-30): al 80% se avisa; al 100% se bloquean las nuevas subidas.
 * Con un tope de 0 minutos no se puede subir nada.
 */
export function quotaOf(usedSeconds: number, limitMinutes: number): Quota {
  const limitSeconds = limitMinutes * 60;
  const ratio = limitSeconds > 0 ? usedSeconds / limitSeconds : 1;
  return {
    usedSeconds,
    usedMinutes: Math.round((usedSeconds / 60) * 10) / 10,
    limitMinutes,
    percent: Math.round(ratio * 100),
    level: ratio >= 1 ? "blocked" : ratio >= QUOTA_WARNING_RATIO ? "warning" : "ok",
  };
}

/** Una subida "subiendo" demasiado tiempo sin avanzar se da por interrumpida. */
export function isStaleUpload(status: ProcessingStatus, createdAt: string, now: Date): boolean {
  return (
    status === "uploading" &&
    now.getTime() - new Date(createdAt).getTime() > STALE_UPLOAD_MINUTES * 60_000
  );
}
