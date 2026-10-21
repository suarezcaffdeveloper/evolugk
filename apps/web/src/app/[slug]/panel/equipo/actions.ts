"use server";

import { revalidatePath } from "next/cache";
import { requireSchoolAdmin } from "@/server/auth/guards";
import { createConfiguredTransport } from "@/server/email/transport";
import { deliverInvitation, describeDelivery } from "@/server/invitation-delivery";
import { createInvitation, revokeInvitation, type InvitableRole } from "@/server/invitations";
import { createServiceClient } from "@/server/supabase";
import { setStaffActive } from "@/server/team";

/**
 * Todas las acciones del equipo vuelven a verificar, en el servidor y en vivo, que quien las pide sea
 * un administrador activo de ESTA escuela: no alcanza con que el botón no se muestre a los profesores.
 */

export type InviteState = {
  error?: string;
  email?: string;
  role?: InvitableRole;
  delivery?: { email: string; link: string; sent: boolean; message: string };
};

const ROLES: InvitableRole[] = ["coach", "school_admin"];

async function inviteAndDeliver(
  slug: string,
  email: unknown,
  role: InvitableRole,
): Promise<Pick<InviteState, "error" | "delivery">> {
  const session = await requireSchoolAdmin(slug);
  const admin = createServiceClient();

  const invitation = await createInvitation(admin, {
    schoolId: session.school.id,
    email,
    role,
    createdBy: session.user.id,
  });
  if (!invitation.ok) {
    const errors = {
      invalid_email:
        invitation.ok === false && invitation.message
          ? invitation.message
          : "El mail no es válido.",
      email_in_use: "Ese mail ya tiene una cuenta en el sistema. Usá otro mail.",
      school_not_found: "No pudimos enviar la invitación. Intentá de nuevo.",
      failed: "No pudimos enviar la invitación. Intentá de nuevo en unos segundos.",
    } as const;
    return { error: errors[invitation.error] };
  }

  const { data: school } = await admin
    .from("school")
    .select("name, slug, primary_color")
    .eq("id", session.school.id)
    .single();

  const delivery = await deliverInvitation(createConfiguredTransport(), {
    token: invitation.token,
    email: invitation.invitation.email,
    role,
    expiresAt: invitation.invitation.expiresAt,
    school: {
      name: school?.name ?? session.school.name,
      slug: session.school.slug,
      primaryColor: school?.primary_color,
    },
  });

  revalidatePath(`/${session.school.slug}/panel/equipo`);
  return {
    delivery: {
      email: invitation.invitation.email,
      link: delivery.link,
      ...describeDelivery(delivery, invitation.invitation.email),
    },
  };
}

export async function inviteAction(
  slug: string,
  _previous: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const email = typeof formData.get("email") === "string" ? (formData.get("email") as string) : "";
  const rawRole = formData.get("role");
  const role = ROLES.find((r) => r === rawRole);
  if (!role) return { error: "Elegí el rol de la persona.", email };

  const result = await inviteAndDeliver(slug, email, role);
  return { ...result, email: result.error ? email : undefined, role };
}

export type ResendState = { error?: string; delivery?: InviteState["delivery"] };

/** Reenvía una invitación pendiente (mismo mail y rol): el link anterior deja de servir. */
export async function resendInvitationAction(
  slug: string,
  invitationId: string,
  _previous: ResendState,
): Promise<ResendState> {
  const session = await requireSchoolAdmin(slug);
  const { data: invitation } = await createServiceClient()
    .from("invitation")
    .select("email, role")
    .eq("id", invitationId)
    .eq("school_id", session.school.id)
    .is("used_at", null)
    .is("revoked_at", null)
    .maybeSingle();
  if (!invitation) return { error: "Esa invitación ya no está pendiente." };

  return inviteAndDeliver(slug, invitation.email, invitation.role);
}

export async function revokeInvitationAction(slug: string, invitationId: string): Promise<void> {
  const session = await requireSchoolAdmin(slug);
  await revokeInvitation(createServiceClient(), { schoolId: session.school.id, invitationId });
  revalidatePath(`/${session.school.slug}/panel/equipo`);
}

export type MemberState = { error?: string };

const MEMBER_ERRORS = {
  not_found: "No encontramos a esa persona en tu equipo.",
  cannot_change_self: "No podés desactivar tu propia cuenta.",
  last_admin: "No se puede desactivar al último administrador activo de la escuela.",
  failed: "No pudimos hacer el cambio. Intentá de nuevo.",
} as const;

export async function setMemberActiveAction(
  slug: string,
  userId: string,
  active: boolean,
  _previous: MemberState,
): Promise<MemberState> {
  const session = await requireSchoolAdmin(slug);
  const result = await setStaffActive(createServiceClient(), {
    schoolId: session.school.id,
    actorId: session.user.id,
    userId,
    active,
  });
  if (!result.ok) return { error: MEMBER_ERRORS[result.error] };
  revalidatePath(`/${session.school.slug}/panel/equipo`);
  return {};
}
