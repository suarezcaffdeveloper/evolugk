import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { getOperatorSession, operatorHome } from "@/server/auth/guards";
import { OperatorLoginForm } from "./operator-login-form";

export default function OperatorLoginPage() {
  return (
    <main
      id="contenido"
      className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 pb-16"
    >
      <Suspense
        fallback={<div className="h-72 animate-pulse rounded-card bg-line" aria-busy="true" />}
      >
        <LoginContent />
      </Suspense>
    </main>
  );
}

async function LoginContent() {
  const session = await getOperatorSession();
  if (session) redirect(operatorHome(session.mfa));

  return (
    <Card className="rise-in space-y-5 p-6">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-bold">Ingreso del operador</h1>
        <p className="text-sm text-ink-muted">Después te pedimos el código de verificación.</p>
      </div>
      <OperatorLoginForm />
    </Card>
  );
}
