import type { ReactNode } from "react";
import { describedBy, Field, Input, inputClassName } from "@/components/ui/field";
import { FOOT_LABELS, FEET, LEVEL_LABELS, LEVELS } from "@/lib/goalkeeper-schemas";
import { cn } from "@/lib/cn";
import type { FieldErrors } from "@/lib/auth-schemas";

export function Select({
  id,
  name,
  defaultValue,
  children,
  ...props
}: {
  id: string;
  name: string;
  defaultValue?: string;
  children: ReactNode;
} & Record<string, unknown>) {
  return (
    <select
      id={id}
      name={name}
      defaultValue={defaultValue ?? ""}
      className={cn(inputClassName, "appearance-auto")}
      {...props}
    >
      {children}
    </select>
  );
}

/** Campos de la ficha, compartidos por el alta y la edición. */
export function GoalkeeperFields({
  values = {},
  errors = {},
}: {
  values?: Record<string, string>;
  errors?: FieldErrors;
}) {
  const v = (key: string) => values[key] ?? "";
  return (
    <div className="space-y-6">
      <fieldset className="space-y-4">
        <legend className="font-display text-lg font-bold">Datos del arquero</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre" htmlFor="firstName" error={errors.firstName}>
            <Input
              id="firstName"
              name="firstName"
              autoComplete="off"
              required
              defaultValue={v("firstName")}
              {...describedBy("firstName", { error: errors.firstName })}
            />
          </Field>
          <Field label="Apellido" htmlFor="lastName" error={errors.lastName}>
            <Input
              id="lastName"
              name="lastName"
              autoComplete="off"
              required
              defaultValue={v("lastName")}
              {...describedBy("lastName", { error: errors.lastName })}
            />
          </Field>
          <Field label="Fecha de nacimiento" htmlFor="birthDate" error={errors.birthDate}>
            <Input
              id="birthDate"
              name="birthDate"
              type="date"
              required
              defaultValue={v("birthDate")}
              {...describedBy("birthDate", { error: errors.birthDate })}
            />
          </Field>
          <Field
            label="Fecha de ingreso"
            htmlFor="joinedOn"
            error={errors.joinedOn}
            hint="Es el punto de partida para comparar su progreso."
          >
            <Input
              id="joinedOn"
              name="joinedOn"
              type="date"
              required
              defaultValue={v("joinedOn")}
              {...describedBy("joinedOn", {
                error: errors.joinedOn,
                hint: "Es el punto de partida para comparar su progreso.",
              })}
            />
          </Field>
          <Field label="Pie hábil" htmlFor="preferredFoot" error={errors.preferredFoot}>
            <Select id="preferredFoot" name="preferredFoot" defaultValue={v("preferredFoot")}>
              <option value="">Sin indicar</option>
              {FEET.map((foot) => (
                <option key={foot} value={foot}>
                  {FOOT_LABELS[foot]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Nivel" htmlFor="level" error={errors.level}>
            <Select id="level" name="level" defaultValue={v("level")}>
              <option value="">Sin indicar</option>
              {LEVELS.map((level) => (
                <option key={level} value={level}>
                  {LEVEL_LABELS[level]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Club actual" htmlFor="currentClub" error={errors.currentClub}>
            <Input id="currentClub" name="currentClub" defaultValue={v("currentClub")} />
          </Field>
          <Field label="Categoría" htmlFor="category" error={errors.category}>
            <Input id="category" name="category" defaultValue={v("category")} />
          </Field>
        </div>
        <Field label="Objetivo" htmlFor="goal" error={errors.goal}>
          <textarea
            id="goal"
            name="goal"
            rows={3}
            defaultValue={v("goal")}
            className={cn(inputClassName, "h-auto py-2")}
          />
        </Field>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="font-display text-lg font-bold">Contacto de emergencia</legend>
        <p className="text-sm text-ink-muted">
          Solo lo ve el equipo de la escuela, nunca la familia.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Nombre" htmlFor="emergencyName" error={errors.emergencyName}>
            <Input id="emergencyName" name="emergencyName" defaultValue={v("emergencyName")} />
          </Field>
          <Field label="Teléfono" htmlFor="emergencyPhone" error={errors.emergencyPhone}>
            <Input
              id="emergencyPhone"
              name="emergencyPhone"
              type="tel"
              inputMode="tel"
              defaultValue={v("emergencyPhone")}
            />
          </Field>
          <Field
            label="Parentesco"
            htmlFor="emergencyRelationship"
            error={errors.emergencyRelationship}
          >
            <Input
              id="emergencyRelationship"
              name="emergencyRelationship"
              defaultValue={v("emergencyRelationship")}
            />
          </Field>
        </div>
      </fieldset>
    </div>
  );
}
