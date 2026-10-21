"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { argentinaDate } from "@/lib/dates";
import {
  goalkeeperSchema,
  guardianSchema,
  isRelationship,
  isStatus,
  measurementSchema,
  type Relationship,
} from "@/lib/goalkeeper-schemas";
import { fieldErrorsFrom, type FieldErrors } from "@/lib/auth-schemas";
import { requireSchoolAdmin, requireStaff } from "@/server/auth/guards";
import {
  addGuardianToGoalkeeper,
  addMeasurement,
  createGoalkeeper,
  deleteGoalkeeper,
  manageGuardianAccess,
  removeGuardianFromGoalkeeper,
  setGoalkeeperGroups,
  setGoalkeeperStatus,
  updateGoalkeeper,
  updateGuardian,
  type AccessAction,
  type DuplicateCandidate,
  type GuardianSpec,
  type NewCredentials,
} from "@/server/goalkeepers";
import { createServiceClient } from "@/server/supabase";

/**
 * Cada acción vuelve a verificar, en el servidor y en vivo, la sesión y el rol: la administración
 * da de alta y edita; los profesores solo registran medidas (spec 01, RF-08 y CA-08).
 */

const text = (formData: FormData, key: string): string => {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
};

/** Todos los valores de texto del formulario, para volver a mostrarlo si hay errores. */
function valuesOf(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string" || key.startsWith("$ACTION")) continue;
    // Los campos repetidos (casillas de grupos) se juntan separados por coma.
    out[key] = key in out ? `${out[key]},${value}` : value;
  }
  return out;
}

const refresh = (slug: string, goalkeeperId?: string) => {
  revalidatePath(`/${slug}/panel/arqueros`);
  if (goalkeeperId) revalidatePath(`/${slug}/panel/arqueros/${goalkeeperId}`);
};

const ERRORS = {
  not_found: "No encontramos al arquero.",
  future_date: "Las fechas no pueden ser futuras.",
  self_requires_adult: "Solo un arquero mayor de 18 años puede ser su propio tutor.",
  invalid_group: "Elegiste un grupo que ya no está disponible.",
  invalid_guardian: "El tutor elegido no existe en tu escuela.",
  no_guardian: "Todo arquero necesita al menos un tutor.",
  already_linked: "Ese tutor ya está vinculado a este arquero.",
  last_guardian: "El arquero tiene que conservar al menos un tutor.",
  failed: "No pudimos guardar los cambios. Intentá de nuevo.",
} as const;

// ───────────────────────────── alta ─────────────────────────────

export type CreateState = {
  errors?: FieldErrors;
  error?: string;
  values?: Record<string, string>;
  duplicates?: DuplicateCandidate[];
  created?: { goalkeeperId: string; name: string; credentials: NewCredentials[] };
};

function relationshipOf(formData: FormData, key = "relationship"): Relationship | null {
  const value = text(formData, key);
  return isRelationship(value) ? value : null;
}

export async function createGoalkeeperAction(
  slug: string,
  _previous: CreateState,
  formData: FormData,
): Promise<CreateState> {
  const session = await requireSchoolAdmin(slug);
  const values = valuesOf(formData);
  const errors: FieldErrors = {};

  const goalkeeper = goalkeeperSchema.safeParse({
    firstName: text(formData, "firstName"),
    lastName: text(formData, "lastName"),
    birthDate: text(formData, "birthDate"),
    joinedOn: text(formData, "joinedOn"),
    preferredFoot: text(formData, "preferredFoot"),
    level: text(formData, "level"),
    currentClub: text(formData, "currentClub"),
    category: text(formData, "category"),
    goal: text(formData, "goal"),
    emergencyName: text(formData, "emergencyName"),
    emergencyPhone: text(formData, "emergencyPhone"),
    emergencyRelationship: text(formData, "emergencyRelationship"),
  });
  if (!goalkeeper.success) Object.assign(errors, fieldErrorsFrom(goalkeeper.error));

  const relationship = relationshipOf(formData);
  if (!relationship) errors.relationship = "Elegí el parentesco.";

  // El tutor es uno existente (hermanos) o uno nuevo con sus datos.
  const existingGuardianId = text(formData, "existingGuardianId");
  let spec: GuardianSpec | null = null;
  if (relationship) {
    if (existingGuardianId) {
      spec = { relationship, existingGuardianId };
    } else {
      const guardian = guardianSchema.safeParse({
        firstName: text(formData, "guardianFirstName"),
        lastName: text(formData, "guardianLastName"),
        phone: text(formData, "guardianPhone"),
        email: text(formData, "guardianEmail"),
      });
      if (guardian.success) {
        spec = { relationship, data: guardian.data };
      } else {
        const g = fieldErrorsFrom(guardian.error);
        if (g.firstName) errors.guardianFirstName = g.firstName;
        if (g.lastName) errors.guardianLastName = g.lastName;
        if (g.phone) errors.guardianPhone = g.phone;
        if (g.email) errors.guardianEmail = g.email;
      }
    }
  }

  if (!goalkeeper.success || !spec) return { errors, values };

  const groupIds = formData.getAll("groupIds").filter((v): v is string => typeof v === "string");
  const result = await createGoalkeeper(createServiceClient(), {
    schoolId: session.school.id,
    actorId: session.user.id,
    goalkeeper: goalkeeper.data,
    guardians: [spec],
    groupIds,
    today: argentinaDate(new Date()),
    confirmDuplicate: text(formData, "confirmDuplicate") === "yes",
  });

  if (!result.ok) {
    if (result.error === "duplicate") return { values, duplicates: result.duplicates };
    if (result.error === "self_requires_adult") {
      return { errors: { relationship: ERRORS.self_requires_adult }, values };
    }
    return { error: ERRORS[result.error], values };
  }

  refresh(session.school.slug);
  return {
    created: {
      goalkeeperId: result.goalkeeperId,
      name: `${goalkeeper.data.firstName} ${goalkeeper.data.lastName}`,
      credentials: result.credentials,
    },
  };
}

