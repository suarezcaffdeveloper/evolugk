import { randomInt } from "node:crypto";

/** Sin 0/O ni 1/I/L: el código se dicta por WhatsApp o en voz alta. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const LENGTH = 8;

/** Código de acceso de un tutor, sin guion: "K7QM4TXD". */
export function generateAccessCode(): string {
  let code = "";
  for (let i = 0; i < LENGTH; i += 1) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

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
