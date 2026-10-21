import { describe, expect, it } from "vitest";
import { base32Decode, totpCode } from "./totp";

// Vectores de prueba de la RFC 6238 (secreto ASCII "12345678901234567890" en base32).
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("totpCode", () => {
  it.each([
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
  ])("coincide con el vector de la RFC en t=%i", (seconds, expected8) => {
    expect(totpCode(RFC_SECRET, seconds * 1000, 8)).toBe(expected8);
  });

  it("con 6 dígitos son los últimos 6 del código de 8", () => {
    expect(totpCode(RFC_SECRET, 59_000)).toBe("287082");
  });

  it("cambia cada 30 segundos y se repite dentro del mismo paso", () => {
    expect(totpCode(RFC_SECRET, 30_000)).toBe(totpCode(RFC_SECRET, 59_999));
    expect(totpCode(RFC_SECRET, 30_000)).not.toBe(totpCode(RFC_SECRET, 60_000));
  });
});

describe("base32Decode", () => {
  it("decodifica el secreto de la RFC", () => {
    expect(base32Decode(RFC_SECRET).toString("ascii")).toBe("12345678901234567890");
  });

  it("ignora espacios, minúsculas y relleno", () => {
    expect(base32Decode("mfrg gzdf==").toString("ascii")).toBe("abcde");
  });

  it("rechaza caracteres inválidos", () => {
    expect(() => base32Decode("ABC1")).toThrow();
  });
});
