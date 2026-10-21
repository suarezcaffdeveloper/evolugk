/**
 * Evaluaciones, rúbrica, notas y novedades (spec 02: CA-01 a CA-11; spec 04: CA-06, CA-09, CA-12).
 * Corre contra el proyecto de desarrollo: `pnpm test:db`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeEvaluationSchema, type EvaluationInput } from "@/lib/evaluation-schemas";
import { comparison, currentEvaluation, radarValues } from "@/lib/evolution";
import {
  addNote,
  createEvaluation,
  deleteEvaluation,
  getCurrentRubric,
  getEvaluation,
  listEvaluations,
  listPendingGoalkeepers,
  publishEvaluation,
  unpublishEvaluation,
  updateEvaluation,
  type Actor,
  type RubricCategory,
} from "@/server/evaluations";
import type { EmailMessage, EmailTransport } from "@/server/email/transport";
import type { GuardianSession } from "@/server/guardian/access";
import { getFamilyEvaluation, getFamilyEvolution, markSeen } from "@/server/guardian/evaluations";
import {
  cleanup,
  createAdminClient,
  createAnonClient,
  createSchool,
  createStaff,
  purgeLeftovers,
  signIn,
  type TestSchool,
} from "./db";

const PERMISSION_DENIED = "42501";
const FOREIGN_KEY_VIOLATION = "23503";
const CHECK_VIOLATION = "23514";

const admin = createAdminClient();
const created = { schoolIds: [] as string[], userIds: [] as string[] };
const TODAY = "2026-10-21";
const schema = makeEvaluationSchema(TODAY);

let school: TestSchool;
let other: TestSchool;
let adminActor: Actor;
let coachActor: Actor;
let coach2Actor: Actor;
let otherAdminActor: Actor;
let categories: RubricCategory[];
let goalkeeperId: string;
let otherGoalkeeperId: string;
let strangerGuardian: GuardianSession;

let adminClient: SupabaseClient;
let coachClient: SupabaseClient;
let coach2Client: SupabaseClient;
let otherAdminClient: SupabaseClient;

const sentMails: EmailMessage[] = [];
const transport: EmailTransport = async (message) => {
  sentMails.push(message);
  return { ok: true, id: "test" };
};
const failingTransport: EmailTransport = async () => ({ ok: false, reason: "not_configured" });
const schoolBrand = () => ({ name: "Escuela de prueba", slug: school.slug });

function must<T>(
  result: { data: T; error: { message: string } | null },
  what: string,
): NonNullable<T> {
  if (result.error || result.data == null) {
    throw new Error(`No se pudo crear ${what}: ${result.error?.message}`);
  }
  return result.data as NonNullable<T>;
}

async function newGoalkeeper(
  target: TestSchool,
  label: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  return must(
    await admin
      .from("goalkeeper")
      .insert({
        school_id: target.id,
        first_name: label,
        last_name: "Evaluado",
        birth_date: "2012-05-01",
        joined_on: "2024-03-01",
        ...overrides,
      })
      .select("id")
      .single(),
    "el arquero",
  ).id;
}

async function newGuardian(
  target: TestSchool,
  goalkeeper: string,
  label: string,
  email: string | null,
): Promise<GuardianSession> {
  const guardianRow = must(
    await admin
      .from("guardian")
      .insert({
        school_id: target.id,
        first_name: label,
        last_name: "Tutor",
        phone: "1155551111",
        email,
        access_code: Math.random().toString(36).slice(2, 10).toUpperCase().padEnd(8, "A"),
        pin_hash: "scrypt$x",
      })
      .select("id")
      .single(),
    "el tutor",
  );
  must(
    await admin
      .from("goalkeeper_guardian")
      .insert({
        school_id: target.id,
        goalkeeper_id: goalkeeper,
        guardian_id: guardianRow.id,
        relationship: "mother",
      })
      .select("guardian_id")
      .single(),
    "el vínculo",
  );
  return {
    guardianId: guardianRow.id,
    schoolId: target.id,
    schoolSlug: target.slug,
  } as GuardianSession;
}

/** Una evaluación válida; `scores` indica el puntaje por clave de categoría (las demás quedan omitidas). */
function input(
  scores: Record<string, number>,
  overrides: Partial<{ date: string; type: string; comment: string }> = {},
): EvaluationInput {
  return schema.parse({
    date: "2026-10-10",
    type: "periodic",
    comment: "",
    scores: categories.map((c) => ({ categoryId: c.id, score: scores[c.key] ?? "" })),
    ...overrides,
  });
}

