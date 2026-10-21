"use server";

import type { FieldErrors } from "@/lib/auth-schemas";
import { createConfiguredTransport } from "@/server/email/transport";
import { emailSchema } from "@/server/invitations";
import { requestPasswordReset } from "@/server/password-reset";
import { createServiceClient } from "@/server/supabase";

export type RecoverState = { fieldErrors?: FieldErrors; email?: string; done?: boolean };

/**
 * Pide el mail de recuperación. Si el mail tiene un formato válido, la respuesta es siempre la misma:
 * no se revela si existe una cuenta, si es de otra escuela o si está desactivada.
 */
export async function requestResetAction(
  slug: string,
  _previous: RecoverState,
  formData: FormData,
): Promise<RecoverState> {
  const raw = typeof formData.get("email") === "string" ? (formData.get("email") as string) : "";
  const parsed = emailSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      fieldErrors: { email: parsed.error.issues[0]?.message ?? "El mail no es válido." },
      email: raw,
    };
  }

  await requestPasswordReset(createServiceClient(), createConfiguredTransport(), {
    slug,
    email: parsed.data,
  });
  return { done: true, email: parsed.data };
}
