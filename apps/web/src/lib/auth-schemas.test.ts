import { describe, expect, it } from "vitest";
import { fieldErrorsFrom, loginSchema, totpCodeSchema } from "./auth-schemas";

describe("loginSchema", () => {
  it("normaliza el mail (espacios y mayúsculas)", () => {
    const result = loginSchema.parse({ email: "  Ana@Example.COM ", password: "x" });
    expect(result.email).toBe("ana@example.com");
  });

  it("no altera la contraseña", () => {
    expect(
      loginSchema.parse({ email: "a@example.com", password: "  Con espacios  " }).password,
    ).toBe("  Con espacios  ");
  });

  it.each([
    ["mail vacío", { email: "", password: "x" }, "email", "Ingresá tu mail."],
    [
      "mail inválido",
      { email: "no-es-mail", password: "x" },
      "email",
      "El mail no tiene un formato válido.",
    ],
    [
      "contraseña vacía",
      { email: "a@example.com", password: "" },
      "password",
      "Ingresá tu contraseña.",
    ],
    ["sin campos", {}, "email", "Ingresá tu mail."],
  ])("rechaza %s", (_label, input, field, message) => {
    const result = loginSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) expect(fieldErrorsFrom(result.error)[field]).toBe(message);
  });

  it("informa un error por campo", () => {
    const result = loginSchema.safeParse({ email: "", password: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(Object.keys(fieldErrorsFrom(result.error)).sort()).toEqual(["email", "password"]);
    }
  });
});

describe("totpCodeSchema", () => {
  it.each([
    ["123456", "123456"],
    ["123 456", "123456"],
    [" 123456 ", "123456"],
    ["000000", "000000"],
  ])("acepta %j", (input, expected) => {
    expect(totpCodeSchema.parse(input)).toBe(expected);
  });

  it.each(["", "12345", "1234567", "abcdef", "12 34 5a", "１２３４５６"])("rechaza %j", (input) => {
    expect(totpCodeSchema.safeParse(input).success).toBe(false);
  });
});
