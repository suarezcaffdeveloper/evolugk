import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CONSENT_TEXT_VERSION } from "@/lib/consent-text";
import {
  guardianSchema,
  type Foot,
  type GoalkeeperStatus,
  type Level,
  type Relationship,
} from "@/lib/goalkeeper-schemas";
import { consentStatusOf, type ConsentStatus } from "../goalkeepers";
import type { GuardianSession } from "./access";

/**
 * Lecturas y escrituras del portal de familia (spec 04). El cliente con clave secreta se saltea
 * RLS, así que cada función filtra por el tutor de la sesión y por su escuela: un tutor solo
 * llega a los arqueros vinculados a él (RN-01).
 */

type Db = SupabaseClient;

async function audit(
  db: Db,
  session: GuardianSession,
  action: string,
  entity: string,
  entityId: string,
  details: Record<string, unknown> = {},
) {
  // De mejor esfuerzo: la auditoría no debe impedir la acción ya realizada. El actor es el tutor
  // (no es un usuario de Supabase Auth), por eso se aclara en el detalle.
  await db.from("audit_log").insert({
    school_id: session.schoolId,
    actor_id: session.guardianId,
    action,
    entity,
    entity_id: entityId,
    details: { actor: "guardian", ...details },
  });
}

// ───────────────────────────── arqueros del tutor ─────────────────────────────

export type FamilyGoalkeeper = {
  id: string;
  firstName: string;
  lastName: string;
  status: GoalkeeperStatus;
  relationship: Relationship;
  consent: ConsentStatus;
};

/** Arqueros vinculados al tutor de la sesión, con el estado de consentimiento de cada uno. */
export async function listFamilyGoalkeepers(
  db: Db,
  session: GuardianSession,
): Promise<FamilyGoalkeeper[]> {
  const { data: links } = await db
    .from("goalkeeper_guardian")
    .select("goalkeeper_id, relationship")
    .eq("school_id", session.schoolId)
    .eq("guardian_id", session.guardianId);
  const ids = (links ?? []).map((l) => l.goalkeeper_id as string);
  if (ids.length === 0) return [];

  const [{ data: rows }, { data: consents }] = await Promise.all([
    db
      .from("goalkeeper")
      .select("id, first_name, last_name, status")
      .eq("school_id", session.schoolId)
      .in("id", ids),
    db
      .from("consent")
      .select("goalkeeper_id, revoked_at")
      .eq("school_id", session.schoolId)
      .eq("type", "media")
      .in("goalkeeper_id", ids),
  ]);

  const relationship = new Map((links ?? []).map((l) => [l.goalkeeper_id, l.relationship]));
  const consentsBy = new Map<string, { revoked_at: string | null }[]>();
  for (const c of consents ?? []) {
    const list = consentsBy.get(c.goalkeeper_id) ?? [];
    list.push(c);
    consentsBy.set(c.goalkeeper_id, list);
  }

  return (rows ?? [])
    .map((r) => ({
      id: r.id as string,
      firstName: r.first_name as string,
      lastName: r.last_name as string,
      status: r.status as GoalkeeperStatus,
      relationship: relationship.get(r.id) as Relationship,
      consent: consentStatusOf(consentsBy.get(r.id) ?? []),
    }))
    .sort((a, b) => a.firstName.localeCompare(b.firstName, "es"));
}

/** Un arquero del tutor, o null si no existe o no es suyo (CA-12). */
export async function getFamilyGoalkeeper(
  db: Db,
  session: GuardianSession,
  goalkeeperId: string,
): Promise<FamilyGoalkeeper | null> {
  const all = await listFamilyGoalkeepers(db, session);
  return all.find((g) => g.id === goalkeeperId) ?? null;
}

// ───────────────────────────── consentimiento ─────────────────────────────

export type ConsentResult = { ok: true } | { ok: false; message: string };

/**
 * El tutor da el consentimiento de imagen y video de un arquero suyo (spec 01, RF-26). Basta un
 * tutor (CA-02): si ya hay uno vigente no se duplica.
 */
export async function grantConsent(
  db: Db,
  session: GuardianSession,
  goalkeeperId: string,
): Promise<ConsentResult> {
  if (!(await getFamilyGoalkeeper(db, session, goalkeeperId))) {
    return { ok: false, message: "No encontramos a ese arquero." };
  }

  const { error } = await db.from("consent").insert({
    school_id: session.schoolId,
    goalkeeper_id: goalkeeperId,
    guardian_id: session.guardianId,
    type: "media",
    text_version: CONSENT_TEXT_VERSION,
  });
  // 23505: ya había uno vigente (otro tutor o un doble envío). El resultado es el mismo.
  if (error && error.code !== "23505") {
    return { ok: false, message: "No pudimos registrar el consentimiento. Probá de nuevo." };
  }
  if (!error) {
    await audit(db, session, "consent.granted", "goalkeeper", goalkeeperId, {
      textVersion: CONSENT_TEXT_VERSION,
    });
  }
  return { ok: true };
}

