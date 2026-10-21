"use server";

import { redirect } from "next/navigation";
import type { FieldErrors } from "@/lib/auth-schemas";
import { isValidSlug, normalizeSlug } from "@/lib/slug";
import { createUserClient } from "@/lib/supabase/user-client";
import { loginStaff } from "@/server/auth/staff-login";
import { createServiceClient } from "@/server/supabase";

export type LoginState = {
  /** Mensaje general (credenciales incorrectas). Es el mismo para cualquier causa. */
  error?: string;
  fieldErrors?: FieldErrors;
  /** Se conserva el mail escrito para no obligar a volver a tipearlo. */
  email?: string;
};

export async function loginAction(
  slug: string,
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = typeof formData.get("email") === "string" ? (formData.get("email") as string) : "";

  const result = await loginStaff(
    { admin: createServiceClient(), auth: await createUserClient() },
    slug,
    { email: formData.get("email"), password: formData.get("password") },
  );

  if (!result.ok) {
    if (result.error === "invalid_input") return { fieldErrors: result.fieldErrors, email };
    return { error: "Mail o contraseña incorrectos.", email };
  }

  // El slug ya se validó dentro de loginStaff; solo se redirige tras un ingreso exitoso.
  redirect(`/${normalizeSlug(slug)}/panel`);
}

export async function logoutAction(slug: string): Promise<void> {
  const supabase = await createUserClient();
  await supabase.auth.signOut();
  const safe = normalizeSlug(slug);
  redirect(isValidSlug(safe) ? `/${safe}/login` : "/");
}
