import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type CSSProperties } from "react";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { formatCalendarDate } from "@/lib/dates";
import { requireOperator } from "@/server/auth/guards";
import { listPendingInvitations } from "@/server/invitations";
import { getSchoolDetail } from "@/server/schools";
import { createServiceClient } from "@/server/supabase";
import { getVideoQuota } from "@/server/videos";
import { listTeam } from "@/server/team";
import { ResendInvitation } from "./resend-invitation";
import { VideoLimitForm } from "./video-limit-form";
import { SuspendControl } from "./suspend-control";

export const metadata: Metadata = { title: "Escuela · EvoluGK", robots: { index: false } };

const ARS = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2,
});
const NUMBER = new Intl.NumberFormat("es-AR");

export default function SchoolDetailPage({ params }: PageProps<"/operator/escuelas/[slug]">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 pb-16 pt-4">
      <Link href="/operator" className="text-sm font-semibold text-ink-muted hover:text-ink">
        ← Volver a las escuelas
      </Link>
      <Suspense
        fallback={<div className="h-64 animate-pulse rounded-card bg-line" aria-busy="true" />}
      >
        <SchoolDetail params={params} />
      </Suspense>
    </main>
  );
}

async function SchoolDetail({ params }: Pick<PageProps<"/operator/escuelas/[slug]">, "params">) {
  await requireOperator("ready");
  const { slug } = await params;

  const admin = createServiceClient();
  const school = await getSchoolDetail(admin, slug);
  if (!school) notFound();

  const [team, pending, videoQuota] = await Promise.all([
    listTeam(admin, school.id),
    listPendingInvitations(admin, school.id),
    getVideoQuota(admin, school.id),
  ]);
  const admins = team.filter((member) => member.role === "school_admin");
  const pendingAdmins = pending.filter((invitation) => invitation.role === "school_admin");
  const sub = school.subscription;

  return (
    <>
      <div className="rise-in flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-3xl font-bold leading-tight">{school.name}</h1>
          <p className="font-mono text-sm text-ink-muted">/{school.slug}</p>
        </div>
        <Chip tone={school.status === "active" ? "success" : "danger"}>
          {school.status === "active" ? "● Activa" : "● Suspendida"}
        </Chip>
      </div>

      <Card className="rise-in space-y-3" style={{ "--i": 1 } as CSSProperties}>
        <h2 className="font-display text-lg font-bold">Condiciones</h2>
        {sub ? (
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Fact label="Precio mensual" value={ARS.format(sub.monthlyPriceArs)} />
            <Fact label="Tope de arqueros" value={NUMBER.format(sub.goalkeeperLimit)} />
            <Fact label="Tope de minutos de video" value={NUMBER.format(sub.videoMinutesLimit)} />
            <Fact
              label={sub.trialUntil ? "Prueba hasta" : "Cubierto hasta"}
              value={formatCalendarDate(sub.trialUntil ?? sub.coveredUntil)}
            />
          </dl>
        ) : (
          <p className="text-ink-muted">Esta escuela no tiene condiciones cargadas.</p>
        )}
      </Card>

      <Card className="rise-in space-y-3" style={{ "--i": 1 } as CSSProperties}>
        <h2 className="font-display text-lg font-bold">Uso de video</h2>
        <p className="text-sm text-ink-muted">
          {NUMBER.format(videoQuota.usedMinutes)} de {NUMBER.format(videoQuota.limitMinutes)}{" "}
          minutos usados ({videoQuota.percent}%).
          {videoQuota.level === "warning" && " La escuela pasó el 80% de su tope."}
          {videoQuota.level === "blocked" &&
            " La escuela llegó al 100%: no puede subir más videos."}
        </p>
        <VideoLimitForm
          schoolId={school.id}
          slug={school.slug}
          currentMinutes={videoQuota.limitMinutes}
        />
      </Card>

      <Card className="rise-in space-y-4" style={{ "--i": 2 } as CSSProperties}>
        <h2 className="font-display text-lg font-bold">Administradores</h2>

        {admins.length === 0 && pendingAdmins.length === 0 && (
          <p className="text-ink-muted">No hay administradores ni invitaciones pendientes.</p>
        )}

        {admins.length > 0 && (
          <ul className="divide-y divide-line">
            {admins.map((member) => (
              <li
                key={member.userId}
                className="flex flex-wrap items-center justify-between gap-2 py-2.5"
              >
                <div>
                  <p className="font-semibold">
                    {member.firstName} {member.lastName}
                  </p>
                  <p className="text-sm text-ink-muted">{member.email}</p>
                </div>
                <Chip tone={member.active ? "success" : "neutral"}>
                  {member.active ? "Activo" : "Desactivado"}
                </Chip>
              </li>
            ))}
          </ul>
        )}

        {pendingAdmins.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm font-semibold">Invitaciones pendientes</p>
            <ul className="space-y-4">
              {pendingAdmins.map((invitation) => (
                <li key={invitation.email} className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold">{invitation.email}</p>
                      <p className="text-sm text-ink-muted">
                        {invitation.expired ? "Venció" : "Vence"} el{" "}
                        {new Intl.DateTimeFormat("es-AR", {
                          dateStyle: "long",
                          timeZone: "America/Argentina/Buenos_Aires",
                        }).format(invitation.expiresAt)}
                      </p>
                    </div>
                    <Chip tone={invitation.expired ? "warning" : "neutral"}>
                      {invitation.expired ? "Vencida" : "Pendiente"}
                    </Chip>
                  </div>
                  <ResendInvitation schoolId={school.id} email={invitation.email} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card className="rise-in space-y-3" style={{ "--i": 3 } as CSSProperties}>
        <h2 className="font-display text-lg font-bold">Estado de la escuela</h2>
        <SuspendControl
          schoolId={school.id}
          schoolName={school.name}
          suspended={school.status === "suspended"}
        />
      </Card>

      <Link
        href={`/${school.slug}`}
        className="text-sm font-semibold text-ink-muted underline underline-offset-2 hover:text-ink"
      >
        Abrir la página pública de la escuela →
      </Link>
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-ink-muted">{label}</dt>
      <dd className="tabular font-semibold">{value}</dd>
    </div>
  );
}
