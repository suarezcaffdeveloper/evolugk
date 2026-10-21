import { describe, expect, it } from "vitest";
import { checkPin, generateInitialPin } from "./pin";

describe("reglas del PIN", () => {
  it.each(["482915", "135792", "100200"])("acepta %s", (pin) => {
    expect(checkPin(pin).ok).toBe(true);
  });

  it.each(["111111", "000000", "123456", "654321", "234567", "987654"])("rechaza %s", (pin) => {
    expect(checkPin(pin).ok).toBe(false);
  });

  it.each(["12345", "1234567", "12a456", "", "12 456"])("rechaza el formato %j", (pin) => {
    expect(checkPin(pin).ok).toBe(false);
  });

  it("el PIN inicial siempre cumple las reglas", () => {
    for (let i = 0; i < 500; i += 1) expect(checkPin(generateInitialPin()).ok).toBe(true);
  });
});
