import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { argentinaDate, formatCalendarDate } from "@/lib/dates";
import { FEE_STATUS_LABELS, FEE_STATUS_TONES, NOTICE_TYPE_LABELS } from "@/lib/fees";
import { requireSchoolAdmin } from "@/server/auth/guards";
import { listFeePanel, listNoticeLog } from "@/server/fees";
import { createServiceClient } from "@/server/supabase";
import { QuickPayButton } from "./fee-controls";

export const metadata: Metadata = {
  title: "Cuotas · EvoluGK",
  robots: { index: false },
};

export default function FeesPage({ params }: PageProps<"/[slug]/panel/cuotas">) {
  return (
    <main
      id="contenido"
      className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 pb-16 pt-4"
    >
      <Suspense
        fallback={<div className="h-60 animate-pulse rounded-card bg-line" aria-busy="true" />}
      >
        <FeesContent params={params} />
      </Suspense>
    </main>
  );
}

async function FeesContent({ params }: Pick<PageProps<"/[slug]/panel/cuotas">, "params">) {
  const { slug } = await params;
  // Solo el admin: el profesor recibe acceso denegado (spec 06, RF-36).
  const session = await requireSchoolAdmin(slug);
  const db = createServiceClient();
  const today = argentinaDate(new Date());
  const [panel, log] = await Promise.all([
    listFeePanel(db, { schoolId: session.school.id, today }),
    listNoticeLog(db, { schoolId: session.school.id, limit: 30 }),
  ]);
  const base = `/${session.school.slug}/panel`;
  const failed = log.filter((l) => l.status === "failed");

  return (
    <>
      <Link
        href={base}
        className="inline-flex min-h-11 items-center text-sm font-semibold text-ink-muted hover:text-ink"
      >
        ← Panel
      </Link>
      <div className="rise-in flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-3xl font-bold leading-tight">Cuotas</h1>
        <Link
          href={`${base}/cuotas/resumen`}
          className="inline-flex h-11 items-center rounded-control border border-line bg-surface px-4 font-semibold hover:bg-accent-soft"
        >
          Resumen de cobranza
        </Link>
      </div>

      <Card className="rise-in space-y-3">
        <div className="space-y-1">
          <h2 className="font-display text-lg font-bold">Por vencer y vencidas</h2>
          <p className="text-sm text-ink-muted">
            Ordenadas por urgencia. Cada cuota se paga hasta 10 días después de su fecha de pago.
          </p>
        </div>
        {panel.length === 0 ? (
          <p className="text-ink-muted">No hay cuotas por vencer ni vencidas. Todo al día.</p>
        ) : (
          <ul className="divide-y divide-line">
            {panel.map((fee) => (
              <li key={fee.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <Link
                  href={`${base}/arqueros/${fee.goalkeeperId}/cuotas`}
                  className="min-w-0 hover:text-accent"
                >
                  <span className="block font-semibold">
                    {fee.lastName}, {fee.firstName}
                    {fee.goalkeeperStatus !== "active" && (
                      <span className="font-normal text-ink-muted"> · baja (deuda)</span>
                    )}
                  </span>
                  <span className="block text-sm text-ink-muted">
                    Cuota {fee.number} · se paga el {formatCalendarDate(fee.dueOn)}
                  </span>
                </Link>
                <div className="flex flex-wrap items-center gap-2">
                  <Chip tone={FEE_STATUS_TONES[fee.status]}>
                    {fee.status === "overdue"
                      ? `Vencida hace ${fee.daysOverdue} ${fee.daysOverdue === 1 ? "día" : "días"}`
                      : FEE_STATUS_LABELS[fee.status]}
                  </Chip>
                  <QuickPayButton
                    slug={session.school.slug}
                    feeId={fee.id}
                    goalkeeperId={fee.goalkeeperId}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {failed.length > 0 && (
        <Card className="rise-in space-y-3 border-warning/50 bg-warning/10">
          <h2 className="font-display text-lg font-bold">Avisos que no se pudieron enviar</h2>
          <p className="text-sm text-ink-muted">
            El mail puede ser inválido o haber rebotado. Revisá el contacto del tutor.
          </p>
          <ul className="divide-y divide-line text-sm">
            {failed.map((entry) => (
              <li key={entry.id} className="py-2">
                <span className="font-semibold">{entry.goalkeeperName}</span> · {entry.recipient}
                <span className="block text-ink-muted">
                  {NOTICE_TYPE_LABELS[entry.type]} ·{" "}
                  {formatCalendarDate(argentinaDate(new Date(entry.createdAt)))}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
