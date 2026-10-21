import { describe, expect, it } from "vitest";
import { hashPin, verifyPin } from "./pin-hash";

describe("hash del PIN", () => {
  it("verifica el PIN correcto y rechaza otro", async () => {
    const hash = await hashPin("482915");
    expect(await verifyPin("482915", hash)).toBe(true);
    expect(await verifyPin("482916", hash)).toBe(false);
  });

  it("no guarda el PIN en claro y usa una sal distinta cada vez", async () => {
    const [a, b] = await Promise.all([hashPin("482915"), hashPin("482915")]);
    expect(a).not.toContain("482915");
    expect(a).not.toBe(b);
  });

  it("un hash mal formado cuenta como PIN incorrecto", async () => {
    expect(await verifyPin("482915", "basura")).toBe(false);
    expect(await verifyPin("482915", "scrypt$16384$8$1$$")).toBe(false);
  });
});
