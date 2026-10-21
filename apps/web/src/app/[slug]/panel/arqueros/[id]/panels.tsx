"use client";

import Link from "next/link";
import { useActionState, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { describedBy, Field, FormAlert, Input, inputClassName } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/cn";
import {
  RELATIONSHIPS,
  RELATIONSHIP_LABELS,
  STATUS_LABELS,
  STATUSES,
  type GoalkeeperStatus,
  type Relationship,
} from "@/lib/goalkeeper-schemas";
import {
  addGuardianAction,
  addMeasurementAction,
  deleteGoalkeeperAction,
  guardianAccessAction,
  linkGuardianAction,
  removeGuardianAction,
  setGroupsAction,
  setStatusAction,
  updateGuardianAction,
  type ActionState,
  type GuardianFormState,
} from "../actions";
import { CredentialsCard } from "../credentials-card";
import { Select } from "../goalkeeper-fields";

// ───────────────────────────── utilidades ─────────────────────────────

/** Botón que pide una segunda confirmación antes de ejecutar una acción difícil de deshacer. */
function ConfirmButton({
  label,
  confirmLabel,
  pendingText,
  action,
  variant = "secondary",
}: {
  label: string;
  confirmLabel: string;
  pendingText: string;
  action: (payload: FormData) => void;
  variant?: "primary" | "secondary";
}) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <Button type="button" size="sm" variant={variant} onClick={() => setAsking(true)}>
        {label}
      </Button>
    );
  }
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <SubmitButton size="sm" pendingText={pendingText}>
        {confirmLabel}
      </SubmitButton>
      <Button type="button" size="sm" variant="ghost" onClick={() => setAsking(false)}>
        Cancelar
      </Button>
    </form>
  );
}

// ───────────────────────────── estado ─────────────────────────────

export function StatusForm({
  slug,
  goalkeeperId,
  status,
}: {
  slug: string;
  goalkeeperId: string;
  status: GoalkeeperStatus;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    setStatusAction.bind(null, slug, goalkeeperId),
    {},
  );
  return (
    <form action={formAction} className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-40 flex-1">
          <label htmlFor="status" className="mb-1.5 block text-sm font-semibold">
            Estado
          </label>
          <Select id="status" name="status" defaultValue={status}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>
        <SubmitButton variant="secondary" pendingText="Guardando…">
          Cambiar
        </SubmitButton>
      </div>
      <p className="text-sm text-ink-muted">
        Un arquero inactivo o egresado no cuenta para el tope de la suscripción ni genera cuotas. Su
        familia conserva el acceso al historial.
      </p>
      {state.error && <FormAlert>{state.error}</FormAlert>}
      {state.ok && <Notice tone="success">Estado actualizado.</Notice>}
    </form>
  );
}

// ───────────────────────────── medidas ─────────────────────────────

export function MeasurementForm({
  slug,
  goalkeeperId,
  today,
}: {
  slug: string;
  goalkeeperId: string;
  today: string;
}) {
  const [state, formAction] = useActionState(
    addMeasurementAction.bind(null, slug, goalkeeperId),
    {},
  );
  const errors = state.errors ?? {};
  return (
    <form action={formAction} noValidate className="space-y-3">
      {state.error && <FormAlert>{state.error}</FormAlert>}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Fecha" htmlFor="m-date" error={errors.date}>
          <Input
            id="m-date"
            name="date"
            type="date"
            max={today}
            defaultValue={today}
            required
            {...describedBy("m-date", { error: errors.date })}
          />
        </Field>
        <Field label="Altura (cm)" htmlFor="heightCm" error={errors.heightCm}>
          <Input
            id="heightCm"
            name="heightCm"
            inputMode="decimal"
            autoComplete="off"
            {...describedBy("heightCm", { error: errors.heightCm })}
          />
        </Field>
        <Field label="Peso (kg)" htmlFor="weightKg" error={errors.weightKg}>
          <Input
            id="weightKg"
            name="weightKg"
            inputMode="decimal"
            autoComplete="off"
            {...describedBy("weightKg", { error: errors.weightKg })}
          />
        </Field>
      </div>
      <SubmitButton variant="secondary" pendingText="Guardando…">
        Registrar medida
      </SubmitButton>
      {state.ok && <Notice tone="success">Medida registrada.</Notice>}
    </form>
  );
}

// ───────────────────────────── grupos ─────────────────────────────