async function createDraft(
  actor: Actor,
  target: string,
  data: EvaluationInput = input({ save_technique: 6, reflexes: 8 }),
): Promise<string> {
  const result = await createEvaluation(admin, { ...actor, goalkeeperId: target, data });
  if (!result.ok) throw new Error(`No se pudo crear la evaluación: ${result.error}`);
  return result.evaluationId;
}

async function publish(actor: Actor, evaluationId: string, t: EmailTransport = transport) {
  const result = await publishEvaluation(admin, {
    ...actor,
    evaluationId,
    transport: t,
    school: schoolBrand(),
  });
  if (!result.ok) throw new Error(`No se pudo publicar: ${result.error}`);
  return result;
}

beforeAll(async () => {
  await purgeLeftovers(admin);
  school = await createSchool(admin, "eval-a");
  other = await createSchool(admin, "eval-b");
  created.schoolIds.push(school.id, other.id);

  const adminUser = await createStaff(admin, school, "school_admin", "adminA");
  const coachUser = await createStaff(admin, school, "coach", "coachA");
  const coach2User = await createStaff(admin, school, "coach", "coachA2");
  const otherAdminUser = await createStaff(admin, other, "school_admin", "adminB");
  created.userIds.push(adminUser.id, coachUser.id, coach2User.id, otherAdminUser.id);

  adminActor = { schoolId: school.id, actorId: adminUser.id, role: "school_admin" };
  coachActor = { schoolId: school.id, actorId: coachUser.id, role: "coach" };
  coach2Actor = { schoolId: school.id, actorId: coach2User.id, role: "coach" };
  otherAdminActor = { schoolId: other.id, actorId: otherAdminUser.id, role: "school_admin" };

  categories = (await getCurrentRubric(admin)).categories;

  goalkeeperId = await newGoalkeeper(school, "Mateo");
  otherGoalkeeperId = await newGoalkeeper(other, "Bruno");
  const stranger = await newGoalkeeper(school, "Ajeno");
  strangerGuardian = await newGuardian(school, stranger, "Otra", null);

  [adminClient, coachClient, coach2Client, otherAdminClient] = await Promise.all([
    signIn(adminUser),
    signIn(coachUser),
    signIn(coach2User),
    signIn(otherAdminUser),
  ]);
});

afterAll(async () => {
  await cleanup(admin, created);
});

describe("rúbrica", () => {
  it("tiene las 8 categorías con guías, en orden", () => {
    expect(categories.map((c) => c.key)).toEqual([
      "save_technique",
      "aerial_play",
      "footwork",
      "positioning",
      "reflexes",
      "communication",
      "physical_coordination",
      "mindset",
    ]);
    for (const c of categories) {
      expect(c.guideLow && c.guideMid && c.guideHigh).toBeTruthy();
    }
  });

  it("los clientes con sesión pueden leerla pero no modificarla (RF-04)", async () => {
    const read = await coachClient.from("rubric_category").select("id");
    expect(read.data).toHaveLength(8);

    const write = await adminClient
      .from("rubric_category")
      .update({ name: "Otra" })
      .eq("id", categories[0].id);
    expect(write.error?.code).toBe(PERMISSION_DENIED);
    const anon = await createAnonClient().from("rubric_category").select("id");
    expect(anon.data ?? []).toHaveLength(0);
  });
});

