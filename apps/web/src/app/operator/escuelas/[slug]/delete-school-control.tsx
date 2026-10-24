"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, Input, describedBy } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { deleteSchoolAction, type DeleteSchoolState } from "../actions";

/**
 * Borrado definitivo de una escuela suspendida. Irreversible, así que exige haber cumplido los 90
 * días de suspensión y escribir el identificador de la escuela. Antes de esa fecha solo informa.
 */
export function DeleteSchoolControl({
  schoolId,
  schoolName,
  slug,
  eligibleOn,
  eligibleNow,
}: {
  schoolId: string;
  schoolName: string;
  slug: string;
  /** Primer día en que se puede borrar, ya formateado. */
  eligibleOn: string;
  eligibleNow: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction] = useActionState<DeleteSchoolState, FormData>(
    deleteSchoolAction.bind(null, schoolId),
    {},
  );

  if (!eligibleNow) {
    return (
      <Notice tone="info">
        Se conservan todos sus datos durante 90 días desde la suspensión. Se podrá borrar
        definitivamente desde el {eligibleOn}.
      </Notice>
    );
  }

  if (!confirming) {
    return (
      <Button variant="danger" onClick={() => setConfirming(true)}>
        Borrar definitivamente
      </Button>
    );
  }

  return (
    <form
      action={formAction}
      className="space-y-3 rounded-control border border-danger/50 bg-canvas p-4"
    >
      {state.error && <FormAlert>{state.error}</FormAlert>}
      <p className="font-semibold">¿Borrar definitivamente a {schoolName}?</p>
      <p className="text-sm text-ink-muted">
        Se borran para siempre sus arqueros, evaluaciones, asistencia, cuotas, videos (también en el
        proveedor) y las cuentas de su equipo. No se puede deshacer. Los pagos que hizo a la
        plataforma se conservan en el resumen de ingresos.
      </p>
      <Field label={`Para confirmar, escribí «${slug}»`} htmlFor="confirmSlug">
        <Input
          id="confirmSlug"
          name="confirmSlug"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          required
          {...describedBy("confirmSlug", {})}
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <SubmitButton variant="danger" pendingText="Borrando…">
          Sí, borrar para siempre
        </SubmitButton>
        <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
