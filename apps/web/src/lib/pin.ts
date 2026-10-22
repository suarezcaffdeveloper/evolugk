import "server-only";
import { randomInt } from "node:crypto";

export const PIN_LENGTH = 6;

export type PinCheck = { ok: true } | { ok: false; message: string };

/**
 * Reglas del PIN (spec 00, RF-16): 6 dígitos, sin todos iguales (111111) ni secuencias
 * (123456, 654321).
 */
export function checkPin(pin: string): PinCheck {
  if (!/^\d{6}$/.test(pin)) return { ok: false, message: "El PIN tiene 6 dígitos." };

  const digits = [...pin].map(Number);
  if (digits.every((d) => d === digits[0])) {
    return { ok: false, message: "El PIN no puede tener todos los dígitos iguales." };
  }
  const steps = digits.slice(1).map((d, i) => d - digits[i]);
  if (steps.every((s) => s === 1) || steps.every((s) => s === -1)) {
    return { ok: false, message: "El PIN no puede ser una secuencia como 123456." };
  }
  return { ok: true };
}

/** PIN inicial aleatorio que cumple las reglas. */
export function generateInitialPin(): string {
  for (;;) {
    const pin = String(randomInt(0, 1_000_000)).padStart(PIN_LENGTH, "0");
    if (checkPin(pin).ok) return pin;
  }
}