describe("crear, borrador y visibilidad", () => {
  it("una evaluación nueva queda en borrador (RF-11)", async () => {
    const id = await createDraft(coachActor, goalkeeperId);
    const detail = await getEvaluation(admin, school.id, id, {
      userId: coachActor.actorId,
      role: "coach",
    });
    expect(detail?.status).toBe("draft");
    expect(detail?.publishedAt).toBeNull();
    expect(detail?.scores.map((s) => [s.key, s.score])).toEqual([
      ["save_technique", 6],
      ["reflexes", 8],
    ]);
  });

  it("el borrador lo ven su autor y el admin, no otro profesor (RF-11 y RF-25)", async () => {
    const id = await createDraft(coachActor, goalkeeperId);
    const asCoach2 = { userId: coach2Actor.actorId, role: "coach" as const };
    const asAdmin = { userId: adminActor.actorId, role: "school_admin" as const };

    expect(await getEvaluation(admin, school.id, id, asCoach2)).toBeNull();
    expect(await getEvaluation(admin, school.id, id, asAdmin)).not.toBeNull();
    const listed = await listEvaluations(admin, school.id, goalkeeperId, asCoach2);
    expect(listed.some((e) => e.id === id)).toBe(false);

    // Lo mismo desde la base, con la sesión del profesor (RLS).
    const rls = await coach2Client.from("evaluation").select("id").eq("id", id);
    expect(rls.data).toEqual([]);
    const rlsScores = await coach2Client
      .from("evaluation_score")
      .select("category_id")
      .eq("evaluation_id", id);
    expect(rlsScores.data).toEqual([]);
    expect((await coachClient.from("evaluation").select("id").eq("id", id)).data).toHaveLength(1);
    expect((await adminClient.from("evaluation").select("id").eq("id", id)).data).toHaveLength(1);
  });

  it("la familia no ve el borrador (CA-01)", async () => {
    const gk = await newGoalkeeper(school, "Borrador");
    const tutor = await newGuardian(school, gk, "Tutora", null);
    await createDraft(coachActor, gk);
    const evolution = await getFamilyEvolution(admin, tutor, gk);
    expect(evolution.evaluations).toEqual([]);
    expect(evolution.newCount).toBe(0);
  });

  it("no se evalúa a un arquero inactivo (CA-09)", async () => {
    const gk = await newGoalkeeper(school, "Inactivo", { status: "inactive" });
    const result = await createEvaluation(admin, {
      ...coachActor,
      goalkeeperId: gk,
      data: input({ save_technique: 5 }),
    });
    expect(result).toEqual({ ok: false, error: "not_active" });

    // La base también lo impide aunque falle el código.
    const direct = await admin.from("evaluation").insert({
      school_id: school.id,
      goalkeeper_id: gk,
      rubric_version_id: categories[0].versionId,
      date: "2026-10-01",
      type: "periodic",
    });
    expect(direct.error?.code).toBe(CHECK_VIOLATION);
  });

  it("no se evalúa a un arquero de otra escuela", async () => {
    const result = await createEvaluation(admin, {
      ...coachActor,
      goalkeeperId: otherGoalkeeperId,
      data: input({ save_technique: 5 }),
    });
    expect(result).toEqual({ ok: false, error: "not_found" });
  });

  it("rechaza categorías que no son de la rúbrica", async () => {
    const data = input({ save_technique: 5 });
    data.scores.push({
      categoryId: "99999999-9999-4999-8999-999999999999",
      score: 4,
      comment: null,
    });
    const result = await createEvaluation(admin, { ...coachActor, goalkeeperId, data });
    expect(result).toEqual({ ok: false, error: "invalid_category" });
  });

  it("la fecha futura se rechaza también en la base (RN-07)", async () => {
    const { error } = await admin.from("evaluation").insert({
      school_id: school.id,
      goalkeeper_id: goalkeeperId,
      rubric_version_id: categories[0].versionId,
      date: "2099-01-01",
      type: "periodic",
    });
    expect(error?.code).toBe(CHECK_VIOLATION);
  });
});

describe("evaluación de ingreso única (CA-05)", () => {
  it("rechaza una segunda de ingreso", async () => {
    const gk = await newGoalkeeper(school, "Ingreso");
    const first = await createEvaluation(admin, {
      ...coachActor,
      goalkeeperId: gk,
      data: input({ save_technique: 4 }, { type: "entry" }),
    });
    expect(first.ok).toBe(true);
    const second = await createEvaluation(admin, {
      ...coach2Actor,
      goalkeeperId: gk,
      data: input({ save_technique: 5 }, { type: "entry" }),
    });
    expect(second).toEqual({ ok: false, error: "entry_exists" });

    // Y la base lo garantiza aunque se saltee el código.
    const direct = await admin.from("evaluation").insert({
      school_id: school.id,
      goalkeeper_id: gk,
      rubric_version_id: categories[0].versionId,
      date: "2026-10-01",
      type: "entry",
    });
    expect(direct.error?.code).toBe("23505");
  });

  it("no se puede convertir otra evaluación en una segunda de ingreso", async () => {
    const gk = await newGoalkeeper(school, "Ingreso2");
    await createDraft(coachActor, gk, input({ save_technique: 4 }, { type: "entry" }));
    const periodic = await createDraft(coachActor, gk);
    const result = await updateEvaluation(admin, {
      ...coachActor,
      evaluationId: periodic,
      data: input({ save_technique: 6, reflexes: 8 }, { type: "entry" }),
    });
    expect(result).toEqual({ ok: false, error: "entry_exists" });
  });
});

