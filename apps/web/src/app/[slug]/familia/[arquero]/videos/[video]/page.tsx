import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Chip } from "@/components/ui/chip";
import { VideoStage } from "@/components/video-stage";
import { argentinaDate, formatCalendarDate } from "@/lib/dates";
import { formatDuration, VIDEO_TOPIC_LABELS } from "@/lib/video-schemas";
import { getFamilyVideo, markVideoSeen } from "@/server/guardian/videos";
import { listFamilyGoalkeepers } from "@/server/guardian/portal";
import { requireFamily } from "@/server/guardian/session";
import { createServiceClient } from "@/server/supabase";
import { PortalFrame } from "../../../portal-frame";

export const metadata: Metadata = {
  title: "Video · EvoluGK",
  robots: { index: false },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = PageProps<"/[slug]/familia/[arquero]/videos/[video]">;

export default function FamilyVideoPage({ params }: Props) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto h-64 w-full max-w-2xl animate-pulse rounded-card bg-line" />
      }
    >
      <FamilyVideoContent params={params} />
    </Suspense>
  );
}

async function FamilyVideoContent({ params }: Pick<Props, "params">) {
  const { slug, arquero, video: videoId } = await params;
  const session = await requireFamily(slug);
  if (!UUID.test(videoId)) notFound();
  const db = createServiceClient();

  const goalkeepers = await listFamilyGoalkeepers(db, session);
  const goalkeeper = goalkeepers.find((g) => g.id === arquero);
  if (!goalkeeper) notFound();

  // Un borrador, un video de otro arquero o sin consentimiento vigente: todos "no encontrado".
  const video = await getFamilyVideo(db, session, goalkeeper.id, videoId);
  if (!video) notFound();

  // Abrirlo lo marca como visto (RF-39). Esta visita todavía lo muestra como nuevo.
  await markVideoSeen(db, session, goalkeeper.id, videoId);

  return (
    <PortalFrame slug={session.schoolSlug} goalkeepers={goalkeepers} currentId={goalkeeper.id}>
      <Link
        href={`/${session.schoolSlug}/familia/${goalkeeper.id}/videos`}
        className="text-sm font-semibold text-ink-muted hover:text-ink"
      >
        ← Videos
      </Link>

      <div className="rise-in space-y-2">
        <h1 className="font-display text-3xl font-bold leading-tight">{video.title}</h1>
        <div className="flex flex-wrap gap-2">
          {video.isNew && <Chip tone="success">Nuevo</Chip>}
          <Chip>{VIDEO_TOPIC_LABELS[video.topic]}</Chip>
          {video.durationSec !== null && <Chip>{formatDuration(video.durationSec)}</Chip>}
          {video.authorName && <Chip>Subido por {video.authorName}</Chip>}
        </div>
        <p className="text-sm text-ink-muted">
          {formatCalendarDate(argentinaDate(new Date(video.publishedAt)))}
        </p>
      </div>

      <VideoStage
        slug={session.schoolSlug}
        videoId={videoId}
        title={video.title}
        comments={video.comments}
      />
    </PortalFrame>
  );
}
