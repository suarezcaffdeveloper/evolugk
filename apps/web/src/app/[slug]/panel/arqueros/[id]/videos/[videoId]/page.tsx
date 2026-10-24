import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type CSSProperties } from "react";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Notice } from "@/components/ui/notice";
import { VideoStage } from "@/components/video-stage";
import { formatCalendarDate } from "@/lib/dates";
import { EVALUATION_TYPE_LABELS } from "@/lib/evaluation-schemas";
import { requireStaff } from "@/server/auth/guards";
import { listEvaluations } from "@/server/evaluations";
import { createServiceClient } from "@/server/supabase";
import { getVideoProvider } from "@/server/video";
import { getVideo, refreshProcessing } from "@/server/videos";
import { addCommentAction, deleteCommentAction, updateCommentAction } from "../actions";
import { VideoMeta, VideoStatusChips } from "../video-cards";
import {
  DeleteVideoButton,
  EditVideoForm,
  PublishControls,
  RestartUpload,
} from "../video-controls";

export const metadata: Metadata = {
  title: "Video · EvoluGK",
  robots: { index: false },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = PageProps<"/[slug]/panel/arqueros/[id]/videos/[videoId]">;

export default function VideoPage({ params }: Props) {
  return (
    <main
      id="contenido"
      className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 pb-24 pt-4"
    >
      <Suspense
        fallback={<div className="h-96 animate-pulse rounded-card bg-line" aria-busy="true" />}
      >
        <VideoContent params={params} />
      </Suspense>
    </main>
  );
}

async function VideoContent({ params }: Pick<Props, "params">) {
  const { slug, id, videoId } = await params;
  const session = await requireStaff(slug);
  if (!UUID.test(id) || !UUID.test(videoId)) notFound();

  const db = createServiceClient();
  // Si el aviso del proveedor no llegó, se lo consulta al abrir el video.
  await refreshProcessing(db, getVideoProvider(), session.school.id, [videoId]);

  const video = await getVideo(db, session.school.id, videoId);
  if (!video || video.goalkeeperId !== id) notFound();

  const evaluations = (
    video.evaluationIds.length > 0
      ? await listEvaluations(db, session.school.id, id, {
          userId: session.user.id,
          role: session.role,
        })
      : []
  ).filter((e) => video.evaluationIds.includes(e.id));

  const isAdmin = session.role === "school_admin";
  const isAuthor = video.authorId === session.user.id;
  const canManage = isAdmin || isAuthor;
  const base = `/${session.school.slug}/panel/arqueros/${id}`;
  const ids = { slug: session.school.slug, goalkeeperId: id, videoId };
  const failed = video.processingStatus === "error";

  return (
    <>
      <Link
        href={`${base}/videos`}
        className="inline-flex min-h-11 items-center text-sm font-semibold text-ink-muted hover:text-ink"
      >
        ← Videos
      </Link>

      <div className="rise-in space-y-2">
        <h1 className="font-display text-3xl font-bold leading-tight">{video.title}</h1>
        <VideoMeta
          topic={video.topic}
          durationSec={video.durationSec}
          authorName={video.authorName}
          date={video.createdAt}
        />
        <div className="flex flex-wrap gap-2">
          <VideoStatusChips
            processingStatus={video.processingStatus}
            publicationStatus={video.publicationStatus}
          />
        </div>
      </div>

      {video.playable ? (
        <VideoStage
          slug={session.school.slug}
          videoId={videoId}
          title={video.title}
          comments={video.comments}
          staff={{
            userId: session.user.id,
            isAdmin,
            actions: {
              add: addCommentAction.bind(null, session.school.slug, id, videoId),
              update: updateCommentAction.bind(null, session.school.slug, id, videoId),
              remove: deleteCommentAction.bind(null, session.school.slug, id, videoId),
            },
          }}
        />
      ) : failed ? (
        <Card className="space-y-3">
          <Notice tone="warning">
            {video.errorReason ?? "No se pudo procesar el video."} No cuenta para la cuota de
            minutos de la escuela.
          </Notice>
          {canManage && (
            <div className="flex flex-wrap items-start gap-3">
              <RestartUpload {...ids} />
              <DeleteVideoButton {...ids} discard />
            </div>
          )}
        </Card>
      ) : (
        <Notice>
          El video todavía se está{" "}
          {video.processingStatus === "uploading" ? "subiendo" : "procesando"}. Cuando esté listo
          vas a poder verlo, comentarlo y publicarlo. Podés seguir trabajando: la página se
          actualiza al volver a abrirla.
        </Notice>
      )}

      {video.playable && canManage && (
        <Card className="rise-in space-y-4" style={{ "--i": 1 } as CSSProperties}>
          <h2 className="font-display text-lg font-bold">Publicación</h2>
          <PublishControls {...ids} published={video.publicationStatus === "published"} />
        </Card>
      )}

      {canManage && (
        <Card className="rise-in space-y-4" style={{ "--i": 2 } as CSSProperties}>
          <h2 className="font-display text-lg font-bold">Datos del video</h2>
          <EditVideoForm {...ids} title={video.title} topic={video.topic} />
        </Card>
      )}

      {evaluations.length > 0 && (
        <Card className="rise-in space-y-3" style={{ "--i": 3 } as CSSProperties}>
          <h2 className="font-display text-lg font-bold">Respalda estas evaluaciones</h2>
          <ul className="divide-y divide-line">
            {evaluations.map((evaluation) => (
              <li key={evaluation.id}>
                <Link
                  href={`${base}/evaluaciones/${evaluation.id}`}
                  className="flex min-h-11 flex-wrap items-center justify-between gap-2 py-2 hover:text-accent"
                >
                  <span className="font-semibold">{formatCalendarDate(evaluation.date)}</span>
                  <span className="flex gap-2">
                    <Chip>{EVALUATION_TYPE_LABELS[evaluation.type]}</Chip>
                    <Chip tone={evaluation.status === "published" ? "success" : "warning"}>
                      {evaluation.status === "published" ? "Publicada" : "Borrador"}
                    </Chip>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="text-sm text-ink-muted">
            La familia ve el video dentro de la evaluación solo si ambos están publicados.
          </p>
        </Card>
      )}

      {isAdmin && !failed && (
        <Card className="rise-in" style={{ "--i": 4 } as CSSProperties}>
          <DeleteVideoButton {...ids} discard={false} />
        </Card>
      )}
    </>
  );
}
