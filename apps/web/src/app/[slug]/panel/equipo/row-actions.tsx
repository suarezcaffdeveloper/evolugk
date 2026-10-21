"use client";

import { useActionState } from "react";
import { CopyLink } from "@/components/copy-link";
import { FormAlert } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  resendInvitationAction,
  revokeInvitationAction,
  setMemberActiveAction,
  type MemberState,
  type ResendState,
} from "./actions";

/** Desactivar o reactivar a un miembro del equipo. */
export function MemberToggle({
  slug,
  userId,
  name,
  active,
}: {
  slug: string;
  userId: string;
  name: string;
  active: boolean;
}) {
  const [state, formAction] = useActionState<MemberState, FormData>(
    setMemberActiveAction.bind(null, slug, userId, !active),
    {},
  );
  return (
    <form action={formAction} className="space-y-2">
      <SubmitButton
        variant={active ? "secondary" : "primary"}
        size="sm"
        pendingText={active ? "Desactivando…" : "Reactivando…"}
        aria-label={`${active ? "Desactivar" : "Reactivar"} a ${name}`}
      >
        {active ? "Desactivar" : "Reactivar"}
      </SubmitButton>
      {state.error && <FormAlert>{state.error}</FormAlert>}
    </form>
  );
}

/** Reenviar o revocar una invitación pendiente. */
export function PendingInvitationActions({
  slug,
  invitationId,
  email,
}: {
  slug: string;
  invitationId: string;
  email: string;
}) {
  const [state, resend] = useActionState<ResendState, FormData>(
    resendInvitationAction.bind(null, slug, invitationId),
    {},
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <form action={resend}>
          <SubmitButton
            variant="secondary"
            size="sm"
            pendingText="Reenviando…"
            aria-label={`Reenviar la invitación a ${email}`}
          >
            Reenviar
          </SubmitButton>
        </form>
        <form action={revokeInvitationAction.bind(null, slug, invitationId)}>
          <SubmitButton
            variant="ghost"
            size="sm"
            pendingText="Revocando…"
            aria-label={`Revocar la invitación a ${email}`}
          >
            Revocar
          </SubmitButton>
        </form>
      </div>
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
