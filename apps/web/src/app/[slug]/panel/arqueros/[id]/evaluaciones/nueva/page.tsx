import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Notice } from "@/components/ui/notice";
import { argentinaDate } from "@/lib/dates";
import { requireStaff } from "@/server/auth/guards";
import { getCurrentRubric, getEvaluationContext } from "@/server/evaluations";
import { createServiceClient } from "@/server/supabase";
import { EvaluationForm } from "../evaluation-form";

export const metadata: Metadata = {
  title: "Nueva evaluación · EvoluGK",
  robots: { index: false },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function NewEvaluationPage({
  params,
}: PageProps<"/[slug]/panel/arqueros/[id]/evaluaciones/nueva">) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 pb-8 pt-4">
      <Suspense
        fallback={<div className="h-96 animate-pulse rounded-card bg-line" aria-busy="true" />}
      >
        <NewEvaluationContent params={params} />
      </Suspense>
    </main>
  );
}

async function NewEvaluationContent({
  params,
}: Pick<PageProps<"/[slug]/panel/arqueros/[id]/evaluaciones/nueva">, "params">) {
  const { slug, id } = await params;
  const session = await requireStaff(slug);
  if (!UUID.test(id)) notFound();

  const db = createServiceClient();
  const context = await getEvaluationContext(db, session.school.id, id);
  if (!context) notFound();

  const back = `/${session.school.slug}/panel/arqueros/${id}`;
  const name = `${context.goalkeeper.firstName} ${context.goalkeeper.lastName}`;

  if (context.goalkeeper.status !== "active") {
    return (
      <>
        <Link href={back} className="text-sm font-semibold text-ink-muted hover:text-ink">
          ← {name}
        </Link>
        <Notice tone="warning">
          Solo se puede evaluar a arqueros activos. Reactivalo desde su ficha para cargar una
          evaluación.
        </Notice>
      </>
    );
  }

  const { categories } = await getCurrentRubric(db);
  const today = argentinaDate(new Date());

  return (
    <>
      <Link href={back} className="text-sm font-semibold text-ink-muted hover:text-ink">
        ← {name}
      </Link>
      <div className="rise-in space-y-1">
        <h1 className="font-display text-3xl font-bold leading-tight">Nueva evaluación</h1>
        <p className="text-ink-muted">{name}</p>
      </div>
      {!context.hasEntry && context.count === 0 && (
        <Notice>
          Es la primera evaluación de este arquero: la cargamos como evaluación de ingreso.
        </Notice>
      )}
      <EvaluationForm
        slug={session.school.slug}
        goalkeeperId={id}
        evaluationId={null}
        status={null}
        categories={categories}
        today={today}
        canBeEntry={!context.hasEntry}
        initial={{
          date: today,
          type: !context.hasEntry && context.count === 0 ? "entry" : "periodic",
          comment: "",
          scores: {},
        }}
      />
    </>
  );
}
