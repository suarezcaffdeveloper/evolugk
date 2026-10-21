import { addDays } from "./dates";
import { PENDING_AFTER_DAYS } from "./evaluation-schemas";

/**
 * Cálculos de la evolución del arquero (spec 02, RF-21 a RF-26). Son funciones puras, sobre
 * evaluaciones ya filtradas como publicadas: quien las llama decide qué evaluaciones se ven.
 */

export type EvolutionEvaluation = {
  id: string;
  /** Fecha de la evaluación, "AAAA-MM-DD". */
  date: string;
  /** Instante de creación: desempata dos evaluaciones con la misma fecha (gana la creada después). */
  createdAt: string;
  type: "entry" | "periodic";
  /** Puntaje por id de categoría; sin clave o `null` = "sin evaluar". */
  scores: Record<string, number | null>;
};

/** Más reciente primero: por fecha y, a igual fecha, la creada después (spec 02, casos borde). */
export function sortLatestFirst<T extends Pick<EvolutionEvaluation, "date" | "createdAt">>(
  evaluations: readonly T[],
): T[] {
  return [...evaluations].sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  );
}

/** Estado actual: la evaluación publicada más reciente por fecha (RN-03). */
export function currentEvaluation<T extends EvolutionEvaluation>(
  evaluations: readonly T[],
): T | null {
  return sortLatestFirst(evaluations)[0] ?? null;
}

export function entryEvaluation<T extends EvolutionEvaluation>(
  evaluations: readonly T[],
): T | null {
  return evaluations.find((e) => e.type === "entry") ?? null;
}

/**
 * Valores del radar en el orden de las categorías. Una categoría omitida queda `null`
 * ("sin evaluar"): nunca se arrastra el valor de una evaluación anterior (RN-04).
 */
export function radarValues(
  evaluation: Pick<EvolutionEvaluation, "scores"> | null,
  categoryIds: readonly string[],
): Array<number | null> {
  return categoryIds.map((id) => evaluation?.scores[id] ?? null);
}

/** Los gráficos de evolución aparecen desde la segunda evaluación publicada (RF-24b). */
export function hasEvolution(evaluations: readonly EvolutionEvaluation[]): boolean {
  return evaluations.length >= 2;
}

/**
 * Ingreso vs. hoy (RF-22): solo si hay evaluación de ingreso y es distinta de la actual.
 * Si no, se muestra únicamente el estado actual.
 */
export function comparison<T extends EvolutionEvaluation>(
  evaluations: readonly T[],
): { entry: T; current: T } | null {
  const current = currentEvaluation(evaluations);
  const entry = entryEvaluation(evaluations);
  if (!current || !entry || current.id === entry.id) return null;
  return { entry, current };
}

export type TimelinePoint = { date: string; score: number };

/** Puntajes de una categoría en el tiempo, de la más antigua a la más reciente (RF-23). Omite lo no evaluado. */
export function categoryTimeline(
  evaluations: readonly EvolutionEvaluation[],
  categoryId: string,
): TimelinePoint[] {
  return sortLatestFirst(evaluations)
    .reverse()
    .flatMap((e) => {
      const score = e.scores[categoryId];
      return typeof score === "number" ? [{ date: e.date, score }] : [];
    });
}

/**
 * Evaluación pendiente (RF-26): pasaron más de 90 días desde la última publicada, o nunca tuvo
 * ninguna. El día 90 todavía no es pendiente.
 */
export function isEvaluationPending(lastPublishedDate: string | null, today: string): boolean {
  if (!lastPublishedDate) return true;
  return addDays(lastPublishedDate, PENDING_AFTER_DAYS) < today;
}

/** Ventana del indicador "nuevo" (spec 04, RF-38). */
export const NEW_WINDOW_DAYS = 30;

/** ¿Es una novedad para el tutor? Publicada en los últimos 30 días y todavía no abierta (RF-38 y RF-39). */
export function isNewItem(publishedAt: string, now: Date, seen: boolean): boolean {
  if (seen) return false;
  const limit = now.getTime() - NEW_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return new Date(publishedAt).getTime() >= limit;
}
