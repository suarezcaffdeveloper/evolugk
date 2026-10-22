import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * Las tareas programadas se llaman con `Authorization: Bearer <CRON_SECRET>` (Vercel Cron lo
 * manda solo cuando la variable existe). Sin secreto configurado se rechaza todo. La comparación
 * es de tiempo constante para no filtrar el secreto por la latencia de la respuesta.
 */
export function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;

  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  return received.length === expected.length && timingSafeEqual(received, expected);
}
