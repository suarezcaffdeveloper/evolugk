import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { requireOperator } from "@/server/auth/guards";
import { createServiceClient } from "@/server/supabase";
import { incomeByMonth } from "@/server/subscriptions";

export const metadata: Metadata = { title: "Ingresos · EvoluGK", robots: { index: false } };

const ARS = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });

export default function IncomePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 pb-16 pt-4">
      <Link href="/operator" className="text-sm font-semibold text-ink-muted hover:text-ink">
        ← Volver a las escuelas
      </Link>
      <Suspense
        fallback={<div className="h-40 animate-pulse rounded-card bg-line" aria-busy="true" />}
      >
        <Income />
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

/** Resumen de ingresos por mes (spec 07, RF-19): solo el operador. */
async function Income() {
  await requireOperator("ready");
  const rows = await incomeByMonth(createServiceClient());
  return (
    <>
      <h1 className="rise-in font-display text-3xl font-bold leading-tight">Ingresos</h1>
      <Card className="rise-in space-y-3">
        {rows.length === 0 ? (
          <p className="text-ink-muted">Todavía no hay pagos registrados.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Ingresos por mes según la fecha de pago</caption>
            <thead className="text-ink-muted">
              <tr>
                <th className="py-1 font-semibold">Mes</th>
                <th className="py-1 font-semibold">Pagos</th>
                <th className="py-1 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row) => (
                <tr key={row.month}>
                  <td className="py-2">{monthLabel(row.month)}</td>
                  <td className="py-2">{row.payments}</td>
                  <td className="tabular py-2 text-right font-semibold">
                    {ARS.format(row.totalArs)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="text-sm text-ink-muted">
          Suma los pagos registrados por fecha de pago. Los pagos deshechos no cuentan.
        </p>
      </Card>
    </>
  );
}
