"use client";

import { useActionState } from "react";
import { Field, FormAlert, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { setVideoLimitAction, type VideoLimitState } from "../actions";

/** Cambiar el tope de minutos de video de la escuela. Se aplica de inmediato. */
export function VideoLimitForm({
  schoolId,
  slug,
  currentMinutes,
}: {
  schoolId: string;
  slug: string;
  currentMinutes: number;
}) {
  const [state, formAction] = useActionState<VideoLimitState, FormData>(
    setVideoLimitAction.bind(null, schoolId, slug),
    {},
  );
  return (
    <form action={formAction} noValidate className="space-y-3">
      <Field label="Tope de minutos de video" htmlFor="video-minutes">
        <Input
          id="video-minutes"
          name="minutes"
          inputMode="numeric"
          defaultValue={currentMinutes}
          autoComplete="off"
        />
      </Field>
      {state.error && <FormAlert>{state.error}</FormAlert>}
      <SubmitButton variant="secondary" pendingText="Guardando…">
        Cambiar tope
      </SubmitButton>
      {state.ok && (
        <Notice tone="success">
          Tope actualizado. Si la escuela estaba bloqueada, ya puede subir.
        </Notice>
      )}
    </form>
  );
}
