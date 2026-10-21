"use server";

import { revalidatePath } from "next/cache";
import { fieldErrorsFrom, type FieldErrors } from "@/lib/auth-schemas";
import { groupSchema } from "@/lib/goalkeeper-schemas";
import { requireSchoolAdmin } from "@/server/auth/guards";
import { createGroup, setGroupArchived, updateGroup } from "@/server/goalkeepers";
import { createServiceClient } from "@/server/supabase";

/** Solo la administración gestiona los grupos (spec 01, RF-18). */

export type GroupState = { errors?: FieldErrors; error?: string; ok?: boolean };

const ERRORS = {
  name_taken: "Ya hay un grupo vigente con ese nombre.",
  not_found: "No encontramos ese grupo.",
  failed: "No pudimos guardar el grupo. Intentá de nuevo.",
} as const;

const text = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
};

export async function createGroupAction(
  slug: string,
  _previous: GroupState,
  formData: FormData,
): Promise<GroupState> {
  const session = await requireSchoolAdmin(slug);
  const parsed = groupSchema.safeParse({
    name: text(formData, "name"),
    schedule: text(formData, "schedule"),
  });
  if (!parsed.success) return { errors: fieldErrorsFrom(parsed.error) };

  const result = await createGroup(createServiceClient(), {
    schoolId: session.school.id,
    actorId: session.user.id,
    data: parsed.data,
  });
  if (!result.ok) return { error: ERRORS[result.error] };
  revalidatePath(`/${session.school.slug}/panel/grupos`);
  return { ok: true };
}

export async function updateGroupAction(
  slug: string,
  groupId: string,
  _previous: GroupState,
  formData: FormData,
): Promise<GroupState> {
  const session = await requireSchoolAdmin(slug);
  const parsed = groupSchema.safeParse({
    name: text(formData, "name"),
    schedule: text(formData, "schedule"),
  });
  if (!parsed.success) return { errors: fieldErrorsFrom(parsed.error) };

  const result = await updateGroup(createServiceClient(), {
    schoolId: session.school.id,
    actorId: session.user.id,
    groupId,
    data: parsed.data,
  });
  if (!result.ok) return { error: ERRORS[result.error] };
  revalidatePath(`/${session.school.slug}/panel/grupos`);
  return { ok: true };
}

export async function setGroupArchivedAction(
  slug: string,
  groupId: string,
  archived: boolean,
  _previous: GroupState,
): Promise<GroupState> {
  const session = await requireSchoolAdmin(slug);
  const result = await setGroupArchived(createServiceClient(), {
    schoolId: session.school.id,
    actorId: session.user.id,
    groupId,
    archived,
  });
  if (!result.ok) return { error: ERRORS[result.error] };
  revalidatePath(`/${session.school.slug}/panel/grupos`);
  return { ok: true };
}
