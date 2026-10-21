"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { CopyLink } from "@/components/copy-link";
import { Card } from "@/components/ui/card";
import { Field, FormAlert, Input, describedBy } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { createSchoolAction, type NewSchoolState } from "../actions";

/** "Guantes del Sur" → "guantes-del-sur" (sin tildes ni símbolos, hasta 30 caracteres). */
function suggestSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/g, "");
}

export function NewSchoolForm() {
  const [state, formAction] = useActionState<NewSchoolState, FormData>(createSchoolAction, {});
  const slugTouched = useRef(false);
  const [slug, setSlug] = useState("");
  const [startMode, setStartMode] = useState<"trial" | "paid">("trial");
  // Una nueva escuela vuelve a mostrar el formulario vacío.
  const [formKey, setFormKey] = useState(0);

  const errors = state.fieldErrors ?? {};
  const values = state.values ?? {};

  if (state.created) {
    const { created } = state;
    return (
      <Card className="rise-in space-y-4">
        <div className="space-y-1">
          <h2 className="font-display text-xl font-bold">Escuela creada: {created.name}</h2>
          <p className="text-sm text-ink-muted">
            Su dirección es <span className="font-mono">/{created.slug}</span>.
          </p>
        </div>
        <Notice tone={created.delivery.sent ? "success" : "warning"}>
          {created.delivery.message}
        </Notice>
        <div className="space-y-2">
          <p className="text-sm font-semibold">Link de la invitación</p>
          <CopyLink link={created.delivery.link} />
          <p className="text-sm text-ink-muted">
            Este link se muestra una sola vez. Más adelante podés reenviar la invitación y se genera
            uno nuevo.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/operator/escuelas/${created.slug}`}
            className="inline-flex h-11 items-center justify-center rounded-control bg-accent px-4 font-semibold text-on-accent shadow-card transition-[box-shadow,transform,filter] duration-150 hover:shadow-card-hover hover:brightness-110 active:scale-[0.97]"
          >
            Ver la escuela
          </Link>
          <Link
            href="/operator/escuelas/nueva"
            onClick={() => {
              slugTouched.current = false;
              setSlug("");
              setFormKey((k) => k + 1);
            }}
            className="inline-flex h-11 items-center justify-center rounded-control border border-line bg-surface px-4 font-semibold transition-colors duration-150 hover:bg-accent-soft"
          >
            Crear otra
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <form key={formKey} action={formAction} noValidate className="space-y-5">
      {state.error && <FormAlert>{state.error}</FormAlert>}

      <Card className="rise-in space-y-4">
        <h2 className="font-display text-lg font-bold">La escuela</h2>
        <Field label="Nombre" htmlFor="name" error={errors.name}>
          <Input
            id="name"
            name="name"
            required
            autoComplete="off"
            defaultValue={values.name}
            onBlur={(event) => {
              if (!slugTouched.current && !slug) setSlug(suggestSlug(event.target.value));
            }}
            {...describedBy("name", { error: errors.name })}
          />
        </Field>
        <Field
          label="Identificador en la dirección"
          htmlFor="slug"
          error={errors.slug}
          hint="De 3 a 30 caracteres: minúsculas, números y guiones. No se puede cambiar después."
        >
          <div className="flex items-center gap-2">
            <span className="text-ink-muted">/</span>
            <Input
              id="slug"
              name="slug"
              required
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={slug}
              onChange={(event) => {
                slugTouched.current = true;
                setSlug(event.target.value);
              }}
              {...describedBy("slug", { error: errors.slug, hint: "x" })}
            />
          </div>
        </Field>
        <Field label="Mail del primer administrador" htmlFor="adminEmail" error={errors.adminEmail}>
          <Input
            id="adminEmail"
            name="adminEmail"
            type="email"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            required
            defaultValue={values.adminEmail}
            {...describedBy("adminEmail", { error: errors.adminEmail })}
          />
        </Field>
      </Card>

      <Card className="rise-in space-y-4" style={{ "--i": 1 } as React.CSSProperties}>
        <h2 className="font-display text-lg font-bold">Condiciones</h2>
        <Field
          label="Precio mensual (ARS)"
          htmlFor="monthlyPriceArs"
          error={errors.monthlyPriceArs}
        >
          <Input
            id="monthlyPriceArs"
            name="monthlyPriceArs"
            inputMode="decimal"
            required
            defaultValue={values.monthlyPriceArs}
            {...describedBy("monthlyPriceArs", { error: errors.monthlyPriceArs })}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tope de arqueros" htmlFor="goalkeeperLimit" error={errors.goalkeeperLimit}>
            <Input
              id="goalkeeperLimit"
              name="goalkeeperLimit"
              inputMode="numeric"
              required
              defaultValue={values.goalkeeperLimit}
              {...describedBy("goalkeeperLimit", { error: errors.goalkeeperLimit })}
            />
          </Field>
          <Field
            label="Tope de minutos de video"
            htmlFor="videoMinutesLimit"
            error={errors.videoMinutesLimit}
          >
            <Input
              id="videoMinutesLimit"
              name="videoMinutesLimit"
              inputMode="numeric"
              required
              defaultValue={values.videoMinutesLimit}
              {...describedBy("videoMinutesLimit", { error: errors.videoMinutesLimit })}
            />
          </Field>
        </div>
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold">Cómo empieza</legend>
          <label className="flex min-h-11 items-center gap-3">
            <input
              type="radio"
              name="startMode"
              value="trial"
              checked={startMode === "trial"}
              onChange={() => setStartMode("trial")}
            />
            Con período de prueba
          </label>
          <label className="flex min-h-11 items-center gap-3">
            <input
              type="radio"
              name="startMode"
              value="paid"
              checked={startMode === "paid"}
              onChange={() => setStartMode("paid")}
            />
            Sin prueba, con primer pago
          </label>
        </fieldset>
        {startMode === "trial" ? (
          <Field
            label="Días de prueba"
            htmlFor="trialDays"
            error={errors.trialDays}
            hint="La prueba no se cierra sola: la cerrás vos desde el panel."
          >
            <Input
              id="trialDays"
              name="trialDays"
              inputMode="numeric"
              required
              defaultValue={values.trialDays ?? "30"}
              {...describedBy("trialDays", { error: errors.trialDays, hint: "x" })}
            />
          </Field>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Monto del primer pago (ARS)"
              htmlFor="paymentAmountArs"
              error={errors.paymentAmountArs}
            >
              <Input
                id="paymentAmountArs"
                name="paymentAmountArs"
                inputMode="decimal"
                required
                defaultValue={values.paymentAmountArs}
                {...describedBy("paymentAmountArs", { error: errors.paymentAmountArs })}
              />
            </Field>
            <Field label="Meses cubiertos" htmlFor="paymentMonths" error={errors.paymentMonths}>
              <Input
                id="paymentMonths"
                name="paymentMonths"
                inputMode="numeric"
                required
                defaultValue={values.paymentMonths ?? "1"}
                {...describedBy("paymentMonths", { error: errors.paymentMonths })}
              />
            </Field>
          </div>
        )}
      </Card>

      <SubmitButton size="lg" className="w-full" pendingText="Creando la escuela…">
        Crear escuela e invitar al administrador
      </SubmitButton>
    </form>
  );
}
