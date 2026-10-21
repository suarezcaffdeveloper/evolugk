"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { describedBy, Field, FormAlert } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  addNoteAction,
  deleteEvaluationAction,
  publishAction,
  unpublishAction,
  type EvaluationActionState,
  type NoteFormState,
} from "./actions";

type Ids = { slug: string; goalkeeperId: string; evaluationId: string };

export function PublishButton({ slug, goalkeeperId, evaluationId }: Ids) {
  const [state, formAction] = useActionState<EvaluationActionState, FormData>(
    publishAction.bind(null, slug, goalkeeperId, evaluationId),
    {},
  );
  return (
    <form action={formAction} className="space-y-2">
      <SubmitButton pendingText="Publicando…">Publicar</SubmitButton>
      {state.error && <FormAlert>{state.error}</FormAlert>}
    </form>
  );
}

export function UnpublishButton({ slug, goalkeeperId, evaluationId }: Ids) {
  const [state, formAction] = useActionState<EvaluationActionState, FormData>(
    unpublishAction.bind(null, slug, goalkeeperId, evaluationId),
    {},
  );
  return (
    <form action={formAction} className="space-y-2">
      <SubmitButton variant="secondary" pendingText="Despublicando…">
        Despublicar
      </SubmitButton>
      <p className="text-sm text-ink-muted">
        Vuelve a borrador y la familia deja de verla. Si ya se mandó el mail, no se retira.
      </p>
      {state.error && <FormAlert>{state.error}</FormAlert>}
    </form>
  );
}

/** Borrar pide una segunda confirmación: es definitivo y solo lo hace la administración (RF-17). */
export function DeleteEvaluationButton({ slug, goalkeeperId, evaluationId }: Ids) {
  const [asking, setAsking] = useState(false);
  const [state, formAction] = useActionState<EvaluationActionState, FormData>(
    deleteEvaluationAction.bind(null, slug, goalkeeperId, evaluationId),
    {},
  );

  if (!asking) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setAsking(true)}>
        Borrar evaluación
      </Button>
    );
  }
  return (
    <form action={formAction} className="space-y-2">
      <p className="text-sm font-semibold">
        ¿Borrar esta evaluación? Se pierden sus puntajes y su historial de cambios.
      </p>
      <div className="flex flex-wrap gap-2">
        <SubmitButton size="sm" pendingText="Borrando…">
          Sí, borrar
        </SubmitButton>
        <Button type="button" size="sm" variant="ghost" onClick={() => setAsking(false)}>
          Cancelar
        </Button>
      </div>
      {state.error && <FormAlert>{state.error}</FormAlert>}
    </form>
  );
}

export function NoteForm({ slug, goalkeeperId }: { slug: string; goalkeeperId: string }) {
  const [state, formAction] = useActionState<NoteFormState, FormData>(
    addNoteAction.bind(null, slug, goalkeeperId),
    {},
  );
  const errors = state.errors ?? {};

  return (
    // key: tras guardar, el formulario se vacía para escribir otra nota.
    <form key={state.ok ? "saved" : "editing"} action={formAction} noValidate className="space-y-3">
      <Field label="Nueva nota" htmlFor="note-body" error={errors.body}>
        <textarea
          id="note-body"
          name="body"
          rows={3}
          maxLength={1000}
          required
          placeholder="Una observación corta sobre el arquero"
          className="w-full rounded-control border border-line bg-surface px-3 py-2 text-base focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
          {...describedBy("note-body", { error: errors.body })}
        />
      </Field>
      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" name="visibleToFamily" className="h-5 w-5 accent-[var(--accent)]" />
        <span>
          <span className="font-semibold">Visible para la familia.</span>{" "}
          <span className="text-ink-muted">Si no, queda como nota interna.</span>
        </span>
      </label>
      {state.error && <FormAlert>{state.error}</FormAlert>}
      <SubmitButton variant="secondary" pendingText="Guardando…">
        Guardar nota
      </SubmitButton>
      {state.ok && <Notice tone="success">Nota guardada.</Notice>}
    </form>
  );
}
