"use client";

import { useActionState } from "react";
import { CopyLink } from "@/components/copy-link";
import { FormAlert } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { resendAdminInvitationAction, type ResendState } from "../actions";

/** Reenvía la invitación de un administrador: se genera un link nuevo y el anterior deja de servir. */
export function ResendInvitation({ schoolId, email }: { schoolId: string; email: string }) {
  const [state, formAction] = useActionState<ResendState, FormData>(
    resendAdminInvitationAction.bind(null, schoolId, email),
    {},
  );

  return (
    <div className="space-y-3">
      <form action={formAction}>
        <SubmitButton variant="secondary" size="sm" pendingText="Reenviando…">
          Reenviar invitación
        </SubmitButton>
      </form>
      {state.error && <FormAlert>{state.error}</FormAlert>}
      {state.delivery && (
        <div className="space-y-2">
          <Notice tone={state.delivery.sent ? "success" : "warning"}>
            {state.delivery.message}
          </Notice>
          <CopyLink link={state.delivery.link} />
          <p className="text-sm text-ink-muted">El link anterior ya no sirve.</p>
        </div>
      )}
    </div>
  );
}