// ───────────────────────────── edición de la ficha ─────────────────────────────

export type EditState = { errors?: FieldErrors; error?: string; values?: Record<string, string> };

export async function updateGoalkeeperAction(
  slug: string,
  goalkeeperId: string,
  _previous: EditState,
  formData: FormData,
): Promise<EditState> {
  const session = await requireSchoolAdmin(slug);
  const values = valuesOf(formData);

  const parsed = goalkeeperSchema.safeParse({
    firstName: text(formData, "firstName"),
    lastName: text(formData, "lastName"),
    birthDate: text(formData, "birthDate"),
    joinedOn: text(formData, "joinedOn"),
    preferredFoot: text(formData, "preferredFoot"),
    level: text(formData, "level"),
    currentClub: text(formData, "currentClub"),
    category: text(formData, "category"),
    goal: text(formData, "goal"),
    emergencyName: text(formData, "emergencyName"),
    emergencyPhone: text(formData, "emergencyPhone"),
    emergencyRelationship: text(formData, "emergencyRelationship"),
  });
  if (!parsed.success) return { errors: fieldErrorsFrom(parsed.error), values };

  const result = await updateGoalkeeper(createServiceClient(), {
    schoolId: session.school.id,
    actorId: session.user.id,
    goalkeeperId,
    data: parsed.data,
    today: argentinaDate(new Date()),
  });
  if (!result.ok) return { error: ERRORS[result.error], values };

  refresh(session.school.slug, goalkeeperId);
  redirect(`/${session.school.slug}/panel/arqueros/${goalkeeperId}`);
}

// ───────────────────────────── acciones de la ficha ─────────────────────────────

export type ActionState = {
  error?: string;
  ok?: boolean;
  pin?: string;
  credentials?: NewCredentials;
};

export async function setStatusAction(
  slug: string,
  goalkeeperId: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSchoolAdmin(slug);
  const status = text(formData, "status");
  if (!isStatus(status)) return { error: "Elegí un estado." };

  const result = await setGoalkeeperStatus(createServiceClient(), {
    schoolId: session.school.id,
    actorId: session.user.id,
    goalkeeperId,
    status,
  });
  if (!result.ok) return { error: ERRORS[result.error] };
  refresh(session.school.slug, goalkeeperId);
  return { ok: true };
}

export async function addMeasurementAction(
  slug: string,
  goalkeeperId: string,
  _previous: ActionState & { errors?: FieldErrors },
  formData: FormData,
): Promise<ActionState & { errors?: FieldErrors }> {
  // Admin y profesores registran medidas (RF-10).
  const session = await requireStaff(slug);
  const parsed = measurementSchema.safeParse({
    date: text(formData, "date"),
    heightCm: text(formData, "heightCm"),
    weightKg: text(formData, "weightKg"),
  });
  if (!parsed.success) return { errors: fieldErrorsFrom(parsed.error) };

  const result = await addMeasurement(createServiceClient(), {
    schoolId: session.school.id,
    actorId: session.user.id,
    goalkeeperId,
    data: parsed.data,
    today: argentinaDate(new Date()),
  });
  if (!result.ok) return { error: ERRORS[result.error] };
  refresh(session.school.slug, goalkeeperId);
  return { ok: true };
}

export async function setGroupsAction(
  slug: string,
  goalkeeperId: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSchoolAdmin(slug);
  const groupIds = formData.getAll("groupIds").filter((v): v is string => typeof v === "string");
  const result = await setGoalkeeperGroups(createServiceClient(), {
    schoolId: session.school.id,
    actorId: session.user.id,
    goalkeeperId,
    groupIds,
  });
  if (!result.ok) return { error: ERRORS[result.error] };
  refresh(session.school.slug, goalkeeperId);
  return { ok: true };
}

