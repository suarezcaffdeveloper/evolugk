import { describe, expect, it } from "vitest";
import { isValidAccessCode } from "@/lib/access-code";
import { generateAccessCode } from "./access-code";

describe("generador de códigos de acceso", () => {
  it("genera códigos de 8 caracteres sin letras confusas", () => {
    for (let i = 0; i < 200; i += 1) {
      const code = generateAccessCode();
      expect(isValidAccessCode(code)).toBe(true);
      expect(code).not.toMatch(/[01OIL]/);
    }
  });

  it("no repite códigos en una muestra grande", () => {
    const codes = new Set(Array.from({ length: 2000 }, generateAccessCode));
    expect(codes.size).toBe(2000);
  });
});
