import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente con la clave secreta: se saltea la seguridad por escuela (RLS).
 *
 * Solo para código de servidor y SIEMPRE después de verificar en el código quién es la
 * persona y qué puede hacer. Nunca se importa desde componentes de cliente (el import de
 * "server-only" lo impide) ni se le pasa a ellos.
 */
export function createServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY en las variables de entorno.",
    );
  }
  return createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
}