describe("edición y registro de cambios (CA-07 y CA-08)", () => {
  it("un profesor que no es el autor no puede editar una evaluación publicada", async () => {
    const id = await createDraft(coachActor, goalkeeperId);
    await publish(coachActor, id);
    const result = await updateEvaluation(admin, {
      ...coach2Actor,
      evaluationId: id,
      data: input({ save_technique: 9 }),
    });
    expect(result).toEqual({ ok: false, error: "forbidden" });
  });

  it("un borrador ajeno responde como si no existiera", async () => {
    const id = await createDraft(coachActor, goalkeeperId);
    const result = await updateEvaluation(admin, {
      ...coach2Actor,
      evaluationId: id,
      data: input({ save_technique: 9 }),
    });
    expect(result).toEqual({ ok: false, error: "not_found" });
  });

  it("el autor y el admin editan, y queda quién, cuándo y qué cambió; el autor no cambia (RN-01)", async () => {
    const id = await createDraft(
      coachActor,
      goalkeeperId,
      input({ save_technique: 6, reflexes: 8 }),
    );

    const byAuthor = await updateEvaluation(admin, {
      ...coachActor,
      evaluationId: id,
      data: input({ save_technique: 7, reflexes: 8 }, { comment: "Mejoró" }),
    });
    expect(byAuthor.ok).toBe(true);
    const byAdmin = await updateEvaluation(admin, {
      ...adminActor,
      evaluationId: id,
      data: input({ save_technique: 7 }),
    });
    expect(byAdmin.ok).toBe(true);

    const detail = await getEvaluation(admin, school.id, id, {
      userId: adminActor.actorId,
      role: "school_admin",
    });
    expect(detail?.authorId).toBe(coachActor.actorId);
    expect(detail?.scores.map((s) => [s.key, s.score])).toEqual([["save_technique", 7]]);
    expect(detail?.revisions).toHaveLength(2);
    // La más reciente primero: el admin quitó "reflejos".
    expect(detail?.revisions[0].detail.scores?.reflexes?.score).toEqual({ from: 8, to: null });
    expect(detail?.revisions[0].editorName).toContain("adminA");
    expect(detail?.revisions[1].detail.scores?.save_technique?.score).toEqual({ from: 6, to: 7 });
    expect(detail?.revisions[1].detail.comment).toEqual({ from: null, to: "Mejoró" });
    expect(detail?.revisions[1].editedAt).toBeTruthy();
  });

  it("guardar sin cambios no agrega registros", async () => {
    const id = await createDraft(coachActor, goalkeeperId);
    await updateEvaluation(admin, {
      ...coachActor,
      evaluationId: id,
      data: input({ save_technique: 6, reflexes: 8 }),
    });
    const detail = await getEvaluation(admin, school.id, id, {
      userId: coachActor.actorId,
      role: "coach",
    });
    expect(detail?.revisions).toHaveLength(0);
  });

  it("no se edita una evaluación de otra escuela", async () => {
    const id = await createDraft(coachActor, goalkeeperId);
    const result = await updateEvaluation(admin, {
      ...otherAdminActor,
      evaluationId: id,
      data: input({ save_technique: 9 }),
    });
    expect(result).toEqual({ ok: false, error: "not_found" });
  });
});

