import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  diffEvaluation,
  isEmptyDiff,
  type EvaluationDiff,
  type EvaluationSnapshot,
} from "@/lib/evaluation-diff";
import type {
  EvaluationInput,
  EvaluationStatus,
  EvaluationType,
  NoteInput,
} from "@/lib/evaluation-schemas";
import { isEvaluationPending } from "@/lib/evolution";
import { getAppUrl } from "./config";
import { evaluationPublishedEmail } from "./email/templates";
import type { EmailTransport } from "./email/transport";

/**
 * Evaluaciones, rúbrica y notas del staff (spec 02). Toda función recibe la escuela y filtra por
 * ella: el cliente con clave secreta se saltea RLS, así que el aislamiento y la visibilidad de
 * los borradores dependen de este código (la base los vuelve a imponer para el staff).
 */

type Db = SupabaseClient;
export type StaffRole = "school_admin" | "coach";
export type Actor = { schoolId: string; actorId: string; role: StaffRole };

const PG_UNIQUE = "23505";
const PG_CHECK = "23514";

async function audit(
  db: Db,
  actor: Actor,
  action: string,
  entity: string,
  entityId: string,
  details: Record<string, unknown> = {},
) {
  // De mejor esfuerzo: la auditoría no debe impedir la acción ya realizada.
  await db.from("audit_log").insert({
    school_id: actor.schoolId,
    actor_id: actor.actorId,
    action,
    entity,
    entity_id: entityId,
    details,
  });
}

// ───────────────────────────── rúbrica ─────────────────────────────

export type RubricCategory = {
  id: string;
  versionId: string;
  key: string;
  name: string;
  position: number;
  guideLow: string;
  guideMid: string;
  guideHigh: string;
};

type CategoryRow = {
  id: string;
  rubric_version_id: string;
  key: string;
  name: string;
  position: number;
  guide_low: string;
  guide_mid: string;
  guide_high: string;
};

const toCategory = (r: CategoryRow): RubricCategory => ({
  id: r.id,
  versionId: r.rubric_version_id,
  key: r.key,
  name: r.name,
  position: r.position,
  guideLow: r.guide_low,
  guideMid: r.guide_mid,
  guideHigh: r.guide_high,
});

/** Todas las categorías de todas las versiones, por id: las evaluaciones viejas conservan las suyas (RF-04b). */
export async function getCategoriesById(db: Db): Promise<Map<string, RubricCategory>> {
  const { data } = await db
    .from("rubric_category")
    .select("id, rubric_version_id, key, name, position, guide_low, guide_mid, guide_high");
  return new Map((data ?? []).map((r) => [r.id as string, toCategory(r as CategoryRow)]));
}

/** La rúbrica vigente (la versión más reciente) con sus categorías en orden. */
export async function getCurrentRubric(
  db: Db,
): Promise<{ versionId: string; categories: RubricCategory[] }> {
  const { data: version } = await db
    .from("rubric_version")
    .select("id")
    .order("version", { ascending: false })
    .limit(1)
    .single();
  if (!version) throw new Error("No hay una versión de la rúbrica cargada.");

  const { data } = await db
    .from("rubric_category")
    .select("id, rubric_version_id, key, name, position, guide_low, guide_mid, guide_high")
    .eq("rubric_version_id", version.id)
    .order("position", { ascending: true });
  return {
    versionId: version.id as string,
    categories: (data ?? []).map((r) => toCategory(r as CategoryRow)),
  };
}

/** Las categorías de una versión concreta de la rúbrica, en orden (una evaluación conserva la suya). */
export async function getRubricVersionCategories(
  db: Db,
  versionId: string,
): Promise<RubricCategory[]> {
  const { data } = await db
    .from("rubric_category")
    .select("id, rubric_version_id, key, name, position, guide_low, guide_mid, guide_high")
    .eq("rubric_version_id", versionId)
    .order("position", { ascending: true });
  return (data ?? []).map((r) => toCategory(r as CategoryRow));
}

// ───────────────────────────── lectura ─────────────────────────────

export type EvaluationScoreView = {
  categoryId: string;
  key: string;
  name: string;
  position: number;
  score: number | null;
  comment: string | null;
};

