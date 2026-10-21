import { getAppUrl } from "./config";
import { invitationEmail, type InvitableRole } from "./email/templates";
import type { EmailTransport, SendResult } from "./email/transport";

export type InvitationDelivery = {
  /** Link de aceptación. Se muestra siempre, además del mail, para poder compartirlo a mano. */
  link: string;
  /** Resultado del envío del mail (si no hay clave de Resend, `not_configured`). */
  email: SendResult;
};

/** Arma el link de aceptación de una invitación. */
export function invitationLink(slug: string, token: string, appUrl: string = getAppUrl()): string {
  return `${appUrl}/${slug}/invitacion/${token}`;
}

/** Manda el mail de una invitación y devuelve también el link, por si el mail no sale o no llega. */
export async function deliverInvitation(
  transport: EmailTransport,
  input: {
    token: string;
    email: string;
    role: InvitableRole;
    expiresAt: Date;
    school: { name: string; slug: string; primaryColor?: string | null };
  },
): Promise<InvitationDelivery> {
  const link = invitationLink(input.school.slug, input.token);
  const email = await transport(
    invitationEmail({
      to: input.email,
      schoolName: input.school.name,
      role: input.role,
      link,
      expiresAt: input.expiresAt,
      accentColor: input.school.primaryColor,
    }),
  );
  return { link, email };
}

/** Texto para la interfaz según cómo salió el mail. */
export function describeDelivery(
  delivery: InvitationDelivery,
  to: string,
): { sent: boolean; message: string } {
  if (delivery.email.ok) {
    return { sent: true, message: `Le mandamos la invitación a ${to}.` };
  }
  const why =
    delivery.email.reason === "not_configured"
      ? "El envío de mails todavía no está configurado."
      : "No pudimos enviar el mail.";
  return {
    sent: false,
    message: `${why} Compartile este link a ${to} para que acepte la invitación.`,
  };
}
