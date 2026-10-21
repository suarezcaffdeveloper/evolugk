"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fieldErrorsFrom, type FieldErrors } from "@/lib/auth-schemas";
import { argentinaDate } from "@/lib/dates";
import { makeEvaluationSchema, noteSchema } from "@/lib/evaluation-schemas";
import { requireStaff, type StaffSession } from "@/server/auth/guards";
import { createConfiguredTransport } from "@/server/email/transport";
import {
  addNote,
  createEvaluation,
  deleteEvaluation,
  publishEvaluation,
  unpublishEvaluation,
  updateEvaluation,
  type Actor,
  type NotifyResult,
  type SaveError,
} from "@/server/evaluations";
import { createServiceClient } from "@/server/supabase";

/**
 * Cada acción vuelve a verificar, en el servidor y en vivo, la sesión y el rol (profesores y admin
 * cargan; solo el admin borra). Los permisos finos, como "solo el autor edita", los aplica la capa
 * de servidor de evaluaciones.
 */

const text = (formData: FormData, key: string): string => {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
};

const actorOf = (session: StaffSession): Actor => ({
  schoolId: session.school.id,
  actorId: session.user.id,
  role: session.role,
});

const base = (slug: string, goalkeeperId: string) => `/${slug}/panel/arqueros/${goalkeeperId}`;

function refresh(slug: string, goalkeeperId: string) {
  revalidatePath(`/${slug}/panel/arqueros`);
  revalidatePath(base(slug, goalkeeperId));
  revalidatePath(`/${slug}/panel`);
}

const ERRORS: Record<SaveError | "not_active_note", string> = {
  not_found: "No encontramos la evaluación.",
  not_active: "Solo se puede evaluar a arqueros activos.",
  forbidden: "Solo quien cargó la evaluación o un administrador pueden modificarla.",
  entry_exists: "Este arquero ya tiene una evaluación de ingreso.",
  invalid_category: "Alguna categoría ya no está disponible. Recargá la página e intentá de nuevo.",
  failed: "No pudimos guardar los cambios. Intentá de nuevo.",
  not_active_note: "Solo se puede escribir notas sobre arqueros activos.",
};

/** Qué pasó con el mail a la familia, para mostrarlo en la pantalla de la evaluación. */
function publishedQuery(notify: NotifyResult | null): string {
  return notify
    ? `?publicada=1&enviados=${notify.sent}&fallidos=${notify.failed}&sinmail=${notify.withoutEmail}`
    : "?publicada=1";
}

// ───────────────────────────── guardar ─────────────────────────────

export type EvaluationFormState = {
  errors?: FieldErrors;
  error?: string;
  /** Lo que se escribió, para volver a mostrarlo si hay errores. */
  values?: Record<string, string>;
};

function valuesOf(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && !key.startsWith("$ACTION")) out[key] = value;
  }
  return out;
}

/** Puntajes y comentarios por categoría: los campos se llaman `score-<id>` y `comment-<id>`. */
function scoresOf(formData: FormData) {
  const ids = new Set<string>();
  for (const key of formData.keys()) {
    const match = /^(?:score|comment)-(.+)$/.exec(key);
    if (match) ids.add(match[1]);
  }
  return [...ids].map((categoryId) => ({
    categoryId,
    score: text(formData, `score-${categoryId}`),
    comment: text(formData, `comment-${categoryId}`),
  }));
}

/**
 * Crea o edita una evaluación. `intent`: "draft" guarda como borrador, "publish" guarda y
 * publica, "save" guarda los cambios de una ya existente sin cambiar su estado.
 */
