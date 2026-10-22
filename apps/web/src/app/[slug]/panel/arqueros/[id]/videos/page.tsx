import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type CSSProperties } from "react";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { isVideoTopic, VIDEO_TOPIC_LABELS, VIDEO_TOPICS } from "@/lib/video-schemas";
import { requireStaff } from "@/server/auth/guards";
import { getEvaluationContext } from "@/server/evaluations";
import { createServiceClient } from "@/server/supabase";
import { getVideoProvider } from "@/server/video";
import { thumbnailUrls } from "@/server/video/thumbnails";
import { getVideoQuota, listVideos } from "@/server/videos";
import { Select } from "../../goalkeeper-fields";
import { Thumbnail, VideoMeta, VideoStatusChips } from "./video-cards";

export const metadata: Metadata = {
  title: "Videos · EvoluGK",
  robots: { index: false },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

type Props = PageProps<"/[slug]/panel/arqueros/[id]/videos">;

export default function VideosPage({ params, searchParams }: Props) {
  return (
    <main
      id="contenido"
      className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 pb-24 pt-4"
    >
      <Suspense
        fallback={<div className="h-96 animate-pulse rounded-card bg-line" aria-busy="true" />}
      >
        <VideosContent params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function VideosContent({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const { slug, id } = await params;
  const session = await requireStaff(slug);
  if (!UUID.test(id)) notFound();

  const query = await searchParams;
  const topicParam = first(query.tema);
  const topic = isVideoTopic(topicParam) ? topicParam : undefined;

  const db = createServiceClient();
  const [context, videos, quota] = await Promise.all([
    getEvaluationContext(db, session.school.id, id),
    listVideos(db, session.school.id, id, { topic }),
    getVideoQuota(db, session.school.id),
  ]);
  if (!context) notFound();

  const thumbnails = await thumbnailUrls(
    db,
    getVideoProvider(),
    session.school.id,
    videos.filter((v) => v.playable).map((v) => v.id),
  );
  const base = `/${session.school.slug}/panel/arqueros/${id}`;
  const canUpload = context.goalkeeper.status === "active";

  return (
    <>
      <Link
        href={base}
        className="inline-flex min-h-11 items-center text-sm font-semibold text-ink-muted hover:text-ink"
      >
        ← {context.goalkeeper.firstName} {context.goalkeeper.lastName}
      </Link>

      <div className="rise-in flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-3xl font-bold leading-tight">Videos</h1>
          <p className="text-ink-muted">
            {videos.length} {videos.length === 1 ? "video" : "videos"}
            {topic ? ` de ${VIDEO_TOPIC_LABELS[topic].toLowerCase()}` : ""}
          </p>
        </div>
        {canUpload && (
          <Link
            href={`${base}/videos/nuevo`}
            className="inline-flex h-11 items-center rounded-control bg-accent px-4 font-semibold text-on-accent shadow-card hover:brightness-110"
          >
            Subir video
          </Link>
        )}
      </div>

      {first(query.borrado) && <Notice tone="success">El video se borró.</Notice>}
      {first(query.subiendo) && (
        <Notice>
          La subida sigue en segundo plano: podés seguir trabajando. Mirá el estado en la bandeja de
          abajo.
        </Notice>
      )}
      {quota.level !== "ok" && session.role === "school_admin" && (
        <Notice tone="warning">
          {quota.level === "blocked"
            ? `La escuela alcanzó su tope de ${quota.limitMinutes} minutos de video: no se pueden subir más. Borrá videos para liberar espacio o pedí un tope mayor.`
            : `La escuela usó el ${quota.percent}% de sus ${quota.limitMinutes} minutos de video.`}
        </Notice>
      )}

      <Card className="rise-in" style={{ "--i": 1 } as CSSProperties}>
        <form method="get" className="flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1">
            <label htmlFor="tema" className="mb-1.5 block text-sm font-semibold">
              Tema
            </label>
            <Select id="tema" name="tema" defaultValue={topic ?? ""}>
              <option value="">Todos los temas</option>
              {VIDEO_TOPICS.map((value) => (
                <option key={value} value={value}>
                  {VIDEO_TOPIC_LABELS[value]}
                </option>
              ))}
            </Select>
          </div>
          <button
            type="submit"
            className="inline-flex h-11 items-center rounded-control bg-accent px-4 font-semibold text-on-accent"
          >
            Filtrar
          </button>
          {topic && (
            <Link
              href={`${base}/videos`}
              className="inline-flex h-11 items-center rounded-control px-4 font-semibold text-ink-muted hover:text-ink"
            >
              Limpiar
            </Link>
          )}
        </form>
      </Card>

      {videos.length === 0 ? (
        <Card className="space-y-1 text-center">
          <p className="font-display text-lg font-bold">
            {topic ? "No hay videos de ese tema" : "Todavía no hay videos"}
          </p>
          <p className="text-ink-muted">
            {canUpload
              ? "Subí el primero desde la cámara o la galería."
              : "Este arquero no está activo: no se pueden subir videos nuevos."}
          </p>
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {videos.map((video) => (
            <li key={video.id}>
              <Link
                href={`${base}/videos/${video.id}`}
                className="block rounded-card focus-visible:outline-offset-4"
              >
                <Card interactive className="space-y-3 p-3">
                  <Thumbnail url={thumbnails.get(video.id)} status={video.processingStatus} />
                  <div className="space-y-1">
                    <p className="line-clamp-2 font-display text-base font-bold">{video.title}</p>
                    <VideoMeta
                      topic={video.topic}
                      durationSec={video.durationSec}
                      authorName={video.authorName}
                      date={video.createdAt}
                    />
                    <div className="flex flex-wrap gap-2 pt-1">
                      <VideoStatusChips
                        processingStatus={video.processingStatus}
                        publicationStatus={video.publicationStatus}
                      />
                    </div>
                    {video.processingStatus === "error" && video.errorReason && (
                      <p className="text-sm text-danger">{video.errorReason}</p>
                    )}
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
