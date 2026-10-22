import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type CSSProperties } from "react";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Notice } from "@/components/ui/notice";
import { argentinaDate, formatCalendarDate } from "@/lib/dates";
import { requireOperator } from "@/server/auth/guards";
import { listPendingInvitations } from "@/server/invitations";
import { getSchoolDetail } from "@/server/schools";
import { createServiceClient } from "@/server/supabase";
import { getVideoQuota } from "@/server/videos";
import { listTeam } from "@/server/team";
import { getAccountStatement } from "@/server/subscriptions";
import { ResendInvitation } from "./resend-invitation";
import {
  AdjustCoveredForm,
  CloseTrialForm,
  ConditionsForm,
  PaymentForm,
  VoidPaymentButton,
} from "./subscription-forms";
import { VideoLimitForm } from "./video-limit-form";
import { deletionEligibleOn } from "@/server/school-deletion";
import { DeleteSchoolControl } from "./delete-school-control";
import { SuspendControl } from "./suspend-control";

export const metadata: Metadata = { title: "Escuela · EvoluGK", robots: { index: false } };

const ARS = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2,
});
const NUMBER = new Intl.NumberFormat("es-AR");

const STATE_LABELS = {
  trial: "En prueba",
  current: "Al día",
  overdue: "Vencida",
  suspended: "Suspendida",
} as const;
const STATE_TONES = {
  trial: "neutral",
  current: "success",
  overdue: "warning",
  suspended: "danger",
} as const;
const FIELD_LABELS: Record<string, string> = {
  monthly_price_ars: "Precio mensual",
  goalkeeper_limit: "Tope de arqueros",
  video_minutes_limit: "Tope de minutos de video",
  covered_until: "Cubierto hasta",
  trial_until: "Fin de la prueba",
};

