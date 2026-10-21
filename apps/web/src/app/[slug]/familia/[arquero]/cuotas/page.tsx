import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Notice } from "@/components/ui/notice";
import { argentinaDate, formatCalendarDate } from "@/lib/dates";
import { STANDING_LABELS } from "@/lib/fees";
import { getFamilyFees } from "@/server/guardian/fees";
import { listFamilyGoalkeepers } from "@/server/guardian/portal";
import { requireFamily } from "@/server/guardian/session";
import { createServiceClient } from "@/server/supabase";
import { PortalFrame } from "../../portal-frame";

export const metadata: Metadata = {
  title: "Cuota · EvoluGK",
  robots: { index: false },
};

type Props = PageProps<"/[slug]/familia/[arquero]/cuotas">;

export default function FamilyFeesPage({ params }: Props) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto h-64 w-full max-w-2xl animate-pulse rounded-card bg-line" />
      }
    >
      <FamilyFeesContent params={params} />
    </Suspense>
  );
}

const STANDING_TONE = { current: "success", due_soon: "warning", overdue: "danger" } as const;

async function FamilyFeesContent({ params }: Pick<Props, "params">) {
  const { slug, arquero } = await params;
  const session = await requireFamily(slug);
  const db = createServiceClient();

  const goalkeepers = await listFamilyGoalkeepers(db, session);
  // Un arquero ajeno o inexistente es indistinguible de uno que no existe.
  const goalkeeper = goalkeepers.find((g) => g.id === arquero);
  if (!goalkeeper) notFound();

  const fees = await getFamilyFees(db, session, goalkeeper.id, argentinaDate(new Date()));
  // Para un arquero exento, inactivo o egresado no hay sección de cuota (spec 06, RF-40).
  if (!fees.available) notFound();

  return (
    <PortalFrame slug={session.schoolSlug} goalkeepers={goalkeepers} currentId={goalkeeper.id}>
      <div className="rise-in space-y-2">
        <h1 className="font-display text-3xl font-bold leading-tight">
          Cuota de {goalkeeper.firstName}
        </h1>
        <Chip tone={STANDING_TONE[fees.standing]}>{STANDING_LABELS[fees.standing]}</Chip>
      </div>

      <Card className="space-y-2">
        <h2 className="font-display text-lg font-bold">Cuota actual</h2>
        {fees.current ? (
          <>
            <p>
              Corresponde pagarla el <strong>{formatCalendarDate(fees.current.dueOn)}</strong>.
            </p>
            <p className="text-ink-muted">
              El plazo vence el {formatCalendarDate(fees.current.graceUntil)}.
            </p>
            {fees.current.status === "overdue" && (
              <Notice tone="warning">
                La cuota está vencida. Comunicate con la escuela para coordinar el pago.
              </Notice>
            )}
            {fees.current.status === "due_soon" && (
              <Notice>
                Se acerca la fecha de pago. Si ya pagaste, la escuela lo va a registrar.
              </Notice>
            )}
          </>
        ) : (
          <p className="text-ink-muted">No hay cuotas pendientes. Está todo al día.</p>
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="font-display text-lg font-bold">Cuotas pagadas</h2>
        {fees.paid.length === 0 ? (
          <p className="text-ink-muted">Todavía no hay pagos registrados.</p>
        ) : (
          <ul className="divide-y divide-line">
            {fees.paid.map((fee) => (
              <li key={fee.number + fee.dueOn} className="py-2">
                <span className="block font-semibold">
                  Cuota del {formatCalendarDate(fee.dueOn)}
                </span>
                <span className="block text-sm text-ink-muted">
                  Pagada el {formatCalendarDate(fee.paidOn)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </PortalFrame>
  );
}