describe("publicar y avisar (CA-02)", () => {
  it("publica, manda el mail a los tutores con mail y no lo repite al republicar", async () => {
    const gk = await newGoalkeeper(school, "Mail");
    const withMail = await newGuardian(school, gk, "ConMail", "familia@example.com");
    void withMail;
    await newGuardian(school, gk, "SinMail", null);
    const id = await createDraft(coachActor, gk);
    sentMails.length = 0;

    const first = await publish(coachActor, id);
    expect(first.notify).toEqual({ sent: 1, failed: 0, withoutEmail: 1 });
    expect(sentMails).toHaveLength(1);
    expect(sentMails[0].to).toBe("familia@example.com");
    expect(sentMails[0].text).toContain(`/${school.slug}/familia/${gk}/evolucion`);

    await unpublishEvaluation(admin, { ...coachActor, evaluationId: id });
    const again = await publish(coachActor, id);
    expect(again.notify).toBeNull();
    expect(sentMails).toHaveLength(1);
  });

  it("si el mail no sale, no se da por avisada y un nuevo intento lo reenvía", async () => {
    const gk = await newGoalkeeper(school, "MailFalla");
    await newGuardian(school, gk, "Tutor", "falla@example.com");
    const id = await createDraft(coachActor, gk);

    const first = await publish(coachActor, id, failingTransport);
    expect(first.notify).toEqual({ sent: 0, failed: 1, withoutEmail: 0 });
    sentMails.length = 0;
    const retry = await publish(coachActor, id, transport);
    expect(retry.alreadyPublished).toBe(true);
    expect(retry.notify?.sent).toBe(1);
  });

  it("sin ningún mail cargado no hay aviso, pero se publica", async () => {
    const gk = await newGoalkeeper(school, "SinMails");
    await newGuardian(school, gk, "Tutor", null);
    const id = await createDraft(coachActor, gk);
    sentMails.length = 0;
    const result = await publish(coachActor, id);
    expect(result.notify).toEqual({ sent: 0, failed: 0, withoutEmail: 1 });
    expect(sentMails).toHaveLength(0);
  });

  it("la familia ve puntajes y comentarios de lo publicado, y no el contacto ni el autor interno", async () => {
    const gk = await newGoalkeeper(school, "Publicada");
    const tutor = await newGuardian(school, gk, "Tutora", null);
    const id = await createDraft(
      coachActor,
      gk,
      input({ save_technique: 7, reflexes: 9 }, { comment: "Gran mes" }),
    );
    await publish(coachActor, id);

    const evolution = await getFamilyEvolution(admin, tutor, gk);
    expect(evolution.evaluations).toHaveLength(1);
    expect(evolution.evaluations[0].comment).toBe("Gran mes");
    expect(evolution.evaluations[0].isNew).toBe(true);
    expect(evolution.newCount).toBe(1);
    expect(JSON.stringify(evolution)).not.toContain(coachActor.actorId);

    // Un tutor de otro arquero de la misma escuela no accede por el id (CA-12 / RN-01).
    expect(await getFamilyEvaluation(admin, strangerGuardian, goalkeeperId, id)).toBeNull();
    expect(await getFamilyEvaluation(admin, tutor, gk, id)).not.toBeNull();
  });

  it("despublicar vuelve a borrador y la familia deja de verla (RF-14)", async () => {
    const gk = await newGoalkeeper(school, "Despublicada");
    const tutor = await newGuardian(school, gk, "Tutora", null);
    const id = await createDraft(coachActor, gk);
    await publish(coachActor, id);
    expect((await getFamilyEvolution(admin, tutor, gk)).evaluations).toHaveLength(1);

    expect(await unpublishEvaluation(admin, { ...coachActor, evaluationId: id })).toEqual({
      ok: true,
    });
    expect((await getFamilyEvolution(admin, tutor, gk)).evaluations).toHaveLength(0);
    expect(await getFamilyEvaluation(admin, tutor, gk, id)).toBeNull();
  });

  it("solo el autor o un admin publican o despublican", async () => {
    const id = await createDraft(coachActor, goalkeeperId);
    const published = await publishEvaluation(admin, {
      ...coach2Actor,
      evaluationId: id,
      transport,
      school: schoolBrand(),
    });
    expect(published).toEqual({ ok: false, error: "not_found" });

    await publish(coachActor, id);
    expect(await unpublishEvaluation(admin, { ...coach2Actor, evaluationId: id })).toEqual({
      ok: false,
      error: "forbidden",
    });
  });
});

