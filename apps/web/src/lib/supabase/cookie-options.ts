/**
 * Cookies de sesión (spec 00: sesión del staff de 30 días que se renueva con el uso).
 *
 * La cookie se vuelve a escribir cada vez que Supabase renueva el token (cerca de una vez por
 * hora de actividad), así que vence a los 30 días SIN ingresar. Es httpOnly: la aplicación
 * maneja toda la autenticación desde el servidor y el navegador no necesita leerla.
 */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export const sessionCookieOptions = {
  maxAge: SESSION_MAX_AGE_SECONDS,
  path: "/",
  sameSite: "lax" as const,
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
};
