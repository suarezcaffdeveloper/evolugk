/**
 * Cuándo y cómo sugerir instalar la app (spec 04, RF-40). Reglas puras: el componente solo lee el
 * navegador y las usa.
 */

/** Cuántos días se respeta un "Ahora no" antes de volver a sugerir. */
export const DISMISS_DAYS = 30;

export type InstallPlatform =
  /** Ya se abrió como app instalada: no hay nada que sugerir. */
  | "installed"
  /** iPhone o iPad: no hay botón de instalar, se explica el paso a mano. */
  | "ios"
  /** El resto: se ofrece el botón solo si el navegador avisa que se puede instalar. */
  | "other";

export function detectPlatform(input: {
  userAgent: string;
  standalone: boolean;
  maxTouchPoints?: number;
}): InstallPlatform {
  if (input.standalone) return "installed";
  // Desde iPadOS 13 el iPad se presenta como Mac: se distingue por la pantalla táctil.
  const iPadAsMac = /Macintosh/.test(input.userAgent) && (input.maxTouchPoints ?? 0) > 1;
  if (/iPhone|iPad|iPod/.test(input.userAgent) || iPadAsMac) return "ios";
  return "other";
}

/** `dismissedAt` es la marca de tiempo guardada al tocar "Ahora no" (o null si nunca se tocó). */
export function isDismissed(dismissedAt: number | null, now: number): boolean {
  if (dismissedAt === null || !Number.isFinite(dismissedAt)) return false;
  // Una fecha guardada en el futuro (reloj corrido) no puede silenciar el aviso para siempre.
  if (dismissedAt > now) return false;
  return now - dismissedAt < DISMISS_DAYS * 24 * 60 * 60 * 1000;
}