describe("evolución para la familia (CA-03, CA-04, CA-11)", () => {
  it("la categoría omitida queda sin evaluar y el radar usa la de fecha más reciente", async () => {
    const gk = await newGoalkeeper(school, "Evolución");
    const tutor = await newGuardian(school, gk, "Tutora", null);

    const entry = await createDraft(
      coachActor,
      gk,
      input({ save_technique: 4, reflexes: 5 }, { type: "entry", date: "2026-01-10" }),
    );
    // Dos profesores evalúan en el mismo mes: se conservan ambas (CA-11).
    const june1 = await createDraft(
      coachActor,
      gk,
      input({ save_technique: 6, reflexes: 7 }, { date: "2026-06-05" }),
    );
    const june2 = await createDraft(
      coach2Actor,
      gk,
      input({ save_technique: 8 }, { date: "2026-06-20" }),
    );
    for (const [actor, id] of [
      [coachActor, entry],
      [coachActor, june1],
      [coach2Actor, june2],
    ] as const) {
      await publish(actor, id);
    }

    const evolution = await getFamilyEvolution(admin, tutor, gk);
    expect(evolution.evaluations).toHaveLength(3);

    const series = evolution.evaluations.map((e) => ({
      id: e.id,
      date: e.date,
      createdAt: e.createdAt,
      type: e.type,
      scores: Object.fromEntries(e.scores.map((s) => [s.key, s.score])),
    }));
    const current = currentEvaluation(series);
    expect(current?.id).toBe(june2);

    // CA-03: "reflejos" no se arrastra de la evaluación anterior.
    const values = radarValues(
      current,
      categories.map((c) => c.key),
    );
    expect(values[categories.findIndex((c) => c.key === "save_technique")]).toBe(8);
    expect(values[categories.findIndex((c) => c.key === "reflexes")]).toBeNull();

    // CA-04: ingreso vs. hoy.
    const compared = comparison(series);
    expect(compared?.entry.id).toBe(entry);
    expect(compared?.current.id).toBe(june2);
  });

  it("el indicador 'nuevo' desaparece al abrirla y es por tutor (CA-09)", async () => {
    const gk = await newGoalkeeper(school, "Nuevo");
    const mother = await newGuardian(school, gk, "Madre", null);
    const father = await newGuardian(school, gk, "Padre", null);
    const id = await createDraft(coachActor, gk);
    await publish(coachActor, id);

    expect((await getFamilyEvolution(admin, mother, gk)).newCount).toBe(1);
    await markSeen(admin, mother, gk, "evaluation", [id]);
    await markSeen(admin, mother, gk, "evaluation", [id]); // idempotente
    expect((await getFamilyEvolution(admin, mother, gk)).newCount).toBe(0);
    expect((await getFamilyEvolution(admin, father, gk)).newCount).toBe(1);
  });

  it("no marca como vistos elementos que el tutor no puede ver", async () => {
    const gk = await newGoalkeeper(school, "NoVisto");
    const tutor = await newGuardian(school, gk, "Tutora", null);
    const draft = await createDraft(coachActor, gk);
    const hiddenNote = await addNote(admin, {
      ...coachActor,
      goalkeeperId: gk,
      data: { body: "Interna", visibleToFamily: false },
    });
    await markSeen(admin, tutor, gk, "evaluation", [draft]);
    if (hiddenNote.ok) await markSeen(admin, tutor, gk, "note", [hiddenNote.noteId]);
    // Otro arquero del mismo tutor/escuela: tampoco.
    await markSeen(admin, tutor, goalkeeperId, "evaluation", [draft]);
    const { data } = await admin
      .from("guardian_seen")
      .select("ref_id")
      .eq("guardian_id", tutor.guardianId);
    expect(data).toEqual([]);
  });
});

describe("notas (CA-10)", () => {
  it("la nota interna no la ve la familia; la visible sí", async () => {
    const gk = await newGoalkeeper(school, "Notas");
    const tutor = await newGuardian(school, gk, "Tutora", null);
    const internal = await addNote(admin, {
      ...coachActor,
      goalkeeperId: gk,
      data: { body: "Llegó tarde", visibleToFamily: false },
    });
    const visible = await addNote(admin, {
      ...coachActor,
      goalkeeperId: gk,
      data: { body: "Muy buen trabajo hoy", visibleToFamily: true },
    });
    expect(internal.ok && visible.ok).toBe(true);

    const evolution = await getFamilyEvolution(admin, tutor, gk);
    expect(evolution.notes.map((n) => n.body)).toEqual(["Muy buen trabajo hoy"]);
    expect(evolution.notes[0].authorName).toContain("coachA");
  });

  it("no entran en el radar ni en los puntajes (RF-20) y no se cargan a inactivos", async () => {
    const inactive = await newGoalkeeper(school, "NotaInactivo", { status: "inactive" });
    expect(
      await addNote(admin, {
        ...coachActor,
        goalkeeperId: inactive,
        data: { body: "x", visibleToFamily: false },
      }),
    ).toEqual({ ok: false, error: "not_active" });
    const { data } = await admin.from("evaluation").select("id").eq("goalkeeper_id", inactive);
    expect(data).toEqual([]);
  });

  it("las notas de una escuela no las ve el staff de otra (RLS)", async () => {
    const gk = await newGoalkeeper(school, "NotaAislada");
    await addNote(admin, {
      ...coachActor,
      goalkeeperId: gk,
      data: { body: "Reservada", visibleToFamily: false },
    });
    expect((await coachClient.from("note").select("id").eq("goalkeeper_id", gk)).data).toHaveLength(
      1,
    );
    expect((await otherAdminClient.from("note").select("id").eq("goalkeeper_id", gk)).data).toEqual(
      [],
    );
  });
});

