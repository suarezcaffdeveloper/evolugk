"use client";

import { useActionState } from "react";
import { Field, FormAlert, Input, describedBy } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { SubmitButton } from "@/components/ui/submit-button";
import { familyLoginAction, type FamilyLoginState } from "./actions";

export function FamilyLoginForm({ slug }: { slug: string }) {
  const [state, formAction] = useActionState<FamilyLoginState, FormData>(
    familyLoginAction.bind(null, slug),
    {},
  );

  return (
    <form action={formAction} noValidate className="space-y-4">
      {state.error && <FormAlert>{state.error}</FormAlert>}

      <Field
        label="Código de acceso"
        htmlFor="code"
        hint="Son 8 letras y números, por ejemplo K7QM-4TXD."
      >
        <Input
          id="code"
          name="code"
          autoComplete="username"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          required
          maxLength={12}
          defaultValue={state.code}
          className="font-mono uppercase tracking-widest"
          {...describedBy("code", { hint: "x" })}
        />
      </Field>

      <Field label="PIN" htmlFor="pin" hint="Son 6 números.">
        <PasswordInput
          id="pin"
          name="pin"
          inputMode="numeric"
          autoComplete="current-password"
          required
          maxLength={6}
          className="font-mono tracking-widest"
          {...describedBy("pin", { hint: "x" })}
        />
      </Field>

      <SubmitButton size="lg" className="w-full" pendingText="Ingresando…">
        Ingresar
      </SubmitButton>

      <p className="text-center text-sm text-ink-muted">
        ¿No tenés el código o el PIN, o no funcionan? Pedíselos a la escuela.
      </p>
    </form>
  );
}
