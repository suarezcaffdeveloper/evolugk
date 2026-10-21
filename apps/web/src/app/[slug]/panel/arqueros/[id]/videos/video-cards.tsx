import { Chip } from "@/components/ui/chip";
import { formatCalendarDate, argentinaDate } from "@/lib/dates";
import {
  formatDuration,
  PROCESSING_LABELS,
  VIDEO_TOPIC_LABELS,
  type ProcessingStatus,
  type PublicationStatus,
  type VideoTopic,
} from "@/lib/video-schemas";

/** Miniatura de un video, o un marcador mientras no hay (subiendo, procesando, con error). */
export function Thumbnail({
  url,
  status,
  className,
}: {
  url?: string;
  status: ProcessingStatus;
  className?: string;
}) {
  if (url) {
    return (
      // Las miniaturas vienen firmadas y vencen: no pasan por la optimización de imágenes.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        loading="lazy"
        className={`aspect-video w-full rounded-control bg-line object-cover ${className ?? ""}`}
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      className={`flex aspect-video w-full items-center justify-center rounded-control bg-line text-sm font-semibold text-ink-muted ${className ?? ""}`}
    >
      {status === "ready" ? "▶" : PROCESSING_LABELS[status]}
    </div>
  );
}

/** Estado de un video para el staff: procesamiento y publicación, siempre con texto además del color. */
export function VideoStatusChips({
  processingStatus,
  publicationStatus,
}: {
  processingStatus: ProcessingStatus;
  publicationStatus: PublicationStatus;
}) {
  return (
    <>
      {processingStatus !== "ready" && (
        <Chip tone={processingStatus === "error" ? "danger" : "warning"}>
          {PROCESSING_LABELS[processingStatus]}
        </Chip>
      )}
      {processingStatus === "ready" && (
        <Chip tone={publicationStatus === "published" ? "success" : "warning"}>
          {publicationStatus === "published" ? "Publicado" : "Borrador"}
        </Chip>
      )}
    </>
  );
}

export function VideoMeta({
  topic,
  durationSec,
  authorName,
  date,
}: {
  topic: VideoTopic;
  durationSec: number | null;
  authorName: string | null;
  date: string;
}) {
  return (
    <p className="text-sm text-ink-muted">
      {VIDEO_TOPIC_LABELS[topic]}
      {durationSec !== null && ` · ${formatDuration(durationSec)}`}
      {authorName && ` · ${authorName}`}
      {` · ${formatCalendarDate(argentinaDate(new Date(date)))}`}
    </p>
  );
}
