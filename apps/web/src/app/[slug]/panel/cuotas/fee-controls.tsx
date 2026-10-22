"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  advanceAction,
  changeStartAction,
  exemptAction,
  markPaidAction,
  undoPaymentAction,
  voidFeeAction,
  type FeeState,
} from "./actions";

/** "Marcar pagada" de un toque, con la fecha de hoy (spec 06, RF-33). */
export function QuickPayButton({
  slug,
  feeId,
  goalkeeperId,
}: {
  slug: string;
  feeId: string;
  goalkeeperId: string;
}) {
  const [state, formAction] = useActionState<FeeState, FormData>(
    markPaidAction.bind(null, slug, feeId, goalkeeperId),
    {},
  );
  return (
    <form action={formAction}>
      <SubmitButton size="sm" pendingText="Guardando…">
        Marcar pagada
      </SubmitButton>
      {state.error && <FormAlert>{state.error}</FormAlert>}
    </form>
  );
}

/** Pago con la fecha real elegida (RF-13), más anular con una nota (RF-17). */
export function FeeRowActions({
  slug,
  feeId,
  goalkeeperId,
  today,
  minDate,
}: {
  slug: string;
  feeId: string;
  goalkeeperId: string;
  today: string;
  minDate: string;
}) {
  const [pay, payAction] = useActionState<FeeState, FormData>(
    markPaidAction.bind(null, slug, feeId, goalkeeperId),
    {},
  );
  const [voidState, voidAction] = useActionState<FeeState, FormData>(
    voidFeeAction.bind(null, slug, feeId, goalkeeperId),
    {},
  );
  const [voiding, setVoiding] = useState(false);
  return (
    <div className="space-y-2">
      <form action={payAction} className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor={`paid-${feeId}`} className="mb-1 block text-xs font-semibold">
            Fecha de pago
          </label>
          <Input
            id={`paid-${feeId}`}
            name="paidOn"
            type="date"
            defaultValue={today}
            min={minDate}
            max={today}
            className="h-9"
          />
        </div>
        <SubmitButton size="sm" pendingText="Guardando…">
          Marcar pagada
        </SubmitButton>
        <Button type="button" size="sm" variant="ghost" onClick={() => setVoiding((v) => !v)}>
          Anular
        </Button>
      </form>
      {pay.error && <FormAlert>{pay.error}</FormAlert>}
      {voiding && (
        <form action={voidAction} className="flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1">
            <label htmlFor={`void-${feeId}`} className="mb-1 block text-xs font-semibold">
              Nota interna (opcional)
            </label>
            <Input id={`void-${feeId}`} name="note" maxLength={300} className="h-9" />
          </div>
          <SubmitButton size="sm" variant="secondary" pendingText="Anulando…">
            Confirmar anulación
          </SubmitButton>
        </form>
      )}
      {voidState.error && <FormAlert>{voidState.error}</FormAlert>}
    </div>
  );
}

export function UndoPaymentButton({
  slug,
  feeId,
  goalkeeperId,
}: {
  slug: string;
  feeId: string;
  goalkeeperId: string;
}) {
  const [state, formAction] = useActionState<FeeState>(
    undoPaymentAction.bind(null, slug, feeId, goalkeeperId),
    {},
  );
  return (
    <form action={formAction}>
      <SubmitButton size="sm" variant="ghost" pendingText="Deshaciendo…">
        Deshacer pago
      </SubmitButton>
      {state.error && <FormAlert>{state.error}</FormAlert>}
    </form>
  );
}

export function AdvanceForm({ slug, goalkeeperId }: { slug: string; goalkeeperId: string }) {
  const [state, formAction] = useActionState<FeeState, FormData>(
    advanceAction.bind(null, slug, goalkeeperId),
    {},
  );
  return (
    <form action={formAction} className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Pagó por adelantado (meses)" htmlFor="advance-months">
          <Input
            id="advance-months"
            name="months"
            type="number"
            min={1}
            max={12}
            defaultValue={3}
            inputMode="numeric"
            className="w-28"
          />
        </Field>
        <SubmitButton variant="secondary" pendingText="Guardando…">
          Registrar adelanto
        </SubmitButton>
      </div>
      {state.error && <FormAlert>{state.error}</FormAlert>}
      {state.ok && <Notice tone="success">Cuotas marcadas como pagadas.</Notice>}
    </form>
  );
}

export function ExemptForm({
  slug,
  goalkeeperId,
  exempt,
  note,
}: {
  slug: string;
  goalkeeperId: string;
  exempt: boolean;
  note: string | null;
}) {
  const [state, formAction] = useActionState<FeeState, FormData>(
    exemptAction.bind(null, slug, goalkeeperId, !exempt),
    {},
  );
  return (
    <form action={formAction} className="space-y-2">
      {exempt ? (
        <p className="text-sm text-ink-muted">
          Exento{note ? `: ${note}` : ""}. No genera cuotas ni avisos. Al quitar la exención el
          ciclo empieza hoy y se asume pagado el primer mes.
        </p>
      ) : (
        <Field label="Nota interna (becas, acuerdos, hijos del personal)" htmlFor="exempt-note">
          <Input id="exempt-note" name="note" maxLength={300} />
        </Field>
      )}
      <SubmitButton variant="secondary" pendingText="Guardando…">
        {exempt ? "Quitar la exención" : "Marcar como exento"}
      </SubmitButton>
      {state.error && <FormAlert>{state.error}</FormAlert>}
    </form>
  );
}

export function StartForm({
  slug,
  goalkeeperId,
  start,
}: {
  slug: string;
  goalkeeperId: string;
  start: string | null;
}) {
  const [state, formAction] = useActionState<FeeState, FormData>(
    changeStartAction.bind(null, slug, goalkeeperId),
    {},
  );
  return (
    <form action={formAction} className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Inicio de cuotas" htmlFor="fees-start">
          <Input id="fees-start" name="start" type="date" defaultValue={start ?? ""} required />
        </Field>
        <SubmitButton variant="secondary" pendingText="Guardando…">
          Cambiar inicio
        </SubmitButton>
      </div>
      <p className="text-sm text-ink-muted">
        Las cuotas pendientes se reprograman con las nuevas fechas; las pagadas no cambian.
      </p>
      {state.error && <FormAlert>{state.error}</FormAlert>}
      {state.ok && <Notice tone="success">Inicio de cuotas actualizado.</Notice>}
    </form>
  );
}
