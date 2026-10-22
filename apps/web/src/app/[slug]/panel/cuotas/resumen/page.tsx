import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { argentinaDate, formatCalendarDate } from "@/lib/dates";
import { addMonths } from "@/lib/fees";
import { requireSchoolAdmin } from "@/server/auth/guards";
import { getCollectionOverview } from "@/server/fees";
import { createServiceClient } from "@/server/supabase";

export const metadata: Metadata = {
  title: "Resumen de cobranza · EvoluGK",
  robots: { index: false },
};

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export default function CollectionPage({
  params,
  searchParams,
}: PageProps<"/[slug]/panel/cuotas/resumen">) {
  return (
    <main
      id="contenido"
      className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 pb-16 pt-4"
    >
      <Suspense
        fallback={<div className="h-60 animate-pulse rounded-card bg-line" aria-busy="true" />}
      >
        <CollectionContent params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

function monthLabel(month: string): string {
  const label = new Intl.DateTimeFormat("es-AR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T12:00:00Z`));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

async function CollectionContent({
  params,
  searchParams,
}: Pick<PageProps<"/[slug]/panel/cuotas/resumen">, "params" | "searchParams">) {
  const { slug } = await params;
  const session = await requireSchoolAdmin(slug);
  const { mes } = await searchParams;
  const today = argentinaDate(new Date());
  const requested = typeof mes === "string" && MONTH.test(mes) ? mes : null;
  const month = requested ?? today.slice(0, 7);

  const overview = await getCollectionOverview(createServiceClient(), {
    schoolId: session.school.id,
    month,
    today,
  });
  const { summary } = overview;
  const base = `/${session.school.slug}/panel/cuotas`;
  const previous = addMonths(`${month}-01`, -1).slice(0, 7);
  const next = addMonths(`${month}-01`, 1).slice(0, 7);

  const tiles = [
    { label: "Pagadas", value: summary.paid },
    { label: "Por vencer", value: summary.dueSoon },
    { label: "Vencidas", value: summary.overdue },
    { label: "Exentos", value: summary.exempt },
  ];

  return (
    <>
      <Link
        href={base}
        className="inline-flex min-h-11 items-center text-sm font-semibold text-ink-muted hover:text-ink"
      >
        ← Cuotas
      </Link>
      <h1 className="rise-in font-display text-3xl font-bold leading-tight">Resumen de cobranza</h1>

      <nav aria-label="Mes" className="flex items-center justify-between gap-2">
        <Link
          href={`${base}/resumen?mes=${previous}`}
          className="inline-flex h-11 items-center rounded-control border border-line bg-surface px-4 font-semibold hover:bg-accent-soft"
        >
          ← {monthLabel(previous)}
        </Link>
        <p className="font-display text-lg font-bold">{monthLabel(month)}</p>
        <Link
          href={`${base}/resumen?mes=${next}`}
          className="inline-flex h-11 items-center rounded-control border border-line bg-surface px-4 font-semibold hover:bg-accent-soft"
        >
          {monthLabel(next)} →
        </Link>
      </nav>

      <Card className="rise-in space-y-4">
        <p className="text-ink-muted">
          {summary.paidPercent === null ? (
            "No hay cuotas con fecha de pago en este mes."
          ) : (
            <>
              <strong className="font-display text-3xl text-ink">{summary.paidPercent}%</strong> de
              las cuotas del mes están pagadas ({summary.paid} de {summary.total}).
            </>
          )}
        </p>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tiles.map((tile) => (
            <div key={tile.label} className="rounded-control bg-accent-soft p-3">
              <dt className="text-sm text-ink-muted">{tile.label}</dt>
              <dd className="font-display text-2xl font-bold">{tile.value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm text-ink-muted">
          El mes se determina por la fecha de pago de la cuota. Las anuladas no cuentan.
        </p>
      </Card>

      <Card className="rise-in space-y-3">
        <h2 className="font-display text-lg font-bold">Quién debe</h2>
        {overview.debtors.length === 0 ? (
          <p className="text-ink-muted">Nadie tiene cuotas vencidas.</p>
        ) : (
          <ul className="divide-y divide-line">
            {overview.debtors.map((fee) => (
              <li key={fee.id}>
                <Link
                  href={`/${session.school.slug}/panel/arqueros/${fee.goalkeeperId}/cuotas`}
                  className="flex min-h-12 flex-wrap items-center justify-between gap-2 py-2 hover:text-accent"
                >
                  <span>
                    <span className="block font-semibold">
                      {fee.lastName}, {fee.firstName}
                    </span>
                    <span className="block text-sm text-ink-muted">
                      Cuota {fee.number} · se pagaba el {formatCalendarDate(fee.dueOn)}
                    </span>
                  </span>
                  <Chip tone="danger">
                    {fee.daysOverdue} {fee.daysOverdue === 1 ? "día" : "días"} de atraso
                  </Chip>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
