"use server";

import { redirect } from "next/navigation";
import type { FieldErrors } from "@/lib/auth-schemas";
import { normalizeSlug } from "@/lib/slug";
import { createUserClient } from "@/lib/supabase/user-client";
import { resetPassword } from "@/server/password-reset";
import { createServiceClient } from "@/server/supabase";

export type ResetState = { error?: string; invalidLink?: boolean; fieldErrors?: FieldErrors };

const text = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};

export async function resetPasswordAction(
  slug: string,
  tokenHash: string,
  _previous: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const result = await resetPassword(
    { admin: createServiceClient(), auth: await createUserClient() },
    {
      slug,
      tokenHash,
      password: text(formData, "password"),
      passwordConfirmation: text(formData, "passwordConfirmation"),
    },
  );

  if (!result.ok) {
    if (result.error === "invalid_input") return { fieldErrors: result.fieldErrors };
    if (result.error === "invalid_link") {
      return { invalidLink: true, error: "Este link venció o ya se usó. Pedí uno nuevo." };
    }
    if (result.error === "weak_password") {
      return { error: "Esa contraseña no es válida o es igual a la anterior. Probá con otra." };
    }
    return { error: "No pudimos cambiar la contraseña. Intentá de nuevo en unos segundos." };
  }

  redirect(`/${normalizeSlug(slug)}/login?restablecida=1`);
}