describe("borrado (RF-17 y RN-06)", () => {
  it("solo el admin borra evaluaciones", async () => {
    const id = await createDraft(coachActor, goalkeeperId);
    expect(await deleteEvaluation(admin, { ...coachActor, evaluationId: id })).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await deleteEvaluation(admin, { ...otherAdminActor, evaluationId: id })).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await deleteEvaluation(admin, { ...adminActor, evaluationId: id })).toEqual({
      ok: true,
    });
    const { data } = await admin.from("evaluation").select("id").eq("id", id);
    expect(data).toEqual([]);
  });

  it("al borrar al arquero se van sus evaluaciones, puntajes, notas y novedades", async () => {
    const gk = await newGoalkeeper(school, "Borrado");
    const tutor = await newGuardian(school, gk, "Tutora", null);
    const id = await createDraft(coachActor, gk);
    await publish(coachActor, id);
    await markSeen(admin, tutor, gk, "evaluation", [id]);
    await addNote(admin, {
      ...coachActor,
      goalkeeperId: gk,
      data: { body: "x", visibleToFamily: true },
    });

    await admin.from("goalkeeper").delete().eq("id", gk);
    for (const table of ["evaluation", "evaluation_score", "note", "guardian_seen"]) {
      const { data } = await admin
        .from(table)
        .select("school_id")
        .eq("school_id", school.id)
        .eq(
          table === "evaluation_score"
            ? "evaluation_id"
            : table === "guardian_seen"
              ? "ref_id"
              : "goalkeeper_id",
          table === "evaluation_score" || table === "guardian_seen" ? id : gk,
        );
      expect(data, table).toEqual([]);
    }
  });
});

describe("pendientes (CA-06)", () => {
  it("nunca evaluado = pendiente; hasta 90 días no; más de 90 días sí", async () => {
    const never = await newGoalkeeper(school, "NuncaEvaluado");
    const recent = await newGoalkeeper(school, "Reciente");
    const edge = await newGoalkeeper(school, "Borde90");
    const old = await newGoalkeeper(school, "Viejo");
    const draftOnly = await newGoalkeeper(school, "SoloBorrador");
    const inactive = await newGoalkeeper(school, "InactivoPend", { status: "inactive" });

    // 2026-07-23 + 90 días = 2026-10-21 (hoy): todavía no es pendiente.
    for (const [gk, date] of [
      [recent, "2026-10-01"],
      [edge, "2026-07-23"],
      [old, "2026-07-22"],
    ] as const) {
      await publish(
        coachActor,
        await createDraft(coachActor, gk, input({ save_technique: 5 }, { date })),
      );
    }
    await createDraft(coachActor, draftOnly, input({ save_technique: 5 }, { date: "2026-10-15" }));

    const pending = await listPendingGoalkeepers(admin, school.id, TODAY);
    const ids = new Set(pending.map((p) => p.id));
    expect(ids.has(never)).toBe(true);
    expect(ids.has(old)).toBe(true);
    expect(ids.has(draftOnly)).toBe(true); // un borrador no cuenta como evaluación publicada
    expect(ids.has(recent)).toBe(false);
    expect(ids.has(edge)).toBe(false);
    expect(ids.has(inactive)).toBe(false); // solo arqueros activos
    // Primero los que nunca fueron evaluados.
    expect(pending[0].lastEvaluationDate).toBeNull();
    expect(pending.find((p) => p.id === old)?.lastEvaluationDate).toBe("2026-07-22");
  });

  it("no mezcla arqueros de otra escuela", async () => {
    const pending = await listPendingGoalkeepers(admin, school.id, TODAY);
    expect(pending.some((p) => p.id === otherGoalkeeperId)).toBe(false);
  });
});

