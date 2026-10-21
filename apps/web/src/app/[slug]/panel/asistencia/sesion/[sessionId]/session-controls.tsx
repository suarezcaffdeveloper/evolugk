"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { deleteSessionAction, suspendSessionAction, type ChangeState } from "../../actions";

/** Suspender una sesión pide un motivo corto (RF-12); reactivarla la vuelve a abrir (RN-02). */
export function SuspendControl({
  slug,
  sessionId,
  suspended,
}: {
  slug: string;
  sessionId: string;
  suspended: boolean;
}) {
  const [state, formAction] = useActionState<ChangeState, FormData>(
    suspendSessionAction.bind(null, slug, sessionId, !suspended),
    {},
  );
  return (
    <form action={formAction} noValidate className="space-y-3">
      {!suspended && (
        <Field label="Motivo" htmlFor="reason" hint="Por ejemplo: lluvia o feriado.">
          <Input id="reason" name="reason" maxLength={200} autoComplete="off" />
        </Field>
      )}
      {suspended && (
        <p className="text-sm text-ink-muted">
          Una sesión suspendida no cuenta para nadie. Al reactivarla vuelve a abrirse y conserva las
          marcas anteriores.
        </p>
      )}
      {state.error && <FormAlert>{state.error}</FormAlert>}
      <SubmitButton variant="secondary" pendingText="Guardando…">
        {suspended ? "Reactivar sesión" : "Suspender sesión"}
      </SubmitButton>
      {state.ok && <Notice tone="success">Listo, la sesión quedó actualizada.</Notice>}
    </form>
  );
}

/** Solo la administración borra una sesión (RF-15): es definitivo, así que pide confirmar. */
export function DeleteSessionControl({ slug, sessionId }: { slug: string; sessionId: string }) {
  const [asking, setAsking] = useState(false);
  const [state, formAction] = useActionState<ChangeState, FormData>(
    deleteSessionAction.bind(null, slug, sessionId),
    {},
  );
  if (!asking) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setAsking(true)}>
        Borrar sesión
      </Button>
    );
  }
  return (
    <form action={formAction} className="space-y-2">
      <p className="text-sm font-semibold">
        ¿Borrar esta sesión? Se pierden las marcas de todos los arqueros en esta fecha. No se puede
        deshacer.
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
