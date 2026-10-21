import Link from "next/link";
import { Suspense, type CSSProperties } from "react";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatCalendarDate } from "@/lib/dates";
import { requireOperator } from "@/server/auth/guards";
import { listSchools, type SchoolSummary } from "@/server/schools";
import { ALERT_LABELS, listOpenAlerts } from "@/server/subscriptions";
import { DismissAlertButton } from "./escuelas/[slug]/subscription-forms";
import { createServiceClient } from "@/server/supabase";
import { operatorLogoutAction } from "./actions";

export default function OperatorHomePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 pb-16 pt-4">
      <Suspense
        fallback={<div className="h-40 animate-pulse rounded-card bg-line" aria-busy="true" />}
      >
        <OperatorHome />
      </Suspense>
    </main>
  );
}

async function OperatorHome() {
  // Al panel solo se entra con la verificación en dos pasos completa.
  const session = await requireOperator("ready");
  const db = createServiceClient();
  const [schools, alerts] = await Promise.all([listSchools(db), listOpenAlerts(db)]);

  return (
    <>
      <div className="rise-in flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-ink-muted">Operador de la plataforma</p>
          <h1 className="font-display text-3xl font-bold leading-tight">
            Hola, {session.firstName}
          </h1>
        </div>
        <Link
          href="/operator/ingresos"
          className="inline-flex h-11 items-center justify-center rounded-control border border-line bg-surface px-4 font-semibold transition-colors duration-150 hover:bg-accent-soft"
        >
          Ingresos
        </Link>
        <Link
          href="/operator/escuelas/nueva"
          className="inline-flex h-11 items-center justify-center rounded-control bg-accent px-4 font-semibold text-on-accent shadow-card transition-[box-shadow,transform,filter] duration-150 hover:shadow-card-hover hover:brightness-110 active:scale-[0.97]"
        >
          Nueva escuela
        </Link>
      </div>

      {alerts.length > 0 && (
        <Card className="rise-in space-y-3 border-warning/50 bg-warning/10">
          <h2 className="font-display text-lg font-bold">
            Alertas <span className="tabular text-ink-muted">({alerts.length})</span>
          </h2>
          <ul className="divide-y divide-line">
            {alerts.map((alert) => (
              <li key={alert.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link href={`/operator/escuelas/${alert.schoolSlug}`} className="hover:text-accent">
                  <span className="block font-semibold">{alert.schoolName}</span>
                  <span className="block text-sm text-ink-muted">{ALERT_LABELS[alert.type]}</span>
                </Link>
                <DismissAlertButton alertId={alert.id} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <section aria-labelledby="schools-title" className="space-y-3">
        <h2 id="schools-title" className="font-display text-xl font-bold">
          Escuelas <span className="tabular text-ink-muted">({schools.length})</span>
        </h2>

        {schools.length === 0 ? (
          <Card className="rise-in space-y-2 text-center" style={{ "--i": 1 } as CSSProperties}>
            <p className="font-display text-lg font-bold">Todavía no hay escuelas</p>
            <p className="text-ink-muted">
              Creá la primera: cargás sus condiciones y le mandás la invitación a su administrador.
            </p>
          </Card>
        ) : (
          <ul className="space-y-3">
            {schools.map((school, index) => (
              <li key={school.id} className="rise-in" style={{ "--i": index + 1 } as CSSProperties}>
                <SchoolCard school={school} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <form action={operatorLogoutAction} className="mt-2">
        <SubmitButton variant="secondary" pendingText="Saliendo…">
          Cerrar sesión
        </SubmitButton>
      </form>
    </>
  );
}

function SchoolCard({ school }: { school: SchoolSummary }) {
  const adminText =
    school.admins.active > 0
      ? `${school.admins.active} ${school.admins.active === 1 ? "administrador activo" : "administradores activos"}`
      : school.admins.pending > 0
        ? "Invitación al administrador pendiente"
        : "Sin administrador";

  return (
    <Link
      href={`/operator/escuelas/${school.slug}`}
      className="block rounded-card focus-visible:outline-offset-4"
    >
      <Card interactive className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="truncate font-display text-lg font-bold">{school.name}</p>
          <p className="font-mono text-sm text-ink-muted">/{school.slug}</p>
          <p className="text-sm text-ink-muted">
            {adminText}
            {school.trialUntil && <> · Prueba hasta el {formatCalendarDate(school.trialUntil)}</>}
          </p>
        </div>
        <Chip tone={school.status === "active" ? "success" : "danger"}>
          {school.status === "active" ? "● Activa" : "● Suspendida"}
        </Chip>
      </Card>
    </Link>
  );
}
