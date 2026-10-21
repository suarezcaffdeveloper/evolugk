"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { describedBy, Field, FormAlert, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { RELATIONSHIPS, RELATIONSHIP_LABELS } from "@/lib/goalkeeper-schemas";
import { createGoalkeeperAction, type CreateState } from "../actions";
import { CredentialsCard } from "../credentials-card";
import { GoalkeeperFields, Select } from "../goalkeeper-fields";

type Props = {
  slug: string;
  schoolName: string;
  groups: { id: string; name: string }[];
  /** Tutor existente (alta de un hermano): sus datos no se vuelven a cargar. */
  existingGuardian?: { id: string; name: string; phone: string } | null;
};

export function NewGoalkeeperForm(props: Props) {
  // "Dar de alta a otro" navega a la misma ruta, así que el componente no se
  // desmonta y el estado de la acción (arquero creado) sobreviviría. Cambiar la
  // key remonta el formulario con el estado y los campos en blanco.
  const [formKey, setFormKey] = useState(0);
  return (
    <NewGoalkeeperFormInner key={formKey} {...props} onReset={() => setFormKey((k) => k + 1)} />
  );
}

function NewGoalkeeperFormInner({
  slug,
  schoolName,
  groups,
  existingGuardian,
  onReset,
}: Props & { onReset: () => void }) {
  const [state, formAction] = useActionState<CreateState, FormData>(
    createGoalkeeperAction.bind(null, slug),
    {},
  );

  if (state.created) {
    const { created } = state;
    return (
      <div className="space-y-4">
        <Notice tone="success">{created.name} quedó dado de alta.</Notice>
        {created.credentials.length > 0 ? (
          created.credentials.map((credential) => (
            <CredentialsCard
              key={credential.guardianId}
              slug={slug}
              schoolName={schoolName}
              credential={credential}
              title={`Acceso de ${credential.name}`}
            />
          ))
        ) : (
          <Notice>
            El tutor ya tenía acceso: usa el mismo código y PIN que para su otro hijo.
          </Notice>
        )}
        <p className="text-sm text-ink-muted">
          Hasta que un tutor acepte el consentimiento en el portal, no se pueden subir fotos ni
          videos de {created.name}.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/${slug}/panel/arqueros/${created.goalkeeperId}`}
            className="inline-flex h-11 items-center rounded-control bg-accent px-4 font-semibold text-on-accent"
          >
            Ir a la ficha
          </Link>
          <Link
            href={`/${slug}/panel/arqueros/nuevo`}
            onClick={onReset}
            className="inline-flex h-11 items-center rounded-control border border-line bg-surface px-4 font-semibold hover:bg-accent-soft"
          >
            Dar de alta a otro
          </Link>
        </div>
      </div>
    );
  }

  const values = state.values ?? {};
  const errors = state.errors ?? {};
  const selectedGroups = new Set((values.groupIds ?? "").split(","));

  return (
    <form action={formAction} noValidate className="space-y-8">
      {state.error && <FormAlert>{state.error}</FormAlert>}

      {state.duplicates && (
        <div className="space-y-3 rounded-control border border-warning/40 bg-warning/10 p-4">
          <p className="font-semibold">Ya hay un arquero con ese nombre y fecha de nacimiento.</p>
          <ul className="list-inside list-disc text-sm">
            {state.duplicates.map((d) => (
              <li key={d.id}>
                <Link href={`/${slug}/panel/arqueros/${d.id}`} className="font-semibold underline">
                  {d.firstName} {d.lastName}
                </Link>
              </li>
            ))}
          </ul>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="confirmDuplicate"
              value="yes"
              className="mt-0.5 accent-[var(--accent)]"
            />
            <span>Es otra persona, crear de todos modos.</span>
          </label>
        </div>
      )}

      <GoalkeeperFields values={values} errors={errors} />

      {groups.length > 0 && (
        <fieldset className="space-y-3">
          <legend className="font-display text-lg font-bold">Grupos</legend>
          <div className="flex flex-wrap gap-2">
            {groups.map((group) => (
              <label
                key={group.id}
                className="flex cursor-pointer items-center gap-2 rounded-control border border-line bg-surface px-3 py-2 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
              >
                <input
                  type="checkbox"
                  name="groupIds"
                  value={group.id}
                  defaultChecked={selectedGroups.has(group.id)}
                  className="accent-[var(--accent)]"
                />
                {group.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset className="space-y-4">
        <legend className="font-display text-lg font-bold">Tutor con acceso al portal</legend>
        {existingGuardian ? (
          <>
            <input type="hidden" name="existingGuardianId" value={existingGuardian.id} />
            <Notice>
              Se vincula a <strong>{existingGuardian.name}</strong> ({existingGuardian.phone}), que
              ya tiene acceso: verá a los dos arqueros con el mismo código.
            </Notice>
          </>
        ) : (
          <>
            <p className="text-sm text-ink-muted">
              Se genera un código y un PIN inicial para que entre al portal. Si es su propio tutor
              (mayor de 18 años), cargá sus datos y elegí &ldquo;Él mismo&rdquo;.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nombre" htmlFor="guardianFirstName" error={errors.guardianFirstName}>
                <Input
                  id="guardianFirstName"
                  name="guardianFirstName"
                  autoComplete="off"
                  required
                  defaultValue={values.guardianFirstName}
                  {...describedBy("guardianFirstName", { error: errors.guardianFirstName })}
                />
              </Field>
              <Field label="Apellido" htmlFor="guardianLastName" error={errors.guardianLastName}>
                <Input
                  id="guardianLastName"
                  name="guardianLastName"
                  autoComplete="off"
                  required
                  defaultValue={values.guardianLastName}
                  {...describedBy("guardianLastName", { error: errors.guardianLastName })}
                />
              </Field>
              <Field label="Teléfono" htmlFor="guardianPhone" error={errors.guardianPhone}>
                <Input
                  id="guardianPhone"
                  name="guardianPhone"
                  type="tel"
                  inputMode="tel"
                  required
                  defaultValue={values.guardianPhone}
                  {...describedBy("guardianPhone", { error: errors.guardianPhone })}
                />
              </Field>
              <Field label="Mail (opcional)" htmlFor="guardianEmail" error={errors.guardianEmail}>
                <Input
                  id="guardianEmail"
                  name="guardianEmail"
                  type="email"
                  inputMode="email"
                  autoCapitalize="none"
                  defaultValue={values.guardianEmail}
                  {...describedBy("guardianEmail", { error: errors.guardianEmail })}
                />
              </Field>
            </div>
          </>
        )}
        <Field label="Parentesco con el arquero" htmlFor="relationship" error={errors.relationship}>
          <Select
            id="relationship"
            name="relationship"
            defaultValue={values.relationship ?? ""}
            required
            {...describedBy("relationship", { error: errors.relationship })}
          >
            <option value="" disabled>
              Elegí una opción
            </option>
            {RELATIONSHIPS.map((r) => (
              <option key={r} value={r}>
                {RELATIONSHIP_LABELS[r]}
              </option>
            ))}
          </Select>
        </Field>
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <SubmitButton pendingText="Guardando…" size="lg">
          Dar de alta
        </SubmitButton>
        <Link
          href={`/${slug}/panel/arqueros`}
          className="inline-flex h-12 items-center rounded-control px-4 font-semibold text-ink-muted hover:text-ink"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
