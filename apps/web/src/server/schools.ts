import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { fieldErrorsFrom, type FieldErrors } from "@/lib/auth-schemas";
import { argentinaDatePlusDays } from "@/lib/dates";
import { isValidSlug } from "@/lib/slug";
import { createInvitation, emailSchema, type InvitableRole } from "./invitations";

/** Número escrito en un formulario: acepta coma o punto decimal y rechaza el campo vacío. */
const numberField = (label: string) =>
  z
    .string({ error: `Ingresá ${label}.` })
    .trim()
    .min(1, `Ingresá ${label}.`)
    .transform((value) => Number(value.replace(",", ".")))
    .pipe(z.number({ error: "Ingresá un número válido." }).finite("Ingresá un número válido."));

export const createSchoolSchema = z.object({
  name: z
    .string({ error: "Ingresá el nombre de la escuela." })
    .trim()
    .min(2, "El nombre debe tener al menos 2 caracteres.")
    .max(120, "El nombre es demasiado largo."),
  slug: z
    .string({ error: "Ingresá el identificador de la escuela." })
    .trim()
    .toLowerCase()
    .refine(
      isValidSlug,
      "Usá de 3 a 30 caracteres: minúsculas, números y guiones (sin guion al inicio ni al final). Algunas palabras están reservadas.",
    ),
  adminEmail: emailSchema,
  monthlyPriceArs: numberField("el precio mensual").pipe(
    z.number().min(0, "El precio no puede ser negativo."),
  ),
  goalkeeperLimit: numberField("el tope de arqueros").pipe(
    z
      .number()
      .int("Tiene que ser un número entero.")
      .min(1, "El tope de arqueros debe ser al menos 1."),
  ),
  videoMinutesLimit: numberField("el tope de minutos de video").pipe(
    z
      .number()
      .int("Tiene que ser un número entero.")
      .min(0, "El tope de video no puede ser negativo."),
  ),
  trialDays: numberField("los días de prueba").pipe(
    z
      .number()
      .int("Tiene que ser un número entero.")
      .min(1, "La prueba debe durar al menos 1 día.")
      .max(365, "La prueba no puede superar los 365 días."),
  ),
});

export type CreateSchoolResult =
  | {
      ok: true;
      school: { id: string; name: string; slug: string };
      token: string;
      invitation: { id: string; email: string; role: InvitableRole; expiresAt: Date };
    }
  | { ok: false; error: "invalid_input"; fieldErrors: FieldErrors }
  | { ok: false; error: "slug_taken" | "admin_email_in_use" | "failed" };

/**
 * Alta de una escuela por el operador (spec 00 RF-05/RF-06 y spec 07 RF-05/RF-06): crea la escuela,
 * sus condiciones (precio, topes y período de prueba) y la invitación de su primer admin.
 * Si algo falla a medias, borra lo creado para no dejar una escuela sin admin ni condiciones.
 */
export async function createSchoolWithAdminInvitation(
  admin: SupabaseClient,
  raw: Record<string, unknown>,
  context: { actorId: string; now?: Date },
): Promise<CreateSchoolResult> {
  const parsed = createSchoolSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "invalid_input", fieldErrors: fieldErrorsFrom(parsed.error) };
  }
  const input = parsed.data;
  const now = context.now ?? new Date();

  const school = await admin
    .from("school")
    .insert({ name: input.name, slug: input.slug })
    .select("id, name, slug")
    .single();
  if (school.error || !school.data) {
    return { ok: false, error: school.error?.code === "23505" ? "slug_taken" : "failed" };
  }
  const schoolId = school.data.id as string;
  const rollback = () => admin.from("school").delete().eq("id", schoolId);

  const trialUntil = argentinaDatePlusDays(now, input.trialDays);
  const subscription = await admin.from("subscription").insert({
    school_id: schoolId,
    monthly_price_ars: input.monthlyPriceArs,
    goalkeeper_limit: input.goalkeeperLimit,
    video_minutes_limit: input.videoMinutesLimit,
    trial_until: trialUntil,
    covered_until: trialUntil,
  });
  if (subscription.error) {
    await rollback();
    return { ok: false, error: "failed" };
  }

  const invitation = await createInvitation(admin, {
    schoolId,
    email: input.adminEmail,
    role: "school_admin",
    createdBy: context.actorId,
    now,
  });
  if (!invitation.ok) {
    await rollback();
    return {
      ok: false,
      error: invitation.error === "email_in_use" ? "admin_email_in_use" : "failed",
    };
  }

  await admin.from("audit_log").insert({
    school_id: schoolId,
    actor_id: context.actorId,
    action: "school.created",
    entity: "school",
    entity_id: schoolId,
    details: { slug: input.slug, trial_days: input.trialDays },
  });

  return {
    ok: true,
    school: { id: schoolId, name: school.data.name, slug: school.data.slug },
    token: invitation.token,
    invitation: invitation.invitation,
  };
}

export type SuspendResult =
  { ok: true; slug: string } | { ok: false; error: "not_found" | "failed" };

/**
 * Suspende o reactiva una escuela (spec 00 RF-06e, spec 07 RF-25 a RF-28). Es siempre una decisión
 * manual del operador. La persona que llama debe invalidar la caché de la marca con el `slug` devuelto.
 */
