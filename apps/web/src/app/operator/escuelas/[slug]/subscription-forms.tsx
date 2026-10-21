"use client";

import { useActionState, type ReactNode } from "react";
import { Field, FormAlert, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  adjustCoveredAction,
  closeTrialAction,
  dismissAlertAction,
  registerPaymentAction,
  updateConditionsAction,
  voidPaymentAction,
  type SubscriptionState,
} from "../subscription-actions";

function Result({ state }: { state: SubscriptionState }) {
  return (
    <>
      {state.error && <FormAlert>{state.error}</FormAlert>}
      {state.ok && state.message && <Notice tone="success">{state.message}</Notice>}
    </>
  );
}

function Form({
  action,
  children,
  state,
}: {
  action: (payload: FormData) => void;
  children: ReactNode;
  state: SubscriptionState;
}) {
  return (
    <form action={action} noValidate className="space-y-3">
      {children}
      <Result state={state} />
    </form>
  );
}

/** Precio y topes (RF-01 a RF-03): cada cambio queda en el historial con su nota. */
export function ConditionsForm({
  schoolId,
  slug,
  price,
  goalkeeperLimit,
  videoMinutesLimit,
}: {
  schoolId: string;
  slug: string;
  price: number;
  goalkeeperLimit: number;
  videoMinutesLimit: number;
}) {
  const [state, action] = useActionState<SubscriptionState, FormData>(
    updateConditionsAction.bind(null, schoolId, slug),
    {},
  );
  return (
    <Form action={action} state={state}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Precio mensual (ARS)" htmlFor="cond-price">
          <Input id="cond-price" name="monthlyPriceArs" inputMode="decimal" defaultValue={price} />
        </Field>
        <Field label="Tope de arqueros" htmlFor="cond-gk">
          <Input
            id="cond-gk"
            name="goalkeeperLimit"
            inputMode="numeric"
            defaultValue={goalkeeperLimit}
          />
        </Field>
        <Field label="Tope de minutos de video" htmlFor="cond-video">
          <Input
            id="cond-video"
            name="videoMinutesLimit"
            inputMode="numeric"
            defaultValue={videoMinutesLimit}
          />
        </Field>
      </div>
      <Field label="Nota del cambio (opcional)" htmlFor="cond-note">
        <Input id="cond-note" name="note" maxLength={300} />
      </Field>
      <SubmitButton variant="secondary" pendingText="Guardando…">
        Guardar condiciones
      </SubmitButton>
    </Form>
  );
}

/** Registrar un pago de la escuela (RF-14): cada pago suma sus meses a “cubierto hasta”. */
export function PaymentForm({
  schoolId,
  slug,
  today,
}: {
  schoolId: string;
  slug: string;
  today: string;
}) {
  const [state, action] = useActionState<SubscriptionState, FormData>(
    registerPaymentAction.bind(null, schoolId, slug),
    {},
  );
  return (
    <Form action={action} state={state}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Fecha de pago" htmlFor="pay-date">
          <Input id="pay-date" name="paidOn" type="date" defaultValue={today} max={today} />
        </Field>
        <Field label="Monto cobrado (ARS)" htmlFor="pay-amount">
          <Input id="pay-amount" name="amountArs" inputMode="decimal" />
        </Field>
        <Field label="Meses cubiertos" htmlFor="pay-months">
          <Input id="pay-months" name="monthsCovered" inputMode="numeric" defaultValue="1" />
        </Field>
      </div>
      <Field label="Nota (opcional)" htmlFor="pay-note">
        <Input id="pay-note" name="note" maxLength={300} />
      </Field>
      <SubmitButton pendingText="Registrando…">Registrar pago</SubmitButton>
    </Form>
  );
}

export function VoidPaymentButton({
  schoolId,
  slug,
  paymentId,
}: {
  schoolId: string;
  slug: string;
  paymentId: string;
}) {
  const [state, action] = useActionState<SubscriptionState>(
    voidPaymentAction.bind(null, schoolId, slug, paymentId),
    {},
  );
  return (
    <form action={action}>
      <SubmitButton size="sm" variant="ghost" pendingText="Deshaciendo…">
        Deshacer
      </SubmitButton>
      {state.error && <FormAlert>{state.error}</FormAlert>}
    </form>
  );
}

/** Ajuste manual de “cubierto hasta”, con nota obligatoria (RF-17). */
export function AdjustCoveredForm({
  schoolId,
  slug,
  coveredUntil,
}: {
  schoolId: string;
  slug: string;
  coveredUntil: string;
}) {
  const [state, action] = useActionState<SubscriptionState, FormData>(
    adjustCoveredAction.bind(null, schoolId, slug),
    {},
  );
  return (
    <Form action={action} state={state}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Cubierto hasta" htmlFor="adj-date">
          <Input id="adj-date" name="coveredUntil" type="date" defaultValue={coveredUntil} />
        </Field>
        <Field label="Nota (obligatoria)" htmlFor="adj-note">
          <Input id="adj-note" name="note" maxLength={300} />
        </Field>
      </div>
      <SubmitButton variant="secondary" pendingText="Guardando…">
        Ajustar fecha
      </SubmitButton>
    </Form>
  );
}

/** Cerrar la prueba pasando a pago (RF-13): la fecha de inicio del cobro no es retroactiva. */
export function CloseTrialForm({
  schoolId,
  slug,
  today,
}: {
  schoolId: string;
  slug: string;
  today: string;
}) {
  const [state, action] = useActionState<SubscriptionState, FormData>(
    closeTrialAction.bind(null, schoolId, slug),
    {},
  );
  return (
    <Form action={action} state={state}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Inicio del cobro" htmlFor="trial-start">
          <Input id="trial-start" name="startOn" type="date" defaultValue={today} />
        </Field>
        <Field label="Monto del primer pago (ARS)" htmlFor="trial-amount">
          <Input id="trial-amount" name="amountArs" inputMode="decimal" />
        </Field>
        <Field label="Meses del primer pago" htmlFor="trial-months">
          <Input id="trial-months" name="monthsCovered" inputMode="numeric" defaultValue="1" />
        </Field>
      </div>
      <SubmitButton pendingText="Cerrando…">Cerrar la prueba y pasar a pago</SubmitButton>
      <p className="text-sm text-ink-muted">
        Para cerrar la prueba suspendiendo la escuela, usá “Estado de la escuela”.
      </p>
    </Form>
  );
}

export function DismissAlertButton({ alertId }: { alertId: string }) {
  const [state, action] = useActionState<SubscriptionState>(
    dismissAlertAction.bind(null, alertId),
    {},
  );
  return (
    <form action={action}>
      <SubmitButton size="sm" variant="ghost" pendingText="Descartando…">
        Descartar
      </SubmitButton>
      {state.error && <FormAlert>{state.error}</FormAlert>}
    </form>
  );
}
