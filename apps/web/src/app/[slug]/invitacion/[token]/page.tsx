import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { formatLongDate, ROLE_LABELS } from "@/server/email/templates";
import { lookupInvitation } from "@/server/invitations";
import { createServiceClient } from "@/server/supabase";
import { normalizeSlug } from "@/lib/slug";
import { AcceptForm } from "./accept-form";

export const metadata: Metadata = {
  title: "Invitación · EvoluGK",
  // El link contiene un token: no debe indexarse ni enviarse como referencia a otros sitios.
  robots: { index: false },
  referrer: "no-referrer",
};

export default function InvitationPage({ params }: PageProps<"/[slug]/invitacion/[token]">) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 pb-16">
      <Suspense
        fallback={<div className="h-96 animate-pulse rounded-card bg-line" aria-busy="true" />}
      >
        <InvitationContent params={params} />
      </Suspense>
    </main>
  );
}

const PROBLEMS = {
  expired: {
    title: "Esta invitación venció",
    body: "Pedile a quien te invitó que te mande una nueva.",
  },
  revoked: {
    title: "Esta invitación ya no es válida",
    body: "Pedile a quien te invitó que te mande una nueva.",
  },
  used: {
    title: "Esta invitación ya fue usada",
    body: "Si ya creaste tu cuenta, ingresá con tu mail y tu contraseña.",
  },
} as const;

async function InvitationContent({
  params,
}: Pick<PageProps<"/[slug]/invitacion/[token]">, "params">) {
  const { slug, token } = await params;
  const lookup = await lookupInvitation(createServiceClient(), token);

  // Un token que no existe, de una escuela suspendida o de otra escuela se muestra como una página inexistente.
  if (
    lookup.status === "not_found" ||
    lookup.status === "school_unavailable" ||
    lookup.school.slug !== normalizeSlug(slug)
  ) {
    notFound();
  }

  if (lookup.status !== "valid") {
    const problem = PROBLEMS[lookup.status];
    return (
      <Card className="rise-in space-y-3 p-6">
        <h1 className="font-display text-2xl font-bold">{problem.title}</h1>
        <p className="text-ink-muted">{problem.body}</p>
        {lookup.status === "used" && (
          <Link
            href={`/${lookup.school.slug}/login`}
            className="inline-flex h-11 items-center justify-center rounded-control bg-accent px-4 font-semibold text-on-accent"
          >
            Ir al ingreso
          </Link>
        )}
      </Card>
    );
  }

  return (
    <Card className="rise-in space-y-5 p-6">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-bold">Te invitaron a {lookup.school.name}</h1>
        <p className="text-sm text-ink-muted">
          Vas a entrar con el rol de <strong>{ROLE_LABELS[lookup.invitation.role]}</strong> usando
          el mail <strong>{lookup.invitation.email}</strong>. La invitación vence el{" "}
          {formatLongDate(lookup.invitation.expiresAt)}.
        </p>
      </div>
      <AcceptForm token={token} />
    </Card>
  );
}
