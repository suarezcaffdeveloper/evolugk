import type { Metadata } from "next";
import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { formatAccessCode } from "@/lib/access-code";
import { changePinAction } from "../actions";
import { getGuardianProfile, listFamilyGoalkeepers } from "@/server/guardian/portal";
import { getLastGoalkeeperId, requireFamily } from "@/server/guardian/session";
import { createServiceClient } from "@/server/supabase";
import { PinForm } from "../pin-form";
import { PortalFrame } from "../portal-frame";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = {
  title: "Mis datos · EvoluGK",
  robots: { index: false },
};

export default function MyDataPage({ params }: PageProps<"/[slug]/familia/mis-datos">) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto h-64 w-full max-w-2xl animate-pulse rounded-card bg-line" />
      }
    >
      <MyData params={params} />
    </Suspense>
  );
}

async function MyData({ params }: Pick<PageProps<"/[slug]/familia/mis-datos">, "params">) {
  const { slug } = await params;
  const session = await requireFamily(slug);
  const db = createServiceClient();

  const [profile, goalkeepers, lastId] = await Promise.all([
    getGuardianProfile(db, session),
    listFamilyGoalkeepers(db, session),
    getLastGoalkeeperId(),
  ]);
  // Los links de la navegación apuntan al último arquero elegido, si todavía es suyo.
  const current = goalkeepers.find((g) => g.id === lastId) ?? goalkeepers[0] ?? null;

  return (
    <PortalFrame
      slug={session.schoolSlug}
      goalkeepers={goalkeepers}
      currentId={current?.id ?? null}
    >
      <h1 className="rise-in font-display text-3xl font-bold leading-tight">Mis datos</h1>

      <Card className="space-y-3">
        <h2 className="font-display text-lg font-bold">Tu acceso</h2>
        <dl className="space-y-3">
          <div className="grid gap-0.5 sm:grid-cols-[10rem_1fr] sm:gap-3">
            <dt className="text-sm font-semibold text-ink-muted">Nombre</dt>
            <dd>
              {session.firstName} {session.lastName}
            </dd>
          </div>
          {profile && (
            <div className="grid gap-0.5 sm:grid-cols-[10rem_1fr] sm:gap-3">
              <dt className="text-sm font-semibold text-ink-muted">Código de acceso</dt>
              <dd className="font-mono text-lg font-bold tracking-widest">
                {formatAccessCode(profile.accessCode)}
              </dd>
            </div>
          )}
        </dl>
        <p className="text-sm text-ink-muted">
          El nombre lo cambia la escuela. Por seguridad, el PIN no se muestra nunca.
        </p>
      </Card>

      {profile && (
        <Card className="space-y-4">
          <h2 className="font-display text-lg font-bold">Contacto</h2>
          <ContactForm slug={session.schoolSlug} phone={profile.phone} email={profile.email} />
        </Card>
      )}

      <Card className="space-y-4">
        <h2 className="font-display text-lg font-bold">Cambiar el PIN</h2>
        <PinForm
          action={changePinAction.bind(null, session.schoolSlug)}
          currentLabel="PIN actual"
          submitLabel="Cambiar el PIN"
          successMessage="Listo, cambiaste tu PIN. Cerramos tus otras sesiones abiertas."
        />
      </Card>
    </PortalFrame>
  );
}
