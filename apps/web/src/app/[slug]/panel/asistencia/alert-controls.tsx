"use client";

import { useActionState } from "react";
import { FormAlert } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { dismissAlertAction, type ChangeState } from "./actions";

/** El admin descarta un aviso de ausencias seguidas (RF-25). */
export function DismissAlertButton({ slug, alertId }: { slug: string; alertId: string }) {
  const [state, formAction] = useActionState<ChangeState, FormData>(
    dismissAlertAction.bind(null, slug, alertId),
    {},
  );
  return (
    <form action={formAction}>
      <SubmitButton size="sm" variant="ghost" pendingText="Descartando…">
        Descartar
      </SubmitButton>
      {state.error && <FormAlert>{state.error}</FormAlert>}
    </form>
  );
}
