"use client";

import { useActionState } from "react";
import { Field, FormAlert, Input, describedBy } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { SubmitButton } from "@/components/ui/submit-button";
import { operatorLoginAction, type LoginState } from "../actions";

export function OperatorLoginForm() {
  const [state, formAction] = useActionState<LoginState, FormData>(operatorLoginAction, {});
  const emailError = state.fieldErrors?.email;
  const passwordError = state.fieldErrors?.password;

  return (
    <form action={formAction} noValidate className="space-y-4">
      {state.error && <FormAlert>{state.error}</FormAlert>}

      <Field label="Mail" htmlFor="email" error={emailError}>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          defaultValue={state.email}
          {...describedBy("email", { error: emailError })}
        />
      </Field>

      <Field label="Contraseña" htmlFor="password" error={passwordError}>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          required
          {...describedBy("password", { error: passwordError })}
        />
      </Field>

      <SubmitButton size="lg" className="w-full" pendingText="Ingresando…">
        Continuar
      </SubmitButton>
    </form>
  );
}
