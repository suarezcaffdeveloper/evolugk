import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { argentinaDate, formatCalendarDate } from "@/lib/dates";
import { requireStaff } from "@/server/auth/guards";
import { listPendingGoalkeepers } from "@/server/evaluations";
import { getVideoQuota } from "@/server/videos";
import { createServiceClient } from "@/server/supabase";
import { logoutAction } from "../login/actions";

export const metadata: Metadata = {
  title: "Panel · EvoluGK",
  robots: { index: false },
};

const ROLE_LABEL = { school_admin: "Administración", coach: "Profesor" } as const;

export default function PanelPage({ params }: PageProps<"/[slug]/panel">) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 pb-16 pt-4">
      <Suspense
        fallback={<div className="h-40 animate-pulse rounded-card bg-line" aria-busy="true" />}
      >
        <PanelContent params={params} />
      </Suspense>
    </main>
  );
}

async function PanelContent({ params }: Pick<PageProps<"/[slug]/panel">, "params">) {
  const { slug } = await params;
  const session = await requireStaff(slug);
  const db = createServiceClient();
  const [pending, quota] = await Promise.all([
    listPendingGoalkeepers(db, session.school.id, argentinaDate(new Date())),
    // El consumo de video lo ve la administración (spec 03, RF-31).
    session.role === "school_admin" ? getVideoQuota(db, session.school.id) : Promise.resolve(null),
  ]);

  return (
    <>
      <div className="rise-in space-y-1">
        <p className="text-sm font-semibold text-ink-muted">{ROLE_LABEL[session.role]}</p>
        <h1 className="font-display text-3xl font-bold leading-tight">Hola, {session.firstName}</h1>
      </div>

      <Link
        href={`/${session.school.slug}/panel/arqueros`}
        className="rise-in block rounded-card focus-visible:outline-offset-4"
        style={{ "--i": 1 } as CSSProperties}
      >
        <Card interactive className="space-y-1">
          <h2 className="font-display text-lg font-bold">Arqueros</h2>
          <p className="text-ink-muted">
            {session.role === "school_admin"
              ? "Altas, fichas, tutores y accesos de las familias."
              : "Mirá las fichas y registrá altura y peso."}
          </p>
        </Card>
      </Link>

      {quota && (
        <Card className="rise-in space-y-2" style={{ "--i": 1 } as CSSProperties}>
          <h2 className="font-display text-lg font-bold">Minutos de video</h2>
          <p className="text-ink-muted">
            {quota.usedMinutes} de {quota.limitMinutes} minutos usados ({quota.percent}%).
          </p>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(100, quota.percent)}
            aria-label="Minutos de video usados"
            className="h-2 overflow-hidden rounded-full bg-line"
          >
            <div
              className={`h-full rounded-full ${quota.level === "ok" ? "bg-accent" : "bg-warning"}`}
              style={{ width: `${Math.min(100, quota.percent)}%` }}
            />
          </div>
          {quota.level === "warning" && (
            <p className="text-sm font-medium">
              Estás cerca del tope. Al llegar al 100% no se podrán subir más videos: podés borrar
              videos para liberar espacio o pedir un tope mayor.
            </p>
          )}
          {quota.level === "blocked" && (
            <p className="text-sm font-medium text-danger">
              Alcanzaste el tope: no se pueden subir más videos. Borrá videos para liberar espacio o
              pedí un tope mayor.
            </p>
          )}
        </Card>
      )}

      {pending.length > 0 && (
        <Card className="rise-in space-y-3" style={{ "--i": 1 } as CSSProperties}>
          <div className="space-y-1">
            <h2 className="font-display text-lg font-bold">Evaluaciones pendientes</h2>
            <p className="text-ink-muted">
              {pending.length === 1
                ? "1 arquero activo no tiene una evaluación publicada en los últimos 90 días."
                : `${pending.length} arqueros activos no tienen una evaluación publicada en los últimos 90 días.`}
            </p>
          </div>
          <ul className="divide-y divide-line">
            {pending.slice(0, 8).map((g) => (
              <li key={g.id}>
                <Link
                  href={`/${session.school.slug}/panel/arqueros/${g.id}`}
                  className="flex min-h-11 items-center justify-between gap-3 py-2 hover:text-accent"
                >
                  <span className="font-semibold">
                    {g.lastName}, {g.firstName}
                  </span>
                  <span className="text-sm text-ink-muted">
                    {g.lastEvaluationDate
                      ? `Última: ${formatCalendarDate(g.lastEvaluationDate)}`
                      : "Nunca evaluado"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {pending.length > 8 && (
            <p className="text-sm text-ink-muted">
              Y {pending.length - 8} más en la lista de arqueros.
            </p>
          )}
        </Card>
      )}

      {session.role === "school_admin" && (
        <Link
          href={`/${session.school.slug}/panel/grupos`}
          className="rise-in block rounded-card focus-visible:outline-offset-4"
          style={{ "--i": 2 } as CSSProperties}
        >
          <Card interactive className="space-y-1">
            <h2 className="font-display text-lg font-bold">Grupos</h2>
            <p className="text-ink-muted">Organizá a los arqueros por edad, nivel u horario.</p>
          </Card>
        </Link>
      )}

      {session.role === "school_admin" && (
        <Link
          href={`/${session.school.slug}/panel/equipo`}
          className="rise-in block rounded-card focus-visible:outline-offset-4"
          style={{ "--i": 3 } as CSSProperties}
        >
          <Card interactive className="space-y-1">
            <h2 className="font-display text-lg font-bold">Equipo</h2>
            <p className="text-ink-muted">
              Invitá profesores y administradores, y gestioná quién tiene acceso.
            </p>
          </Card>
        </Link>
      )}

      <form
        action={logoutAction.bind(null, session.school.slug)}
        className="rise-in"
        style={{ "--i": 4 } as CSSProperties}
      >
        <SubmitButton variant="secondary" pendingText="Saliendo…">
          Cerrar sesión
        </SubmitButton>
      </form>
    </>
  );
}
