import { describe, expect, it } from "vitest";
import {
  categoryTimeline,
  comparison,
  currentEvaluation,
  hasEvolution,
  isEvaluationPending,
  isNewItem,
  radarValues,
  sortLatestFirst,
  type EvolutionEvaluation,
} from "./evolution";

const evaluation = (
  id: string,
  date: string,
  scores: Record<string, number | null>,
  extra: Partial<EvolutionEvaluation> = {},
): EvolutionEvaluation => ({
  id,
  date,
  createdAt: `${date}T12:00:00Z`,
  type: "periodic",
  scores,
  ...extra,
});

describe("estado actual", () => {
  it("usa la evaluación más reciente por fecha (RN-03)", () => {
    const list = [
      evaluation("a", "2026-03-01", { x: 5 }),
      evaluation("b", "2026-06-01", { x: 7 }),
      evaluation("c", "2026-04-01", { x: 6 }),
    ];
    expect(currentEvaluation(list)?.id).toBe("b");
  });

  it("con la misma fecha gana la creada después", () => {
    const list = [
      evaluation("a", "2026-06-01", {}, { createdAt: "2026-06-01T10:00:00Z" }),
      evaluation("b", "2026-06-01", {}, { createdAt: "2026-06-01T15:00:00Z" }),
    ];
    expect(sortLatestFirst(list).map((e) => e.id)).toEqual(["b", "a"]);
  });

  it("sin evaluaciones no hay estado actual", () => {
    expect(currentEvaluation([])).toBeNull();
  });
});

describe("radar", () => {
  it("deja la categoría omitida como sin evaluar y no arrastra la anterior (RN-04)", () => {
    const old = evaluation("old", "2026-01-01", { atajada: 6, reflejos: 8 });
    const latest = evaluation("new", "2026-06-01", { atajada: 7 });
    expect(radarValues(currentEvaluation([old, latest]), ["atajada", "reflejos"])).toEqual([
      7,
      null,
    ]);
  });

  it("trata el puntaje nulo como sin evaluar", () => {
    expect(radarValues(evaluation("a", "2026-01-01", { x: null }), ["x"])).toEqual([null]);
  });
});

describe("comparativo ingreso vs. hoy", () => {
  it("superpone ingreso y actual cuando son distintas", () => {
    const entry = evaluation("e", "2026-01-01", { x: 4 }, { type: "entry" });
    const now = evaluation("n", "2026-06-01", { x: 7 });
    expect(comparison([now, entry])).toEqual({ entry, current: now });
  });

  it("no compara si solo hay una evaluación, aunque sea la de ingreso", () => {
    const entry = evaluation("e", "2026-01-01", { x: 4 }, { type: "entry" });
    expect(comparison([entry])).toBeNull();
  });

  it("no compara si no hay evaluación de ingreso", () => {
    expect(
      comparison([evaluation("a", "2026-01-01", {}), evaluation("b", "2026-02-01", {})]),
    ).toBeNull();
  });
});

describe("evolución visible", () => {
  it("aparece desde la segunda evaluación publicada (RF-24b)", () => {
    expect(hasEvolution([])).toBe(false);
    expect(hasEvolution([evaluation("a", "2026-01-01", {})])).toBe(false);
    expect(
      hasEvolution([evaluation("a", "2026-01-01", {}), evaluation("b", "2026-02-01", {})]),
    ).toBe(true);
  });
});

describe("línea de tiempo por categoría", () => {
  it("va de la más antigua a la más reciente y omite lo no evaluado", () => {
    const list = [
      evaluation("c", "2026-09-01", { x: 8 }),
      evaluation("a", "2026-01-01", { x: 4 }),
      evaluation("b", "2026-05-01", { x: null }),
    ];
    expect(categoryTimeline(list, "x")).toEqual([
      { date: "2026-01-01", score: 4 },
      { date: "2026-09-01", score: 8 },
    ]);
  });
});

describe("evaluación pendiente", () => {
  it("nunca evaluado = pendiente", () => {
    expect(isEvaluationPending(null, "2026-10-21")).toBe(true);
  });

  it("el día 90 todavía no es pendiente y el 91 sí", () => {
    // 2026-07-23 + 90 días = 2026-10-21
    expect(isEvaluationPending("2026-07-23", "2026-10-21")).toBe(false);
    expect(isEvaluationPending("2026-07-23", "2026-10-22")).toBe(true);
  });

  it("una evaluación reciente no es pendiente", () => {
    expect(isEvaluationPending("2026-10-01", "2026-10-21")).toBe(false);
  });
});

describe("indicador nuevo", () => {
  const now = new Date("2026-10-21T12:00:00Z");

  it("es nuevo si se publicó en los últimos 30 días y no se abrió", () => {
    expect(isNewItem("2026-10-20T10:00:00Z", now, false)).toBe(true);
    expect(isNewItem("2026-09-25T10:00:00Z", now, false)).toBe(true);
  });

  it("deja de serlo al abrirlo (RF-39)", () => {
    expect(isNewItem("2026-10-20T10:00:00Z", now, true)).toBe(false);
  });

  it("no es nuevo si pasaron más de 30 días", () => {
    expect(isNewItem("2026-09-10T10:00:00Z", now, false)).toBe(false);
  });
});
