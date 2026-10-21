import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ScoreList } from "@/components/score-list";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { formatCalendarDate } from "@/lib/dates";
import { EVALUATION_TYPE_LABELS } from "@/lib/evaluation-schemas";
import { getCurrentRubric } from "@/server/evaluations";
import { getFamilyEvaluation, markSeen } from "@/server/guardian/evaluations";
import { listFamilyGoalkeepers } from "@/server/guardian/portal";
import { requireFamily } from "@/server/guardian/session";
import { createServiceClient } from "@/server/supabase";
import { PortalFrame } from "../../../portal-frame";

export const metadata: Metadata = {
  title: "Evaluación · EvoluGK",
  robots: { index: false },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = PageProps<"/[slug]/familia/[arquero]/evaluaciones/[evaluacion]">;

export default function FamilyEvaluationPage({ params }: Props) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto h-64 w-full max-w-2xl animate-pulse rounded-card bg-line" />
      }
    >
      <FamilyEvaluationContent params={params} />
    </Suspense>
  );
}

async function FamilyEvaluationContent({ params }: Pick<Props, "params">) {
  const { slug, arquero, evaluacion } = await params;
  const session = await requireFamily(slug);
  if (!UUID.test(evaluacion)) notFound();
  const db = createServiceClient();

  const goalkeepers = await listFamilyGoalkeepers(db, session);
  const goalkeeper = goalkeepers.find((g) => g.id === arquero);
  if (!goalkeeper) notFound();

  const evaluation = await getFamilyEvaluation(db, session, goalkeeper.id, evaluacion);
  // Un borrador, una evaluación de otro arquero o una inexistente: todas dan "no encontrada".
  if (!evaluation) notFound();

  // Abrirla la marca como vista (RF-39). Esta visita todavía la muestra como nueva.
  await markSeen(db, session, goalkeeper.id, "evaluation", [evaluation.id]);

  // Siempre las 8 categorías: las que no se evaluaron se ven como tales (RF-17).
  const { categories } = await getCurrentRubric(db);
  const byKey = new Map(evaluation.scores.map((s) => [s.key, s]));
  const rows = categories.map((c) => ({
    key: c.key,
    name: c.name,
    score: byKey.get(c.key)?.score ?? null,
    comment: byKey.get(c.key)?.comment ?? null,
  }));

  return (
    <PortalFrame slug={session.schoolSlug} goalkeepers={goalkeepers} currentId={goalkeeper.id}>
      <Link
        href={`/${session.schoolSlug}/familia/${goalkeeper.id}/evolucion`}
        className="text-sm font-semibold text-ink-muted hover:text-ink"
      >
        ← Evolución
      </Link>

      <div className="rise-in space-y-2">
        <h1 className="font-display text-3xl font-bold leading-tight">
          Evaluación del {formatCalendarDate(evaluation.date)}
        </h1>
        <div className="flex flex-wrap gap-2">
          {evaluation.isNew && <Chip tone="success">Nuevo</Chip>}
          <Chip>{EVALUATION_TYPE_LABELS[evaluation.type]}</Chip>
          {evaluation.authorName && <Chip>Por {evaluation.authorName}</Chip>}
        </div>
      </div>

      <Card className="space-y-4">
        <h2 className="font-display text-lg font-bold">Puntajes</h2>
        <ScoreList rows={rows} />
      </Card>

      {evaluation.comment && (
        <Card className="space-y-1">
          <h2 className="font-display text-lg font-bold">Comentario de los profesores</h2>
          <p className="whitespace-pre-line">{evaluation.comment}</p>
        </Card>
      )}
    </PortalFrame>
  );
}
