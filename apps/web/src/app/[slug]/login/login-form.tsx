"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field, FormAlert, Input, describedBy } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { SubmitButton } from "@/components/ui/submit-button";
import { loginAction, type LoginState } from "./actions";

export function LoginForm({ slug }: { slug: string }) {
  const [state, formAction] = useActionState<LoginState, FormData>(
    loginAction.bind(null, slug),
    {},
  );
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
        Ingresar
      </SubmitButton>

      <Link
        href={`/${slug}/recuperar`}
        className="block py-3 text-center text-sm font-semibold text-ink-muted hover:text-ink"
      >
        ¿Olvidaste tu contraseña?
      </Link>
    </form>
  );
}
