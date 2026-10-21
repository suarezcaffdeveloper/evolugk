import { getEmailConfig } from "../config";

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type SendResult =
  | { ok: true; id: string | null }
  | { ok: false; reason: "not_configured" | "rejected" | "network_error"; detail?: string };

/** Algo que sabe mandar un mail. Nunca lanza: devuelve el resultado. */
export type EmailTransport = (message: EmailMessage) => Promise<SendResult>;

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const TIMEOUT_MS = 10_000;

/**
 * Transporte por la API de Resend. Recibe `fetch` para poder probarse sin red. La clave solo
 * viaja en la cabecera de autorización: nunca aparece en los resultados ni en los errores.
 */
export function createResendTransport(options: {
  apiKey: string;
  from: string;
  fetchImpl?: typeof fetch;
}): EmailTransport {
  const { apiKey, from, fetchImpl = fetch } = options;

  return async (message) => {
    try {
      const response = await fetchImpl(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      const body = (await response.json().catch(() => null)) as {
        id?: string;
        message?: string;
        name?: string;
      } | null;

      if (!response.ok) {
        return {
          ok: false,
          reason: "rejected",
          detail: `${response.status} ${body?.name ?? ""} ${body?.message ?? ""}`.trim(),
        };
      }
      return { ok: true, id: body?.id ?? null };
    } catch (error) {
      return {
        ok: false,
        reason: "network_error",
        detail: error instanceof Error ? error.name : "error desconocido",
      };
    }
  };
}

/** Transporte según el entorno. Sin RESEND_API_KEY no manda nada y lo informa (la UI muestra el link). */
export function createConfiguredTransport(env: NodeJS.ProcessEnv = process.env): EmailTransport {
  const { apiKey, from } = getEmailConfig(env);
  if (!apiKey) return async () => ({ ok: false, reason: "not_configured" });
  return createResendTransport({ apiKey, from });
}
