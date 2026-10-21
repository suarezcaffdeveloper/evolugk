import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Notice } from "@/components/ui/notice";
import { argentinaDate, formatCalendarDate } from "@/lib/dates";
import {
  formatDuration,
  isVideoTopic,
  VIDEO_TOPIC_LABELS,
  VIDEO_TOPICS,
} from "@/lib/video-schemas";
import { listFamilyVideos } from "@/server/guardian/videos";
import { listFamilyGoalkeepers } from "@/server/guardian/portal";
import { requireFamily } from "@/server/guardian/session";
import { createServiceClient } from "@/server/supabase";
import { getVideoProvider } from "@/server/video";
import { thumbnailUrls } from "@/server/video/thumbnails";
import { PortalFrame } from "../../portal-frame";

export const metadata: Metadata = {
  title: "Videos · EvoluGK",
  robots: { index: false },
};

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

type Props = PageProps<"/[slug]/familia/[arquero]/videos">;

export default function FamilyVideosPage({ params, searchParams }: Props) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto h-64 w-full max-w-2xl animate-pulse rounded-card bg-line" />
      }
    >
      <FamilyVideosContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function FamilyVideosContent({
  params,
  searchParams,
}: Pick<Props, "params" | "searchParams">) {
  const { slug, arquero } = await params;
  const session = await requireFamily(slug);
  const db = createServiceClient();

  const goalkeepers = await listFamilyGoalkeepers(db, session);
  // Un arquero ajeno o inexistente es indistinguible de uno que no existe (CA-12 de la spec 04).
  const goalkeeper = goalkeepers.find((g) => g.id === arquero);
  if (!goalkeeper) notFound();

  const topicParam = first((await searchParams).tema);
  const topic = isVideoTopic(topicParam) ? topicParam : undefined;
  const { consent, videos } = await listFamilyVideos(db, session, goalkeeper.id, { topic });
  const thumbnails = await thumbnailUrls(
    db,
    getVideoProvider(),
    session.schoolId,
    videos.map((v) => v.id),
  );

  const base = `/${session.schoolSlug}/familia/${goalkeeper.id}`;

  return (
    <PortalFrame slug={session.schoolSlug} goalkeepers={goalkeepers} currentId={goalkeeper.id}>
      <div className="rise-in space-y-1">
        <h1 className="font-display text-3xl font-bold leading-tight">
          Videos de {goalkeeper.firstName}
        </h1>
      </div>

      {consent !== "valid" ? (
        // Sin consentimiento vigente no se muestra ningún video (spec 04, CA-02).
        <Notice tone="warning">
          <p>
            {consent === "revoked"
              ? "Retiraste el consentimiento de imagen y video: no se muestran videos de este arquero."
              : "Todavía no aceptaste el consentimiento de imagen y video: no se muestran videos de este arquero."}{" "}
            <Link href={`${base}/privacidad`} className="font-bold underline underline-offset-4">
              Ir a Privacidad
            </Link>
          </p>
        </Notice>
      ) : (
        <>
          <nav aria-label="Filtrar por tema" className="flex gap-2 overflow-x-auto pb-1">
            {[undefined, ...VIDEO_TOPICS].map((value) => {
              const active = value === topic;
              return (
                <Link
                  key={value ?? "todos"}
                  href={value ? `${base}/videos?tema=${value}` : `${base}/videos`}
                  aria-current={active ? "true" : undefined}
                  className={`inline-flex h-11 shrink-0 items-center rounded-full border px-4 text-sm font-semibold ${
                    active
                      ? "border-accent bg-accent text-on-accent"
                      : "border-line bg-surface hover:bg-accent-soft"
                  }`}
                >
                  {value ? VIDEO_TOPIC_LABELS[value] : "Todos"}
                </Link>
              );
            })}
          </nav>

          {videos.length === 0 ? (
            <Card className="space-y-1 text-center">
              <p className="font-display text-lg font-bold">
                {topic ? "No hay videos de ese tema" : "Todavía no hay videos"}
              </p>
              <p className="text-ink-muted">
                Cuando los profesores publiquen videos de {goalkeeper.firstName}, los vas a ver acá.
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
                      {thumbnails.get(video.id) ? (
                        // Miniatura firmada que vence: no pasa por la optimización de imágenes.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumbnails.get(video.id)}
                          alt=""
                          loading="lazy"
                          className="aspect-video w-full rounded-control bg-line object-cover"
                        />
                      ) : (
                        <div
                          aria-hidden="true"
                          className="flex aspect-video w-full items-center justify-center rounded-control bg-line text-2xl text-ink-muted"
                        >
                          ▶
                        </div>
                      )}
                      <div className="space-y-1">
                        <p className="flex flex-wrap items-center gap-2">
                          <span className="line-clamp-2 font-display text-base font-bold">
                            {video.title}
                          </span>
                          {video.isNew && <Chip tone="success">Nuevo</Chip>}
                        </p>
                        <p className="text-sm text-ink-muted">
                          {VIDEO_TOPIC_LABELS[video.topic]}
                          {video.durationSec !== null && ` · ${formatDuration(video.durationSec)}`}
                          {video.authorName && ` · ${video.authorName}`}
                          {` · ${formatCalendarDate(argentinaDate(new Date(video.publishedAt)))}`}
                        </p>
                      </div>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </PortalFrame>
  );
}
