import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { requireOperator } from "@/server/auth/guards";
import { SetupFlow } from "./setup-form";

export default function TwoFactorSetupPage() {
  return (
    <main
      id="contenido"
      className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 pb-16"
    >
      <Suspense
        fallback={<div className="h-96 animate-pulse rounded-card bg-line" aria-busy="true" />}
      >
        <SetupContent />
      </Suspense>
    </main>
  );
}

async function SetupContent() {
  await requireOperator("enroll");

  return (
    <Card className="rise-in space-y-5 p-6">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-bold">Activá la verificación en dos pasos</h1>
        <p className="text-sm text-ink-muted">
          La cuenta del operador tiene acceso a todas las escuelas, por eso es obligatoria.
        </p>
      </div>
      <SetupFlow />
    </Card>
  );
}
