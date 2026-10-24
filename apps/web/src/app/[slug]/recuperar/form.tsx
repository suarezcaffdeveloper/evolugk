"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field, Input, describedBy } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { requestResetAction, type RecoverState } from "./actions";

export function RecoverForm({ slug }: { slug: string }) {
  const [state, formAction] = useActionState<RecoverState, FormData>(
    requestResetAction.bind(null, slug),
    {},
  );
  const emailError = state.fieldErrors?.email;

  if (state.done) {
    return (
      <div className="space-y-4">
        <Notice tone="success">
          Si <strong>{state.email}</strong> corresponde a una cuenta de esta escuela, te mandamos un
          link para elegir una contraseña nueva. Puede tardar un par de minutos; mirá también la
          carpeta de spam.
        </Notice>
        <Link
          href={`/${slug}/login`}
          className="text-sm font-semibold underline underline-offset-2"
        >
          Volver al ingreso
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} noValidate className="space-y-4">
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
          autoFocus
          defaultValue={state.email}
          {...describedBy("email", { error: emailError })}
        />
      </Field>
      <SubmitButton size="lg" className="w-full" pendingText="Enviando…">
        Enviarme el link
      </SubmitButton>
      <Link
        href={`/${slug}/login`}
        className="block py-3 text-center text-sm font-semibold text-ink-muted hover:text-ink"
      >
        Volver al ingreso
      </Link>
    </form>
  );
}
