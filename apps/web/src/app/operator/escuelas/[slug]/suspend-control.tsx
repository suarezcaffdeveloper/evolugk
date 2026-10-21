"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { setSuspendedAction, type SuspendState } from "../actions";

/**
 * Suspender o reactivar una escuela. Es una decisión manual y con consecuencias, así que pide una
 * confirmación explícita antes de hacerlo.
 */
export function SuspendControl({
  schoolId,
  schoolName,
  suspended,
}: {
  schoolId: string;
  schoolName: string;
  suspended: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction] = useActionState<SuspendState, FormData>(
    setSuspendedAction.bind(null, schoolId, !suspended),
    {},
  );

  if (state.done) {
    return (
      <Notice tone="success">
        {state.done === "suspended"
          ? `${schoolName} quedó suspendida: nadie de su equipo ni de sus familias puede ingresar.`
          : `${schoolName} se reactivó: su equipo y sus familias vuelven a poder ingresar.`}
      </Notice>
    );
  }

  if (!confirming) {
    return (
      <Button variant="secondary" onClick={() => setConfirming(true)}>
        {suspended ? "Reactivar escuela" : "Suspender escuela"}
      </Button>
    );
  }

  return (
    <form
      action={formAction}
      className="space-y-3 rounded-control border border-line bg-canvas p-4"
    >
      {state.error && <FormAlert>{state.error}</FormAlert>}
      <p className="font-semibold">
        {suspended ? `¿Reactivar a ${schoolName}?` : `¿Suspender a ${schoolName}?`}
      </p>
      <p className="text-sm text-ink-muted">
        {suspended
          ? "Su equipo y sus familias vuelven a poder ingresar, con todos sus datos."
          : "Nadie de su equipo ni de sus familias va a poder ingresar. Sus datos se conservan: podés reactivarla cuando quieras."}
      </p>
      <div className="flex flex-wrap gap-2">
        <SubmitButton pendingText={suspended ? "Reactivando…" : "Suspendiendo…"}>
          {suspended ? "Sí, reactivar" : "Sí, suspender"}
        </SubmitButton>
        <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
