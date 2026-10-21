import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type CSSProperties } from "react";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Notice } from "@/components/ui/notice";
import { ScoreList } from "@/components/score-list";
import { formatCalendarDate } from "@/lib/dates";
import { describeDiff } from "@/lib/evaluation-diff";
import { EVALUATION_TYPE_LABELS } from "@/lib/evaluation-schemas";
import { requireStaff } from "@/server/auth/guards";
import {
  getEvaluation,
  getEvaluationContext,
  getRubricVersionCategories,
} from "@/server/evaluations";
import { createServiceClient } from "@/server/supabase";
import { DeleteEvaluationButton, PublishButton, UnpublishButton } from "../evaluation-actions";

export const metadata: Metadata = {
  title: "Evaluación · EvoluGK",
  robots: { index: false },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

type Props = PageProps<"/[slug]/panel/arqueros/[id]/evaluaciones/[evaluationId]">;

export default function EvaluationPage({ params, searchParams }: Props) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 pb-16 pt-4">
      <Suspense
        fallback={<div className="h-96 animate-pulse rounded-card bg-line" aria-busy="true" />}
      >
        <EvaluationContent params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function EvaluationContent({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const { slug, id, evaluationId } = await params;
  const session = await requireStaff(slug);
  if (!UUID.test(id) || !UUID.test(evaluationId)) notFound();

  const db = createServiceClient();
  const viewer = { userId: session.user.id, role: session.role };
  const evaluation = await getEvaluation(db, session.school.id, evaluationId, viewer);
  // Un borrador ajeno es indistinguible de uno que no existe.
  if (!evaluation || evaluation.goalkeeperId !== id) notFound();

  const [categories, context, query] = await Promise.all([
    getRubricVersionCategories(db, evaluation.rubricVersionId),
    getEvaluationContext(db, session.school.id, id),
    searchParams,
  ]);
  const isAdmin = session.role === "school_admin";
  const canManage = isAdmin || evaluation.authorId === session.user.id;
  const base = `/${session.school.slug}/panel/arqueros/${id}`;
  const name = context
    ? `${context.goalkeeper.firstName} ${context.goalkeeper.lastName}`
    : "Arquero";

  const byKey = new Map(evaluation.scores.map((s) => [s.key, s]));
  const rows = categories.map((c) => ({
    key: c.key,
    name: c.name,
    score: byKey.get(c.key)?.score ?? null,
    comment: byKey.get(c.key)?.comment ?? null,
  }));
  const categoryNames = Object.fromEntries(categories.map((c) => [c.key, c.name]));

  const sent = Number(first(query.enviados) ?? 0);
  const failed = Number(first(query.fallidos) ?? 0);
  const withoutEmail = Number(first(query.sinmail) ?? 0);
  const ids = { slug: session.school.slug, goalkeeperId: id, evaluationId };

  return (
    <>
      <Link href={base} className="text-sm font-semibold text-ink-muted hover:text-ink">
        ← {name}
      </Link>

      {first(query.publicada) && (
        <Notice tone="success">
          Evaluación publicada: la familia ya puede verla.
          {sent > 0 && ` Avisamos por mail a ${sent} ${sent === 1 ? "tutor" : "tutores"}.`}
          {failed > 0 && ` No pudimos mandar ${failed === 1 ? "un mail" : `${failed} mails`}.`}
          {sent === 0 &&
            failed === 0 &&
            withoutEmail > 0 &&
            " Ningún tutor tiene mail cargado: no hay aviso."}
        </Notice>
      )}
      {first(query.despublicada) && (
        <Notice>La evaluación volvió a borrador: la familia ya no la ve.</Notice>
      )}

      <div className="rise-in space-y-2">
        <h1 className="font-display text-3xl font-bold leading-tight">
          Evaluación del {formatCalendarDate(evaluation.date)}
        </h1>
        <div className="flex flex-wrap gap-2">
          <Chip tone={evaluation.status === "published" ? "success" : "warning"}>
            {evaluation.status === "published" ? "Publicada" : "Borrador"}
          </Chip>
          <Chip>{EVALUATION_TYPE_LABELS[evaluation.type]}</Chip>
          {evaluation.authorName && <Chip>Por {evaluation.authorName}</Chip>}
        </div>
        {evaluation.status === "draft" && (
          <p className="text-sm text-ink-muted">
            Solo la ves vos
            {evaluation.authorId !== session.user.id ? " y la administración" : ""}. La familia la
            ve cuando la publiques.
          </p>
        )}
      </div>

      <Card className="rise-in space-y-4" style={{ "--i": 1 } as CSSProperties}>
        <h2 className="font-display text-lg font-bold">Puntajes</h2>
        <ScoreList rows={rows} />
        {evaluation.comment && (
          <div className="space-y-1 border-t border-line pt-4">
            <h3 className="text-sm font-semibold text-ink-muted">Comentario general</h3>
            <p className="whitespace-pre-line">{evaluation.comment}</p>
          </div>
        )}
      </Card>

      {canManage && (
        <Card className="rise-in space-y-4" style={{ "--i": 2 } as CSSProperties}>
          <h2 className="font-display text-lg font-bold">Acciones</h2>
          <div className="flex flex-wrap items-start gap-3">
            <Link
              href={`${base}/evaluaciones/${evaluationId}/editar`}
              className="inline-flex h-11 items-center rounded-control border border-line bg-surface px-4 font-semibold hover:bg-accent-soft"
            >
              Editar
            </Link>
            {evaluation.status === "draft" ? (
              <PublishButton {...ids} />
            ) : (
              <UnpublishButton {...ids} />
            )}
          </div>
          {isAdmin && <DeleteEvaluationButton {...ids} />}
        </Card>
      )}

      {evaluation.revisions.length > 0 && (
        <Card className="rise-in space-y-3" style={{ "--i": 3 } as CSSProperties}>
          <h2 className="font-display text-lg font-bold">Registro de cambios</h2>
          <ul className="divide-y divide-line">
            {evaluation.revisions.map((revision) => (
              <li key={revision.id} className="space-y-1 py-3 first:pt-0 last:pb-0">
                <p className="text-sm font-semibold">
                  {revision.editorName ?? "Alguien del equipo"} ·{" "}
                  <time dateTime={revision.editedAt}>
                    {new Intl.DateTimeFormat("es-AR", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "America/Argentina/Buenos_Aires",
                    }).format(new Date(revision.editedAt))}
                  </time>
                </p>
                <ul className="list-disc pl-5 text-sm text-ink-muted">
                  {describeDiff(revision.detail, categoryNames, formatCalendarDate).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
