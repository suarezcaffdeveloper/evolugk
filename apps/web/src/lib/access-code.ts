/**
 * Formato y validación del código de acceso de un tutor. Solo funciones puras: este módulo lo
 * importa también código que corre en el navegador (la tarjeta de credenciales y la importación),
 * así que NO puede traer `node:crypto`: el empaquetador lo reemplazaría por un polyfill de ~440 KB.
 * El generador aleatorio vive en `server/guardian/access-code.ts`.
 */

/** Lo que se escribió → forma guardada (mayúsculas, sin espacios ni guiones). */
export function normalizeAccessCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isValidAccessCode(code: string): boolean {
  return /^[A-Z0-9]{8}$/.test(code);
}

/** Forma que se muestra: "K7QM-4TXD". */
export function formatAccessCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}