/** El tutor retira el consentimiento vigente de un arquero suyo (spec 01, RF-29; spec 04, RF-32). */
export async function revokeConsent(
  db: Db,
  session: GuardianSession,
  goalkeeperId: string,
): Promise<ConsentResult> {
  if (!(await getFamilyGoalkeeper(db, session, goalkeeperId))) {
    return { ok: false, message: "No encontramos a ese arquero." };
  }

  const { data, error } = await db
    .from("consent")
    .update({ revoked_at: new Date().toISOString(), revoked_by: session.guardianId })
    .eq("school_id", session.schoolId)
    .eq("goalkeeper_id", goalkeeperId)
    .eq("type", "media")
    .is("revoked_at", null)
    .select("id");
  if (error) return { ok: false, message: "No pudimos retirar el consentimiento. Probá de nuevo." };
  if ((data ?? []).length > 0) {
    await audit(db, session, "consent.revoked", "goalkeeper", goalkeeperId);
  }
  return { ok: true };
}

// ───────────────────────────── primer ingreso ─────────────────────────────

/** Cierra el asistente de primer ingreso: el tutor ya cambió el PIN y vio el consentimiento. */
export async function completeFirstLogin(db: Db, session: GuardianSession): Promise<void> {
  const { error } = await db
    .from("guardian")
    .update({ first_login_completed: true })
    .eq("id", session.guardianId)
    .eq("school_id", session.schoolId);
  if (error) throw new Error(`No se pudo completar el primer ingreso: ${error.message}`);
}

// ───────────────────────────── mis datos ─────────────────────────────

export type GuardianProfile = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  accessCode: string;
};

export async function getGuardianProfile(
  db: Db,
  session: GuardianSession,
): Promise<GuardianProfile | null> {
  const { data } = await db
    .from("guardian")
    .select("first_name, last_name, phone, email, access_code")
    .eq("id", session.guardianId)
    .eq("school_id", session.schoolId)
    .maybeSingle();
  if (!data) return null;
  return {
    firstName: data.first_name,
    lastName: data.last_name,
    phone: data.phone,
    email: data.email,
    accessCode: data.access_code,
  };
}

export type ContactResult =
  { ok: true } | { ok: false; fieldErrors?: { phone?: string; email?: string }; message?: string };

/** El tutor cambia su mail y su teléfono; el nombre lo cambia la escuela (spec 04, RF-28). */
export async function updateGuardianContact(
  db: Db,
  session: GuardianSession,
  input: { phone: unknown; email: unknown },
): Promise<ContactResult> {
  const parsed = guardianSchema
    .pick({ phone: true, email: true })
    .safeParse({ phone: input.phone, email: input.email });
  if (!parsed.success) {
    const fieldErrors: { phone?: string; email?: string } = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if ((key === "phone" || key === "email") && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return { ok: false, fieldErrors };
  }

  const { error } = await db
    .from("guardian")
    .update({ phone: parsed.data.phone, email: parsed.data.email })
    .eq("id", session.guardianId)
    .eq("school_id", session.schoolId);
  if (error) return { ok: false, message: "No pudimos guardar tus datos. Probá de nuevo." };

  await audit(db, session, "guardian.contact_updated", "guardian", session.guardianId);
  return { ok: true };
}

/** Registra en la auditoría un cambio de PIN hecho por el propio tutor (spec 04, RF-30). */
export function auditPinChange(db: Db, session: GuardianSession): Promise<void> {
  return audit(db, session, "guardian.pin_changed", "guardian", session.guardianId);
}

// ───────────────────────────── ficha para la familia ─────────────────────────────

export type FamilyGoalkeeperProfile = {
  birthDate: string;
  joinedOn: string;
  preferredFoot: Foot | null;
  level: Level | null;
  currentClub: string | null;
  category: string | null;
  goal: string | null;
  groups: string[];
  measurements: { id: string; date: string; heightCm: number | null; weightKg: number | null }[];
};

/**
 * Datos de la ficha que la familia puede ver (spec 04, RF-18). No incluye el contacto de
 * emergencia (RN-03) ni la foto: hasta que existan los videos y fotos, el portal no las muestra.
 * El arquero ya se verificó como propio del tutor (`getFamilyGoalkeeper`).
 */
export async function getFamilyGoalkeeperProfile(
  db: Db,
  session: GuardianSession,
  goalkeeperId: string,
): Promise<FamilyGoalkeeperProfile | null> {
  const [{ data: row }, { data: memberships }, { data: measurements }] = await Promise.all([
    db
      .from("goalkeeper")
      .select("birth_date, joined_on, preferred_foot, level, current_club, category, goal")
      .eq("school_id", session.schoolId)
      .eq("id", goalkeeperId)
      .maybeSingle(),
    db
      .from("goalkeeper_group")
      .select("groups(name)")
      .eq("school_id", session.schoolId)
      .eq("goalkeeper_id", goalkeeperId),
    db
      .from("goalkeeper_measurement")
      .select("id, date, height_cm, weight_kg")
      .eq("school_id", session.schoolId)
      .eq("goalkeeper_id", goalkeeperId)
      .order("date", { ascending: false })
      .limit(12),
  ]);
  if (!row) return null;

  return {
    birthDate: row.birth_date,
    joinedOn: row.joined_on,
    preferredFoot: row.preferred_foot,
    level: row.level,
    currentClub: row.current_club,
    category: row.category,
    goal: row.goal,
    groups: (memberships ?? [])
      .map((m) => (m.groups as unknown as { name: string } | null)?.name)
      .filter((name): name is string => Boolean(name)),
    measurements: (measurements ?? []).map((m) => ({
      id: m.id,
      date: m.date,
      heightCm: m.height_cm === null ? null : Number(m.height_cm),
      weightKg: m.weight_kg === null ? null : Number(m.weight_kg),
    })),
  };
}
