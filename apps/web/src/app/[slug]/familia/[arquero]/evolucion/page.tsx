import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CategoryTimeline } from "@/components/category-timeline";
import { EvolutionRadar } from "@/components/evolution-radar";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Notice } from "@/components/ui/notice";
import { formatCalendarDate } from "@/lib/dates";
import { EVALUATION_TYPE_LABELS } from "@/lib/evaluation-schemas";
import {
  categoryTimeline,
  comparison,
  currentEvaluation,
  hasEvolution,
  radarValues,
} from "@/lib/evolution";
import {
  getFamilyEvolution,
  markSeen,
  toEvolutionSeries,
  type FamilyEvaluation,
  type FamilyNote,
} from "@/server/guardian/evaluations";
import { listFamilyGoalkeepers } from "@/server/guardian/portal";
import { requireFamily } from "@/server/guardian/session";
import { createServiceClient } from "@/server/supabase";
import { PortalFrame } from "../../portal-frame";

export const metadata: Metadata = {
  title: "Evolución · EvoluGK",
  robots: { index: false },
};

export default function EvolutionPage({
  params,
}: PageProps<"/[slug]/familia/[arquero]/evolucion">) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto h-64 w-full max-w-2xl animate-pulse rounded-card bg-line" />
      }
    >
      <EvolutionContent params={params} />
    </Suspense>
  );
}

async function EvolutionContent({
  params,
}: Pick<PageProps<"/[slug]/familia/[arquero]/evolucion">, "params">) {
  const { slug, arquero } = await params;
  const session = await requireFamily(slug);
  const db = createServiceClient();

  const goalkeepers = await listFamilyGoalkeepers(db, session);
  // Un arquero ajeno o inexistente es indistinguible de uno que no existe (CA-12).
  const goalkeeper = goalkeepers.find((g) => g.id === arquero);
  if (!goalkeeper) notFound();

  const evolution = await getFamilyEvolution(db, session, goalkeeper.id);
  const series = toEvolutionSeries(evolution.evaluations);
  const current = currentEvaluation(series);
  const compared = comparison(series);
  const keys = evolution.categories.map((c) => c.key);

  // Las notas se muestran en esta pantalla: abrirla es verlas (RF-39). Se marcan después de
  // calcular cuáles eran nuevas, así este mismo pedido todavía las señala.
  await markSeen(
    db,
    session,
    goalkeeper.id,
    "note",
    evolution.notes.filter((n) => n.isNew).map((n) => n.id),
  );

  const base = `/${session.schoolSlug}/familia/${goalkeeper.id}`;

  return (
    <PortalFrame slug={session.schoolSlug} goalkeepers={goalkeepers} currentId={goalkeeper.id}>
      <div className="rise-in space-y-1">
        <h1 className="font-display text-3xl font-bold leading-tight">
          Evolución de {goalkeeper.firstName}
        </h1>
      </div>

      {!current ? (
        <Card className="space-y-1 text-center">
          <p className="font-display text-lg font-bold">Todavía no hay evaluaciones</p>
          <p className="text-ink-muted">
            Cuando los profesores publiquen la primera evaluación de {goalkeeper.firstName}, la vas
            a ver acá.
          </p>
        </Card>
      ) : (
        <>
          <Card className="space-y-3">
            <div className="space-y-0.5">
              <h2 className="font-display text-lg font-bold">
                {compared ? "Ingreso vs. hoy" : "Estado actual"}
              </h2>
              <p className="text-sm text-ink-muted">
                Última evaluación: {formatCalendarDate(current.date)}
              </p>
            </div>
            <EvolutionRadar
              labels={evolution.categories.map((c) => c.name)}
              current={radarValues(current, keys)}
              entry={compared ? radarValues(compared.entry, keys) : null}
              currentLabel={`Hoy · ${formatCalendarDate(current.date)}`}
              entryLabel={
                compared ? `Ingreso · ${formatCalendarDate(compared.entry.date)}` : undefined
              }
            />
          </Card>

          {hasEvolution(series) ? (
            <Card className="space-y-5">
              <div className="space-y-0.5">
                <h2 className="font-display text-lg font-bold">Evolución por categoría</h2>
                <p className="text-sm text-ink-muted">Puntaje en cada evaluación publicada.</p>
              </div>
              <div className="grid gap-6 sm:grid-cols-2">
                {evolution.categories.map((category) => (
                  <CategoryTimeline
                    key={category.key}
                    name={category.name}
                    points={categoryTimeline(series, category.key)}
                  />
                ))}
              </div>
            </Card>
          ) : (
            <Notice>
              Con una sola evaluación todavía no se puede ver la evolución. Con la próxima vas a
              poder comparar el ingreso con hoy y ver cómo cambió cada categoría.
            </Notice>
          )}
        </>
      )}

      <History evaluations={evolution.evaluations} notes={evolution.notes} base={base} />
    </PortalFrame>
  );
}

type HistoryItem =
  | { kind: "evaluation"; at: string; evaluation: FamilyEvaluation }
  | { kind: "note"; at: string; note: FamilyNote };

/** Historial cronológico que mezcla evaluaciones publicadas y notas visibles (spec 04, RF-16). */
function History({
  evaluations,
  notes,
  base,
}: {
  evaluations: FamilyEvaluation[];
  notes: FamilyNote[];
  base: string;
}) {
  const items: HistoryItem[] = [
    ...evaluations.map((evaluation) => ({
      kind: "evaluation" as const,
      // Se ordena por la fecha de la evaluación, no por cuándo se publicó.
      at: evaluation.date,
      evaluation,
    })),
    ...notes.map((note) => ({
      kind: "note" as const,
      at: note.createdAt.slice(0, 10),
      note,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <Card className="space-y-3">
      <h2 className="font-display text-lg font-bold">Historial</h2>
      {items.length === 0 ? (
        <p className="text-ink-muted">Todavía no hay nada para mostrar.</p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((item) =>
            item.kind === "evaluation" ? (
              <li key={`e-${item.evaluation.id}`}>
                <Link
                  href={`${base}/evaluaciones/${item.evaluation.id}`}
                  className="block space-y-1 py-3 hover:text-accent"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">
                      Evaluación del {formatCalendarDate(item.evaluation.date)}
                    </span>
                    {item.evaluation.isNew && <Chip tone="success">Nuevo</Chip>}
                    <Chip>{EVALUATION_TYPE_LABELS[item.evaluation.type]}</Chip>
                  </span>
                  {item.evaluation.comment && (
                    <span className="line-clamp-2 block text-sm text-ink-muted">
                      {item.evaluation.comment}
                    </span>
                  )}
                </Link>
              </li>
            ) : (
              <li key={`n-${item.note.id}`} className="space-y-1 py-3">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">Nota del {formatCalendarDate(item.at)}</span>
                  {item.note.isNew && <Chip tone="success">Nuevo</Chip>}
                </p>
                <p className="whitespace-pre-line">{item.note.body}</p>
                {item.note.authorName && (
                  <p className="text-sm text-ink-muted">{item.note.authorName}</p>
                )}
              </li>
            ),
          )}
        </ul>
      )}
    </Card>
  );
}
