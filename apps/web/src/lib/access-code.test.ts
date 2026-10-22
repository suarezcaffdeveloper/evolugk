import { describe, expect, it } from "vitest";
import { formatAccessCode, normalizeAccessCode } from "./access-code";

describe("código de acceso", () => {
  it("normaliza lo que escribe la familia", () => {
    expect(normalizeAccessCode(" k7qm-4txd ")).toBe("K7QM4TXD");
    expect(normalizeAccessCode("k7qm 4txd")).toBe("K7QM4TXD");
  });

  it("lo muestra con guion", () => {
    expect(formatAccessCode("K7QM4TXD")).toBe("K7QM-4TXD");
  });
});
