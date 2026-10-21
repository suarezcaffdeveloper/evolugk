"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field, FormAlert, describedBy } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { SubmitButton } from "@/components/ui/submit-button";
import { resetPasswordAction, type ResetState } from "./actions";

export function ResetForm({ slug, tokenHash }: { slug: string; tokenHash: string }) {
  const [state, formAction] = useActionState<ResetState, FormData>(
    resetPasswordAction.bind(null, slug, tokenHash),
    {},
  );
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} noValidate className="space-y-4">
      {state.error && <FormAlert>{state.error}</FormAlert>}
      {state.invalidLink && (
        <Link
          href={`/${slug}/recuperar`}
          className="inline-block text-sm font-semibold underline underline-offset-2"
        >
          Pedir un link nuevo
        </Link>
      )}

      <Field
        label="Contraseña nueva"
        htmlFor="password"
        error={errors.password}
        hint="Al menos 8 caracteres."
      >
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          required
          autoFocus
          {...describedBy("password", { error: errors.password, hint: "x" })}
        />
      </Field>
      <Field
        label="Repetí la contraseña"
        htmlFor="passwordConfirmation"
        error={errors.passwordConfirmation}
      >
        <PasswordInput
          id="passwordConfirmation"
          name="passwordConfirmation"
          autoComplete="new-password"
          required
          {...describedBy("passwordConfirmation", { error: errors.passwordConfirmation })}
        />
      </Field>
      <SubmitButton size="lg" className="w-full" pendingText="Guardando…">
        Guardar la contraseña nueva
      </SubmitButton>
    </form>
  );
}
