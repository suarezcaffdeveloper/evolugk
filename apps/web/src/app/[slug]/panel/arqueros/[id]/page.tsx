import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type CSSProperties, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EvolutionRadar } from "@/components/evolution-radar";
import { Notice } from "@/components/ui/notice";
import { argentinaDate, formatCalendarDate } from "@/lib/dates";
import { EVALUATION_TYPE_LABELS } from "@/lib/evaluation-schemas";
import { comparison, currentEvaluation, isEvaluationPending, radarValues } from "@/lib/evolution";
import {
  ageOn,
  FOOT_LABELS,
  LEVEL_LABELS,
  STATUS_LABELS,
  type Foot,
} from "@/lib/goalkeeper-schemas";
import { requireStaff } from "@/server/auth/guards";
import {
  getCurrentRubric,
  lastPublishedDates,
  listEvaluations,
  listNotes,
} from "@/server/evaluations";
import { getGoalkeeperDetail, listGroups, searchGuardians } from "@/server/goalkeepers";
import { createServiceClient } from "@/server/supabase";
import { getVideoQuota, listVideos } from "@/server/videos";
import { AttendanceCalendar } from "@/components/attendance-calendar";
import { attendanceSummary, ENTRY_LABELS, monthCalendar, parseMonth } from "@/lib/attendance";
import { getGoalkeeperAttendance, toRecords } from "@/server/attendance";
import { NoteForm } from "./evaluaciones/evaluation-actions";
import { DeleteAllVideosButton } from "./videos/video-controls";
import {
  AddGuardian,
  DeleteForm,
  GroupsForm,
  GuardianCard,
  MeasurementForm,
  StatusForm,
} from "./panels";

export const metadata: Metadata = {
  title: "Ficha del arquero · EvoluGK",
  robots: { index: false },
};

