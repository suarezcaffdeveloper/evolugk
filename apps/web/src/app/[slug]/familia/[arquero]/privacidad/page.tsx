import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { CONSENT_PARAGRAPHS, CONSENT_TITLE } from "@/lib/consent-text";
import { listFamilyGoalkeepers } from "@/server/guardian/portal";
import { requireFamily } from "@/server/guardian/session";
import { createServiceClient } from "@/server/supabase";
import { PortalFrame } from "../../portal-frame";
import { ConsentControls } from "./consent-controls";

export const metadata: Metadata = {
  title: "Privacidad · EvoluGK",
  robots: { index: false },
};

const CONSENT_CHIP = {
  valid: { tone: "success", label: "Vigente" },
  revoked: { tone: "danger", label: "Retirado" },
  pending: { tone: "warning", label: "Pendiente" },
} as const;

export default function PrivacyPage({ params }: PageProps<"/[slug]/familia/[arquero]/privacidad">) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto h-64 w-full max-w-2xl animate-pulse rounded-card bg-line" />
      }
    >
      <Privacy params={params} />
    </Suspense>
  );
}

async function Privacy({
  params,
}: Pick<PageProps<"/[slug]/familia/[arquero]/privacidad">, "params">) {
  const { slug, arquero } = await params;
  const session = await requireFamily(slug);

  const goalkeepers = await listFamilyGoalkeepers(createServiceClient(), session);
  const goalkeeper = goalkeepers.find((g) => g.id === arquero);
  if (!goalkeeper) notFound();
  const chip = CONSENT_CHIP[goalkeeper.consent];

  return (
    <PortalFrame slug={session.schoolSlug} goalkeepers={goalkeepers} currentId={goalkeeper.id}>
      <div className="rise-in space-y-1">
        <h1 className="font-display text-3xl font-bold leading-tight">Privacidad</h1>
        <p className="text-ink-muted">
          Qué hace la escuela con las fotos y los videos de {goalkeeper.firstName}.
        </p>
      </div>

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-bold">{CONSENT_TITLE}</h2>
          <Chip tone={chip.tone}>{chip.label}</Chip>
        </div>
        <div className="space-y-3">
          {CONSENT_PARAGRAPHS.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
        <ConsentControls
          slug={session.schoolSlug}
          goalkeeperId={goalkeeper.id}
          firstName={goalkeeper.firstName}
          status={goalkeeper.consent}
        />
      </Card>
    </PortalFrame>
  );
}
