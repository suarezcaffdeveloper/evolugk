/**
 * Qué cambió entre dos versiones de una evaluación, para el registro de ediciones (spec 02,
 * RF-16 y CA-07). El resultado se guarda tal cual en `evaluation_revision.detail`.
 */

export type EvaluationSnapshot = {
  date: string;
  type: "entry" | "periodic";
  comment: string | null;
  /** Por clave de categoría. */
  scores: Record<string, { score: number | null; comment: string | null }>;
};

export type Change<T> = { from: T; to: T };

export type EvaluationDiff = {
  date?: Change<string>;
  type?: Change<string>;
  comment?: Change<string | null>;
  scores?: Record<string, { score?: Change<number | null>; comment?: Change<string | null> }>;
};

export function diffEvaluation(
  before: EvaluationSnapshot,
  after: EvaluationSnapshot,
): EvaluationDiff {
  const diff: EvaluationDiff = {};
  if (before.date !== after.date) diff.date = { from: before.date, to: after.date };
  if (before.type !== after.type) diff.type = { from: before.type, to: after.type };
  if ((before.comment ?? null) !== (after.comment ?? null)) {
    diff.comment = { from: before.comment ?? null, to: after.comment ?? null };
  }

  const scores: NonNullable<EvaluationDiff["scores"]> = {};
  for (const key of new Set([...Object.keys(before.scores), ...Object.keys(after.scores)])) {
    const a = before.scores[key] ?? { score: null, comment: null };
    const b = after.scores[key] ?? { score: null, comment: null };
    const entry: NonNullable<EvaluationDiff["scores"]>[string] = {};
    if (a.score !== b.score) entry.score = { from: a.score, to: b.score };
    if (a.comment !== b.comment) entry.comment = { from: a.comment, to: b.comment };
    if (entry.score || entry.comment) scores[key] = entry;
  }
  if (Object.keys(scores).length > 0) diff.scores = scores;
  return diff;
}

export function isEmptyDiff(diff: EvaluationDiff): boolean {
  return Object.keys(diff).length === 0;
}

const TYPE_LABEL: Record<string, string> = { entry: "de ingreso", periodic: "periódica" };

const shown = (value: number | null) => (value === null ? "sin evaluar" : String(value));

/** El cambio en palabras, una frase por cosa modificada (para el registro que ve el staff). */
export function describeDiff(
  diff: EvaluationDiff,
  categoryNames: Record<string, string>,
  formatDate: (date: string) => string = (date) => date,
): string[] {
  const lines: string[] = [];
  if (diff.date) {
    lines.push(`Cambió la fecha del ${formatDate(diff.date.from)} al ${formatDate(diff.date.to)}.`);
  }
  if (diff.type) {
    lines.push(
      `Cambió el tipo de ${TYPE_LABEL[diff.type.from] ?? diff.type.from} a ${TYPE_LABEL[diff.type.to] ?? diff.type.to}.`,
    );
  }
  if (diff.comment) lines.push("Se modificó el comentario general.");
  for (const [key, change] of Object.entries(diff.scores ?? {})) {
    const name = categoryNames[key] ?? key;
    if (change.score) {
      lines.push(`${name}: de ${shown(change.score.from)} a ${shown(change.score.to)}.`);
    }
    if (change.comment) lines.push(`${name}: se modificó el comentario.`);
  }
  return lines;
}
