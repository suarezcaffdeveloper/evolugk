import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type CSSProperties } from "react";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Notice } from "@/components/ui/notice";
import { MONTH_NAMES, parseMonth, shiftMonth } from "@/lib/attendance";
import { argentinaDate, formatCalendarDate } from "@/lib/dates";
import { requireStaff } from "@/server/auth/guards";
import {
  getGroupMonthReport,
  getLowAttendance,
  listAbsenceAlerts,
  listSessions,
} from "@/server/attendance";
import { createServiceClient } from "@/server/supabase";
import { DismissAlertButton } from "../alert-controls";

export const metadata: Metadata = {
  title: "Informes de asistencia · EvoluGK",
  robots: { index: false },
};

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

type Props = PageProps<"/[slug]/panel/asistencia/informes">;

export default function ReportsPage({ params, searchParams }: Props) {
  return (
    <main
      id="contenido"
      className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 pb-16 pt-4"
    >
      <Suspense
        fallback={<div className="h-96 animate-pulse rounded-card bg-line" aria-busy="true" />}
      >
        <ReportsContent params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function ReportsContent({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const { slug } = await params;
  const session = await requireStaff(slug);
  const query = await searchParams;

  const today = argentinaDate(new Date());
  const month = parseMonth(first(query.mes)) ?? {
    year: Number(today.slice(0, 4)),
    month: Number(today.slice(5, 7)),
  };
  const isAdmin = session.role === "school_admin";
  const base = `/${session.school.slug}/panel/asistencia`;

  const db = createServiceClient();
  // Resumen por grupo y baja asistencia: los ven el admin y los profesores (RF-23b); los avisos, solo el admin.
  const [groups, low, sessions, alerts] = await Promise.all([
    getGroupMonthReport(db, session.school.id, month),
    getLowAttendance(db, session.school.id, today),
    listSessions(db, session.school.id, { limit: 20 }),
    isAdmin ? listAbsenceAlerts(db, session.school.id) : Promise.resolve([]),
  ]);

  return (
    <>
      <Link
        href={base}
        className="inline-flex min-h-11 items-center text-sm font-semibold text-ink-muted hover:text-ink"
      >
        ← Asistencia
      </Link>
      <h1 className="rise-in font-display text-3xl font-bold leading-tight">
        Informes de asistencia
      </h1>

      {first(query.borrada) && <Notice tone="success">La sesión se borró.</Notice>}

      {isAdmin && alerts.length > 0 && (
        <Card
          className="rise-in space-y-3 border-warning/50 bg-warning/10"
          style={{ "--i": 1 } as CSSProperties}
        >
          <h2 className="font-display text-lg font-bold">Ausencias seguidas</h2>
          <ul className="divide-y divide-line">
            {alerts.map((alert) => (
              <li key={alert.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link
                  href={`/${session.school.slug}/panel/arqueros/${alert.goalkeeperId}`}
                  className="hover:text-accent"
                >
                  <span className="font-semibold">
                    {alert.lastName}, {alert.firstName}
                  </span>
                  <span className="block text-sm text-ink-muted">
                    {alert.streakLength} ausencias seguidas sin justificar
                  </span>
                </Link>
                <DismissAlertButton slug={session.school.slug} alertId={alert.id} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="rise-in space-y-4" style={{ "--i": 2 } as CSSProperties}>
        <div className="flex items-center justify-between gap-2">
          <Link
            href={`${base}/informes?mes=${shiftMonth(month.year, month.month, -1)}`}
            aria-label="Mes anterior"
            className="inline-flex h-11 w-11 items-center justify-center rounded-control border border-line bg-surface hover:bg-accent-soft"
          >
            ←
          </Link>
          <h2 className="font-display text-lg font-bold capitalize">
            Por grupo · {MONTH_NAMES[month.month - 1]} de {month.year}
          </h2>
          <Link
            href={`${base}/informes?mes=${shiftMonth(month.year, month.month, 1)}`}
            aria-label="Mes siguiente"
            className="inline-flex h-11 w-11 items-center justify-center rounded-control border border-line bg-surface hover:bg-accent-soft"
          >
            →
          </Link>
        </div>
        {groups.length === 0 ? (
          <p className="text-ink-muted">Todavía no hay grupos.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-72 text-left">
              <thead>
                <tr className="text-sm text-ink-muted">
                  <th scope="col" className="py-1.5 pr-3 font-semibold">
                    Grupo
                  </th>
                  <th scope="col" className="py-1.5 pr-3 font-semibold">
                    Entrenamientos
                  </th>
                  <th scope="col" className="py-1.5 font-semibold">
                    Asistencia promedio
                  </th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <tr key={group.groupId} className="border-t border-line">
                    <td className="py-2 pr-3 font-semibold">{group.groupName}</td>
                    <td className="py-2 pr-3">{group.trainings}</td>
                    <td className="py-2">
                      {group.average === null ? (
                        <span className="text-ink-muted">Sin datos</span>
                      ) : (
                        `${group.average}%`
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="rise-in space-y-3" style={{ "--i": 3 } as CSSProperties}>
        <div className="space-y-1">
          <h2 className="font-display text-lg font-bold">Baja asistencia</h2>
          <p className="text-sm text-ink-muted">
            Arqueros activos con menos de 70% en los últimos 90 días (sin contar justificadas ni
            sesiones suspendidas).
          </p>
        </div>
        {low.length === 0 ? (
          <p className="text-ink-muted">Ningún arquero está por debajo del 70%.</p>
        ) : (
          <ul className="divide-y divide-line">
            {low.map((row) => (
              <li key={row.goalkeeperId}>
                <Link
                  href={`/${session.school.slug}/panel/arqueros/${row.goalkeeperId}`}
                  className="flex min-h-11 flex-wrap items-center justify-between gap-2 py-2 hover:text-accent"
                >
                  <span className="font-semibold">
                    {row.lastName}, {row.firstName}
                  </span>
                  <Chip tone="warning">
                    {row.summary.percent}% · {row.summary.present} de {row.summary.counted}
                  </Chip>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="rise-in space-y-3" style={{ "--i": 4 } as CSSProperties}>
        <h2 className="font-display text-lg font-bold">Últimas sesiones</h2>
        {sessions.length === 0 ? (
          <p className="text-ink-muted">Todavía no se tomó lista.</p>
        ) : (
          <ul className="divide-y divide-line">
            {sessions.map((item) => (
              <li key={item.id}>
                <Link
                  href={`${base}/sesion/${item.id}`}
                  className="flex min-h-11 flex-wrap items-center justify-between gap-2 py-2 hover:text-accent"
                >
                  <span>
                    <span className="font-semibold">{item.groupName}</span>
                    <span className="block text-sm text-ink-muted">
                      {formatCalendarDate(item.date)}
                      {item.status === "suspended" ? ` · Suspendida: ${item.suspensionReason}` : ""}
                    </span>
                  </span>
                  <span className="text-sm text-ink-muted">
                    {item.present} presentes · {item.absent} ausentes
                    {item.unmarked > 0 ? ` · ${item.unmarked} sin marcar` : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