export function GroupsForm({
  slug,
  goalkeeperId,
  options,
  selected,
}: {
  slug: string;
  goalkeeperId: string;
  options: { id: string; name: string; archived: boolean }[];
  selected: string[];
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    setGroupsAction.bind(null, slug, goalkeeperId),
    {},
  );
  if (options.length === 0) {
    return <p className="text-ink-muted">Todavía no hay grupos creados.</p>;
  }
  return (
    <form action={formAction} className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {options.map((group) => (
          <label
            key={group.id}
            className="flex cursor-pointer items-center gap-2 rounded-control border border-line bg-surface px-3 py-2 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
          >
            <input
              type="checkbox"
              name="groupIds"
              value={group.id}
              defaultChecked={selected.includes(group.id)}
              className="accent-[var(--accent)]"
            />
            {group.name}
            {group.archived && <span className="text-ink-muted">(archivado)</span>}
          </label>
        ))}
      </div>
      <SubmitButton variant="secondary" pendingText="Guardando…">
        Guardar grupos
      </SubmitButton>
      {state.error && <FormAlert>{state.error}</FormAlert>}
      {state.ok && <Notice tone="success">Grupos actualizados.</Notice>}
    </form>
  );
}

// ───────────────────────────── tutores ─────────────────────────────

export type GuardianView = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  relationship: Relationship;
  accessCode: string;
  pinChanged: boolean;
  firstLoginCompleted: boolean;
  accessRevoked: boolean;
  locked: boolean;
};

