import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { fieldErrorsFrom, type FieldErrors } from "@/lib/auth-schemas";

/**
 * Invitaciones de staff (spec 00, RF-06, RF-10, RF-11 y RN-07).
 *
 * El token viaja solo en el link del mail: en la base se guarda únicamente su hash (SHA-256), así
 * que quien lea la tabla no puede aceptar invitaciones. Todas las funciones reciben el cliente con
 * la clave secreta y devuelven un resultado: los errores esperados no lanzan.
 */

export const INVITATION_TTL_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type InvitableRole = "school_admin" | "coach";

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** 32 bytes aleatorios en base64url (43 caracteres) y su hash. */
export function generateToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

export const emailSchema = z
  .string({ error: "Ingresá un mail." })
  .trim()
  .toLowerCase()
  .min(1, "Ingresá un mail.")
  .pipe(z.email({ error: "El mail no tiene un formato válido." }));

/* ───────────────────────────── crear ───────────────────────────── */

export type CreateInvitationResult =
  | {
      ok: true;
      token: string;
      invitation: { id: string; email: string; role: InvitableRole; expiresAt: Date };
    }
  | {
      ok: false;
      error: "invalid_email" | "email_in_use" | "school_not_found" | "failed";
      message?: string;
    };

/**
 * Crea una invitación y devuelve el token en claro (única vez que existe). Si ya había una abierta
 * para el mismo mail y escuela, la revoca (así "reenviar" no deja links viejos vivos).
 * Rechaza mails que ya tienen cuenta: una cuenta pertenece a una sola escuela.
 */
export async function createInvitation(
  admin: SupabaseClient,
  input: {
    schoolId: string;
    email: unknown;
    role: InvitableRole;
    createdBy: string | null;
    now?: Date;
  },
): Promise<CreateInvitationResult> {
  const parsed = emailSchema.safeParse(input.email);
  if (!parsed.success) {
    return { ok: false, error: "invalid_email", message: parsed.error.issues[0]?.message };
  }
  const email = parsed.data;
  const now = input.now ?? new Date();

  const existing = await admin.rpc("find_user_id_by_email", { p_email: email });
  if (existing.error) return { ok: false, error: "failed" };
  if (existing.data) return { ok: false, error: "email_in_use" };

  const revoked = await admin
    .from("invitation")
    .update({ revoked_at: now.toISOString() })
    .eq("school_id", input.schoolId)
    .eq("email", email)
    .is("used_at", null)
    .is("revoked_at", null);
  if (revoked.error) return { ok: false, error: "failed" };

  const { token, hash } = generateToken();
  const expiresAt = new Date(now.getTime() + INVITATION_TTL_DAYS * DAY_MS);
  const { data, error } = await admin
    .from("invitation")
    .insert({
      school_id: input.schoolId,
      email,
      role: input.role,
      token_hash: hash,
      expires_at: expiresAt.toISOString(),
      created_by: input.createdBy,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.code === "23503" ? "school_not_found" : "failed" };
  }
  return { ok: true, token, invitation: { id: data.id, email, role: input.role, expiresAt } };
}

/* ───────────────────────────── consultar ───────────────────────────── */

export type InvitationStatus =
  "valid" | "expired" | "used" | "revoked" | "school_unavailable" | "not_found";

export type InvitationLookup =
  | { status: "not_found" }
  | {
      status: Exclude<InvitationStatus, "not_found">;
      invitation: { id: string; email: string; role: InvitableRole; expiresAt: Date };
      school: {
        id: string;
        name: string;
        slug: string;
        primaryColor: string | null;
        logoUrl: string | null;
      };
    };

type InvitationRow = {
  id: string;
  email: string;
  role: InvitableRole;
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
  school: {
    id: string;
    name: string;
    slug: string;
    primary_color: string | null;
    logo_url: string | null;
    status: string;
  } | null;
};

/** Busca una invitación por su token y dice en qué estado está. Un token mal formado ni consulta la base. */
export async function lookupInvitation(
  admin: SupabaseClient,
  token: string,
  now: Date = new Date(),
): Promise<InvitationLookup> {
  if (!TOKEN_PATTERN.test(token)) return { status: "not_found" };

  const { data } = await admin
    .from("invitation")
    .select(
      "id, email, role, expires_at, used_at, revoked_at, school:school_id (id, name, slug, primary_color, logo_url, status)",
    )
    .eq("token_hash", hashToken(token))
    .maybeSingle<InvitationRow>();
  if (!data || !data.school) return { status: "not_found" };

  const expiresAt = new Date(data.expires_at);
  let status: Exclude<InvitationStatus, "not_found"> = "valid";
  if (data.used_at) status = "used";
  else if (data.revoked_at) status = "revoked";
  else if (expiresAt.getTime() <= now.getTime()) status = "expired";
  else if (data.school.status !== "active") status = "school_unavailable";

  return {
    status,
    invitation: { id: data.id, email: data.email, role: data.role, expiresAt },
    school: {
      id: data.school.id,
      name: data.school.name,
      slug: data.school.slug,
      primaryColor: data.school.primary_color,
      logoUrl: data.school.logo_url,
    },
  };
}

/* ───────────────────────────── revocar ───────────────────────────── */

