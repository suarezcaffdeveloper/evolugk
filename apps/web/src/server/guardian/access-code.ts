import "server-only";
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
