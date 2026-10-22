import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { fieldErrorsFrom, type FieldErrors } from "@/lib/auth-schemas";
import { isValidSlug, normalizeSlug } from "@/lib/slug";
import { getAppUrl } from "./config";
import { passwordResetEmail } from "./email/templates";
import type { EmailTransport } from "./email/transport";
import { emailSchema } from "./invitations";

/** Recuperación de contraseña del staff (spec 00, RF-09). El mail lo mandamos nosotros, con la marca de la escuela. */

/** Una persona no puede pedir más de un mail de recuperación por este lapso. */
export const RESET_COOLDOWN_MS = 60_000;
const AUDIT_ACTION = "auth.password_reset_requested";

/**
 * Pide el mail de recuperación. **Siempre termina igual** (sin error) para no revelar si el mail
 * existe, si pertenece a esa escuela o si está desactivado: solo manda el mail cuando corresponde.
 */
export async function requestPasswordReset(
  admin: SupabaseClient,
  transport: EmailTransport,
  input: { slug: string; email: unknown; now?: Date },
): Promise<void> {
  const email = emailSchema.safeParse(input.email);
  const slug = normalizeSlug(input.slug);
  if (!email.success || !isValidSlug(slug)) return;
  const now = input.now ?? new Date();

  const { data: school } = await admin
    .from("school")
    .select("id, name, primary_color, status")
    .eq("slug", slug)
    .maybeSingle();
  if (!school || school.status !== "active") return;

  const found = await admin.rpc("find_user_id_by_email", { p_email: email.data });
  const userId = found.data as string | null;
  if (!userId) return;

  const { data: profile } = await admin
    .from("profile")
    .select("school_id, role, active")
    .eq("user_id", userId)
    .maybeSingle();
  const allowed =
    profile?.active === true &&
    profile.school_id === school.id &&
    (profile.role === "school_admin" || profile.role === "coach");
  if (!allowed) return;

  // Freno simple contra el abuso (mails repetidos a una misma persona).
  const since = new Date(now.getTime() - RESET_COOLDOWN_MS).toISOString();
  const recent = await admin
    .from("audit_log")
    .select("id", { count: "exact", head: true })
    .eq("action", AUDIT_ACTION)
    .eq("actor_id", userId)
    .gte("created_at", since);
  if ((recent.count ?? 0) > 0) return;

  const generated = await admin.auth.admin.generateLink({ type: "recovery", email: email.data });
  const tokenHash = generated.data?.properties?.hashed_token;
  if (generated.error || !tokenHash) return;

  await admin.from("audit_log").insert({
    school_id: school.id,
    actor_id: userId,
    action: AUDIT_ACTION,
    entity: "profile",
    entity_id: userId,
  });

  await transport(
    passwordResetEmail({
      to: email.data,
      schoolName: school.name,
      link: resetLink(slug, tokenHash),
      accentColor: school.primary_color,
    }),
  );
}

export function resetLink(slug: string, tokenHash: string, appUrl: string = getAppUrl()): string {
  return `${appUrl}/${slug}/restablecer?token_hash=${encodeURIComponent(tokenHash)}`;
}

export const resetPasswordSchema = z
  .object({
    password: z
      .string({ error: "Elegí una contraseña." })
      .min(8, "La contraseña debe tener al menos 8 caracteres."),
    passwordConfirmation: z.string({ error: "Repetí la contraseña." }),
  })
  .refine((v) => v.password === v.passwordConfirmation, {
    path: ["passwordConfirmation"],
    message: "Las contraseñas no coinciden.",
  });

export type ResetPasswordResult =
  | { ok: true }
  | { ok: false; error: "invalid_input"; fieldErrors: FieldErrors }
  | { ok: false; error: "invalid_link" | "weak_password" | "failed" };

/**
 * Cambia la contraseña con el link del mail. Verifica el token acá (al enviar el formulario) y no al
 * abrir la página: los programas que "previsualizan" links de los mails los consumirían antes que la persona.
 * El `auth` es el cliente de la persona (queda con la sesión de recuperación para poder cambiarla).
 */
export async function resetPassword(
  { admin, auth }: { admin: SupabaseClient; auth: SupabaseClient },
  input: { slug: string; tokenHash: unknown; password?: unknown; passwordConfirmation?: unknown },
): Promise<ResetPasswordResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "invalid_input", fieldErrors: fieldErrorsFrom(parsed.error) };
  }
  const slug = normalizeSlug(input.slug);
  if (!isValidSlug(slug) || typeof input.tokenHash !== "string" || !input.tokenHash) {
    return { ok: false, error: "invalid_link" };
  }

  const verified = await auth.auth.verifyOtp({ token_hash: input.tokenHash, type: "recovery" });
  if (verified.error || !verified.data.user) return { ok: false, error: "invalid_link" };
  const user = verified.data.user;

  // La cuenta debe seguir siendo del staff activo de esta escuela (activa).
  const [{ data: school }, { data: profile }] = await Promise.all([
    admin.from("school").select("id, status").eq("slug", slug).maybeSingle(),
    admin.from("profile").select("school_id, role, active").eq("user_id", user.id).maybeSingle(),
  ]);
  const allowed =
    school?.status === "active" &&
    profile?.active === true &&
    profile.school_id === school.id &&
    (profile.role === "school_admin" || profile.role === "coach");
  if (!allowed) {
    await auth.auth.signOut();
    return { ok: false, error: "invalid_link" };
  }

  const updated = await auth.auth.updateUser({ password: parsed.data.password });
  // Después de cambiarla, la persona ingresa de nuevo con la contraseña nueva.
  await auth.auth.signOut();
  if (updated.error) {
    const code = "code" in updated.error ? updated.error.code : undefined;
    return {
      ok: false,
      error: code === "weak_password" || code === "same_password" ? "weak_password" : "failed",
    };
  }

  await admin.from("audit_log").insert({
    school_id: school.id,
    actor_id: user.id,
    action: "auth.password_reset_completed",
    entity: "profile",
    entity_id: user.id,
  });
  return { ok: true };
}
