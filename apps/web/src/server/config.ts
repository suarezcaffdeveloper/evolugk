/**
 * Configuración que viene del entorno. Se lee cuando se usa (no al cargar el módulo) para que las
 * pruebas y los scripts puedan cambiar las variables.
 */

const DEV_APP_URL = "http://localhost:3000";

/**
 * Dirección pública de la aplicación, sin barra final. Con ella se arman los links de los mails
 * (invitaciones y recuperación). En producción es obligatoria.
 */
export function getAppUrl(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.APP_URL?.trim();
  if (value) return value.replace(/\/+$/, "");
  if (env.NODE_ENV === "production") {
    throw new Error("Falta la variable de entorno APP_URL (dirección pública de la aplicación).");
  }
  return DEV_APP_URL;
}

/**
 * Remitente de los mails. Mientras no haya un dominio propio verificado en Resend, la dirección de
 * prueba `onboarding@resend.dev` solo entrega mails a la casilla de la cuenta de Resend.
 */
export const DEFAULT_EMAIL_FROM = "EvoluGK <onboarding@resend.dev>";

export function getEmailConfig(env: NodeJS.ProcessEnv = process.env): {
  apiKey: string | null;
  from: string;
} {
  return {
    apiKey: env.RESEND_API_KEY?.trim() || null,
    from: env.EMAIL_FROM?.trim() || DEFAULT_EMAIL_FROM,
  };
}