export type EvaluationView = {
  id: string;
  goalkeeperId: string;
  authorId: string | null;
  authorName: string | null;
  rubricVersionId: string;
  date: string;
  type: EvaluationType;
  status: EvaluationStatus;
  publishedAt: string | null;
  createdAt: string;
  comment: string | null;
  scores: EvaluationScoreView[];
};

export type Viewer = { userId: string; role: StaffRole };

type EvaluationRow = {
  id: string;
  goalkeeper_id: string;
  author_id: string | null;
  rubric_version_id: string;
  date: string;
  type: EvaluationType;
  status: EvaluationStatus;
  published_at: string | null;
  created_at: string;
  comment: string | null;
  evaluation_score: { category_id: string; score: number | null; comment: string | null }[];
};

const EVALUATION_COLUMNS =
  "id, goalkeeper_id, author_id, rubric_version_id, date, type, status, published_at, created_at, comment, evaluation_score(category_id, score, comment)";

/** Nombre de quien escribió cada cosa (profesor o admin), por id de usuario. */
async function staffNames(
  db: Db,
  schoolId: string,
  userIds: (string | null)[],
): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return new Map();
  const { data } = await db
    .from("profile")
    .select("user_id, first_name, last_name")
    .eq("school_id", schoolId)
    .in("user_id", ids);
  return new Map(
    (data ?? []).map((p) => [p.user_id as string, `${p.first_name} ${p.last_name}`.trim()]),
  );
}