describe("aislamiento entre escuelas (RLS)", () => {
  let publishedId: string;
  let draftId: string;

  beforeAll(async () => {
    const gk = await newGoalkeeper(school, "Aislado");
    publishedId = await createDraft(coachActor, gk);
    await publish(coachActor, publishedId);
    draftId = await createDraft(coachActor, gk);
    await createDraft(otherAdminActor, otherGoalkeeperId);
  });

  it("el staff de otra escuela no ve evaluaciones, puntajes ni revisiones", async () => {
    await updateEvaluation(admin, {
      ...coachActor,
      evaluationId: publishedId,
      data: input({ save_technique: 9 }),
    });
    for (const [table, column] of [
      ["evaluation", "id"],
      ["evaluation_score", "evaluation_id"],
      ["evaluation_revision", "evaluation_id"],
    ] as const) {
      const foreign = await otherAdminClient
        .from(table)
        .select("school_id")
        .in(column, [publishedId, draftId]);
      expect(foreign.data, table).toEqual([]);
      const own = await adminClient
        .from(table)
        .select("school_id")
        .in(column, [publishedId, draftId]);
      expect(own.data?.length, table).toBeGreaterThan(0);
    }
  });

  it("el admin ve solo las de su escuela, aunque pida todas", async () => {
    const { data } = await otherAdminClient.from("evaluation").select("school_id");
    expect(new Set(data?.map((r) => r.school_id))).toEqual(new Set([other.id]));
  });

  it("nadie escribe desde el cliente: ni staff ni sin sesión", async () => {
    const row = {
      school_id: school.id,
      goalkeeper_id: goalkeeperId,
      rubric_version_id: categories[0].versionId,
      date: "2026-10-01",
      type: "periodic",
    };
    expect((await adminClient.from("evaluation").insert(row)).error?.code).toBe(PERMISSION_DENIED);
    expect((await createAnonClient().from("evaluation").insert(row)).error?.code).toBe(
      PERMISSION_DENIED,
    );
    expect(
      (await adminClient.from("evaluation").update({ comment: "x" }).eq("id", publishedId)).error
        ?.code,
    ).toBe(PERMISSION_DENIED);
    expect((await adminClient.from("evaluation").delete().eq("id", publishedId)).error?.code).toBe(
      PERMISSION_DENIED,
    );
    expect(
      (
        await adminClient.from("note").insert({
          school_id: school.id,
          goalkeeper_id: goalkeeperId,
          body: "x",
        })
      ).error?.code,
    ).toBe(PERMISSION_DENIED);
  });

  it("guardian_seen y las evaluaciones no se leen sin la clave secreta", async () => {
    expect((await adminClient.from("guardian_seen").select("ref_id")).error?.code).toBe(
      PERMISSION_DENIED,
    );
    expect((await createAnonClient().from("evaluation").select("id")).data ?? []).toEqual([]);
    expect((await createAnonClient().from("note").select("id")).data ?? []).toEqual([]);
  });

  it("un puntaje no puede apuntar a una evaluación de otra escuela (clave compuesta)", async () => {
    const { error } = await admin.from("evaluation_score").insert({
      evaluation_id: publishedId,
      school_id: other.id,
      // Una categoría sin puntaje previo en esa evaluación, para llegar a la clave foránea.
      category_id: categories[2].id,
      score: 5,
    });
    expect(error?.code).toBe(FOREIGN_KEY_VIOLATION);
  });

  it("una evaluación no puede apuntar a un arquero de otra escuela (clave compuesta)", async () => {
    const { error } = await admin.from("evaluation").insert({
      school_id: school.id,
      goalkeeper_id: otherGoalkeeperId,
      rubric_version_id: categories[0].versionId,
      date: "2026-10-01",
      type: "periodic",
    });
    // Falla antes por el disparador (el arquero no es "activo" en esta escuela) o por la clave compuesta.
    expect([FOREIGN_KEY_VIOLATION, CHECK_VIOLATION]).toContain(error?.code);
  });

  it("la publicación exige fecha y el puntaje debe ir de 1 a 10", async () => {
    const bad = await admin
      .from("evaluation")
      .update({ status: "published", published_at: null })
      .eq("id", draftId);
    expect(bad.error?.code).toBe(CHECK_VIOLATION);

    const score = await admin
      .from("evaluation_score")
      .update({ score: 11 })
      .eq("evaluation_id", publishedId)
      .eq("category_id", categories[0].id);
    expect(score.error?.code).toBe(CHECK_VIOLATION);
  });
});
