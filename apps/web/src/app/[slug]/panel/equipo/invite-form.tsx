"use client";

import { useActionState } from "react";
import { CopyLink } from "@/components/copy-link";
import { Field, FormAlert, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { inviteAction, type InviteState } from "./actions";

export function InviteForm({ slug }: { slug: string }) {
  const [state, formAction] = useActionState<InviteState, FormData>(
    inviteAction.bind(null, slug),
    {},
  );

  return (
    <div className="space-y-4">
      <form
        // Después de una invitación enviada, el formulario se vacía para invitar a otra persona.
        key={state.delivery?.link ?? "form"}
        action={formAction}
        noValidate
        className="space-y-4"
      >
        {state.error && <FormAlert>{state.error}</FormAlert>}
        <Field label="Mail" htmlFor="email">
          <Input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            required
            defaultValue={state.email}
          />
        </Field>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">Rol</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              {
                value: "coach",
                label: "Profesor",
                help: "Carga evaluaciones, videos y asistencia.",
              },
              {
                value: "school_admin",
                label: "Administración",
                help: "Además gestiona el equipo y las cuotas.",
              },
            ].map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer gap-3 rounded-control border border-line bg-surface p-3 transition-colors has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
              >
                <input
                  type="radio"
                  name="role"
                  value={option.value}
                  defaultChecked={(state.role ?? "coach") === option.value}
                  className="mt-1 accent-[var(--accent)]"
                />
                <span>
                  <span className="block font-semibold">{option.label}</span>
                  <span className="block text-sm text-ink-muted">{option.help}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <SubmitButton pendingText="Enviando…">Enviar invitación</SubmitButton>
      </form>

      {state.delivery && (
        <div className="space-y-2">
          <Notice tone={state.delivery.sent ? "success" : "warning"}>
            {state.delivery.message}
          </Notice>
          <CopyLink link={state.delivery.link} />
          <p className="text-sm text-ink-muted">
            El link vence en 7 días y solo se puede usar una vez.
          </p>
        </div>
      )}
    </div>
  );
}