export default function SchoolDetailPage({ params }: PageProps<"/operator/escuelas/[slug]">) {
  return (
    <main
      id="contenido"
      className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 pb-16 pt-4"
    >
      <Link
        href="/operator"
        className="inline-flex min-h-11 items-center text-sm font-semibold text-ink-muted hover:text-ink"
      >
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

  const today = argentinaDate(new Date());
  const [team, pending, videoQuota, statement] = await Promise.all([
    listTeam(admin, school.id),
    listPendingInvitations(admin, school.id),
    getVideoQuota(admin, school.id),
    getAccountStatement(admin, school.id, today),
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

      {sub && statement ? (
        <>
          <Card className="rise-in space-y-3" style={{ "--i": 1 } as CSSProperties}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-lg font-bold">Suscripción</h2>
              <Chip tone={STATE_TONES[statement.state]}>{STATE_LABELS[statement.state]}</Chip>
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Fact label="Precio mensual" value={ARS.format(statement.monthlyPriceArs)} />
              <Fact
                label={statement.trialUntil ? "Prueba hasta" : "Cubierto hasta"}
                value={formatCalendarDate(statement.coveredUntil)}
              />
              <Fact
                label="Arqueros activos"
                value={`${NUMBER.format(statement.goalkeepers.active)} de ${NUMBER.format(statement.goalkeepers.limit)}`}
              />
              <Fact
                label="Minutos de video"
                value={`${NUMBER.format(statement.video.usedMinutes)} de ${NUMBER.format(statement.video.limitMinutes)}`}
              />
            </dl>
            {statement.state === "trial" && statement.daysUntilCovered < 0 && (
              <Notice tone="warning">
                La prueba terminó hace {-statement.daysUntilCovered} días y sigue abierta. Cerrala
                pasando a pago o suspendiendo la escuela.
              </Notice>
            )}
            {statement.state === "overdue" && (
              <Notice tone="warning">
                {statement.graceEnded
                  ? "Pasaron los 10 días de gracia. La escuela sigue funcionando: la suspensión es una decisión tuya."
                  : "La suscripción está vencida, dentro de los 10 días de gracia. La escuela sigue funcionando."}
              </Notice>
            )}
            {statement.goalkeepers.level === "exceeded" && (
              <Notice tone="warning">
                La escuela superó su tope de arqueros: conviene renegociar las condiciones.
              </Notice>
            )}
          </Card>

          {statement.state === "trial" && (
            <Card className="rise-in space-y-3" style={{ "--i": 1 } as CSSProperties}>
              <h2 className="font-display text-lg font-bold">Cerrar la prueba</h2>
              <CloseTrialForm schoolId={school.id} slug={school.slug} today={today} />
            </Card>
          )}

          <Card className="rise-in space-y-3" style={{ "--i": 1 } as CSSProperties}>
            <h2 className="font-display text-lg font-bold">Condiciones</h2>
            <ConditionsForm
              schoolId={school.id}
              slug={school.slug}
              price={sub.monthlyPriceArs}
              goalkeeperLimit={sub.goalkeeperLimit}
              videoMinutesLimit={sub.videoMinutesLimit}
            />
          </Card>

          <Card className="rise-in space-y-3" style={{ "--i": 1 } as CSSProperties}>
            <h2 className="font-display text-lg font-bold">Registrar un pago</h2>
            {school.status === "suspended" && (
              <Notice tone="warning">
                La escuela está suspendida. Al registrar el pago sigue suspendida hasta que la
                reactives vos, desde “Estado de la escuela”.
              </Notice>
            )}
            <PaymentForm schoolId={school.id} slug={school.slug} today={today} />
            <details className="pt-2">
              <summary className="cursor-pointer py-2 text-sm font-semibold">
                Ajustar “cubierto hasta” a mano
              </summary>
              <div className="pt-3">
                <AdjustCoveredForm
                  schoolId={school.id}
                  slug={school.slug}
                  coveredUntil={statement.coveredUntil}
                />
              </div>
            </details>
          </Card>

          <Card className="rise-in space-y-3" style={{ "--i": 1 } as CSSProperties}>
            <h2 className="font-display text-lg font-bold">Estado de cuenta</h2>
            {statement.payments.length === 0 ? (
              <p className="text-ink-muted">Todavía no hay pagos registrados.</p>
            ) : (
              <ul className="divide-y divide-line">
                {statement.payments.map((payment) => (
                  <li
                    key={payment.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                  >
                    <div className={payment.voided ? "text-ink-muted line-through" : undefined}>
                      <p className="tabular font-semibold">{ARS.format(payment.amountArs)}</p>
                      <p className="text-sm text-ink-muted">
                        {formatCalendarDate(payment.paidOn)} · {payment.monthsCovered}{" "}
                        {payment.monthsCovered === 1 ? "mes" : "meses"}
                        {payment.note ? ` · ${payment.note}` : ""}
                      </p>
                    </div>
                    {payment.voided ? (
                      <Chip>Deshecho</Chip>
                    ) : (
                      <VoidPaymentButton
                        schoolId={school.id}
                        slug={school.slug}
                        paymentId={payment.id}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {statement.changes.length > 0 && (
            <Card className="rise-in space-y-3" style={{ "--i": 1 } as CSSProperties}>
              <h2 className="font-display text-lg font-bold">Historial de condiciones</h2>
              <ul className="divide-y divide-line text-sm">
                {statement.changes.map((change) => (
                  <li key={change.id} className="py-2">
                    <span className="font-semibold">
                      {FIELD_LABELS[change.field] ?? change.field}
                    </span>
                    : {change.oldValue ?? "—"} → {change.newValue ?? "—"}
                    <span className="block text-ink-muted">
                      {formatCalendarDate(argentinaDate(new Date(change.madeAt)))}
                      {change.note ? ` · ${change.note}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      ) : (
        <Card className="rise-in space-y-3" style={{ "--i": 1 } as CSSProperties}>
          <h2 className="font-display text-lg font-bold">Condiciones</h2>
          <p className="text-ink-muted">Esta escuela no tiene condiciones cargadas.</p>
        </Card>
      )}

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
        {school.status === "suspended" && school.suspendedAt && (
          <DeleteSchoolControl
            schoolId={school.id}
            schoolName={school.name}
            slug={school.slug}
            eligibleOn={formatCalendarDate(deletionEligibleOn(school.suspendedAt.toISOString()))}
            eligibleNow={
              deletionEligibleOn(school.suspendedAt.toISOString()) <= argentinaDate(new Date())
            }
          />
        )}
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