export default function GoalkeeperPage({
  params,
  searchParams,
}: PageProps<"/[slug]/panel/arqueros/[id]">) {
  return (
    <main
      id="contenido"
      className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 pb-16 pt-4"
    >
      <Suspense
        fallback={<div className="h-96 animate-pulse rounded-card bg-line" aria-busy="true" />}
      >
        <GoalkeeperContent params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 py-2">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

async function GoalkeeperContent({
  params,
  searchParams,
}: Pick<PageProps<"/[slug]/panel/arqueros/[id]">, "params" | "searchParams">) {
  const { slug, id } = await params;
  const session = await requireStaff(slug);
  if (!UUID.test(id)) notFound();

  const db = createServiceClient();
  const detail = await getGoalkeeperDetail(db, session.school.id, id);
  if (!detail) notFound();

  const { tq, evaluacion, mes } = await searchParams;
  const tutorQuery = (Array.isArray(tq) ? tq[0] : tq)?.trim() ?? "";
  const isAdmin = session.role === "school_admin";
  const today = argentinaDate(new Date());

  const viewer = { userId: session.user.id, role: session.role };
  const [allGroups, found, evaluations, notes, rubric, lastPublished, videos, quota, attendance] =
    await Promise.all([
      isAdmin ? listGroups(db, session.school.id) : Promise.resolve([]),
      isAdmin && tutorQuery
        ? searchGuardians(db, session.school.id, tutorQuery)
        : Promise.resolve([]),
      listEvaluations(db, session.school.id, id, viewer),
      listNotes(db, session.school.id, id),
      getCurrentRubric(db),
      lastPublishedDates(db, session.school.id, [id]),
      listVideos(db, session.school.id, id),
      getVideoQuota(db, session.school.id),
      getGoalkeeperAttendance(db, session.school.id, id),
    ]);
  const linkedIds = new Set(detail.guardians.map((g) => g.id));
  const matches = found
    .filter((g) => !linkedIds.has(g.id))
    .map((g) => ({ id: g.id, name: `${g.firstName} ${g.lastName}`, phone: g.phone }));

  // Opciones del selector de grupos: los vigentes y los archivados a los que ya pertenece.
  const groupOptions = [
    ...allGroups.map((g) => ({ id: g.id, name: g.name, archived: false })),
    ...detail.groups.filter((g) => g.archived),
  ];
  const latest = detail.measurements[0];
  const consentLabel = {
    valid: { label: "Consentimiento vigente", tone: "success" as const },
    pending: { label: "Consentimiento pendiente", tone: "warning" as const },
    revoked: { label: "Consentimiento retirado", tone: "danger" as const },
  }[detail.consent];
  const base = `/${session.school.slug}/panel/arqueros`;
  const attendanceStats = attendanceSummary(toRecords(attendance), today);
  const attendanceMonth = parseMonth(typeof mes === "string" ? mes : undefined) ?? {
    year: Number(today.slice(0, 4)),
    month: Number(today.slice(5, 7)),
  };

  // Evolución: solo con lo publicado (los borradores no entran en el radar, RN-03).
  const published = evaluations
    .filter((e) => e.status === "published")
    .map((e) => ({
      id: e.id,
      date: e.date,
      createdAt: e.createdAt,
      type: e.type,
      scores: Object.fromEntries(e.scores.map((s) => [s.key, s.score])),
    }));
  const current = currentEvaluation(published);
  const compared = comparison(published);
  const categoryKeys = rubric.categories.map((c) => c.key);
  const isActive = detail.status === "active";
  const pending = isActive && isEvaluationPending(lastPublished.get(id) ?? null, today);

  return (
    <>
      <Link
        href={base}
        className="inline-flex min-h-11 items-center text-sm font-semibold text-ink-muted hover:text-ink"
      >
        ← Arqueros
      </Link>

      {evaluacion === "borrada" && <Notice tone="success">La evaluación se borró.</Notice>}

      <div className="rise-in space-y-2">
        <h1 className="font-display text-3xl font-bold leading-tight">
          {detail.firstName} {detail.lastName}
        </h1>
        <div className="flex flex-wrap gap-2">
          <Chip tone={consentLabel.tone}>{consentLabel.label}</Chip>
          <Chip>{STATUS_LABELS[detail.status]}</Chip>
          {detail.level && <Chip>{LEVEL_LABELS[detail.level]}</Chip>}
          {detail.groups.map((g) => (
            <Chip key={g.id}>{g.name}</Chip>
          ))}
        </div>
        {detail.consent !== "valid" && (
          <Notice tone="warning">
            {detail.consent === "revoked"
              ? "La familia retiró el consentimiento: no se muestran fotos ni videos."
              : "Hasta que un tutor acepte el consentimiento en el portal, no se pueden subir fotos ni videos."}
          </Notice>
        )}
      </div>

      <Card className="rise-in space-y-2" style={{ "--i": 1 } as CSSProperties}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-lg font-bold">Ficha</h2>
          {isAdmin && (
            <Link
              href={`${base}/${id}/editar`}
              className="inline-flex min-h-11 items-center px-2 text-sm font-semibold underline"
            >
              Editar
            </Link>
          )}
        </div>
        <dl className="divide-y divide-line">
          <Row label="Edad">
            {ageOn(detail.birthDate, today)} años ({formatCalendarDate(detail.birthDate)})
          </Row>
          <Row label="Ingreso">{formatCalendarDate(detail.joinedOn)}</Row>
          {detail.preferredFoot && (
            <Row label="Pie hábil">{FOOT_LABELS[detail.preferredFoot as Foot]}</Row>
          )}
          {detail.currentClub && <Row label="Club actual">{detail.currentClub}</Row>}
          {detail.category && <Row label="Categoría">{detail.category}</Row>}
          {detail.goal && <Row label="Objetivo">{detail.goal}</Row>}
          {latest && (
            <Row label="Última medida">
              {[
                latest.heightCm && `${latest.heightCm} cm`,
                latest.weightKg && `${latest.weightKg} kg`,
              ]
                .filter(Boolean)
                .join(" · ")}{" "}
              <span className="font-normal text-ink-muted">
                ({formatCalendarDate(latest.date)})
              </span>
            </Row>
          )}
          <Row label="Contacto de emergencia">
            {detail.emergency.name || detail.emergency.phone ? (
              <>
                {[
                  detail.emergency.name,
                  detail.emergency.relationship && `(${detail.emergency.relationship})`,
                ]
                  .filter(Boolean)
                  .join(" ")}
                {detail.emergency.phone && (
                  <>
                    {" · "}
                    <a href={`tel:${detail.emergency.phone}`} className="underline">
                      {detail.emergency.phone}
                    </a>
                  </>
                )}
              </>
            ) : (
              <span className="font-normal text-ink-muted">Sin cargar</span>
            )}
          </Row>
        </dl>
      </Card>

      <Card className="rise-in space-y-4" style={{ "--i": 1 } as CSSProperties}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-lg font-bold">Evaluaciones</h2>
            {pending && <Chip tone="warning">Evaluación pendiente</Chip>}
          </div>
          {isActive && (
            <Link
              href={`${base}/${id}/evaluaciones/nueva`}
              className="inline-flex h-11 items-center rounded-control bg-accent px-4 font-semibold text-on-accent shadow-card hover:brightness-110"
            >
              Nueva evaluación
            </Link>
          )}
        </div>
        {!isActive && (
          <p className="text-sm text-ink-muted">
            Solo se evalúa a arqueros activos. Las evaluaciones anteriores se conservan.
          </p>
        )}
        {current && (
          <EvolutionRadar
            labels={rubric.categories.map((c) => c.name)}
            current={radarValues(current, categoryKeys)}
            entry={compared ? radarValues(compared.entry, categoryKeys) : null}
            currentLabel={`Hoy · ${formatCalendarDate(current.date)}`}
            entryLabel={
              compared ? `Ingreso · ${formatCalendarDate(compared.entry.date)}` : undefined
            }
          />
        )}
        {evaluations.length === 0 ? (
          <p className="text-ink-muted">Todavía no hay evaluaciones cargadas.</p>
        ) : (
          <ul className="divide-y divide-line">
            {evaluations.map((evaluation) => (
              <li key={evaluation.id}>
                <Link
                  href={`${base}/${id}/evaluaciones/${evaluation.id}`}
                  className="flex min-h-14 flex-wrap items-center justify-between gap-2 py-2 hover:text-accent"
                >
                  <span>
                    <span className="block font-semibold">
                      {formatCalendarDate(evaluation.date)}
                    </span>
                    <span className="block text-sm text-ink-muted">
                      {EVALUATION_TYPE_LABELS[evaluation.type]}
                      {evaluation.authorName ? ` · ${evaluation.authorName}` : ""}
                    </span>
                  </span>
                  <Chip tone={evaluation.status === "published" ? "success" : "warning"}>
                    {evaluation.status === "published" ? "Publicada" : "Borrador"}
                  </Chip>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="rise-in space-y-4" style={{ "--i": 1 } as CSSProperties}>
        <h2 className="font-display text-lg font-bold">Notas</h2>
        {isActive && <NoteForm slug={session.school.slug} goalkeeperId={id} />}
        {notes.length > 0 && (
          <ul className="divide-y divide-line">
            {notes.map((note) => (
              <li key={note.id} className="space-y-1 py-3 first:pt-0 last:pb-0">
                <p className="whitespace-pre-line">{note.body}</p>
                <p className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
                  <span>
                    {note.authorName ?? "Equipo"} ·{" "}
                    {formatCalendarDate(argentinaDate(new Date(note.createdAt)))}
                  </span>
                  <Chip tone={note.visibleToFamily ? "success" : "neutral"}>
                    {note.visibleToFamily ? "Visible para la familia" : "Interna"}
                  </Chip>
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="rise-in space-y-4" style={{ "--i": 1 } as CSSProperties}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-bold">Videos</h2>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`${base}/${id}/videos`}
              className="inline-flex h-11 items-center rounded-control border border-line bg-surface px-4 font-semibold hover:bg-accent-soft"
            >
              Ver videos
            </Link>
            {isActive && detail.consent === "valid" && (
              <Link
                href={`${base}/${id}/videos/nuevo`}
                className="inline-flex h-11 items-center rounded-control bg-accent px-4 font-semibold text-on-accent shadow-card hover:brightness-110"
              >
                Subir video
              </Link>
            )}
          </div>
        </div>
        <p className="text-ink-muted">
          {videos.length === 0
            ? "Todavía no hay videos de este arquero."
            : `${videos.length} ${videos.length === 1 ? "video" : "videos"}: ${videos.filter((v) => v.publicationStatus === "published").length} publicados.`}
        </p>
        {isAdmin && quota.level !== "ok" && (
          <Notice tone="warning">
            {quota.level === "blocked"
              ? `La escuela alcanzó su tope de ${quota.limitMinutes} minutos de video: no se pueden subir más.`
              : `La escuela usó el ${quota.percent}% de sus ${quota.limitMinutes} minutos de video.`}
          </Notice>
        )}
        {isAdmin && detail.consent === "revoked" && videos.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm text-ink-muted">
              Como la familia retiró el consentimiento, estos videos ya están ocultos para ella.
              Podés dejarlos así o borrarlos definitivamente.
            </p>
            <DeleteAllVideosButton
              slug={session.school.slug}
              goalkeeperId={id}
              count={videos.length}
            />
          </div>
        )}
      </Card>

      <Card className="rise-in space-y-4" style={{ "--i": 1 } as CSSProperties}>
        <h2 className="font-display text-lg font-bold">Asistencia</h2>
        {attendance.length === 0 ? (
          <p className="text-ink-muted">Todavía no hay asistencia registrada.</p>
        ) : (
          <>
            <p className="text-ink-muted">
              {attendanceStats.percent === null ? (
                "Sin datos en los últimos 90 días."
              ) : (
                <>
                  <strong className="font-display text-2xl text-ink">
                    {attendanceStats.percent}%
                  </strong>{" "}
                  en los últimos 90 días ({attendanceStats.present} presentes de{" "}
                  {attendanceStats.counted}; no cuentan las justificadas, las sesiones suspendidas
                  ni lo que quedó sin marcar).
                </>
              )}
            </p>
            <AttendanceCalendar
              year={attendanceMonth.year}
              month={attendanceMonth.month}
              weeks={monthCalendar(
                attendanceMonth.year,
                attendanceMonth.month,
                toRecords(attendance),
              )}
              hrefForMonth={(value) => `${base}/${id}?mes=${value}`}
            />
            <ul className="divide-y divide-line">
              {attendance.slice(0, 8).map((row) => (
                <li
                  key={row.entryId}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                >
                  <span>
                    <span className="font-semibold">{formatCalendarDate(row.date)}</span>
                    <span className="text-ink-muted">
                      {" "}
                      · {row.groupName}
                      {row.isGuest ? " (invitado)" : ""}
                    </span>
                    {row.reason && (
                      <span className="block text-ink-muted">Motivo: {row.reason}</span>
                    )}
                  </span>
                  <Chip
                    tone={
                      row.sessionStatus === "suspended"
                        ? "neutral"
                        : row.status === "present"
                          ? "success"
                          : row.status === "absent"
                            ? "danger"
                            : row.status === "excused"
                              ? "warning"
                              : "neutral"
                    }
                  >
                    {row.sessionStatus === "suspended" ? "Suspendida" : ENTRY_LABELS[row.status]}
                  </Chip>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {isAdmin && (
        <Link
          href={`${base}/${id}/cuotas`}
          className="rise-in block rounded-card focus-visible:outline-offset-4"
          style={{ "--i": 2 } as CSSProperties}
        >
          <Card interactive className="space-y-1">
            <h2 className="font-display text-lg font-bold">Cuotas</h2>
            <p className="text-ink-muted">
              {detail.feeExempt
                ? "Exento de cuota."
                : "Estado de las cuotas, pagos, adelantos y exención."}
            </p>
          </Card>
        </Link>
      )}

      <Card className="rise-in space-y-4" style={{ "--i": 2 } as CSSProperties}>
        <h2 className="font-display text-lg font-bold">Medidas</h2>
        <MeasurementForm slug={session.school.slug} goalkeeperId={id} today={today} />
        {detail.measurements.length > 0 && (
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Historial de altura y peso</caption>
            <thead className="text-ink-muted">
              <tr>
                <th className="py-1 font-semibold">Fecha</th>
                <th className="py-1 font-semibold">Altura</th>
                <th className="py-1 font-semibold">Peso</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {detail.measurements.map((m) => (
                <tr key={m.id}>
                  <td className="py-2">{formatCalendarDate(m.date)}</td>
                  <td className="py-2">{m.heightCm ? `${m.heightCm} cm` : "—"}</td>
                  <td className="py-2">{m.weightKg ? `${m.weightKg} kg` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="rise-in space-y-2" style={{ "--i": 3 } as CSSProperties}>
        <h2 className="font-display text-lg font-bold">Tutores</h2>
        <ul className="divide-y divide-line">
          {detail.guardians.map((guardian) => (
            <GuardianCard
              key={guardian.id}
              slug={session.school.slug}
              schoolName={session.school.name}
              goalkeeperId={id}
              canManage={isAdmin}
              canRemove={detail.guardians.length > 1}
              guardian={{
                id: guardian.id,
                firstName: guardian.firstName,
                lastName: guardian.lastName,
                phone: guardian.phone,
                email: guardian.email,
                relationship: guardian.relationship,
                accessCode: guardian.accessCode,
                pinChanged: guardian.pinChanged,
                firstLoginCompleted: guardian.firstLoginCompleted,
                accessRevoked: guardian.accessRevoked,
                locked: guardian.locked,
              }}
            />
          ))}
        </ul>
      </Card>

      {isAdmin && (
        <>
          <Card className="rise-in space-y-4" style={{ "--i": 4 } as CSSProperties}>
            <h2 className="font-display text-lg font-bold">Agregar un tutor</h2>
            <AddGuardian
              slug={session.school.slug}
              schoolName={session.school.name}
              goalkeeperId={id}
              matches={matches}
              query={tutorQuery}
            />
          </Card>

          <Card className="rise-in space-y-4" style={{ "--i": 5 } as CSSProperties}>
            <h2 className="font-display text-lg font-bold">Grupos</h2>
            <GroupsForm
              slug={session.school.slug}
              goalkeeperId={id}
              options={groupOptions}
              selected={detail.groups.map((g) => g.id)}
            />
          </Card>

          <Card className="rise-in space-y-4" style={{ "--i": 6 } as CSSProperties}>
            <h2 className="font-display text-lg font-bold">Estado</h2>
            <StatusForm slug={session.school.slug} goalkeeperId={id} status={detail.status} />
          </Card>

          <Card className="rise-in" style={{ "--i": 7 } as CSSProperties}>
            <DeleteForm slug={session.school.slug} goalkeeperId={id} lastName={detail.lastName} />
          </Card>
        </>
      )}
    </>
  );
}
