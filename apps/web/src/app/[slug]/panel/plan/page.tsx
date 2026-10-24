import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Notice } from "@/components/ui/notice";
import { argentinaDate, formatCalendarDate } from "@/lib/dates";
import { requireSchoolAdmin } from "@/server/auth/guards";
import { createServiceClient } from "@/server/supabase";
import { getSchoolPlan } from "@/server/subscriptions";

export const metadata: Metadata = {
  title: "Mi plan · EvoluGK",
  robots: { index: false },
};

const STATE_LABELS = {
  trial: { label: "En prueba", tone: "neutral" },
  current: { label: "Al día", tone: "success" },
  overdue: { label: "Vencida", tone: "warning" },
  suspended: { label: "Suspendida", tone: "danger" },
} as const;

export default function PlanPage({ params }: PageProps<"/[slug]/panel/plan">) {
  return (
    <main
      id="contenido"
      className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 pb-16 pt-4"
    >
      <Suspense
        fallback={<div className="h-60 animate-pulse rounded-card bg-line" aria-busy="true" />}
      >
        <PlanContent params={params} />
      </Suspense>
    </main>
  );
}

function Meter({
  label,
  used,
  limit,
  percent,
  unit,
}: {
  label: string;
  used: number;
  limit: number;
  percent: number;
  unit: string;
}) {
  return (
    <div className="space-y-2">
      <h2 className="font-display text-lg font-bold">{label}</h2>
      <p className="text-ink-muted">
        {used} de {limit} {unit} ({percent}%).
      </p>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, percent)}
        aria-label={label}
        className="h-2 overflow-hidden rounded-full bg-line"
      >
        <div
          className={`h-full rounded-full ${percent >= 90 ? "bg-warning" : "bg-accent"}`}
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
    </div>
  );
}

async function PlanContent({ params }: Pick<PageProps<"/[slug]/panel/plan">, "params">) {
  const { slug } = await params;
  // Solo el admin ve su plan; el profesor recibe acceso denegado (spec 07, RF-34).
  const session = await requireSchoolAdmin(slug);
  const plan = await getSchoolPlan(
    createServiceClient(),
    session.school.id,
    argentinaDate(new Date()),
  );
  if (!plan) notFound();
  const state = STATE_LABELS[plan.state];

  return (
    <>
      <Link
        href={`/${session.school.slug}/panel`}
        className="inline-flex min-h-11 items-center text-sm font-semibold text-ink-muted hover:text-ink"
      >
        ← Panel
      </Link>
      <div className="rise-in space-y-2">
        <h1 className="font-display text-3xl font-bold leading-tight">Mi plan</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={state.tone}>{state.label}</Chip>
          <span className="text-ink-muted">
            {plan.state === "trial" ? "La prueba llega hasta el " : "Próximo vencimiento: "}
            <strong className="text-ink">{formatCalendarDate(plan.coveredUntil)}</strong>
          </span>
        </div>
      </div>

      <Card className="rise-in space-y-5">
        <Meter
          label="Arqueros activos"
          used={plan.goalkeepers.active}
          limit={plan.goalkeepers.limit}
          percent={plan.goalkeepers.percent}
          unit="arqueros"
        />
        {plan.goalkeepers.level === "near" && (
          <Notice tone="warning">
            Estás cerca del tope de arqueros. Podés seguir dando de alta, pero conviene hablar con
            EvoluGK para ampliar el plan.
          </Notice>
        )}
        {plan.goalkeepers.level === "exceeded" && (
          <Notice tone="warning">
            Superaste el tope de arqueros. No se bloquea nada: EvoluGK se va a comunicar para
            ajustar el plan.
          </Notice>
        )}
        <Meter
          label="Minutos de video"
          used={plan.video.usedMinutes}
          limit={plan.video.limitMinutes}
          percent={plan.video.percent}
          unit="minutos"
        />
        {plan.video.level === "warning" && (
          <Notice tone="warning">Estás cerca del tope de minutos de video.</Notice>
        )}
        {plan.video.level === "blocked" && (
          <Notice tone="warning">
            Alcanzaste el tope: no se pueden subir más videos hasta liberar espacio o ampliar el
            plan.
          </Notice>
        )}
      </Card>

      <p className="text-sm text-ink-muted">
        Para cambiar las condiciones del plan, escribinos desde el contacto que te pasamos al
        empezar.
      </p>
    </>
  );
}
