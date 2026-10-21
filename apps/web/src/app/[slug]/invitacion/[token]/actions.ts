"use server";

import { redirect } from "next/navigation";
import type { FieldErrors } from "@/lib/auth-schemas";
import { createUserClient } from "@/lib/supabase/user-client";
import { acceptInvitation } from "@/server/invitations";
import { createServiceClient } from "@/server/supabase";

export type AcceptState = {
  error?: string;
  fieldErrors?: FieldErrors;
  /** Se conservan los nombres escritos si hay un error (las contraseñas nunca se devuelven). */
  values?: { firstName: string; lastName: string };
};

const MESSAGES = {
  expired: "Esta invitación venció. Pedile a quien te invitó que te mande una nueva.",
  used: "Esta invitación ya fue usada. Si ya creaste tu cuenta, ingresá con tu mail y tu contraseña.",
  revoked: "Esta invitación ya no es válida. Pedile a quien te invitó que te mande una nueva.",
  not_found: "Esta invitación no es válida. Revisá el link que te mandaron.",
  school_unavailable: "Esta invitación no es válida. Revisá el link que te mandaron.",
  email_in_use:
    "Ese mail ya tiene una cuenta. Ingresá con tu contraseña o pedile ayuda a quien te invitó.",
  weak_password: "Esa contraseña es demasiado fácil de adivinar. Probá con otra.",
  failed: "No pudimos crear tu cuenta. Intentá de nuevo en unos segundos.",
} as const;

const text = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};

export async function acceptInvitationAction(
  token: string,
  _previous: AcceptState,
  formData: FormData,
): Promise<AcceptState> {
  const values = { firstName: text(formData, "firstName"), lastName: text(formData, "lastName") };
  const password = text(formData, "password");

  const result = await acceptInvitation(createServiceClient(), {
    token,
    ...values,
    password,
    passwordConfirmation: text(formData, "passwordConfirmation"),
  });

  if (!result.ok) {
    if (result.error === "invalid_input") return { fieldErrors: result.fieldErrors, values };
    return { error: MESSAGES[result.error], values };
  }

  // La persona queda con la sesión iniciada y entra directo a su panel.
  const login = await (
    await createUserClient()
  ).auth.signInWithPassword({
    email: result.email,
    password,
  });
  redirect(login.error ? `/${result.schoolSlug}/login` : `/${result.schoolSlug}/panel`);
}
