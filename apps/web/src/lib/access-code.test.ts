import { describe, expect, it } from "vitest";
import {
  formatAccessCode,
  generateAccessCode,
  isValidAccessCode,
  normalizeAccessCode,
} from "./access-code";

describe("código de acceso", () => {
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

  it("normaliza lo que escribe la familia", () => {
    expect(normalizeAccessCode(" k7qm-4txd ")).toBe("K7QM4TXD");
    expect(normalizeAccessCode("k7qm 4txd")).toBe("K7QM4TXD");
  });

  it("lo muestra con guion", () => {
    expect(formatAccessCode("K7QM4TXD")).toBe("K7QM-4TXD");
  });
});
