import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { listFamilyGoalkeepers } from "@/server/guardian/portal";
import { getLastGoalkeeperId, requireFamily } from "@/server/guardian/session";
import { createServiceClient } from "@/server/supabase";
import { PortalFrame } from "./portal-frame";

export const metadata: Metadata = {
  title: "Mi portal · EvoluGK",
  robots: { index: false },
};

export default function FamilyEntryPage({ params }: PageProps<"/[slug]/familia">) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto h-40 w-full max-w-2xl animate-pulse rounded-card bg-line" />
      }
    >
      <FamilyEntry params={params} />
    </Suspense>
  );
}

/** Lleva al último arquero elegido (o al primero). Si falta el asistente de primer ingreso, va a él. */
async function FamilyEntry({ params }: Pick<PageProps<"/[slug]/familia">, "params">) {
  const { slug } = await params;
  const session = await requireFamily(slug);
  const goalkeepers = await listFamilyGoalkeepers(createServiceClient(), session);

  if (goalkeepers.length > 0) {
    const last = await getLastGoalkeeperId();
    const target = goalkeepers.find((g) => g.id === last) ?? goalkeepers[0];
    redirect(`/${session.schoolSlug}/familia/${target.id}`);
  }

  return (
    <PortalFrame slug={session.schoolSlug} goalkeepers={[]} currentId={null}>
      <Card className="space-y-1">
        <h1 className="font-display text-xl font-bold">Todavía no hay arqueros vinculados</h1>
        <p className="text-ink-muted">
          Tu acceso no tiene ningún arquero asociado. Consultá a la escuela para que lo vincule.
        </p>
      </Card>
    </PortalFrame>
  );
}
