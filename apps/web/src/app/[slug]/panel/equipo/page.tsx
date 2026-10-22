import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type CSSProperties } from "react";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { requireSchoolAdmin } from "@/server/auth/guards";
import { ROLE_LABELS, formatLongDate } from "@/server/email/templates";
import { listPendingInvitations } from "@/server/invitations";
import { createServiceClient } from "@/server/supabase";
import { listTeam } from "@/server/team";
import { InviteForm } from "./invite-form";
import { MemberToggle, PendingInvitationActions } from "./row-actions";

export const metadata: Metadata = { title: "Equipo · EvoluGK", robots: { index: false } };

export default function TeamPage({ params }: PageProps<"/[slug]/panel/equipo">) {
  return (
    <main
      id="contenido"
      className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 pb-16 pt-4"
    >
      <Suspense
        fallback={<div className="h-64 animate-pulse rounded-card bg-line" aria-busy="true" />}
      >
        <TeamContent params={params} />
      </Suspense>
    </main>
  );
}

async function TeamContent({ params }: Pick<PageProps<"/[slug]/panel/equipo">, "params">) {
  const { slug } = await params;
  // Solo la administración ve esta pantalla; un profesor vuelve al panel.
  const session = await requireSchoolAdmin(slug);

  const admin = createServiceClient();
  const [team, pending] = await Promise.all([
    listTeam(admin, session.school.id),
    listPendingInvitations(admin, session.school.id),
  ]);

  return (
    <>
      <Link
        href={`/${session.school.slug}/panel`}
        className="inline-flex min-h-11 items-center text-sm font-semibold text-ink-muted hover:text-ink"
      >
        ← Volver al panel
      </Link>
      <div className="rise-in space-y-1">
        <h1 className="font-display text-3xl font-bold leading-tight">Equipo</h1>
        <p className="text-ink-muted">Las personas que usan {session.school.name}.</p>
      </div>

      <Card className="rise-in space-y-4" style={{ "--i": 1 } as CSSProperties}>
        <h2 className="font-display text-lg font-bold">Integrantes</h2>
        <ul className="divide-y divide-line">
          {team.map((member) => {
            const fullName = `${member.firstName} ${member.lastName}`;
            const isSelf = member.userId === session.user.id;
            return (
              <li
                key={member.userId}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="font-semibold">
                    {fullName}
                    {isSelf && <span className="font-normal text-ink-muted"> (vos)</span>}
                  </p>
                  <p className="truncate text-sm text-ink-muted">{member.email}</p>
                  <div className="flex gap-2 pt-1">
                    <Chip>{ROLE_LABELS[member.role]}</Chip>
                    <Chip tone={member.active ? "success" : "neutral"}>
                      {member.active ? "Activo" : "Desactivado"}
                    </Chip>
                  </div>
                </div>
                {!isSelf && (
                  <MemberToggle
                    slug={session.school.slug}
                    userId={member.userId}
                    name={fullName}
                    active={member.active}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      {pending.length > 0 && (
        <Card className="rise-in space-y-4" style={{ "--i": 2 } as CSSProperties}>
          <h2 className="font-display text-lg font-bold">Invitaciones pendientes</h2>
          <ul className="divide-y divide-line">
            {pending.map((invitation) => (
              <li key={invitation.email} className="space-y-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{invitation.email}</p>
                    <p className="text-sm text-ink-muted">
                      {ROLE_LABELS[invitation.role]} · {invitation.expired ? "venció" : "vence"} el{" "}
                      {formatLongDate(invitation.expiresAt)}
                    </p>
                  </div>
                  <Chip tone={invitation.expired ? "warning" : "neutral"}>
                    {invitation.expired ? "Vencida" : "Pendiente"}
                  </Chip>
                </div>
                <PendingInvitationActions
                  slug={session.school.slug}
                  invitationId={invitation.id}
                  email={invitation.email}
                />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="rise-in space-y-4" style={{ "--i": 3 } as CSSProperties}>
        <h2 className="font-display text-lg font-bold">Invitar a una persona</h2>
        <InviteForm slug={session.school.slug} />
      </Card>
    </>
  );
}