export async function setSchoolSuspended(
  admin: SupabaseClient,
  input: { schoolId: string; suspended: boolean; actorId: string; now?: Date },
): Promise<SuspendResult> {
  const { data, error } = await admin
    .from("school")
    .update(
      input.suspended
        ? { status: "suspended", suspended_at: (input.now ?? new Date()).toISOString() }
        : { status: "active", suspended_at: null },
    )
    .eq("id", input.schoolId)
    .select("slug");
  if (error) return { ok: false, error: "failed" };
  if (!data?.length) return { ok: false, error: "not_found" };

  await admin.from("audit_log").insert({
    school_id: input.schoolId,
    actor_id: input.actorId,
    action: input.suspended ? "school.suspended" : "school.reactivated",
    entity: "school",
    entity_id: input.schoolId,
  });
  return { ok: true, slug: data[0].slug };
}

export type VideoLimitResult =
  { ok: true } | { ok: false; error: "invalid" | "not_found" | "failed" };

/** Tope máximo razonable de minutos de video: evita cargar un valor con un cero de más sin querer. */
export const MAX_VIDEO_MINUTES_LIMIT = 100_000;

/**
 * El operador cambia el tope de minutos de video de una escuela (spec 07, RF-04). Se aplica de
 * inmediato: si la escuela estaba bloqueada al 100%, las subidas se destraban. El historial de
 * condiciones completo llega con el hito de suscripciones; por ahora queda en la auditoría.
 */
export async function setVideoMinutesLimit(
  admin: SupabaseClient,
  input: { schoolId: string; minutes: number; actorId: string },
): Promise<VideoLimitResult> {
  if (
    !Number.isInteger(input.minutes) ||
    input.minutes < 0 ||
    input.minutes > MAX_VIDEO_MINUTES_LIMIT
  ) {
    return { ok: false, error: "invalid" };
  }
  const { data: current } = await admin
    .from("subscription")
    .select("video_minutes_limit")
    .eq("school_id", input.schoolId)
    .maybeSingle();
  if (!current) return { ok: false, error: "not_found" };

  const { error } = await admin
    .from("subscription")
    .update({ video_minutes_limit: input.minutes })
    .eq("school_id", input.schoolId);
  if (error) return { ok: false, error: "failed" };

  await admin.from("audit_log").insert({
    school_id: input.schoolId,
    actor_id: input.actorId,
    action: "subscription.video_limit_changed",
    entity: "subscription",
    entity_id: input.schoolId,
    details: { from: current.video_minutes_limit, to: input.minutes },
  });
  return { ok: true };
}

export type SchoolSummary = {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended";
  createdAt: Date;
  trialUntil: string | null;
  coveredUntil: string | null;
  goalkeeperLimit: number | null;
  admins: { active: number; pending: number };
};

/** Escuelas con su estado, vencimiento y cantidad de admins (activos e invitados sin aceptar). */
export async function listSchools(admin: SupabaseClient): Promise<SchoolSummary[]> {
  const [schools, subscriptions, admins, invitations] = await Promise.all([
    admin
      .from("school")
      .select("id, name, slug, status, created_at")
      .order("created_at", { ascending: false }),
    admin.from("subscription").select("school_id, trial_until, covered_until, goalkeeper_limit"),
    admin.from("profile").select("school_id").eq("role", "school_admin").eq("active", true),
    admin
      .from("invitation")
      .select("school_id")
      .eq("role", "school_admin")
      .is("used_at", null)
      .is("revoked_at", null),
  ]);

  const count = (rows: { school_id: string | null }[] | null, id: string) =>
    (rows ?? []).filter((r) => r.school_id === id).length;

  return (schools.data ?? []).map((s) => {
    const sub = subscriptions.data?.find((x) => x.school_id === s.id);
    return {
      id: s.id,
      name: s.name,
      slug: s.slug,
      status: s.status,
      createdAt: new Date(s.created_at),
      trialUntil: sub?.trial_until ?? null,
      coveredUntil: sub?.covered_until ?? null,
      goalkeeperLimit: sub?.goalkeeper_limit ?? null,
      admins: { active: count(admins.data, s.id), pending: count(invitations.data, s.id) },
    };
  });
}

export type SchoolDetail = {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended";
  suspendedAt: Date | null;
  createdAt: Date;
  subscription: {
    monthlyPriceArs: number;
    goalkeeperLimit: number;
    videoMinutesLimit: number;
    trialUntil: string | null;
    coveredUntil: string;
  } | null;
};

/** Datos de una escuela y sus condiciones, por identificador (null si no existe). */
export async function getSchoolDetail(
  admin: SupabaseClient,
  rawSlug: string,
): Promise<SchoolDetail | null> {
  const slug = rawSlug.trim().toLowerCase();
  if (!isValidSlug(slug)) return null;

  const { data: school } = await admin
    .from("school")
    .select("id, name, slug, status, suspended_at, created_at")
    .eq("slug", slug)
    .maybeSingle();
  if (!school) return null;

  const { data: sub } = await admin
    .from("subscription")
    .select("monthly_price_ars, goalkeeper_limit, video_minutes_limit, trial_until, covered_until")
    .eq("school_id", school.id)
    .maybeSingle();

  return {
    id: school.id,
    name: school.name,
    slug: school.slug,
    status: school.status,
    suspendedAt: school.suspended_at ? new Date(school.suspended_at) : null,
    createdAt: new Date(school.created_at),
    subscription: sub
      ? {
          monthlyPriceArs: Number(sub.monthly_price_ars),
          goalkeeperLimit: sub.goalkeeper_limit,
          videoMinutesLimit: sub.video_minutes_limit,
          trialUntil: sub.trial_until,
          coveredUntil: sub.covered_until,
        }
      : null,
  };
}