export async function saveEvaluationAction(
  slug: string,
  goalkeeperId: string,
  evaluationId: string | null,
  _previous: EvaluationFormState,
  formData: FormData,
): Promise<EvaluationFormState> {
  const session = await requireStaff(slug);
  const values = valuesOf(formData);
  const intent = text(formData, "intent");

  const parsed = makeEvaluationSchema(argentinaDate(new Date())).safeParse({
    date: text(formData, "date"),
    type: text(formData, "type"),
    comment: text(formData, "comment"),
    scores: scoresOf(formData),
  });
  if (!parsed.success) return { errors: fieldErrorsFrom(parsed.error), values };

  const db = createServiceClient();
  const actor = actorOf(session);
  const saved = evaluationId
    ? await updateEvaluation(db, { ...actor, evaluationId, data: parsed.data })
    : await createEvaluation(db, { ...actor, goalkeeperId, data: parsed.data });
  if (!saved.ok) {
    return saved.error === "entry_exists"
      ? { errors: { type: ERRORS.entry_exists }, values }
      : { error: ERRORS[saved.error], values };
  }

  let query = "";
  if (intent === "publish") {
    const published = await publishEvaluation(db, {
      ...actor,
      evaluationId: saved.evaluationId,
      transport: createConfiguredTransport(),
      school: { name: session.school.name, slug: session.school.slug },
    });
    if (!published.ok) return { error: ERRORS[published.error], values };
    query = publishedQuery(published.notify);
  }

  refresh(session.school.slug, goalkeeperId);
  redirect(`${base(session.school.slug, goalkeeperId)}/evaluaciones/${saved.evaluationId}${query}`);
}

// ───────────────────────────── publicar, despublicar, borrar ─────────────────────────────

export type EvaluationActionState = { error?: string };

export async function publishAction(
  slug: string,
  goalkeeperId: string,
  evaluationId: string,
  _previous: EvaluationActionState,
): Promise<EvaluationActionState> {
  const session = await requireStaff(slug);
  const result = await publishEvaluation(createServiceClient(), {
    ...actorOf(session),
    evaluationId,
    transport: createConfiguredTransport(),
    school: { name: session.school.name, slug: session.school.slug },
  });
  if (!result.ok) return { error: ERRORS[result.error] };

  refresh(session.school.slug, goalkeeperId);
  redirect(
    `${base(session.school.slug, goalkeeperId)}/evaluaciones/${evaluationId}${publishedQuery(result.notify)}`,
  );
}

export async function unpublishAction(
  slug: string,
  goalkeeperId: string,
  evaluationId: string,
  _previous: EvaluationActionState,
): Promise<EvaluationActionState> {
  const session = await requireStaff(slug);
  const result = await unpublishEvaluation(createServiceClient(), {
    ...actorOf(session),
    evaluationId,
  });
  if (!result.ok) return { error: ERRORS[result.error] };

  refresh(session.school.slug, goalkeeperId);
  redirect(
    `${base(session.school.slug, goalkeeperId)}/evaluaciones/${evaluationId}?despublicada=1`,
  );
}

export async function deleteEvaluationAction(
  slug: string,
  goalkeeperId: string,
  evaluationId: string,
  _previous: EvaluationActionState,
): Promise<EvaluationActionState> {
  const session = await requireStaff(slug);
  const result = await deleteEvaluation(createServiceClient(), {
    ...actorOf(session),
    evaluationId,
  });
  if (!result.ok) return { error: ERRORS[result.error] };

  refresh(session.school.slug, goalkeeperId);
  redirect(`${base(session.school.slug, goalkeeperId)}?evaluacion=borrada`);
}

// ───────────────────────────── notas ─────────────────────────────

export type NoteFormState = { error?: string; errors?: FieldErrors; ok?: boolean };

export async function addNoteAction(
  slug: string,
  goalkeeperId: string,
  _previous: NoteFormState,
  formData: FormData,
): Promise<NoteFormState> {
  const session = await requireStaff(slug);
  const parsed = noteSchema.safeParse({
    body: text(formData, "body"),
    visibleToFamily: text(formData, "visibleToFamily") === "on",
  });
  if (!parsed.success) return { errors: fieldErrorsFrom(parsed.error) };

  const result = await addNote(createServiceClient(), {
    ...actorOf(session),
    goalkeeperId,
    data: parsed.data,
  });
  if (!result.ok) {
    return {
      error: result.error === "not_active" ? ERRORS.not_active_note : ERRORS[result.error],
    };
  }
  refresh(session.school.slug, goalkeeperId);
  return { ok: true };
}
