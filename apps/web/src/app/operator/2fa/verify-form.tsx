"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { CodeForm } from "../code-field";
import { operatorLogoutAction, verifyCodeAction, type CodeState } from "../actions";

export function VerifyForm() {
  const [state, formAction] = useActionState<CodeState, FormData>(verifyCodeAction, {});
  return (
    <div className="space-y-3">
      <CodeForm action={formAction} error={state.error} submitLabel="Verificar" />
      <form action={operatorLogoutAction}>
        <SubmitButton variant="ghost" size="sm" className="w-full" pendingText="Saliendo…">
          Cancelar y salir
        </SubmitButton>
      </form>
    </div>
  );
}
