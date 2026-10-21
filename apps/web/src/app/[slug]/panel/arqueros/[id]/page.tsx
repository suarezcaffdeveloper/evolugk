import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type CSSProperties, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Notice } from "@/components/ui/notice";
import { argentinaDate, formatCalendarDate } from "@/lib/dates";
import {
  ageOn,
  FOOT_LABELS,
  LEVEL_LABELS,
  STATUS_LABELS,
  type Foot,
} from "@/lib/goalkeeper-schemas";
import { requireStaff } from "@/server/auth/guards";
import { getGoalkeeperDetail, listGroups, searchGuardians } from "@/server/goalkeepers";
import { createServiceClient } from "@/server/supabase";
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
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 pb-16 pt-4">
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

  const { tq } = await searchParams;
  const tutorQuery = (Array.isArray(tq) ? tq[0] : tq)?.trim() ?? "";
  const isAdmin = session.role === "school_admin";
  const today = argentinaDate(new Date());

  const [allGroups, found] = await Promise.all([
    isAdmin ? listGroups(db, session.school.id) : Promise.resolve([]),
    isAdmin && tutorQuery
      ? searchGuardians(db, session.school.id, tutorQuery)
      : Promise.resolve([]),
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

  return (
    <>
      <Link href={base} className="text-sm font-semibold text-ink-muted hover:text-ink">
        ← Arqueros
      </Link>

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
            <Link href={`${base}/${id}/editar`} className="text-sm font-semibold underline">
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
