import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EvaluationType } from "@/lib/evaluation-schemas";
import { isNewItem, type EvolutionEvaluation } from "@/lib/evolution";
import { getCategoriesById, getCurrentRubric, type RubricCategory } from "../evaluations";
import type { GuardianSession } from "./access";

/**
 * Evolución del arquero para la familia (spec 04, RF-14 a RF-17 y RF-38/39). El cliente con clave
 * secreta se saltea RLS: acá solo se leen evaluaciones publicadas y notas marcadas como visibles
 * (RN-02). Quien llama ya verificó que el arquero es del tutor (`getFamilyGoalkeeper`); aun así
 * toda consulta filtra por escuela y arquero.
 */

type Db = SupabaseClient;

export type FamilyScore = {
  key: string;
  name: string;
  position: number;
  score: number | null;
  comment: string | null;
};

export type FamilyEvaluation = {
  id: string;
  date: string;
  type: EvaluationType;
  publishedAt: string;
  createdAt: string;
  comment: string | null;
  authorName: string | null;
  scores: FamilyScore[];
  isNew: boolean;
};

export type FamilyNote = {
  id: string;
  body: string;
  authorName: string | null;
  createdAt: string;
  isNew: boolean;
};

export type FamilyEvolution = {
  /** Categorías de la rúbrica vigente, en orden: los ejes del radar. */
  categories: RubricCategory[];
  /** Publicadas, de la más reciente a la más antigua. */
  evaluations: FamilyEvaluation[];
  /** Notas marcadas como visibles, de la más reciente a la más antigua. */
  notes: FamilyNote[];
  newCount: number;
};

type SeenKind = "evaluation" | "note";

async function seenIds(
  db: Db,
  session: GuardianSession,
  goalkeeperId: string,
  kind: SeenKind,
): Promise<Set<string>> {
  const { data } = await db
    .from("guardian_seen")
    .select("ref_id")
    .eq("school_id", session.schoolId)
    .eq("guardian_id", session.guardianId)
    .eq("goalkeeper_id", goalkeeperId)
    .eq("kind", kind);
  return new Set((data ?? []).map((r) => r.ref_id as string));
}

