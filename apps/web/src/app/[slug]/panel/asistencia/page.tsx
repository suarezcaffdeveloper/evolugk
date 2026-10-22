import type { Metadata } from "next";
import { Suspense } from "react";
import { requireStaff } from "@/server/auth/guards";
import { getAttendanceBootstrap } from "@/server/attendance";
import { createServiceClient } from "@/server/supabase";
import { AttendanceApp } from "./attendance-app";

export const metadata: Metadata = {
  title: "Asistencia · EvoluGK",
  robots: { index: false },
};

export default function AttendancePage({ params }: PageProps<"/[slug]/panel/asistencia">) {
  return (
    <main
      id="contenido"
      className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 pb-8 pt-4"
    >
      <Suspense
        fallback={<div className="h-96 animate-pulse rounded-card bg-line" aria-busy="true" />}
      >
        <AttendanceContent params={params} />
      </Suspense>
    </main>
  );
}

async function AttendanceContent({
  params,
}: Pick<PageProps<"/[slug]/panel/asistencia">, "params">) {
  const { slug } = await params;
  const session = await requireStaff(slug);
  const bootstrap = await getAttendanceBootstrap(createServiceClient(), session.school.id);

  return (
    <>
      <div className="rise-in flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          {/* Enlace común (no del router): sin conexión debe abrirse la copia guardada de esta pantalla. */}
          <a
            href={`/${session.school.slug}/panel`}
            className="inline-flex min-h-11 items-center text-sm font-semibold text-ink-muted hover:text-ink"
          >
            ← Volver al panel
          </a>
          <h1 className="font-display text-3xl font-bold leading-tight">Asistencia</h1>
        </div>
        <a
          href={`/${session.school.slug}/panel/asistencia/informes`}
          className="inline-flex h-11 items-center rounded-control border border-line bg-surface px-4 font-semibold hover:bg-accent-soft"
        >
          Informes
        </a>
      </div>
      <AttendanceApp
        slug={session.school.slug}
        userId={session.user.id}
        initial={{ ...bootstrap, generatedAt: new Date().toISOString() }}
      />
    </>
  );
}
