"use server";

import { revalidatePath, updateTag } from "next/cache";
import type { FieldErrors } from "@/lib/auth-schemas";
import { requireOperator } from "@/server/auth/guards";
import { getAppUrl } from "@/server/config";
import { createConfiguredTransport } from "@/server/email/transport";
import { deliverInvitation, describeDelivery } from "@/server/invitation-delivery";
import { createInvitation } from "@/server/invitations";
import { createSchoolWithAdminInvitation, setSchoolSuspended } from "@/server/schools";
import { createServiceClient } from "@/server/supabase";
import { schoolBrandingTag } from "@/server/tenant";

export type DeliveryInfo = { link: string; sent: boolean; message: string };

/* ───────────────────────────── alta ───────────────────────────── */

export type NewSchoolState = {
  fieldErrors?: FieldErrors;
  error?: string;
  /** Lo escrito, para no obligar a tipearlo de nuevo si hay un error. */
  values?: Record<string, string>;
  created?: { name: string; slug: string; adminEmail: string; delivery: DeliveryInfo };
};

const ERROR_MESSAGES = {
  slug_taken: "Ya existe una escuela con ese identificador. Elegí otro.",
  admin_email_in_use: "Ese mail ya tiene una cuenta en el sistema. Usá el de otra persona.",
  failed: "No pudimos crear la escuela. Intentá de nuevo en unos segundos.",
} as const;

const FIELDS = [
  "name",
  "slug",
  "adminEmail",
  "monthlyPriceArs",
  "goalkeeperLimit",
  "videoMinutesLimit",
  "trialDays",
] as const;

export async function createSchoolAction(
  _previous: NewSchoolState,
  formData: FormData,
): Promise<NewSchoolState> {
  const operator = await requireOperator("ready");

  // Falla antes de crear nada si falta la dirección con la que se arma el link de la invitación.
  try {
    getAppUrl();
  } catch {
    return { error: "Falta configurar APP_URL en el servidor. No se creó la escuela." };
  }

  const raw: Record<string, string> = {};
  for (const field of FIELDS) {
    const value = formData.get(field);
    raw[field] = typeof value === "string" ? value : "";
  }

  const admin = createServiceClient();
  const result = await createSchoolWithAdminInvitation(admin, raw, { actorId: operator.user.id });
  if (!result.ok) {
    if (result.error === "invalid_input") return { fieldErrors: result.fieldErrors, values: raw };
    return { error: ERROR_MESSAGES[result.error], values: raw };
  }

  const delivery = await deliverInvitation(createConfiguredTransport(), {
    token: result.token,
    email: result.invitation.email,
    role: "school_admin",
    expiresAt: result.invitation.expiresAt,
    school: { name: result.school.name, slug: result.school.slug },
  });
  const info = describeDelivery(delivery, result.invitation.email);

  revalidatePath("/operator");
  return {
    created: {
      name: result.school.name,
      slug: result.school.slug,
      adminEmail: result.invitation.email,
      delivery: { link: delivery.link, ...info },
    },
  };
}

/* ───────────────────────────── detalle ───────────────────────────── */

export type SuspendState = { error?: string; done?: "suspended" | "reactivated" };

/** Suspender o reactivar es siempre una decisión manual y explícita del operador (spec 07, RF-25 a RF-28). */
export async function setSuspendedAction(
  schoolId: string,
  suspend: boolean,
  _previous: SuspendState,
): Promise<SuspendState> {
  const operator = await requireOperator("ready");

  const result = await setSchoolSuspended(createServiceClient(), {
    schoolId,
    suspended: suspend,
    actorId: operator.user.id,
  });
  if (!result.ok) return { error: "No pudimos cambiar el estado de la escuela. Intentá de nuevo." };

  // La marca de la escuela se cachea: se invalida para que el cambio se vea al instante.
  updateTag(schoolBrandingTag(result.slug));
  revalidatePath("/operator");
  revalidatePath(`/operator/escuelas/${result.slug}`);
  return { done: suspend ? "suspended" : "reactivated" };
}

export type ResendState = { error?: string; delivery?: DeliveryInfo & { email: string } };

/** Reenvía la invitación del admin: revoca el link anterior y manda uno nuevo. */
export async function resendAdminInvitationAction(
  schoolId: string,
  email: string,
  _previous: ResendState,
): Promise<ResendState> {
  const operator = await requireOperator("ready");
  const admin = createServiceClient();

  const { data: school } = await admin
    .from("school")
    .select("id, name, slug, primary_color")
    .eq("id", schoolId)
    .maybeSingle();
  if (!school) return { error: "No encontramos la escuela." };

  const invitation = await createInvitation(admin, {
    schoolId: school.id,
    email,
    role: "school_admin",
    createdBy: operator.user.id,
  });
  if (!invitation.ok) {
    return {
      error:
        invitation.error === "email_in_use"
          ? "Ese mail ya tiene una cuenta: la invitación ya fue aceptada."
          : "No pudimos reenviar la invitación. Intentá de nuevo.",
    };
  }

  const delivery = await deliverInvitation(createConfiguredTransport(), {
    token: invitation.token,
    email: invitation.invitation.email,
    role: "school_admin",
    expiresAt: invitation.invitation.expiresAt,
    school: { name: school.name, slug: school.slug, primaryColor: school.primary_color },
  });

  revalidatePath(`/operator/escuelas/${school.slug}`);
  return {
    delivery: {
      email: invitation.invitation.email,
      link: delivery.link,
      ...describeDelivery(delivery, invitation.invitation.email),
    },
  };
}
