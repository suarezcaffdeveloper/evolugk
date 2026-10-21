import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { sessionCookieOptions } from "@/lib/supabase/cookie-options";

/**
 * Mantiene viva la sesión: en cada pedido, Supabase renueva el token si hace falta y se reescribe
 * la cookie, lo que da la ventana de 30 días "con el uso" (spec 00, RF-08).
 *
 * No decide permisos: eso lo hacen las páginas y acciones (y, en última instancia, RLS).
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: sessionCookieOptions,
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, { ...options, ...sessionCookieOptions }),
          );
        },
      },
    },
  );

  // Valida el token con el servidor de Supabase y lo renueva si venció. Sin cookies, no hace nada.
  if (request.cookies.getAll().some((cookie) => cookie.name.startsWith("sb-"))) {
    await supabase.auth.getUser();
  }

  return response;
}

export const config = {
  // Todo menos los archivos estáticos y las imágenes.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
