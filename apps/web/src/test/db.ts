/**
 * Utilidades para las pruebas contra la base de datos.
 *
 * Corren contra el proyecto de DESARROLLO de Supabase y se niegan a correr contra otro:
 * crean escuelas y usuarios de prueba (con prefijo reconocible) y los borran al terminar.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { totpCode } from "./totp";

const DEV_PROJECT_REF = "udticdfguwfckqrrzdfb";
const SLUG_PREFIX = "test-iso-";
const EMAIL_PREFIX = "isolation-test-";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name} (apps/web/.env.local).`);
  return value;
}

export function getConfig() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const publishableKey = requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const secretKey = requireEnv("SUPABASE_SECRET_KEY");
  const allowedRef = process.env.TEST_SUPABASE_PROJECT_REF ?? DEV_PROJECT_REF;
  if (!new URL(url).host.startsWith(`${allowedRef}.`)) {
    throw new Error(
      "Las pruebas de base de datos solo corren contra el proyecto de desarrollo. " +
        "Revisá NEXT_PUBLIC_SUPABASE_URL.",
    );
  }
  return { url, publishableKey, secretKey };
}

const authOptions = { auth: { persistSession: false, autoRefreshToken: false } };

/** Cliente con la clave secreta: se saltea RLS. Solo para preparar y limpiar datos. */
export function createAdminClient(): SupabaseClient {
  const { url, secretKey } = getConfig();
  return createClient(url, secretKey, authOptions);
}

/** Cliente con la clave pública y sin sesión (equivale a una persona sin iniciar sesión). */
export function createAnonClient(): SupabaseClient {
  const { url, publishableKey } = getConfig();
  return createClient(url, publishableKey, authOptions);
}

export type TestUser = { id: string; email: string; password: string };
export type TestSchool = { id: string; slug: string };
export type Role = "platform_admin" | "school_admin" | "coach";

const unique = () => randomUUID().replace(/-/g, "").slice(0, 10);

export async function createUser(admin: SupabaseClient, label: string): Promise<TestUser> {
  const email = `${EMAIL_PREFIX}${label}-${unique()}@example.com`;
  const password = `Aa1-${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user)
    throw new Error(`No se pudo crear el usuario de prueba: ${error?.message}`);
  return { id: data.user.id, email, password };
}

export async function createSchool(
  admin: SupabaseClient,
  label: string,
  overrides: Record<string, unknown> = {},
): Promise<TestSchool> {
  const slug = `${SLUG_PREFIX}${label}-${unique()}`.slice(0, 30);
  const { data, error } = await admin
    .from("school")
    .insert({ name: `Escuela de prueba ${label}`, slug, ...overrides })
    .select("id, slug")
    .single();
  if (error || !data) throw new Error(`No se pudo crear la escuela de prueba: ${error?.message}`);

  const sub = await admin.from("subscription").insert({
    school_id: data.id,
    monthly_price_ars: 10000,
    goalkeeper_limit: 50,
    video_minutes_limit: 600,
    trial_until: "2099-01-01",
    covered_until: "2099-01-01",
  });
  if (sub.error) throw new Error(`No se pudo crear la suscripción de prueba: ${sub.error.message}`);
  return data;
}

export async function createProfile(
  admin: SupabaseClient,
  profile: {
    userId: string;
    schoolId: string | null;
    role: Role;
    active?: boolean;
    label?: string;
  },
) {
  return admin.from("profile").insert({
    user_id: profile.userId,
    school_id: profile.schoolId,
    role: profile.role,
    first_name: profile.label ?? "Prueba",
    last_name: "Aislamiento",
    active: profile.active ?? true,
  });
}

/** Crea un usuario con perfil de staff en una escuela. */
export async function createStaff(
  admin: SupabaseClient,
  school: TestSchool,
  role: "school_admin" | "coach",
  label: string,
): Promise<TestUser> {
  const user = await createUser(admin, label);
  const { error } = await createProfile(admin, {
    userId: user.id,
    schoolId: school.id,
    role,
    label,
  });
  if (error) throw new Error(`No se pudo crear el perfil de prueba: ${error.message}`);
  return user;
}

/** Cliente con sesión iniciada como el usuario indicado (usa la clave pública, así aplica RLS). */
export async function signIn(user: TestUser): Promise<SupabaseClient> {
  const client = createAnonClient();
  const { error } = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (error) throw new Error(`No se pudo iniciar sesión como ${user.email}: ${error.message}`);
  return client;
}

/**
 * Sube la sesión del cliente a verificación en dos pasos (nivel aal2): inscribe una app de
 * autenticación simulada y verifica un código. Devuelve el secreto, para poder repetir el paso.
 */
export async function elevateToAal2(
  client: SupabaseClient,
): Promise<{ secret: string; factorId: string }> {
  const { data, error } = await client.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `prueba-${unique()}`,
  });
  if (error || !data) throw new Error(`No se pudo inscribir el segundo paso: ${error?.message}`);
  const verified = await client.auth.mfa.challengeAndVerify({
    factorId: data.id,
    code: totpCode(data.totp.secret),
  });
  if (verified.error)
    throw new Error(`No se pudo verificar el segundo paso: ${verified.error.message}`);
  return { secret: data.totp.secret, factorId: data.id };
}

/** Inicia sesión y completa la verificación en dos pasos (equivale a un operador ya verificado). */
export async function signInWithMfa(user: TestUser): Promise<SupabaseClient> {
  const client = await signIn(user);
  await elevateToAal2(client);
  return client;
}

/** Borra las escuelas (con sus perfiles, invitaciones y suscripción), sus pagos y luego los usuarios. */
export async function cleanup(
  admin: SupabaseClient,
  created: { schoolIds: string[]; userIds: string[] },
) {
  if (created.schoolIds.length) {
    await admin.from("audit_log").delete().in("school_id", created.schoolIds);
    await admin.from("school").delete().in("id", created.schoolIds);
    // Estas tablas no cuelgan de la escuela (sobreviven a su borrado a propósito): se limpian aparte.
    await admin.from("subscription_payment").delete().in("school_id", created.schoolIds);
    await admin.from("video_provider_cleanup").delete().in("school_id", created.schoolIds);
  }
  for (const id of created.userIds) {
    await admin.auth.admin.deleteUser(id);
  }
}

/** Elimina restos de ejecuciones anteriores que se hayan cortado a la mitad. */
export async function purgeLeftovers(admin: SupabaseClient) {
  const { data: schools } = await admin.from("school").select("id").like("slug", `${SLUG_PREFIX}%`);
  const schoolIds = (schools ?? []).map((s) => s.id as string);

  const userIds: string[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    const users = data?.users ?? [];
    userIds.push(...users.filter((u) => u.email?.startsWith(EMAIL_PREFIX)).map((u) => u.id));
    if (users.length < 200) break;
  }
  await cleanup(admin, { schoolIds, userIds });
}