/** Revoca una invitación abierta de la escuela indicada. Devuelve si había algo para revocar. */
export async function revokeInvitation(
  admin: SupabaseClient,
  input: { schoolId: string; invitationId: string; now?: Date },
): Promise<boolean> {
  const { data } = await admin
    .from("invitation")
    .update({ revoked_at: (input.now ?? new Date()).toISOString() })
    .eq("id", input.invitationId)
    .eq("school_id", input.schoolId)
    .is("used_at", null)
    .is("revoked_at", null)
    .select("id");
  return (data?.length ?? 0) > 0;
}

export type PendingInvitation = {
  id: string;
  email: string;
  role: InvitableRole;
  expiresAt: Date;
  expired: boolean;
  createdAt: Date;
};

/** Invitaciones sin aceptar ni revocar de una escuela (las vencidas se marcan, para poder reenviarlas). */
export async function listPendingInvitations(
  admin: SupabaseClient,
  schoolId: string,
  now: Date = new Date(),
): Promise<PendingInvitation[]> {
  const { data } = await admin
    .from("invitation")
    .select("id, email, role, expires_at, created_at")
    .eq("school_id", schoolId)
    .is("used_at", null)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  return (data ?? []).map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role,
    expiresAt: new Date(row.expires_at),
    expired: new Date(row.expires_at).getTime() <= now.getTime(),
    createdAt: new Date(row.created_at),
  }));
}

/* ───────────────────────────── aceptar ───────────────────────────── */

export const acceptInvitationSchema = z
  .object({
    firstName: z
      .string({ error: "Ingresá tu nombre." })
      .trim()
      .min(1, "Ingresá tu nombre.")
      .max(80, "El nombre es demasiado largo."),
    lastName: z
      .string({ error: "Ingresá tu apellido." })
      .trim()
      .min(1, "Ingresá tu apellido.")
      .max(80, "El apellido es demasiado largo."),
    password: z
      .string({ error: "Elegí una contraseña." })
      .min(8, "La contraseña debe tener al menos 8 caracteres."),
    passwordConfirmation: z.string({ error: "Repetí la contraseña." }),
  })
  .refine((v) => v.password === v.passwordConfirmation, {
    path: ["passwordConfirmation"],
    message: "Las contraseñas no coinciden.",
  });

export type AcceptInvitationResult =
  | { ok: true; userId: string; email: string; schoolSlug: string; role: InvitableRole }
  | { ok: false; error: "invalid_input"; fieldErrors: FieldErrors }
  | {
      ok: false;
      error: Exclude<InvitationStatus, "valid"> | "email_in_use" | "weak_password" | "failed";
    };

/**
 * Acepta una invitación: crea la cuenta (mail ya confirmado) y el perfil con el rol invitado.
 *
 * Primero "reclama" la invitación con una actualización condicional (así dos pedidos simultáneos
 * no crean dos cuentas); si algo falla después, libera el reclamo y deshace lo creado.
 */
export async function acceptInvitation(
  admin: SupabaseClient,
  input: {
    token: string;
    firstName?: unknown;
    lastName?: unknown;
    password?: unknown;
    passwordConfirmation?: unknown;
    now?: Date;
  },
): Promise<AcceptInvitationResult> {
  const now = input.now ?? new Date();

  const lookup = await lookupInvitation(admin, input.token, now);
  if (lookup.status !== "valid") return { ok: false, error: lookup.status };

  const parsed = acceptInvitationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "invalid_input", fieldErrors: fieldErrorsFrom(parsed.error) };
  }
  const { firstName, lastName, password } = parsed.data;
  if (password.toLowerCase() === lookup.invitation.email) {
    return {
      ok: false,
      error: "invalid_input",
      fieldErrors: { password: "La contraseña no puede ser igual al mail." },
    };
  }

  const release = () =>
    admin.from("invitation").update({ used_at: null }).eq("id", lookup.invitation.id);

  // Reclamo atómico: solo uno de los pedidos simultáneos lo logra.
  const claim = await admin
    .from("invitation")
    .update({ used_at: now.toISOString() })
    .eq("id", lookup.invitation.id)
    .is("used_at", null)
    .is("revoked_at", null)
    .gt("expires_at", now.toISOString())
    .select("id");
  if (claim.error) return { ok: false, error: "failed" };
  if (!claim.data?.length) return { ok: false, error: "used" };

  const created = await admin.auth.admin.createUser({
    email: lookup.invitation.email,
    password,
    email_confirm: true,
  });
  if (created.error || !created.data.user) {
    await release();
    const code = created.error && "code" in created.error ? created.error.code : undefined;
    if (code === "email_exists" || code === "user_already_exists")
      return { ok: false, error: "email_in_use" };
    if (code === "weak_password") return { ok: false, error: "weak_password" };
    return { ok: false, error: "failed" };
  }

  const userId = created.data.user.id;
  const profile = await admin.from("profile").insert({
    user_id: userId,
    school_id: lookup.school.id,
    role: lookup.invitation.role,
    first_name: firstName,
    last_name: lastName,
  });
  if (profile.error) {
    await admin.auth.admin.deleteUser(userId);
    await release();
    return { ok: false, error: "failed" };
  }

  // La auditoría es de mejor esfuerzo: no debe impedir que la cuenta quede creada.
  await admin.from("audit_log").insert({
    school_id: lookup.school.id,
    actor_id: userId,
    action: "invitation.accepted",
    entity: "invitation",
    entity_id: lookup.invitation.id,
    details: { role: lookup.invitation.role },
  });

  return {
    ok: true,
    userId,
    email: lookup.invitation.email,
    schoolSlug: lookup.school.slug,
    role: lookup.invitation.role,
  };
}
