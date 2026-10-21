"use client";

import { Field, FormAlert, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ReactNode } from "react";

/** Formulario de un código de 6 dígitos (la app de autenticación). Lo usan la inscripción y la verificación. */
export function CodeForm({
  action,
  error,
  submitLabel,
  children,
}: {
  action: (formData: FormData) => void;
  error?: string;
  submitLabel: string;
  /** Campos extra (por ejemplo, el identificador de la inscripción). */
  children?: ReactNode;
}) {
  return (
    <form action={action} noValidate className="space-y-4">
      {children}
      {error && <FormAlert>{error}</FormAlert>}
      <Field label="Código de 6 dígitos" htmlFor="code">
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]*"
          maxLength={7}
          required
          autoFocus
          placeholder="123 456"
          className="text-center font-display text-2xl tracking-[0.3em] tabular"
        />
      </Field>
      <SubmitButton size="lg" className="w-full" pendingText="Verificando…">
        {submitLabel}
      </SubmitButton>
    </form>
  );
}
