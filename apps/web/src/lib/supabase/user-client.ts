import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { sessionCookieOptions } from "./cookie-options";

/**
 * Cliente de Supabase con la sesión de la persona (cookies) y la clave pública: aplica RLS.
 * Para acciones de servidor y páginas; las lecturas/escrituras privilegiadas usan createServiceClient.
 */
export async function createUserClient(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
  }

  const cookieStore = await cookies();
  return createServerClient(url, publishableKey, {
    cookieOptions: sessionCookieOptions,
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, { ...options, ...sessionCookieOptions }),
          );
        } catch {
          // Desde un componente de servidor no se pueden escribir cookies: no pasa nada,
          // el proxy renueva la sesión en cada pedido.
        }
      },
    },
  });
}
