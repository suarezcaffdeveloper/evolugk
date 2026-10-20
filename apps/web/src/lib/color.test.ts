import { describe, expect, it } from "vitest";
import {
  MIN_TEXT_CONTRAST,
  MIN_UI_CONTRAST,
  contrastRatio,
  hexToRgb,
  isHex,
  resolveAccent,
  rgbToHex,
} from "./color";

describe("contrastRatio", () => {
  it("da 21 entre negro y blanco", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 1);
  });

  it("da 1 entre colores iguales", () => {
    expect(contrastRatio("#C2410C", "#C2410C")).toBeCloseTo(1, 5);
  });

  it("es simétrico", () => {
    expect(contrastRatio("#C2410C", "#FFFFFF")).toBeCloseTo(contrastRatio("#FFFFFF", "#C2410C"), 8);
  });

  it("confirma el contraste del naranja del brief con texto blanco (>= 4,5)", () => {
    expect(contrastRatio("#C2410C", "#FFFFFF")).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
  });
});

describe("hex", () => {
  it("convierte ida y vuelta", () => {
    expect(rgbToHex(hexToRgb("#e8590c"))).toBe("#E8590C");
  });

  it("valida el formato", () => {
    expect(isHex("#C2410C")).toBe(true);
    expect(isHex("C2410C")).toBe(true);
    expect(isHex("#FFF")).toBe(false);
    expect(isHex("naranja")).toBe(false);
  });

  it("rechaza valores inválidos al resolver", () => {
    expect(() => resolveAccent("naranja")).toThrow();
  });
});

describe("resolveAccent", () => {
  const samples: Array<[string, string]> = [
    ["naranja del producto", "#C2410C"],
    ["azul", "#1D4ED8"],
    ["verde", "#15803D"],
    ["amarillo fuerte", "#FACC15"],
    ["celeste claro", "#7DD3FC"],
    ["casi blanco", "#F5F5F5"],
    ["negro", "#000000"],
  ];

  it("no toca un color que ya cumple los contrastes", () => {
    const { light } = resolveAccent("#C2410C");
    expect(light.accent).toBe("#C2410C");
    expect(light.adjusted).toBe(false);
    expect(light.onAccent).toBe("#FFFFFF");
  });

  it("ajusta un amarillo que no se distingue del fondo claro", () => {
    const { light } = resolveAccent("#FACC15");
    expect(light.adjusted).toBe(true);
    expect(light.accent).not.toBe("#FACC15");
  });

  it.each(samples)("cumple los contrastes mínimos en ambos modos: %s", (_name, hex) => {
    const resolved = resolveAccent(hex);
    for (const mode of [resolved.light, resolved.dark]) {
      expect(mode.textContrast).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
      expect(mode.uiContrast).toBeGreaterThanOrEqual(MIN_UI_CONTRAST);
    }
  });

  it("acepta el hexadecimal con o sin # y en minúsculas", () => {
    expect(resolveAccent("c2410c").light.accent).toBe("#C2410C");
  });
});
