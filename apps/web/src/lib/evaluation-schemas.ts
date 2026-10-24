import { z } from "zod";
import "./zod-config";

/** Validaciones de evaluaciones y notas (spec 02). Mensajes en español (es-AR). */

export const EVALUATION_TYPES = ["entry", "periodic"] as const;
export const EVALUATION_STATUSES = ["draft", "published"] as const;
export type EvaluationType = (typeof EVALUATION_TYPES)[number];
export type EvaluationStatus = (typeof EVALUATION_STATUSES)[number];

export const EVALUATION_TYPE_LABELS: Record<EvaluationType, string> = {
  entry: "De ingreso",
  periodic: "Periódica",
};
export const EVALUATION_STATUS_LABELS: Record<EvaluationStatus, string> = {
  draft: "Borrador",
  published: "Publicada",
};

export const MIN_SCORE = 1;
export const MAX_SCORE = 10;

/** Días sin evaluación publicada a partir de los cuales el arquero queda "pendiente" (RF-26). */
export const PENDING_AFTER_DAYS = 90;

const isoDate = z
  .string({ error: "Ingresá una fecha válida." })
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ingresá una fecha válida.")
  .refine((value) => {
    const [y, m, d] = value.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  }, "Ingresá una fecha válida.");

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} puede tener hasta ${max} caracteres.`)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional()
    .transform((value) => value ?? null);

/** Puntaje de una categoría: entero de 1 a 10, o `null` si no se evaluó (RF-02 y RF-07). */
const scoreField = z
  .union([z.string().trim(), z.number(), z.null()])
  .optional()
  .transform((value) =>
    value === "" || value === undefined || value === null ? null : Number(value),
  )
  .refine(
    (value) =>
      value === null || (Number.isInteger(value) && value >= MIN_SCORE && value <= MAX_SCORE),
    `El puntaje va de ${MIN_SCORE} a ${MAX_SCORE}.`,
  );

export const scoreInputSchema = z.object({
  categoryId: z.uuid({ error: "Categoría inválida." }),
  score: scoreField,
  comment: optionalText(500, "El comentario de la categoría"),
});
export type ScoreInput = z.output<typeof scoreInputSchema>;

/**
 * La fecha no puede ser futura (RN-07), así que el esquema se arma con "hoy" en Argentina.
 * Debe haber al menos una categoría puntuada (spec 02, casos borde).
 */
export function makeEvaluationSchema(today: string) {
  return z
    .object({
      date: isoDate.refine((value) => value <= today, "La fecha no puede ser futura."),
      type: z.enum(EVALUATION_TYPES, { error: "Elegí el tipo de evaluación." }),
      comment: optionalText(2000, "El comentario general"),
      scores: z.array(scoreInputSchema),
    })
    .superRefine((value, ctx) => {
      if (!value.scores.some((s) => s.score !== null)) {
        ctx.addIssue({
          code: "custom",
          path: ["scores"],
          message: "Puntuá al menos una categoría.",
        });
      }
    });
}
export type EvaluationInput = z.output<ReturnType<typeof makeEvaluationSchema>>;

export const noteSchema = z.object({
  body: z
    .string({ error: "Escribí la nota." })
    .trim()
    .min(1, "Escribí la nota.")
    .max(1000, "La nota puede tener hasta 1000 caracteres."),
  visibleToFamily: z.boolean(),
});
export type NoteInput = z.output<typeof noteSchema>;

export function isEvaluationType(value: unknown): value is EvaluationType {
  return EVALUATION_TYPES.includes(value as EvaluationType);
}
