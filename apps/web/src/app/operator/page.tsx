import { Suspense, type CSSProperties } from "react";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireOperator } from "@/server/auth/guards";
import { operatorLogoutAction } from "./actions";

export default function OperatorHomePage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 pb-16 pt-4">
      <Suspense
        fallback={<div className="h-40 animate-pulse rounded-card bg-line" aria-busy="true" />}
      >
        <OperatorHome />
      </Suspense>
    </main>
  );
}

async function OperatorHome() {
  // Al panel solo se entra con la verificación en dos pasos completa.
  const session = await requireOperator("ready");

  return (
    <>
      <div className="rise-in space-y-1">
        <p className="text-sm font-semibold text-ink-muted">Operador de la plataforma</p>
        <h1 className="font-display text-3xl font-bold leading-tight">Hola, {session.firstName}</h1>
      </div>

      <Card className="rise-in space-y-2" style={{ "--i": 1 } as CSSProperties}>
        <h2 className="font-display text-lg font-bold">Escuelas</h2>
        <p className="text-ink-muted">
          Acá vas a crear escuelas, invitar a su primer administrador y suspenderlas o reactivarlas.
          Es el próximo paso del desarrollo.
        </p>
      </Card>

      <form action={operatorLogoutAction} className="rise-in" style={{ "--i": 2 } as CSSProperties}>
        <SubmitButton variant="secondary" pendingText="Saliendo…">
          Cerrar sesión
        </SubmitButton>
      </form>
    </>
  );
}
