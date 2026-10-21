"use client";

import { useActionState } from "react";
import { Field, FormAlert, describedBy } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { PasswordInput } from "@/components/ui/password-input";
import { SubmitButton } from "@/components/ui/submit-button";
import type { FamilyActionState } from "./actions";

const pinInput = {
  inputMode: "numeric",
  maxLength: 6,
  required: true,
  className: "font-mono tracking-widest",
} as const;

/** Cambio de PIN: pide el actual y el nuevo dos veces (spec 00, RF-16). */
export function PinForm({
  action,
  currentLabel,
  submitLabel,
  successMessage,
}: {
  action: (state: FamilyActionState, formData: FormData) => Promise<FamilyActionState>;
  currentLabel: string;
  submitLabel: string;
  successMessage?: string;
}) {
  const [state, formAction] = useActionState<FamilyActionState, FormData>(action, {});
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} noValidate className="space-y-4">
      {state.error && <FormAlert>{state.error}</FormAlert>}
      {state.ok && successMessage && <Notice tone="success">{successMessage}</Notice>}

      <Field label={currentLabel} htmlFor="currentPin" error={errors.currentPin}>
        <PasswordInput
          id="currentPin"
          name="currentPin"
          autoComplete="current-password"
          {...pinInput}
          {...describedBy("currentPin", { error: errors.currentPin })}
        />
      </Field>
      <Field
        label="PIN nuevo"
        htmlFor="newPin"
        hint="6 números. No puede ser 111111 ni una secuencia como 123456."
        error={errors.newPin}
      >
        <PasswordInput
          id="newPin"
          name="newPin"
          autoComplete="new-password"
          {...pinInput}
          {...describedBy("newPin", { error: errors.newPin, hint: "x" })}
        />
      </Field>
      <Field label="Repetí el PIN nuevo" htmlFor="confirmPin" error={errors.confirmPin}>
        <PasswordInput
          id="confirmPin"
          name="confirmPin"
          autoComplete="new-password"
          {...pinInput}
          {...describedBy("confirmPin", { error: errors.confirmPin })}
        />
      </Field>

      <SubmitButton size="lg" className="w-full sm:w-auto" pendingText="Guardando…">
        {submitLabel}
      </SubmitButton>
    </form>
  );
}
