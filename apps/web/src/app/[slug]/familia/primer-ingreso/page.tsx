import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { CONSENT_PARAGRAPHS, CONSENT_TITLE } from "@/lib/consent-text";
import { listFamilyGoalkeepers } from "@/server/guardian/portal";
import { familyHome, requireFamily } from "@/server/guardian/session";
import { createServiceClient } from "@/server/supabase";
import { acceptConsentsAction, firstPinAction } from "../actions";
import { PinForm } from "../pin-form";

export const metadata: Metadata = {
  title: "Primer ingreso · EvoluGK",
  robots: { index: false },
};

export default function FirstLoginPage({ params }: PageProps<"/[slug]/familia/primer-ingreso">) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 pb-16 pt-2">
      <Suspense fallback={<div className="h-64 animate-pulse rounded-card bg-line" />}>
        <FirstLogin params={params} />
      </Suspense>
    </main>
  );
}

async function FirstLogin({ params }: Pick<PageProps<"/[slug]/familia/primer-ingreso">, "params">) {
  const { slug } = await params;
  const session = await requireFamily(slug, { allowIncompleteSetup: true });
  if (session.pinChanged && session.firstLoginCompleted) redirect(familyHome(session.schoolSlug));

  // Primero el PIN (obligatorio) y recién después el consentimiento (spec 04, RF-06).
  if (!session.pinChanged) {
    return (
      <Card className="rise-in space-y-5 p-6">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-ink-muted">Paso 1 de 2</p>
          <h1 className="font-display text-2xl font-bold">Elegí tu PIN</h1>
          <p className="text-ink-muted">
            Hola, {session.firstName}. El PIN que te dio la escuela es provisorio: cambialo por uno
            que solo vos conozcas.
          </p>
        </div>
        <PinForm
          action={firstPinAction.bind(null, session.schoolSlug)}
          currentLabel="PIN que te dio la escuela"
          submitLabel="Guardar y seguir"
        />
      </Card>
    );
  }

  const goalkeepers = await listFamilyGoalkeepers(createServiceClient(), session);
  const pending = goalkeepers.filter((g) => g.consent !== "valid");

  return (
    <Card className="rise-in space-y-5 p-6">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-ink-muted">Paso 2 de 2</p>
        <h1 className="font-display text-2xl font-bold">{CONSENT_TITLE}</h1>
      </div>

      <div className="space-y-3 text-ink">
        {CONSENT_PARAGRAPHS.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>

      <form action={acceptConsentsAction.bind(null, session.schoolSlug)} className="space-y-4">
        {pending.length > 0 ? (
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">Doy mi consentimiento para:</legend>
            {pending.map((g) => (
              <label
                key={g.id}
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control border border-line px-3 py-2 hover:bg-accent-soft"
              >
                <input
                  type="checkbox"
                  name="goalkeeperId"
                  value={g.id}
                  className="h-5 w-5 accent-[var(--accent)]"
                />
                <span className="font-semibold">
                  {g.firstName} {g.lastName}
                </span>
              </label>
            ))}
            <p className="text-sm text-ink-muted">
              Si no aceptás ahora, podés usar el portal pero no vas a ver videos ni fotos. Podés
              aceptar cuando quieras desde Privacidad.
            </p>
          </fieldset>
        ) : (
          <p className="text-sm text-ink-muted">
            El consentimiento de tus arqueros ya está dado. No hace falta nada más.
          </p>
        )}

        <SubmitButton size="lg" className="w-full" pendingText="Guardando…">
          Continuar
        </SubmitButton>
      </form>
    </Card>
  );
}
