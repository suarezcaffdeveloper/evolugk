import { describe, expect, it } from "vitest";
import { makeEvaluationSchema, noteSchema } from "./evaluation-schemas";

const TODAY = "2026-10-21";
const CATEGORY = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const schema = makeEvaluationSchema(TODAY);

const valid = {
  date: "2026-10-20",
  type: "periodic",
  comment: "",
  scores: [{ categoryId: CATEGORY, score: "7", comment: "" }],
};

describe("evaluación", () => {
  it("acepta una evaluación con una categoría puntuada y normaliza vacíos a nulo", () => {
    const result = schema.parse(valid);
    expect(result.comment).toBeNull();
    expect(result.scores[0]).toEqual({ categoryId: CATEGORY, score: 7, comment: null });
  });

  it("rechaza fechas futuras (RN-07) y acepta la de hoy", () => {
    expect(schema.safeParse({ ...valid, date: "2026-10-22" }).success).toBe(false);
    expect(schema.safeParse({ ...valid, date: TODAY }).success).toBe(true);
  });

  it("rechaza una fecha que no existe", () => {
    expect(schema.safeParse({ ...valid, date: "2026-02-30" }).success).toBe(false);
  });

  it("rechaza puntajes fuera de 1 a 10 o decimales (RF-02)", () => {
    for (const score of ["0", "11", "5.5", "abc"]) {
      expect(
        schema.safeParse({ ...valid, scores: [{ categoryId: CATEGORY, score }] }).success,
      ).toBe(false);
    }
    for (const score of ["1", "10"]) {
      expect(
        schema.safeParse({ ...valid, scores: [{ categoryId: CATEGORY, score }] }).success,
      ).toBe(true);
    }
  });

  it("rechaza guardar si no se puntuó ninguna categoría", () => {
    const result = schema.safeParse({
      ...valid,
      scores: [
        { categoryId: CATEGORY, score: "" },
        { categoryId: OTHER, score: null, comment: "Buen día" },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("permite omitir categorías (RF-07)", () => {
    const result = schema.parse({
      ...valid,
      scores: [
        { categoryId: CATEGORY, score: "8" },
        { categoryId: OTHER, score: "" },
      ],
    });
    expect(result.scores.map((s) => s.score)).toEqual([8, null]);
  });

  it("rechaza un tipo desconocido", () => {
    expect(schema.safeParse({ ...valid, type: "otra" }).success).toBe(false);
  });
});

describe("nota", () => {
  it("exige texto", () => {
    expect(noteSchema.safeParse({ body: "   ", visibleToFamily: false }).success).toBe(false);
    expect(noteSchema.safeParse({ body: "Buen trabajo", visibleToFamily: true }).success).toBe(
      true,
    );
  });

  it("limita el largo", () => {
    expect(noteSchema.safeParse({ body: "a".repeat(1001), visibleToFamily: false }).success).toBe(
      false,
    );
  });
});
