"use client";

import { useActionState } from "react";
import { Field, FormAlert, Input, describedBy } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { SubmitButton } from "@/components/ui/submit-button";
import { acceptInvitationAction, type AcceptState } from "./actions";

export function AcceptForm({ token }: { token: string }) {
  const [state, formAction] = useActionState<AcceptState, FormData>(
    acceptInvitationAction.bind(null, token),
    {},
  );
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} noValidate className="space-y-4">
      {state.error && <FormAlert>{state.error}</FormAlert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" htmlFor="firstName" error={errors.firstName}>
          <Input
            id="firstName"
            name="firstName"
            autoComplete="given-name"
            required
            defaultValue={state.values?.firstName}
            {...describedBy("firstName", { error: errors.firstName })}
          />
        </Field>
        <Field label="Apellido" htmlFor="lastName" error={errors.lastName}>
          <Input
            id="lastName"
            name="lastName"
            autoComplete="family-name"
            required
            defaultValue={state.values?.lastName}
            {...describedBy("lastName", { error: errors.lastName })}
          />
        </Field>
      </div>

      <Field
        label="Contraseña"
        htmlFor="password"
        error={errors.password}
        hint="Al menos 8 caracteres."
      >
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          required
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

      <SubmitButton size="lg" className="w-full" pendingText="Creando tu cuenta…">
        Crear mi cuenta y entrar
      </SubmitButton>
    </form>
  );
}
