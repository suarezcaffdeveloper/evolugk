/**
 * Reglas del slug de una escuela (spec 00, RF-06c). Deben coincidir con las restricciones
 * `school_slug_format` y `school_slug_reserved` de la base de datos; una prueba lo verifica.
 */

/** 3 a 30 caracteres: minúsculas, números y guiones, sin guion al inicio ni al final. */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;

/** Palabras que chocan con rutas de la aplicación. */
export const RESERVED_SLUGS = [
  "admin",
  "api",
  "login",
  "app",
  "operator",
  "operador",
  "proto",
  "auth",
  "static",
  "assets",
  "public",
  "www",
  "portal",
  "staff",
  "support",
  "soporte",
  "help",
  "ayuda",
  "privacy",
  "privacidad",
  "terms",
  "terminos",
  "health",
  "status",
  "docs",
] as const;

/** Pasa a minúsculas y quita espacios, como hace la base de datos al buscar por slug. */
export function normalizeSlug(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidSlug(value: string): boolean {
  return SLUG_PATTERN.test(value) && !(RESERVED_SLUGS as readonly string[]).includes(value);
}
