import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AttendanceCalendar } from "@/components/attendance-calendar";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { parseMonth } from "@/lib/attendance";
import { argentinaDate } from "@/lib/dates";
import { getFamilyAttendance } from "@/server/guardian/attendance";
import { listFamilyGoalkeepers } from "@/server/guardian/portal";
import { requireFamily } from "@/server/guardian/session";
import { createServiceClient } from "@/server/supabase";
import { PortalFrame } from "../../portal-frame";

export const metadata: Metadata = {
  title: "Asistencia · EvoluGK",
  robots: { index: false },
};

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

type Props = PageProps<"/[slug]/familia/[arquero]/asistencia">;

export default function FamilyAttendancePage({ params, searchParams }: Props) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto h-64 w-full max-w-2xl animate-pulse rounded-card bg-line" />
      }
    >
      <FamilyAttendanceContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function FamilyAttendanceContent({
  params,
  searchParams,
}: Pick<Props, "params" | "searchParams">) {
  const { slug, arquero } = await params;
  const session = await requireFamily(slug);
  const db = createServiceClient();

  const goalkeepers = await listFamilyGoalkeepers(db, session);
  // Un arquero ajeno o inexistente es indistinguible de uno que no existe.
  const goalkeeper = goalkeepers.find((g) => g.id === arquero);
  if (!goalkeeper) notFound();

  const today = argentinaDate(new Date());
  const month = parseMonth(first((await searchParams).mes)) ?? {
    year: Number(today.slice(0, 4)),
    month: Number(today.slice(5, 7)),
  };
  const attendance = await getFamilyAttendance(db, session, goalkeeper.id, month, today);
  const base = `/${session.schoolSlug}/familia/${goalkeeper.id}/asistencia`;

  return (
    <PortalFrame slug={session.schoolSlug} goalkeepers={goalkeepers} currentId={goalkeeper.id}>
      <div className="rise-in space-y-1">
        <h1 className="font-display text-3xl font-bold leading-tight">
          Asistencia de {goalkeeper.firstName}
        </h1>
      </div>

      {!attendance.available ? (
        // Un arquero inactivo o egresado no muestra asistencia nueva (spec 04, RF-23).
        <Notice>
          {goalkeeper.firstName} ya no está activo en la escuela, por eso no se muestra asistencia.
          Podés seguir viendo su historial de evaluaciones y videos.
        </Notice>
      ) : (
        <>
          <Card className="space-y-1">
            <h2 className="font-display text-lg font-bold">Últimos 90 días</h2>
            {attendance.summary.percent === null ? (
              <p className="text-ink-muted">
                Todavía no hay datos suficientes para calcular el porcentaje.
              </p>
            ) : (
              <>
                <p>
                  <strong className="font-display text-4xl">{attendance.summary.percent}%</strong>
                </p>
                <p className="text-ink-muted">
                  Asistió a {attendance.summary.present} de {attendance.summary.counted}{" "}
                  entrenamientos. No se cuentan las ausencias justificadas ni los entrenamientos
                  suspendidos.
                </p>
              </>
            )}
          </Card>

          <Card>
            <AttendanceCalendar
              year={attendance.year}
              month={attendance.month}
              weeks={attendance.weeks}
              hrefForMonth={(value) => `${base}?mes=${value}`}
            />
          </Card>
        </>
      )}
    </PortalFrame>
  );
}
