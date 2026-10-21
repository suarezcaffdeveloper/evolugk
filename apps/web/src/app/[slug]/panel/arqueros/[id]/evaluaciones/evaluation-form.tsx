"use client";

import { useActionState } from "react";
import { describedBy, Field, FormAlert, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/cn";
import { MAX_SCORE, MIN_SCORE, type EvaluationStatus } from "@/lib/evaluation-schemas";
import { saveEvaluationAction, type EvaluationFormState } from "./actions";

export type FormCategory = {
  id: string;
  name: string;
  guideLow: string;
  guideMid: string;
  guideHigh: string;
};

type Props = {
  slug: string;
  goalkeeperId: string;
  /** Null al crear; el id al editar. */
  evaluationId: string | null;
  /** En edición, para ofrecer "Guardar cambios" en vez de "Guardar borrador". */
  status: EvaluationStatus | null;
  categories: FormCategory[];
  today: string;
  /** Una evaluación de ingreso solo si el arquero todavía no tiene (o esta es la suya). */
  canBeEntry: boolean;
  initial: {
    date: string;
    type: "entry" | "periodic";
    comment: string;
    scores: Record<string, { score: number | null; comment: string | null }>;
  };
};

const SCORES = Array.from({ length: MAX_SCORE - MIN_SCORE + 1 }, (_, i) => MIN_SCORE + i);

/**
 * Carga rápida (spec 02, F1): una pantalla con las 8 categorías, un toque por puntaje. Los
 * puntajes son botones de opción nativos (sin estado en el navegador); la guía y el comentario de
 * cada categoría están plegados para no estorbar.
 */
export function EvaluationForm({
  slug,
  goalkeeperId,
  evaluationId,
  status,
  categories,
  today,
  canBeEntry,
  initial,
}: Props) {
  const [state, formAction] = useActionState<EvaluationFormState, FormData>(
    saveEvaluationAction.bind(null, slug, goalkeeperId, evaluationId),
    {},
  );
  const values = state.values;
  const errors = state.errors ?? {};

  const field = (key: string, fallback: string) => values?.[key] ?? fallback;
  const scoreOf = (categoryId: string) =>
    values
      ? (values[`score-${categoryId}`] ?? "")
      : String(initial.scores[categoryId]?.score ?? "");
  const commentOf = (categoryId: string) =>
    field(`comment-${categoryId}`, initial.scores[categoryId]?.comment ?? "");
  const type = field("type", initial.type);

  return (
    <form action={formAction} noValidate className="space-y-5">
      {state.error && <FormAlert>{state.error}</FormAlert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Fecha de la evaluación" htmlFor="date" error={errors.date}>
          <Input
            id="date"
            name="date"
            type="date"
            max={today}
            required
            defaultValue={field("date", initial.date)}
            {...describedBy("date", { error: errors.date })}
          />
        </Field>

        <fieldset className="space-y-1.5">
          <legend className="text-sm font-semibold">Tipo</legend>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["periodic", "Periódica"],
                ["entry", "De ingreso"],
              ] as const
            ).map(([value, label]) => {
              const disabled = value === "entry" && !canBeEntry;
              return (
                <label
                  key={value}
                  className={cn(
                    "flex h-11 cursor-pointer items-center justify-center rounded-control border border-line bg-surface text-sm font-semibold",
                    "has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40",
                    disabled && "cursor-not-allowed opacity-50",
                  )}
                >
                  <input
                    type="radio"
                    name="type"
                    value={value}
                    disabled={disabled}
                    defaultChecked={type === value}
                    className="sr-only"
                  />
                  {label}
                </label>
              );
            })}
          </div>
          {!canBeEntry && (
            <p className="text-sm text-ink-muted">
              Este arquero ya tiene su evaluación de ingreso.
            </p>
          )}
          {errors.type && (
            <p role="alert" className="text-sm font-medium text-danger">
              {errors.type}
            </p>
          )}
        </fieldset>
      </div>

      <div className="space-y-3">
        <div>
          <h2 className="font-display text-lg font-bold">Puntajes</h2>
          <p className="text-sm text-ink-muted">
            De {MIN_SCORE} a {MAX_SCORE}. Si no la observaste, dejá la categoría sin evaluar.
          </p>
        </div>
        {errors.scores && <FormAlert>{errors.scores}</FormAlert>}

        <ul className="space-y-3">
          {categories.map((category) => {
            const current = scoreOf(category.id);
            return (
              <li
                key={category.id}
                className="space-y-3 rounded-card border border-line bg-surface p-4 shadow-card"
              >
                <fieldset className="space-y-3">
                  <legend className="font-display text-base font-bold">{category.name}</legend>

                  <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-10">
                    {SCORES.map((n) => (
                      <label key={n} className="cursor-pointer">
                        <input
                          type="radio"
                          name={`score-${category.id}`}
                          value={n}
                          defaultChecked={current === String(n)}
                          className="peer sr-only"
                          aria-label={`${category.name}: ${n}`}
                        />
                        <span
                          className={cn(
                            "flex h-11 items-center justify-center rounded-control border border-line bg-canvas text-base font-bold tabular-nums",
                            "transition-colors duration-100 hover:bg-accent-soft",
                            "peer-checked:border-accent peer-checked:bg-accent peer-checked:text-on-accent",
                            "peer-focus-visible:ring-2 peer-focus-visible:ring-accent/50",
                          )}
                        >
                          {n}
                        </span>
                      </label>
                    ))}
                  </div>

                  <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-ink-muted has-[:checked]:text-ink">
                    <input
                      type="radio"
                      name={`score-${category.id}`}
                      value=""
                      defaultChecked={current === ""}
                      className="accent-[var(--accent)]"
                    />
                    Sin evaluar
                  </label>
                </fieldset>

                <details className="text-sm">
                  <summary className="cursor-pointer font-semibold text-ink-muted hover:text-ink">
                    Guía de puntajes
                  </summary>
                  <dl className="mt-2 space-y-1.5">
                    <div>
                      <dt className="font-semibold">Bajo (1 a 3)</dt>
                      <dd className="text-ink-muted">{category.guideLow}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold">Medio (4 a 7)</dt>
                      <dd className="text-ink-muted">{category.guideMid}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold">Alto (8 a 10)</dt>
                      <dd className="text-ink-muted">{category.guideHigh}</dd>
                    </div>
                  </dl>
                </details>

                <details className="text-sm" open={commentOf(category.id) !== ""}>
                  <summary className="cursor-pointer font-semibold text-ink-muted hover:text-ink">
                    Comentario de la categoría
                  </summary>
                  <textarea
                    name={`comment-${category.id}`}
                    rows={2}
                    maxLength={500}
                    defaultValue={commentOf(category.id)}
                    aria-label={`Comentario sobre ${category.name}`}
                    className="mt-2 w-full rounded-control border border-line bg-surface px-3 py-2 text-base focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
                  />
                </details>
              </li>
            );
          })}
        </ul>
      </div>

      <Field label="Comentario general (opcional)" htmlFor="comment" error={errors.comment}>
        <textarea
          id="comment"
          name="comment"
          rows={4}
          maxLength={2000}
          defaultValue={field("comment", initial.comment)}
          className="w-full rounded-control border border-line bg-surface px-3 py-2 text-base focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
          {...describedBy("comment", { error: errors.comment })}
        />
      </Field>

      <div className="sticky bottom-0 -mx-4 flex flex-wrap gap-2 border-t border-line bg-canvas/95 px-4 py-3 backdrop-blur">
        {status === "published" ? (
          <SubmitButton name="intent" value="save" pendingText="Guardando…">
            Guardar cambios
          </SubmitButton>
        ) : (
          <>
            <SubmitButton name="intent" value="publish" pendingText="Publicando…">
              Publicar
            </SubmitButton>
            <SubmitButton name="intent" value="draft" variant="secondary" pendingText="Guardando…">
              Guardar borrador
            </SubmitButton>
          </>
        )}
      </div>
    </form>
  );
}
