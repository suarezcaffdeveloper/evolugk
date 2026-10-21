"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormAlert } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { updateGoalkeeperAction, type EditState } from "../../actions";
import { GoalkeeperFields } from "../../goalkeeper-fields";

export function EditForm({
  slug,
  goalkeeperId,
  initial,
}: {
  slug: string;
  goalkeeperId: string;
  initial: Record<string, string>;
}) {
  const [state, formAction] = useActionState<EditState, FormData>(
    updateGoalkeeperAction.bind(null, slug, goalkeeperId),
    {},
  );

  return (
    <form action={formAction} noValidate className="space-y-8">
      {state.error && <FormAlert>{state.error}</FormAlert>}
      <GoalkeeperFields values={state.values ?? initial} errors={state.errors} />
      <div className="flex flex-wrap gap-2">
        <SubmitButton pendingText="Guardando…" size="lg">
          Guardar cambios
        </SubmitButton>
        <Link
          href={`/${slug}/panel/arqueros/${goalkeeperId}`}
          className="inline-flex h-12 items-center rounded-control px-4 font-semibold text-ink-muted hover:text-ink"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
