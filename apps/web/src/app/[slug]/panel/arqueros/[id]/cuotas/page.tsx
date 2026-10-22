import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Notice } from "@/components/ui/notice";
import { argentinaDate, formatCalendarDate } from "@/lib/dates";
import {
  FEE_REVISION_LABELS,
  FEE_STATUS_LABELS,
  FEE_STATUS_TONES,
  STANDING_LABELS,
} from "@/lib/fees";
import { requireSchoolAdmin } from "@/server/auth/guards";
import { getGoalkeeperFees } from "@/server/fees";
import { getGoalkeeperDetail } from "@/server/goalkeepers";
import { createServiceClient } from "@/server/supabase";
import {
  AdvanceForm,
  ExemptForm,
  FeeRowActions,
  StartForm,
  UndoPaymentButton,
} from "../../../cuotas/fee-controls";

export const metadata: Metadata = {
  title: "Cuotas del arquero · EvoluGK",
  robots: { index: false },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function GoalkeeperFeesPage({
  params,
}: PageProps<"/[slug]/panel/arqueros/[id]/cuotas">) {
  return (
    <main
      id="contenido"
      className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 pb-16 pt-4"
    >
      <Suspense
        fallback={<div className="h-60 animate-pulse rounded-card bg-line" aria-busy="true" />}
      >
        <GoalkeeperFeesContent params={params} />
      </Suspense>
    </main>
  );
}

async function GoalkeeperFeesContent({
  params,
}: Pick<PageProps<"/[slug]/panel/arqueros/[id]/cuotas">, "params">) {
  const { slug, id } = await params;
  const session = await requireSchoolAdmin(slug);
  if (!UUID.test(id)) notFound();

  const db = createServiceClient();
  const today = argentinaDate(new Date());
  const [detail, fees] = await Promise.all([
    getGoalkeeperDetail(db, session.school.id, id),
    getGoalkeeperFees(db, { schoolId: session.school.id, goalkeeperId: id, today }),
  ]);
  if (!detail || !fees) notFound();

  const schoolSlug = session.school.slug;
  const active = detail.status === "active";

  return (
    <>
      <Link
        href={`/${schoolSlug}/panel/arqueros/${id}`}
        className="inline-flex min-h-11 items-center text-sm font-semibold text-ink-muted hover:text-ink"
      >
        ← {detail.firstName} {detail.lastName}
      </Link>
      <div className="rise-in space-y-2">
        <h1 className="font-display text-3xl font-bold leading-tight">Cuotas</h1>
        <div className="flex flex-wrap gap-2">
          {fees.exempt ? (
            <Chip>Exento</Chip>
          ) : (
            <Chip
              tone={
                fees.standing === "overdue"
                  ? "danger"
                  : fees.standing === "due_soon"
                    ? "warning"
                    : "success"
              }
            >
              {STANDING_LABELS[fees.standing]}
            </Chip>
          )}
          {!active && <Chip>Arquero dado de baja</Chip>}
        </div>
        {!active && (
          <Notice>
            Un arquero inactivo o egresado no genera cuotas nuevas ni avisos. Las vencidas se
            conservan como deuda hasta que las anules.
          </Notice>
        )}
      </div>

      <Card className="rise-in space-y-3">
        <h2 className="font-display text-lg font-bold">Cuotas</h2>
        {fees.fees.length === 0 ? (
          <p className="text-ink-muted">
            {fees.exempt
              ? "Este arquero está exento: no tiene cuotas."
              : "Todavía no hay cuotas generadas."}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {fees.fees.map((fee) => (
              <li key={fee.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <span className="block font-semibold">
                      Cuota {fee.number} · se paga el {formatCalendarDate(fee.dueOn)}
                    </span>
                    <span className="block text-sm text-ink-muted">
                      Vence el {formatCalendarDate(fee.graceUntil)}
                      {fee.paidOn
                        ? ` · pagada el ${formatCalendarDate(fee.paidOn)}${fee.isAutomatic ? " (automática)" : ""}`
                        : ""}
                      {fee.note ? ` · ${fee.note}` : ""}
                    </span>
                  </span>
                  <Chip tone={FEE_STATUS_TONES[fee.status]}>
                    {fee.status === "overdue"
                      ? `Vencida hace ${fee.daysOverdue} ${fee.daysOverdue === 1 ? "día" : "días"}`
                      : FEE_STATUS_LABELS[fee.status]}
                  </Chip>
                </div>
                {fee.status === "paid" && (
                  <UndoPaymentButton slug={schoolSlug} feeId={fee.id} goalkeeperId={id} />
                )}
                {(fee.status === "upcoming" ||
                  fee.status === "due_soon" ||
                  fee.status === "overdue") && (
                  <FeeRowActions
                    slug={schoolSlug}
                    feeId={fee.id}
                    goalkeeperId={id}
                    today={today}
                    minDate={fees.feesStartOn ?? "2000-01-01"}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {active && !fees.exempt && fees.feesStartOn && (
        <Card className="rise-in space-y-3">
          <h2 className="font-display text-lg font-bold">Pago por adelantado</h2>
          <AdvanceForm slug={schoolSlug} goalkeeperId={id} />
        </Card>
      )}

      <Card className="rise-in space-y-3">
        <h2 className="font-display text-lg font-bold">Ciclo de cuotas</h2>
        <StartForm slug={schoolSlug} goalkeeperId={id} start={fees.feesStartOn} />
      </Card>

      <Card className="rise-in space-y-3">
        <h2 className="font-display text-lg font-bold">Exención</h2>
        <ExemptForm
          slug={schoolSlug}
          goalkeeperId={id}
          exempt={fees.exempt}
          note={fees.exemptNote}
        />
      </Card>

      {fees.history.length > 0 && (
        <Card className="rise-in space-y-3">
          <h2 className="font-display text-lg font-bold">Registro de cambios</h2>
          <ul className="divide-y divide-line text-sm">
            {fees.history.map((entry) => (
              <li key={entry.id} className="py-2">
                <span className="font-semibold">
                  {FEE_REVISION_LABELS[entry.action] ?? entry.action}
                </span>{" "}
                · cuota {entry.feeNumber}
                <span className="block text-ink-muted">
                  {formatCalendarDate(argentinaDate(new Date(entry.editedAt)))}
                  {entry.editorName ? ` · ${entry.editorName}` : " · Sistema"}
                  {entry.newPaidOn ? ` · pago del ${formatCalendarDate(entry.newPaidOn)}` : ""}
                  {entry.note ? ` · ${entry.note}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
