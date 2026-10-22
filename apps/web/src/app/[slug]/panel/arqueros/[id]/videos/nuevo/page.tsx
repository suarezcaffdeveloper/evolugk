import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Notice } from "@/components/ui/notice";
import { requireStaff } from "@/server/auth/guards";
import { getEvaluationContext } from "@/server/evaluations";
import { consentStatusOf } from "@/server/goalkeepers";
import { createServiceClient } from "@/server/supabase";
import { getVideoQuota } from "@/server/videos";
import { UploadForm } from "../upload-form";

export const metadata: Metadata = {
  title: "Subir video · EvoluGK",
  robots: { index: false },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = PageProps<"/[slug]/panel/arqueros/[id]/videos/nuevo">;

export default function NewVideoPage({ params }: Props) {
  return (
    <main
      id="contenido"
      className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 pb-8 pt-4"
    >
      <Suspense
        fallback={<div className="h-96 animate-pulse rounded-card bg-line" aria-busy="true" />}
      >
        <NewVideoContent params={params} />
      </Suspense>
    </main>
  );
}

async function NewVideoContent({ params }: Pick<Props, "params">) {
  const { slug, id } = await params;
  const session = await requireStaff(slug);
  if (!UUID.test(id)) notFound();

  const db = createServiceClient();
  const [context, { data: consents }, quota] = await Promise.all([
    getEvaluationContext(db, session.school.id, id),
    db
      .from("consent")
      .select("revoked_at")
      .eq("school_id", session.school.id)
      .eq("goalkeeper_id", id)
      .eq("type", "media"),
    getVideoQuota(db, session.school.id),
  ]);
  if (!context) notFound();

  const name = `${context.goalkeeper.firstName} ${context.goalkeeper.lastName}`;
  const back = `/${session.school.slug}/panel/arqueros/${id}`;
  const consent = consentStatusOf((consents ?? []) as { revoked_at: string | null }[]);

  // RF-03, RN-05 y RF-30: los bloqueos se explican antes de pedir nada.
  let blocked: string | null = null;
  if (context.goalkeeper.status !== "active") {
    blocked = "Solo se pueden subir videos de arqueros activos.";
  } else if (consent !== "valid") {
    blocked =
      consent === "revoked"
        ? "La familia retiró el consentimiento de imagen y video: no se pueden subir videos de este arquero."
        : "Hasta que un tutor acepte el consentimiento de imagen y video en el portal, no se pueden subir videos de este arquero.";
  } else if (quota.level === "blocked") {
    blocked =
      "La escuela alcanzó su tope de minutos de video. La administración puede borrar videos para liberar espacio, o pedir un tope mayor.";
  }

  return (
    <>
      <Link
        href={`${back}/videos`}
        className="inline-flex min-h-11 items-center text-sm font-semibold text-ink-muted hover:text-ink"
      >
        ← Videos de {context.goalkeeper.firstName}
      </Link>
      <div className="rise-in space-y-1">
        <h1 className="font-display text-3xl font-bold leading-tight">Subir un video</h1>
        <p className="text-ink-muted">{name}</p>
      </div>

      {blocked ? (
        <Notice tone="warning">{blocked}</Notice>
      ) : (
        <>
          {quota.level === "warning" && (
            <Notice tone="warning">
              La escuela usó el {quota.percent}% de sus minutos de video. Al llegar al 100% no se
              podrán subir más.
            </Notice>
          )}
          <UploadForm
            slug={session.school.slug}
            goalkeeperId={id}
            goalkeeperName={context.goalkeeper.firstName}
          />
        </>
      )}
    </>
  );
}
