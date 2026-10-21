"use client";

import { useActionState } from "react";
import { Field, FormAlert, Input, describedBy } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { updateContactAction, type FamilyActionState } from "../actions";

export function ContactForm({
  slug,
  phone,
  email,
}: {
  slug: string;
  phone: string;
  email: string | null;
}) {
  const [state, formAction] = useActionState<FamilyActionState, FormData>(
    updateContactAction.bind(null, slug),
    {},
  );
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} noValidate className="space-y-4">
      {state.error && <FormAlert>{state.error}</FormAlert>}
      {state.ok && <Notice tone="success">Listo, guardamos tus datos.</Notice>}

      <Field label="Teléfono" htmlFor="phone" error={errors.phone}>
        <Input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
          defaultValue={state.values?.phone ?? phone}
          {...describedBy("phone", { error: errors.phone })}
        />
      </Field>
      <Field
        label="Mail"
        htmlFor="email"
        hint="Opcional. Es donde te van a llegar los avisos de la escuela."
        error={errors.email}
      >
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          defaultValue={state.values?.email ?? email ?? ""}
          {...describedBy("email", { error: errors.email, hint: "x" })}
        />
      </Field>

      <SubmitButton pendingText="Guardando…">Guardar</SubmitButton>
    </form>
  );
}
