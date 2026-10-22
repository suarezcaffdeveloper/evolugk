import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { requireOperator } from "@/server/auth/guards";
import { VerifyForm } from "./verify-form";

export default function TwoFactorPage() {
  return (
    <main
      id="contenido"
      className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 pb-16"
    >
      <Suspense
        fallback={<div className="h-72 animate-pulse rounded-card bg-line" aria-busy="true" />}
      >
        <TwoFactorContent />
      </Suspense>
    </main>
  );
}

async function TwoFactorContent() {
  await requireOperator("challenge");

  return (
    <Card className="rise-in space-y-5 p-6">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-bold">Verificación en dos pasos</h1>
        <p className="text-sm text-ink-muted">
          Abrí tu app de autenticación e ingresá el código de EvoluGK.
        </p>
      </div>
      <VerifyForm />
    </Card>
  );
}
