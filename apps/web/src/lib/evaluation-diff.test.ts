import { describe, expect, it } from "vitest";
import {
  describeDiff,
  diffEvaluation,
  isEmptyDiff,
  type EvaluationSnapshot,
} from "./evaluation-diff";

const base: EvaluationSnapshot = {
  date: "2026-10-01",
  type: "periodic",
  comment: "Buen mes",
  scores: {
    save_technique: { score: 6, comment: null },
    reflexes: { score: 8, comment: "Muy rápido" },
  },
};

describe("diffEvaluation", () => {
  it("sin cambios devuelve un resultado vacío", () => {
    expect(isEmptyDiff(diffEvaluation(base, structuredClone(base)))).toBe(true);
  });

  it("detecta el cambio de un puntaje con el valor anterior y el nuevo", () => {
    const after = structuredClone(base);
    after.scores.save_technique.score = 8;
    expect(diffEvaluation(base, after)).toEqual({
      scores: { save_technique: { score: { from: 6, to: 8 } } },
    });
  });

  it("detecta fecha, tipo y comentario general", () => {
    const diff = diffEvaluation(base, {
      ...base,
      date: "2026-10-05",
      type: "entry",
      comment: null,
    });
    expect(diff.date).toEqual({ from: "2026-10-01", to: "2026-10-05" });
    expect(diff.type).toEqual({ from: "periodic", to: "entry" });
    expect(diff.comment).toEqual({ from: "Buen mes", to: null });
  });

  it("una categoría agregada u omitida aparece como cambio desde o hacia sin evaluar", () => {
    const after = structuredClone(base);
    delete after.scores.reflexes;
    after.scores.mindset = { score: 7, comment: null };
    expect(diffEvaluation(base, after).scores).toEqual({
      reflexes: { score: { from: 8, to: null }, comment: { from: "Muy rápido", to: null } },
      mindset: { score: { from: null, to: 7 } },
    });
  });
});

describe("describeDiff", () => {
  it("cuenta los cambios en palabras", () => {
    const after = structuredClone(base);
    after.scores.save_technique.score = 8;
    delete after.scores.reflexes;
    const lines = describeDiff(
      diffEvaluation(base, { ...after, date: "2026-10-05" }),
      { save_technique: "Atajada", reflexes: "Reflejos" },
      (date) => `fecha ${date}`,
    );
    expect(lines).toEqual([
      "Cambió la fecha del fecha 2026-10-01 al fecha 2026-10-05.",
      "Atajada: de 6 a 8.",
      "Reflejos: de 8 a sin evaluar.",
      "Reflejos: se modificó el comentario.",
    ]);
  });
});
