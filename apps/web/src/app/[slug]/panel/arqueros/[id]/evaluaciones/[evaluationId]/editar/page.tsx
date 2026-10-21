import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Notice } from "@/components/ui/notice";
import { argentinaDate } from "@/lib/dates";
import { requireStaff } from "@/server/auth/guards";
import {
  getEvaluation,
  getEvaluationContext,
  getRubricVersionCategories,
} from "@/server/evaluations";
import { createServiceClient } from "@/server/supabase";
import { EvaluationForm } from "../../evaluation-form";

export const metadata: Metadata = {
  title: "Editar evaluación · EvoluGK",
  robots: { index: false },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = PageProps<"/[slug]/panel/arqueros/[id]/evaluaciones/[evaluationId]/editar">;

export default function EditEvaluationPage({ params }: Props) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 pb-8 pt-4">
      <Suspense
        fallback={<div className="h-96 animate-pulse rounded-card bg-line" aria-busy="true" />}
      >
        <EditEvaluationContent params={params} />
      </Suspense>
    </main>
  );
}

async function EditEvaluationContent({ params }: Pick<Props, "params">) {
  const { slug, id, evaluationId } = await params;
  const session = await requireStaff(slug);
  if (!UUID.test(id) || !UUID.test(evaluationId)) notFound();

  const db = createServiceClient();
  const viewer = { userId: session.user.id, role: session.role };
  const evaluation = await getEvaluation(db, session.school.id, evaluationId, viewer);
  if (!evaluation || evaluation.goalkeeperId !== id) notFound();

  const base = `/${session.school.slug}/panel/arqueros/${id}`;
  const detailHref = `${base}/evaluaciones/${evaluationId}`;
  const canEdit = session.role === "school_admin" || evaluation.authorId === session.user.id;
  if (!canEdit) {
    return (
      <>
        <Link href={detailHref} className="text-sm font-semibold text-ink-muted hover:text-ink">
          ← Evaluación
        </Link>
        <Notice tone="warning">
          Solo quien cargó la evaluación o un administrador pueden editarla.
        </Notice>
      </>
    );
  }

  const [categories, context] = await Promise.all([
    getRubricVersionCategories(db, evaluation.rubricVersionId),
    getEvaluationContext(db, session.school.id, id),
  ]);
  const scores = Object.fromEntries(
    evaluation.scores.map((s) => [s.categoryId, { score: s.score, comment: s.comment }]),
  );

  return (
    <>
      <Link href={detailHref} className="text-sm font-semibold text-ink-muted hover:text-ink">
        ← Evaluación
      </Link>
      <div className="rise-in space-y-1">
        <h1 className="font-display text-3xl font-bold leading-tight">Editar evaluación</h1>
        <p className="text-ink-muted">Cada cambio queda registrado con quién lo hizo y cuándo.</p>
      </div>
      <EvaluationForm
        slug={session.school.slug}
        goalkeeperId={id}
        evaluationId={evaluationId}
        status={evaluation.status}
        categories={categories}
        today={argentinaDate(new Date())}
        canBeEntry={!context?.hasEntry || evaluation.type === "entry"}
        initial={{
          date: evaluation.date,
          type: evaluation.type,
          comment: evaluation.comment ?? "",
          scores,
        }}
      />
    </>
  );
}
