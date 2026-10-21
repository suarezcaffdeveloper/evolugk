import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireStaff } from "@/server/auth/guards";
import { logoutAction } from "../login/actions";

export const metadata: Metadata = {
  title: "Panel · EvoluGK",
  robots: { index: false },
};

const ROLE_LABEL = { school_admin: "Administración", coach: "Profesor" } as const;

export default function PanelPage({ params }: PageProps<"/[slug]/panel">) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 pb-16 pt-4">
      <Suspense
        fallback={<div className="h-40 animate-pulse rounded-card bg-line" aria-busy="true" />}
      >
        <PanelContent params={params} />
      </Suspense>
    </main>
  );
}

async function PanelContent({ params }: Pick<PageProps<"/[slug]/panel">, "params">) {
  const { slug } = await params;
  const session = await requireStaff(slug);

  return (
    <>
      <div className="rise-in space-y-1">
        <p className="text-sm font-semibold text-ink-muted">{ROLE_LABEL[session.role]}</p>
        <h1 className="font-display text-3xl font-bold leading-tight">Hola, {session.firstName}</h1>
      </div>

      <Card className="rise-in space-y-2" style={{ "--i": 1 } as CSSProperties}>
        <h2 className="font-display text-lg font-bold">Estás dentro de {session.school.name}</h2>
        <p className="text-ink-muted">
          Desde acá vas a cargar arqueros, evaluaciones, videos y asistencia. Estas secciones llegan
          en las próximas versiones.
        </p>
      </Card>

      <form
        action={logoutAction.bind(null, session.school.slug)}
        className="rise-in"
        style={{ "--i": 2 } as CSSProperties}
      >
        <SubmitButton variant="secondary" pendingText="Saliendo…">
          Cerrar sesión
        </SubmitButton>
      </form>
    </>
  );
}