function AccessButton({
  slug,
  goalkeeperId,
  guardianId,
  action,
  children,
  pendingText,
  onResult,
  confirm,
}: {
  slug: string;
  goalkeeperId: string;
  guardianId: string;
  action: "reset_pin" | "unlock" | "revoke";
  children: ReactNode;
  pendingText: string;
  onResult?: (pin: string) => void;
  confirm?: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(async (previous, _formData) => {
    const result = await guardianAccessAction(slug, goalkeeperId, guardianId, action, previous);
    if (result.pin && onResult) onResult(result.pin);
    return result;
  }, {});
  return (
    <div className="space-y-1">
      {confirm ? (
        <ConfirmButton
          label={String(children)}
          confirmLabel={confirm}
          pendingText={pendingText}
          action={formAction}
        />
      ) : (
        <form action={formAction}>
          <SubmitButton size="sm" variant="secondary" pendingText={pendingText}>
            {children}
          </SubmitButton>
        </form>
      )}
      {state.error && <FormAlert>{state.error}</FormAlert>}
    </div>
  );
}

export function GuardianCard({
  slug,
  schoolName,
  goalkeeperId,
  guardian,
  canManage,
  canRemove,
}: {
  slug: string;
  schoolName: string;
  goalkeeperId: string;
  guardian: GuardianView;
  canManage: boolean;
  canRemove: boolean;
}) {
  const [newPin, setNewPin] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [removeState, removeAction] = useActionState<ActionState, FormData>(
    async (previous) => removeGuardianAction(slug, goalkeeperId, guardian.id, previous),
    {},
  );
  const fullName = `${guardian.firstName} ${guardian.lastName}`;

  return (
    <li className="space-y-3 py-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">{fullName}</p>
          <p className="text-sm text-ink-muted">
            {RELATIONSHIP_LABELS[guardian.relationship]} · {guardian.phone}
            {guardian.email ? ` · ${guardian.email}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {guardian.accessRevoked ? (
            <Chip tone="danger">Acceso revocado</Chip>
          ) : guardian.locked ? (
            <Chip tone="warning">Bloqueado</Chip>
          ) : guardian.firstLoginCompleted ? (
            <Chip tone="success">Ya ingresó</Chip>
          ) : (
            <Chip tone="neutral">Todavía no ingresó</Chip>
          )}
        </div>
      </div>

      {canManage && (
        <>
          <p className="text-sm text-ink-muted">
            Código de acceso:{" "}
            <span className="font-mono font-semibold text-ink">
              {guardian.accessCode.slice(0, 4)}-{guardian.accessCode.slice(4)}
            </span>
          </p>
          <div className="flex flex-wrap items-start gap-2">
            <AccessButton
              slug={slug}
              goalkeeperId={goalkeeperId}
              guardianId={guardian.id}
              action="reset_pin"
              pendingText="Generando…"
              onResult={setNewPin}
            >
              Generar PIN nuevo
            </AccessButton>
            {guardian.locked && (
              <AccessButton
                slug={slug}
                goalkeeperId={goalkeeperId}
                guardianId={guardian.id}
                action="unlock"
                pendingText="Desbloqueando…"
              >
                Desbloquear
              </AccessButton>
            )}
            {!guardian.accessRevoked && (
              <AccessButton
                slug={slug}
                goalkeeperId={goalkeeperId}
                guardianId={guardian.id}
                action="revoke"
                pendingText="Revocando…"
                confirm="Sí, revocar acceso"
              >
                Revocar acceso
              </AccessButton>
            )}
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing((v) => !v)}>
              {editing ? "Cerrar edición" : "Editar datos"}
            </Button>
            <Link
              href={`/${slug}/panel/arqueros/nuevo?tutor=${guardian.id}`}
              className="inline-flex h-9 items-center rounded-control px-3 text-sm font-semibold hover:bg-accent-soft"
            >
              Dar de alta a otro hijo
            </Link>
            {canRemove && (
              <ConfirmButton
                label="Desvincular"
                confirmLabel="Sí, desvincular"
                pendingText="Quitando…"
                action={removeAction}
              />
            )}
          </div>
          {removeState.error && <FormAlert>{removeState.error}</FormAlert>}
          {newPin && (
            <CredentialsCard
              slug={slug}
              schoolName={schoolName}
              credential={{
                guardianId: guardian.id,
                name: fullName,
                accessCode: guardian.accessCode,
                pin: newPin,
              }}
              title={`Nuevo acceso de ${fullName}`}
            />
          )}
          {editing && (
            <GuardianEditForm
              slug={slug}
              goalkeeperId={goalkeeperId}
              guardian={guardian}
              onDone={() => setEditing(false)}
            />
          )}
        </>
      )}
    </li>
  );
}

function GuardianEditForm({
  slug,
  goalkeeperId,
  guardian,
  onDone,
}: {
  slug: string;
  goalkeeperId: string;
  guardian: GuardianView;
  onDone: () => void;
}) {
  const [state, formAction] = useActionState<GuardianFormState, FormData>(
    async (previous, formData) => {
      const result = await updateGuardianAction(
        slug,
        goalkeeperId,
        guardian.id,
        previous,
        formData,
      );
      if (result.ok) onDone();
      return result;
    },
    {},
  );
  const errors = state.errors ?? {};
  const id = (name: string) => `${name}-${guardian.id}`;
  return (
    <form action={formAction} noValidate className="space-y-3 rounded-control bg-canvas p-3">
      {state.error && <FormAlert>{state.error}</FormAlert>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre" htmlFor={id("firstName")} error={errors.firstName}>
          <Input id={id("firstName")} name="firstName" defaultValue={guardian.firstName} required />
        </Field>
        <Field label="Apellido" htmlFor={id("lastName")} error={errors.lastName}>
          <Input id={id("lastName")} name="lastName" defaultValue={guardian.lastName} required />
        </Field>
        <Field label="Teléfono" htmlFor={id("phone")} error={errors.phone}>
          <Input id={id("phone")} name="phone" type="tel" defaultValue={guardian.phone} required />
        </Field>
        <Field label="Mail (opcional)" htmlFor={id("email")} error={errors.email}>
          <Input
            id={id("email")}
            name="email"
            type="email"
            autoCapitalize="none"
            defaultValue={guardian.email ?? ""}
          />
        </Field>
      </div>
      <SubmitButton size="sm" pendingText="Guardando…">
        Guardar
      </SubmitButton>
    </form>
  );
}

export function AddGuardian({
  slug,
  schoolName,
  goalkeeperId,
  matches,
  query,
}: {
  slug: string;
  schoolName: string;
  goalkeeperId: string;
  matches: { id: string; name: string; phone: string }[];
  query: string;
}) {
  const [state, formAction] = useActionState<GuardianFormState, FormData>(
    addGuardianAction.bind(null, slug, goalkeeperId),
    {},
  );
  const errors = state.errors ?? {};

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h3 className="font-semibold">Vincular un tutor que ya existe</h3>
        <form method="get" className="flex gap-2">
          <label htmlFor="tq" className="sr-only">
            Buscar tutor por nombre o teléfono
          </label>
          <input
            id="tq"
            name="tq"
            type="search"
            defaultValue={query}
            placeholder="Nombre o teléfono"
            className={cn(inputClassName, "min-w-0 flex-1")}
          />
          <Button type="submit" variant="secondary">
            Buscar
          </Button>
        </form>
        {query && matches.length === 0 && (
          <p className="text-sm text-ink-muted">No encontramos tutores con ese dato.</p>
        )}
        <ul className="divide-y divide-line">
          {matches.map((match) => (
            <LinkGuardianRow
              key={match.id}
              slug={slug}
              goalkeeperId={goalkeeperId}
              guardian={match}
            />
          ))}
        </ul>
      </div>

      <div className="space-y-3">
        <h3 className="font-semibold">O cargar un tutor nuevo</h3>
        {state.error && <FormAlert>{state.error}</FormAlert>}
        <form
          key={state.credentials?.guardianId ?? "form"}
          action={formAction}
          noValidate
          className="space-y-3"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre" htmlFor="g-firstName" error={errors.firstName}>
              <Input id="g-firstName" name="firstName" required autoComplete="off" />
            </Field>
            <Field label="Apellido" htmlFor="g-lastName" error={errors.lastName}>
              <Input id="g-lastName" name="lastName" required autoComplete="off" />
            </Field>
            <Field label="Teléfono" htmlFor="g-phone" error={errors.phone}>
              <Input id="g-phone" name="phone" type="tel" inputMode="tel" required />
            </Field>
            <Field label="Mail (opcional)" htmlFor="g-email" error={errors.email}>
              <Input id="g-email" name="email" type="email" autoCapitalize="none" />
            </Field>
          </div>
          <Field label="Parentesco" htmlFor="g-relationship" error={errors.relationship}>
            <RelationshipSelect id="g-relationship" />
          </Field>
          <SubmitButton variant="secondary" pendingText="Agregando…">
            Agregar tutor
          </SubmitButton>
        </form>
        {state.credentials && (
          <CredentialsCard
            slug={slug}
            schoolName={schoolName}
            credential={state.credentials}
            title={`Acceso de ${state.credentials.name}`}
          />
        )}
      </div>
    </div>
  );
}

function RelationshipSelect({ id }: { id: string }) {
  return (
    <Select id={id} name="relationship" defaultValue="" required>
      <option value="" disabled>
        Elegí una opción
      </option>
      {RELATIONSHIPS.map((r) => (
        <option key={r} value={r}>
          {RELATIONSHIP_LABELS[r]}
        </option>
      ))}
    </Select>
  );
}

function LinkGuardianRow({
  slug,
  goalkeeperId,
  guardian,
}: {
  slug: string;
  goalkeeperId: string;
  guardian: { id: string; name: string; phone: string };
}) {
  const [state, formAction] = useActionState<GuardianFormState, FormData>(
    linkGuardianAction.bind(null, slug, goalkeeperId, guardian.id),
    {},
  );
  return (
    <li className="space-y-2 py-3">
      <form action={formAction} className="flex flex-wrap items-end gap-2">
        <div className="min-w-40 flex-1">
          <p className="font-semibold">{guardian.name}</p>
          <p className="text-sm text-ink-muted">{guardian.phone}</p>
        </div>
        <div className="w-40">
          <label htmlFor={`rel-${guardian.id}`} className="sr-only">
            Parentesco de {guardian.name}
          </label>
          <RelationshipSelect id={`rel-${guardian.id}`} />
        </div>
        <SubmitButton size="sm" variant="secondary" pendingText="Vinculando…">
          Vincular
        </SubmitButton>
      </form>
      {state.error && <FormAlert>{state.error}</FormAlert>}
    </li>
  );
}

// ───────────────────────────── eliminación ─────────────────────────────

export function DeleteForm({
  slug,
  goalkeeperId,
  lastName,
}: {
  slug: string;
  goalkeeperId: string;
  lastName: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    deleteGoalkeeperAction.bind(null, slug, goalkeeperId, lastName),
    {},
  );
  return (
    <details className="group space-y-3">
      <summary className="cursor-pointer text-sm font-semibold text-danger">
        Eliminar definitivamente…
      </summary>
      <form action={formAction} className="mt-3 space-y-3">
        <Notice tone="warning">
          Se borran la ficha, las medidas, las evaluaciones, las notas y todos los videos. Los
          tutores que no tengan otros hijos en la escuela también se eliminan. No se puede deshacer.
        </Notice>
        <Field label={`Para confirmar, escribí el apellido: ${lastName}`} htmlFor="confirm">
          <Input id="confirm" name="confirm" autoComplete="off" required />
        </Field>
        {state.error && <FormAlert>{state.error}</FormAlert>}
        <SubmitButton
          pendingText="Eliminando…"
          className="bg-danger text-white hover:brightness-110"
        >
          Eliminar para siempre
        </SubmitButton>
      </form>
    </details>
  );
}