export async function deleteGoalkeeperAction(
  slug: string,
  goalkeeperId: string,
  expectedName: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSchoolAdmin(slug);
  // Confirmación explícita (RF-40): hay que escribir el apellido del arquero.
  const typed = text(formData, "confirm").trim().toLowerCase();
  if (!typed || typed !== expectedName.trim().toLowerCase()) {
    return { error: "Escribí el apellido del arquero para confirmar." };
  }

  const result = await deleteGoalkeeper(createServiceClient(), {
    schoolId: session.school.id,
    actorId: session.user.id,
    goalkeeperId,
  });
  if (!result.ok) return { error: ERRORS[result.error] };
  refresh(session.school.slug);
  redirect(`/${session.school.slug}/panel/arqueros`);
}

// ───────────────────────────── tutores ─────────────────────────────

export type GuardianFormState = ActionState & { errors?: FieldErrors };

export async function addGuardianAction(
  slug: string,
  goalkeeperId: string,
  _previous: GuardianFormState,
  formData: FormData,
): Promise<GuardianFormState> {
  const session = await requireSchoolAdmin(slug);
  const relationship = relationshipOf(formData);
  if (!relationship) return { errors: { relationship: "Elegí el parentesco." } };

  const guardian = guardianSchema.safeParse({
    firstName: text(formData, "firstName"),
    lastName: text(formData, "lastName"),
    phone: text(formData, "phone"),
    email: text(formData, "email"),
  });
  if (!guardian.success) return { errors: fieldErrorsFrom(guardian.error) };

  const result = await addGuardianToGoalkeeper(createServiceClient(), {
    schoolId: session.school.id,
    actorId: session.user.id,
    goalkeeperId,
    spec: { relationship, data: guardian.data },
    today: argentinaDate(new Date()),
  });
  if (!result.ok) return { error: ERRORS[result.error] };
  refresh(session.school.slug, goalkeeperId);
  return { ok: true, credentials: result.credentials };
}

export async function linkGuardianAction(
  slug: string,
  goalkeeperId: string,
  guardianId: string,
  _previous: GuardianFormState,
  formData: FormData,
): Promise<GuardianFormState> {
  const session = await requireSchoolAdmin(slug);
  const relationship = relationshipOf(formData);
  if (!relationship) return { error: "Elegí el parentesco." };

  const result = await addGuardianToGoalkeeper(createServiceClient(), {
    schoolId: session.school.id,
    actorId: session.user.id,
    goalkeeperId,
    spec: { relationship, existingGuardianId: guardianId },
    today: argentinaDate(new Date()),
  });
  if (!result.ok) return { error: ERRORS[result.error] };
  refresh(session.school.slug, goalkeeperId);
  return { ok: true };
}

export async function removeGuardianAction(
  slug: string,
  goalkeeperId: string,
  guardianId: string,
  _previous: ActionState,
): Promise<ActionState> {
  const session = await requireSchoolAdmin(slug);
  const result = await removeGuardianFromGoalkeeper(createServiceClient(), {
    schoolId: session.school.id,
    actorId: session.user.id,
    goalkeeperId,
    guardianId,
  });
  if (!result.ok) return { error: ERRORS[result.error] };
  refresh(session.school.slug, goalkeeperId);
  return { ok: true };
}

export async function updateGuardianAction(
  slug: string,
  goalkeeperId: string,
  guardianId: string,
  _previous: GuardianFormState,
  formData: FormData,
): Promise<GuardianFormState> {
  const session = await requireSchoolAdmin(slug);
  const guardian = guardianSchema.safeParse({
    firstName: text(formData, "firstName"),
    lastName: text(formData, "lastName"),
    phone: text(formData, "phone"),
    email: text(formData, "email"),
  });
  if (!guardian.success) return { errors: fieldErrorsFrom(guardian.error) };

  const result = await updateGuardian(createServiceClient(), {
    schoolId: session.school.id,
    actorId: session.user.id,
    guardianId,
    data: guardian.data,
  });
  if (!result.ok)
    return { error: ERRORS[result.error === "future_date" ? "failed" : result.error] };
  refresh(session.school.slug, goalkeeperId);
  return { ok: true };
}

export async function guardianAccessAction(
  slug: string,
  goalkeeperId: string,
  guardianId: string,
  action: AccessAction,
  _previous: ActionState,
): Promise<ActionState> {
  const session = await requireSchoolAdmin(slug);
  const result = await manageGuardianAccess(createServiceClient(), {
    schoolId: session.school.id,
    actorId: session.user.id,
    guardianId,
    action,
  });
  if (!result.ok) return { error: ERRORS[result.error] };
  refresh(session.school.slug, goalkeeperId);
  return { ok: true, pin: result.pin };
}
