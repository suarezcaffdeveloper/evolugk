import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type CSSProperties } from "react";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { ENTRY_LABELS, type EntryStatus } from "@/lib/attendance";
import { formatCalendarDate } from "@/lib/dates";
import { requireStaff } from "@/server/auth/guards";
import { getSessionState, listSessionRevisions } from "@/server/attendance";
import { createServiceClient } from "@/server/supabase";
import { DeleteSessionControl, SuspendControl } from "./session-controls";

export const metadata: Metadata = {
  title: "Sesión de asistencia · EvoluGK",
  robots: { index: false },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUS_TONE: Record<EntryStatus, "success" | "danger" | "warning" | "neutral"> = {
  present: "success",
  absent: "danger",
  excused: "warning",
  unmarked: "neutral",
};

type Props = PageProps<"/[slug]/panel/asistencia/sesion/[sessionId]">;

export default function SessionPage({ params }: Props) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 pb-16 pt-4">
      <Suspense
        fallback={<div className="h-96 animate-pulse rounded-card bg-line" aria-busy="true" />}
      >
        <SessionContent params={params} />
      </Suspense>
    </main>
  );
}

async function SessionContent({ params }: Pick<Props, "params">) {
  const { slug, sessionId } = await params;
  const session = await requireStaff(slug);
  if (!UUID.test(sessionId)) notFound();

  const db = createServiceClient();
  const [state, revisions] = await Promise.all([
    getSessionState(db, session.school.id, sessionId),
    listSessionRevisions(db, session.school.id, sessionId),
  ]);
  if (!state) notFound();

  const isAdmin = session.role === "school_admin";
  const stamp = new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  });

  return (
    <>
      <Link
        href={`/${session.school.slug}/panel/asistencia`}
        className="text-sm font-semibold text-ink-muted hover:text-ink"
      >
        ← Asistencia
      </Link>

      <div className="rise-in space-y-2">
        <h1 className="font-display text-3xl font-bold leading-tight">
          {state.groupName} · {formatCalendarDate(state.date)}
        </h1>
        <div className="flex flex-wrap gap-2">
          <Chip tone={state.status === "suspended" ? "warning" : "success"}>
            {state.status === "suspended" ? "Suspendida" : "Abierta"}
          </Chip>
          {state.suspensionReason && <Chip>Motivo: {state.suspensionReason}</Chip>}
        </div>
      </div>

      <Card className="rise-in space-y-3" style={{ "--i": 1 } as CSSProperties}>
        <h2 className="font-display text-lg font-bold">Lista</h2>
        {state.entries.length === 0 ? (
          <p className="text-ink-muted">La lista no tiene arqueros.</p>
        ) : (
          <ul className="divide-y divide-line">
            {state.entries.map((entry) => (
              <li
                key={entry.goalkeeperId}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <span>
                  <span className="font-semibold">
                    {entry.lastName}, {entry.firstName}
                  </span>
                  {entry.isGuest && <span className="ml-2 text-sm text-ink-muted">(invitado)</span>}
                  {entry.reason && (
                    <span className="block text-sm text-ink-muted">Motivo: {entry.reason}</span>
                  )}
                </span>
                <Chip tone={STATUS_TONE[entry.status]}>{ENTRY_LABELS[entry.status]}</Chip>
              </li>
            ))}
          </ul>
        )}
        <p className="text-sm text-ink-muted">
          Para corregir una marca, abrí esta fecha y este grupo en Asistencia: cada cambio queda
          registrado abajo.
        </p>
      </Card>

      <Card className="rise-in space-y-3" style={{ "--i": 2 } as CSSProperties}>
        <h2 className="font-display text-lg font-bold">Suspensión</h2>
        <SuspendControl
          slug={session.school.slug}
          sessionId={sessionId}
          suspended={state.status === "suspended"}
        />
      </Card>

      <Card className="rise-in space-y-3" style={{ "--i": 3 } as CSSProperties}>
        <h2 className="font-display text-lg font-bold">Registro de cambios</h2>
        {revisions.length === 0 ? (
          <p className="text-ink-muted">Todavía no hay cambios registrados.</p>
        ) : (
          <ul className="divide-y divide-line">
            {revisions.map((revision) => (
              <li key={revision.id} className="space-y-0.5 py-2 text-sm">
                <p>
                  <span className="font-semibold">{revision.goalkeeperName}</span>:{" "}
                  {ENTRY_LABELS[revision.oldValue]} → {ENTRY_LABELS[revision.newValue]}
                  {revision.discarded && (
                    <span className="ml-2 font-semibold text-warning">
                      (descartado: había una marca más reciente)
                    </span>
                  )}
                </p>
                <p className="text-ink-muted">
                  {revision.editorName ?? "Alguien del equipo"} ·{" "}
                  {stamp.format(new Date(revision.editedAt))}
                  {revision.clientMarkedAt &&
                    ` · marcado a las ${stamp.format(new Date(revision.clientMarkedAt))}`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {isAdmin && (
        <Card className="rise-in" style={{ "--i": 4 } as CSSProperties}>
          <DeleteSessionControl slug={session.school.slug} sessionId={sessionId} />
        </Card>
      )}
    </>
  );
}