function toView(
  row: EvaluationRow,
  categories: Map<string, RubricCategory>,
  names: Map<string, string>,
): EvaluationView {
  return {
    id: row.id,
    goalkeeperId: row.goalkeeper_id,
    authorId: row.author_id,
    authorName: row.author_id ? (names.get(row.author_id) ?? null) : null,
    rubricVersionId: row.rubric_version_id,
    date: row.date,
    type: row.type,
    status: row.status,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    comment: row.comment,
    scores: row.evaluation_score
      .flatMap((s) => {
        const category = categories.get(s.category_id);
        return category
          ? [
              {
                categoryId: s.category_id,
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
  };
}

/**
 * Evaluaciones de un arquero visibles para quien consulta (RF-11 y RF-25): las publicadas, más
 * sus propios borradores; el admin ve todos los borradores. De la más reciente a la más antigua.
 */
export async function listEvaluations(
  db: Db,
  schoolId: string,
  goalkeeperId: string,
  viewer: Viewer,
): Promise<EvaluationView[]> {
  let query = db
    .from("evaluation")
    .select(EVALUATION_COLUMNS)
    .eq("school_id", schoolId)
    .eq("goalkeeper_id", goalkeeperId)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });
  if (viewer.role !== "school_admin") {
    query = query.or(`status.eq.published,author_id.eq.${viewer.userId}`);
  }

  const [{ data }, categories] = await Promise.all([query, getCategoriesById(db)]);
  const rows = (data ?? []) as unknown as EvaluationRow[];
  const names = await staffNames(
    db,
    schoolId,
    rows.map((r) => r.author_id),
  );
  return rows.map((r) => toView(r, categories, names));
}

export type EvaluationContext = {
  goalkeeper: { id: string; firstName: string; lastName: string; status: string };
  /** Si ya hay una de ingreso (de cualquier autor y estado): no se puede cargar otra (RN-02). */
  hasEntry: boolean;
  /** Cantidad de evaluaciones (de cualquier autor y estado), para sugerir la de ingreso (RF-10). */
  count: number;
};

/** Lo que necesita la pantalla de carga: el arquero de la escuela y si ya tiene evaluación de ingreso. */
export async function getEvaluationContext(
  db: Db,
  schoolId: string,
  goalkeeperId: string,
): Promise<EvaluationContext | null> {
  const [{ data: goalkeeper }, { data: evaluations }] = await Promise.all([
    db
      .from("goalkeeper")
      .select("id, first_name, last_name, status")
      .eq("id", goalkeeperId)
      .eq("school_id", schoolId)
      .maybeSingle(),
    db
      .from("evaluation")
      .select("type")
      .eq("school_id", schoolId)
      .eq("goalkeeper_id", goalkeeperId),
  ]);
  if (!goalkeeper) return null;
  return {
    goalkeeper: {
      id: goalkeeper.id as string,
      firstName: goalkeeper.first_name as string,
      lastName: goalkeeper.last_name as string,
      status: goalkeeper.status as string,
    },
    hasEntry: (evaluations ?? []).some((e) => e.type === "entry"),
    count: (evaluations ?? []).length,
  };
}

export type RevisionView = {
  id: string;
  editedAt: string;
  editorName: string | null;
  detail: EvaluationDiff;
};

export type EvaluationDetail = EvaluationView & { revisions: RevisionView[] };

/** Una evaluación con su registro de ediciones, o null si no existe o no es visible para quien consulta. */
export async function getEvaluation(
  db: Db,
  schoolId: string,
  evaluationId: string,
  viewer: Viewer,
): Promise<EvaluationDetail | null> {
  const { data } = await db
    .from("evaluation")
    .select(EVALUATION_COLUMNS)
    .eq("school_id", schoolId)
    .eq("id", evaluationId)
    .maybeSingle();
  const row = data as unknown as EvaluationRow | null;
  if (!row) return null;
  const visible =
    row.status === "published" || row.author_id === viewer.userId || viewer.role === "school_admin";
  if (!visible) return null;

  const [categories, { data: revisions }] = await Promise.all([
    getCategoriesById(db),
    db
      .from("evaluation_revision")
      .select("id, edited_by, edited_at, detail")
      .eq("school_id", schoolId)
      .eq("evaluation_id", evaluationId)
      .order("edited_at", { ascending: false }),
  ]);
  const names = await staffNames(db, schoolId, [
    row.author_id,
    ...(revisions ?? []).map((r) => r.edited_by as string | null),
  ]);

  return {
    ...toView(row, categories, names),
    revisions: (revisions ?? []).map((r) => ({
      id: r.id as string,
      editedAt: r.edited_at as string,
      editorName: r.edited_by ? (names.get(r.edited_by as string) ?? null) : null,
      detail: r.detail as EvaluationDiff,
    })),
  };
}

// ───────────────────────────── escritura ─────────────────────────────

export type SaveError =
  "not_found" | "not_active" | "forbidden" | "entry_exists" | "invalid_category" | "failed";
export type SaveResult = { ok: true; evaluationId: string } | { ok: false; error: SaveError };

/** Las categorías tienen que ser distintas y pertenecer a la versión de la rúbrica de la evaluación. */
async function validCategoryIds(
  db: Db,
  scores: EvaluationInput["scores"],
  versionId: string,
): Promise<boolean> {
  const ids = [...new Set(scores.map((s) => s.categoryId))];
  if (ids.length !== scores.length) return false;
  const { data } = await db.from("rubric_category").select("id").eq("rubric_version_id", versionId);
  const allowed = new Set((data ?? []).map((c) => c.id as string));
  return ids.every((id) => allowed.has(id));
}

/** Filas para guardar: solo las categorías con puntaje o con comentario (las demás quedan "sin evaluar"). */
function scoreRows(evaluationId: string, schoolId: string, scores: EvaluationInput["scores"]) {
  return scores
    .filter((s) => s.score !== null || s.comment !== null)
    .map((s) => ({
      evaluation_id: evaluationId,
      school_id: schoolId,
      category_id: s.categoryId,
      score: s.score,
      comment: s.comment,
    }));
}

/**
 * Crea una evaluación en borrador (RF-11). Solo a arqueros activos de la escuela (RF-08) y, si es
 * de ingreso, solo si el arquero no tiene otra (RN-02).
 */
export async function createEvaluation(
  db: Db,
  input: Actor & { goalkeeperId: string; data: EvaluationInput },
): Promise<SaveResult> {
  const { data: goalkeeper } = await db
    .from("goalkeeper")
    .select("id, status")
    .eq("id", input.goalkeeperId)
    .eq("school_id", input.schoolId)
    .maybeSingle();
  if (!goalkeeper) return { ok: false, error: "not_found" };
  if (goalkeeper.status !== "active") return { ok: false, error: "not_active" };

  const { versionId } = await getCurrentRubric(db);
  if (!(await validCategoryIds(db, input.data.scores, versionId))) {
    return { ok: false, error: "invalid_category" };
  }

  if (input.data.type === "entry") {
    const { data: existing } = await db
      .from("evaluation")
      .select("id")
      .eq("school_id", input.schoolId)
      .eq("goalkeeper_id", input.goalkeeperId)
      .eq("type", "entry")
      .limit(1);
    if (existing?.length) return { ok: false, error: "entry_exists" };
  }

  const { data: created, error } = await db
    .from("evaluation")
    .insert({
      school_id: input.schoolId,
      goalkeeper_id: input.goalkeeperId,
      author_id: input.actorId,
      rubric_version_id: versionId,
      date: input.data.date,
      type: input.data.type,
      comment: input.data.comment,
    })
    .select("id")
    .single();
  if (error || !created) {
    if (error?.code === PG_UNIQUE) return { ok: false, error: "entry_exists" };
    if (error?.code === PG_CHECK) return { ok: false, error: "not_active" };
    return { ok: false, error: "failed" };
  }

  const { error: scoresError } = await db
    .from("evaluation_score")
    .insert(scoreRows(created.id, input.schoolId, input.data.scores));
  if (scoresError) {
    // No hay transacciones desde el cliente: se deshace la evaluación para no dejarla sin puntajes.
    await db.from("evaluation").delete().eq("id", created.id).eq("school_id", input.schoolId);
    return { ok: false, error: "failed" };
  }

  await audit(db, input, "evaluation.created", "evaluation", created.id, {
    goalkeeperId: input.goalkeeperId,
    type: input.data.type,
  });
  return { ok: true, evaluationId: created.id };
}

type Existing = {
  id: string;
  author_id: string | null;
  status: EvaluationStatus;
  published_at: string | null;
  notified_at: string | null;
  goalkeeper_id: string;
  rubric_version_id: string;
  date: string;
  type: EvaluationType;
  comment: string | null;
};

async function loadExisting(db: Db, schoolId: string, evaluationId: string) {
  const { data } = await db
    .from("evaluation")
    .select(
      "id, author_id, status, published_at, notified_at, goalkeeper_id, rubric_version_id, date, type, comment",
    )
    .eq("id", evaluationId)
    .eq("school_id", schoolId)
    .maybeSingle();
  return data as Existing | null;
}

/** La puede tocar quien la cargó y cualquier admin (RF-15); un borrador ajeno ni siquiera existe para un profesor. */
const canManage = (actor: Actor, row: Pick<Existing, "author_id">) =>
  actor.role === "school_admin" || row.author_id === actor.actorId;

function snapshotOf(
  row: Pick<Existing, "date" | "type" | "comment">,
  scores: { key: string; score: number | null; comment: string | null }[],
): EvaluationSnapshot {
  return {
    date: row.date,
    type: row.type,
    comment: row.comment,
    scores: Object.fromEntries(scores.map((s) => [s.key, { score: s.score, comment: s.comment }])),
  };
}

/**
 * Edita una evaluación y deja el registro de qué cambió (RF-15, RF-16, RN-01). El autor original
 * no cambia aunque edite un admin.
 */
export async function updateEvaluation(
  db: Db,
  input: Actor & { evaluationId: string; data: EvaluationInput },
): Promise<SaveResult> {
  const existing = await loadExisting(db, input.schoolId, input.evaluationId);
  if (!existing || !canManage(input, existing)) {
    // Un profesor ajeno no debe poder distinguir "no existe" de "no es tuya" cuando es un borrador.
    return {
      ok: false,
      error: existing && existing.status === "published" ? "forbidden" : "not_found",
    };
  }
  if (!(await validCategoryIds(db, input.data.scores, existing.rubric_version_id))) {
    return { ok: false, error: "invalid_category" };
  }

  const categories = await getCategoriesById(db);
  const keyOf = (categoryId: string) => categories.get(categoryId)?.key ?? categoryId;

  const { data: beforeScores } = await db
    .from("evaluation_score")
    .select("category_id, score, comment")
    .eq("school_id", input.schoolId)
    .eq("evaluation_id", input.evaluationId);
  const before = snapshotOf(
    existing,
    (beforeScores ?? []).map((s) => ({
      key: keyOf(s.category_id as string),
      score: s.score as number | null,
      comment: s.comment as string | null,
    })),
  );
  const after = snapshotOf(
    { date: input.data.date, type: input.data.type, comment: input.data.comment },
    input.data.scores
      .filter((s) => s.score !== null || s.comment !== null)
      .map((s) => ({ key: keyOf(s.categoryId), score: s.score, comment: s.comment })),
  );
  const diff = diffEvaluation(before, after);
  if (isEmptyDiff(diff)) return { ok: true, evaluationId: input.evaluationId };

  if (input.data.type === "entry" && existing.type !== "entry") {
    const { data: other } = await db
      .from("evaluation")
      .select("id")
      .eq("school_id", input.schoolId)
      .eq("goalkeeper_id", existing.goalkeeper_id)
      .eq("type", "entry")
      .neq("id", input.evaluationId)
      .limit(1);
    if (other?.length) return { ok: false, error: "entry_exists" };
  }

  const { error } = await db
    .from("evaluation")
    .update({ date: input.data.date, type: input.data.type, comment: input.data.comment })
    .eq("id", input.evaluationId)
    .eq("school_id", input.schoolId);
  if (error) {
    return { ok: false, error: error.code === PG_UNIQUE ? "entry_exists" : "failed" };
  }

  const keep = input.data.scores.filter((s) => s.score !== null || s.comment !== null);
  const dropped = [...(beforeScores ?? [])]
    .map((s) => s.category_id as string)
    .filter((id) => !keep.some((s) => s.categoryId === id));
  if (dropped.length > 0) {
    await db
      .from("evaluation_score")
      .delete()
      .eq("school_id", input.schoolId)
      .eq("evaluation_id", input.evaluationId)
      .in("category_id", dropped);
  }
  if (keep.length > 0) {
    const { error: upsertError } = await db
      .from("evaluation_score")
      .upsert(scoreRows(input.evaluationId, input.schoolId, keep), {
        onConflict: "evaluation_id,category_id",
      });
    if (upsertError) return { ok: false, error: "failed" };
  }

  await db.from("evaluation_revision").insert({
    school_id: input.schoolId,
    evaluation_id: input.evaluationId,
    edited_by: input.actorId,
    detail: diff,
  });
  await audit(db, input, "evaluation.updated", "evaluation", input.evaluationId);
  return { ok: true, evaluationId: input.evaluationId };
}

// ───────────────────────────── publicación ─────────────────────────────

export type NotifyResult = { sent: number; failed: number; withoutEmail: number };
export type PublishResult =
  | { ok: true; alreadyPublished: boolean; notify: NotifyResult | null }
  | { ok: false; error: "not_found" | "forbidden" | "failed" };

/**
 * Publica una evaluación (RF-12) y avisa por mail a los tutores con mail cargado (RF-13). El aviso
 * sale una sola vez: republicar no lo repite (spec 02, casos borde). Si el mail no se pudo mandar a
 * nadie, no se marca como avisada y un nuevo intento de publicar lo reintenta.
 */
export async function publishEvaluation(
  db: Db,
  input: Actor & {
    evaluationId: string;
    transport: EmailTransport;
    school: { name: string; slug: string; primaryColor?: string | null };
  },
): Promise<PublishResult> {
  const existing = await loadExisting(db, input.schoolId, input.evaluationId);
  if (!existing) return { ok: false, error: "not_found" };
  if (!canManage(input, existing)) {
    return { ok: false, error: existing.status === "published" ? "forbidden" : "not_found" };
  }

  const alreadyPublished = existing.status === "published";
  if (!alreadyPublished) {
    const { error } = await db
      .from("evaluation")
      .update({ status: "published", published_at: new Date().toISOString() })
      .eq("id", input.evaluationId)
      .eq("school_id", input.schoolId);
    if (error) return { ok: false, error: "failed" };
    await audit(db, input, "evaluation.published", "evaluation", input.evaluationId, {
      goalkeeperId: existing.goalkeeper_id,
    });
  }

  const notify = existing.notified_at ? null : await notifyFamily(db, input, existing);
  return { ok: true, alreadyPublished, notify };
}

async function notifyFamily(
  db: Db,
  input: Parameters<typeof publishEvaluation>[1],
  existing: Existing,
): Promise<NotifyResult> {
  const [{ data: goalkeeper }, { data: links }] = await Promise.all([
    db
      .from("goalkeeper")
      .select("first_name")
      .eq("id", existing.goalkeeper_id)
      .eq("school_id", input.schoolId)
      .maybeSingle(),
    db
      .from("goalkeeper_guardian")
      .select("guardian(email)")
      .eq("school_id", input.schoolId)
      .eq("goalkeeper_id", existing.goalkeeper_id),
  ]);

  const emails = [
    ...new Set(
      (links ?? [])
        .map((l) => (l.guardian as unknown as { email: string | null } | null)?.email)
        .filter((email): email is string => Boolean(email)),
    ),
  ];
  const result: NotifyResult = {
    sent: 0,
    failed: 0,
    withoutEmail: (links ?? []).length - emails.length,
  };

  const link = `${getAppUrl()}/${input.school.slug}/familia/${existing.goalkeeper_id}/evolucion`;
  for (const to of emails) {
    const sent = await input.transport(
      evaluationPublishedEmail({
        to,
        schoolName: input.school.name,
        goalkeeperName: goalkeeper?.first_name ?? "tu arquero",
        link,
        accentColor: input.school.primaryColor,
      }),
    );
    if (sent.ok) result.sent += 1;
    else result.failed += 1;
  }

  // Sin destinatarios no hay nada que reintentar; con destinatarios, solo si al menos uno recibió el aviso.
  if (emails.length === 0 || result.sent > 0) {
    await db
      .from("evaluation")
      .update({ notified_at: new Date().toISOString() })
      .eq("id", existing.id)
      .eq("school_id", input.schoolId);
  }
  return result;
}

/** Vuelve la evaluación a borrador (RF-14). El mail ya enviado no se retira. */
export async function unpublishEvaluation(
  db: Db,
  input: Actor & { evaluationId: string },
): Promise<{ ok: true } | { ok: false; error: "not_found" | "forbidden" | "failed" }> {
  const existing = await loadExisting(db, input.schoolId, input.evaluationId);
  if (!existing) return { ok: false, error: "not_found" };
  if (!canManage(input, existing)) return { ok: false, error: "forbidden" };
  if (existing.status === "draft") return { ok: true };

  const { error } = await db
    .from("evaluation")
    .update({ status: "draft", published_at: null })
    .eq("id", input.evaluationId)
    .eq("school_id", input.schoolId);
  if (error) return { ok: false, error: "failed" };
  await audit(db, input, "evaluation.unpublished", "evaluation", input.evaluationId);
  return { ok: true };
}

/** Solo el admin borra evaluaciones (RF-17). */
export async function deleteEvaluation(
  db: Db,
  input: Actor & { evaluationId: string },
): Promise<{ ok: true } | { ok: false; error: "not_found" | "forbidden" | "failed" }> {
  if (input.role !== "school_admin") return { ok: false, error: "forbidden" };
  const { data, error } = await db
    .from("evaluation")
    .delete()
    .eq("id", input.evaluationId)
    .eq("school_id", input.schoolId)
    .select("id, goalkeeper_id, date, type");
  if (error) return { ok: false, error: "failed" };
  if (!data?.length) return { ok: false, error: "not_found" };
  await audit(db, input, "evaluation.deleted", "evaluation", input.evaluationId, {
    goalkeeperId: data[0].goalkeeper_id,
    date: data[0].date,
    type: data[0].type,
  });
  return { ok: true };
}

// ───────────────────────────── notas ─────────────────────────────

export type NoteView = {
  id: string;
  body: string;
  visibleToFamily: boolean;
  authorName: string | null;
  createdAt: string;
};

export async function listNotes(
  db: Db,
  schoolId: string,
  goalkeeperId: string,
): Promise<NoteView[]> {
  const { data } = await db
    .from("note")
    .select("id, author_id, body, visible_to_family, created_at")
    .eq("school_id", schoolId)
    .eq("goalkeeper_id", goalkeeperId)
    .order("created_at", { ascending: false });
  const rows = data ?? [];
  const names = await staffNames(
    db,
    schoolId,
    rows.map((r) => r.author_id as string | null),
  );
  return rows.map((r) => ({
    id: r.id as string,
    body: r.body as string,
    visibleToFamily: r.visible_to_family as boolean,
    authorName: r.author_id ? (names.get(r.author_id as string) ?? null) : null,
    createdAt: r.created_at as string,
  }));
}

/** Nota rápida sobre un arquero activo (RF-18 y RF-19). Interna salvo que se marque como visible. */
export async function addNote(
  db: Db,
  input: Actor & { goalkeeperId: string; data: NoteInput },
): Promise<
  { ok: true; noteId: string } | { ok: false; error: "not_found" | "not_active" | "failed" }
> {
  const { data: goalkeeper } = await db
    .from("goalkeeper")
    .select("status")
    .eq("id", input.goalkeeperId)
    .eq("school_id", input.schoolId)
    .maybeSingle();
  if (!goalkeeper) return { ok: false, error: "not_found" };
  if (goalkeeper.status !== "active") return { ok: false, error: "not_active" };

  const { data, error } = await db
    .from("note")
    .insert({
      school_id: input.schoolId,
      goalkeeper_id: input.goalkeeperId,
      author_id: input.actorId,
      body: input.data.body,
      visible_to_family: input.data.visibleToFamily,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "failed" };
  await audit(db, input, "note.created", "note", data.id, {
    goalkeeperId: input.goalkeeperId,
    visibleToFamily: input.data.visibleToFamily,
  });
  return { ok: true, noteId: data.id };
}

// ───────────────────────────── pendientes ─────────────────────────────

/** Fecha de la última evaluación publicada de cada arquero de la escuela (RF-26). */
export async function lastPublishedDates(
  db: Db,
  schoolId: string,
  goalkeeperIds?: string[],
): Promise<Map<string, string>> {
  let query = db
    .from("evaluation")
    .select("goalkeeper_id, date")
    .eq("school_id", schoolId)
    .eq("status", "published");
  if (goalkeeperIds) query = query.in("goalkeeper_id", goalkeeperIds);
  const { data } = await query;

  const last = new Map<string, string>();
  for (const row of data ?? []) {
    const id = row.goalkeeper_id as string;
    const date = row.date as string;
    if (!last.has(id) || date > (last.get(id) as string)) last.set(id, date);
  }
  return last;
}

export type PendingGoalkeeper = {
  id: string;
  firstName: string;
  lastName: string;
  /** Última evaluación publicada, o null si nunca tuvo. */
  lastEvaluationDate: string | null;
};

/** Arqueros activos con evaluación pendiente: más de 90 días desde la última publicada, o ninguna (RF-26 y RF-27). */
export async function listPendingGoalkeepers(
  db: Db,
  schoolId: string,
  today: string,
): Promise<PendingGoalkeeper[]> {
  const [{ data: goalkeepers }, last] = await Promise.all([
    db
      .from("goalkeeper")
      .select("id, first_name, last_name")
      .eq("school_id", schoolId)
      .eq("status", "active"),
    lastPublishedDates(db, schoolId),
  ]);

  return (goalkeepers ?? [])
    .map((g) => ({
      id: g.id as string,
      firstName: g.first_name as string,
      lastName: g.last_name as string,
      lastEvaluationDate: last.get(g.id as string) ?? null,
    }))
    .filter((g) => isEvaluationPending(g.lastEvaluationDate, today))
    .sort(
      (a, b) =>
        // Los que nunca fueron evaluados primero; después, los de evaluación más vieja.
        (a.lastEvaluationDate ?? "").localeCompare(b.lastEvaluationDate ?? "") ||
        a.lastName.localeCompare(b.lastName, "es"),
    );
}