async function authorNames(
  db: Db,
  schoolId: string,
  ids: (string | null)[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return new Map();
  const { data } = await db
    .from("profile")
    .select("user_id, first_name, last_name")
    .eq("school_id", schoolId)
    .in("user_id", unique);
  return new Map(
    (data ?? []).map((p) => [p.user_id as string, `${p.first_name} ${p.last_name}`.trim()]),
  );
}

type EvaluationRow = {
  id: string;
  author_id: string | null;
  date: string;
  type: EvaluationType;
  published_at: string;
  created_at: string;
  comment: string | null;
  evaluation_score: { category_id: string; score: number | null; comment: string | null }[];
};

const COLUMNS =
  "id, author_id, date, type, published_at, created_at, comment, evaluation_score(category_id, score, comment)";

function toFamilyEvaluation(
  row: EvaluationRow,
  categories: Map<string, RubricCategory>,
  names: Map<string, string>,
  seen: Set<string>,
  now: Date,
): FamilyEvaluation {
  return {
    id: row.id,
    date: row.date,
    type: row.type,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    comment: row.comment,
    authorName: row.author_id ? (names.get(row.author_id) ?? null) : null,
    scores: row.evaluation_score
      .flatMap((s) => {
        const category = categories.get(s.category_id);
        return category
          ? [
              {
                key: category.key,
                name: category.name,
                position: category.position,
                score: s.score,
                comment: s.comment,
              },
            ]
          : [];
      })
      .sort((a, b) => a.position - b.position),
    isNew: isNewItem(row.published_at, now, seen.has(row.id)),
  };
}

/** Las evaluaciones en la forma que usan los cálculos de evolución (puntajes por clave de categoría). */
export function toEvolutionSeries(evaluations: FamilyEvaluation[]): EvolutionEvaluation[] {
  return evaluations.map((e) => ({
    id: e.id,
    date: e.date,
    createdAt: e.createdAt,
    type: e.type,
    scores: Object.fromEntries(e.scores.map((s) => [s.key, s.score])),
  }));
}

export async function getFamilyEvolution(
  db: Db,
  session: GuardianSession,
  goalkeeperId: string,
  now: Date = new Date(),
): Promise<FamilyEvolution> {
  const [{ data: rows }, { data: noteRows }, rubric, categoryById, seenEvaluations, seenNotes] =
    await Promise.all([
      db
        .from("evaluation")
        .select(COLUMNS)
        .eq("school_id", session.schoolId)
        .eq("goalkeeper_id", goalkeeperId)
        .eq("status", "published")
        .order("date", { ascending: false })
        .order("created_at", { ascending: false }),
      db
        .from("note")
        .select("id, author_id, body, created_at")
        .eq("school_id", session.schoolId)
        .eq("goalkeeper_id", goalkeeperId)
        .eq("visible_to_family", true)
        .order("created_at", { ascending: false }),
      getCurrentRubric(db),
      getCategoriesById(db),
      seenIds(db, session, goalkeeperId, "evaluation"),
      seenIds(db, session, goalkeeperId, "note"),
    ]);

  const evaluationRows = (rows ?? []) as unknown as EvaluationRow[];
  const names = await authorNames(db, session.schoolId, [
    ...evaluationRows.map((r) => r.author_id),
    ...(noteRows ?? []).map((n) => n.author_id as string | null),
  ]);

  const evaluations = evaluationRows.map((r) =>
    toFamilyEvaluation(r, categoryById, names, seenEvaluations, now),
  );
  const notes = (noteRows ?? []).map((n) => ({
    id: n.id as string,
    body: n.body as string,
    authorName: n.author_id ? (names.get(n.author_id as string) ?? null) : null,
    createdAt: n.created_at as string,
    isNew: isNewItem(n.created_at as string, now, seenNotes.has(n.id as string)),
  }));

  return {
    categories: rubric.categories,
    evaluations,
    notes,
    newCount: evaluations.filter((e) => e.isNew).length + notes.filter((n) => n.isNew).length,
  };
}

/** Una evaluación publicada del arquero, o null si no existe, es un borrador o es de otro arquero. */
export async function getFamilyEvaluation(
  db: Db,
  session: GuardianSession,
  goalkeeperId: string,
  evaluationId: string,
): Promise<FamilyEvaluation | null> {
  const { data } = await db
    .from("evaluation")
    .select(COLUMNS)
    .eq("school_id", session.schoolId)
    .eq("goalkeeper_id", goalkeeperId)
    .eq("id", evaluationId)
    .eq("status", "published")
    .maybeSingle();
  const row = data as unknown as EvaluationRow | null;
  if (!row) return null;

  const [categories, names, seen] = await Promise.all([
    getCategoriesById(db),
    authorNames(db, session.schoolId, [row.author_id]),
    seenIds(db, session, goalkeeperId, "evaluation"),
  ]);
  return toFamilyEvaluation(row, categories, names, seen, new Date());
}

/**
 * Marca como visto lo que el tutor abrió (RF-39). Solo registra elementos que el tutor puede ver:
 * una evaluación publicada o una nota visible de ese arquero.
 */
export async function markSeen(
  db: Db,
  session: GuardianSession,
  goalkeeperId: string,
  kind: SeenKind,
  refIds: string[],
): Promise<void> {
  if (refIds.length === 0) return;

  const table = kind === "evaluation" ? "evaluation" : "note";
  const visibility = kind === "evaluation" ? { status: "published" } : { visible_to_family: true };
  const { data: visible } = await db
    .from(table)
    .select("id")
    .eq("school_id", session.schoolId)
    .eq("goalkeeper_id", goalkeeperId)
    .match(visibility)
    .in("id", refIds);
  const ids = (visible ?? []).map((r) => r.id as string);
  if (ids.length === 0) return;

  await db.from("guardian_seen").upsert(
    ids.map((refId) => ({
      guardian_id: session.guardianId,
      goalkeeper_id: goalkeeperId,
      school_id: session.schoolId,
      kind,
      ref_id: refId,
    })),
    { onConflict: "guardian_id,kind,ref_id", ignoreDuplicates: true },
  );
}
