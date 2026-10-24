import { describe, expect, it } from "vitest";
import { contrastRatio, MIN_TEXT_CONTRAST } from "./color";
import {
  DEFAULT_ACCENT,
  ICON_FILES,
  SHORT_NAME_MAX,
  buildManifest,
  iconColors,
  isIconFile,
  shortNameOf,
} from "./pwa";

describe("shortNameOf", () => {
  it("deja el nombre entero si entra bajo el ícono", () => {
    expect(shortNameOf("Arqueros FC")).toBe("Arqueros FC");
  });

  it("usa la primera palabra si el nombre es largo", () => {
    expect(shortNameOf("Escuela de Arqueros del Sur")).toBe("Escuela");
  });

  it("usa las iniciales si ni la primera palabra entra", () => {
    expect(shortNameOf("Superlongnombredeescuela Norte")).toBe("SN");
  });

  it("ignora espacios de más", () => {
    expect(shortNameOf("  Los   Halcones  ")).toBe("Los Halcones");
  });

  it("nunca supera el máximo", () => {
    for (const name of ["Academia Internacional de Guardametas", "A", "Escuela Sudamericana"]) {
      expect(shortNameOf(name).length).toBeLessThanOrEqual(SHORT_NAME_MAX);
    }
  });
});

describe("iconColors", () => {
  it("usa el color del producto si la escuela no eligió uno", () => {
    expect(iconColors(null).background).toBeTruthy();
    expect(iconColors("no-es-un-color")).toEqual(iconColors(null));
    expect(DEFAULT_ACCENT).toMatch(/^#[0-9A-F]{6}$/i);
  });

  it("las iniciales siempre se leen sobre el fondo, sea cual sea el color de la escuela", () => {
    for (const color of ["#FFFF00", "#000000", "#FFFFFF", "#0A7BFF", "#C2410C", "#2E7D32"]) {
      const { background, text } = iconColors(color);
      expect(contrastRatio(text, background)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    }
  });
});

describe("buildManifest", () => {
  const manifest = buildManifest({ slug: "halcones", name: "Los Halcones", background: "#C2410C" });

  it("lleva el nombre y el color de la escuela", () => {
    expect(manifest.name).toBe("Los Halcones");
    expect(manifest.short_name).toBe("Los Halcones");
    expect(manifest.theme_color).toBe("#C2410C");
  });

  it("queda encerrada en la escuela: otra escuela no se abre dentro de esta app", () => {
    expect(manifest.scope).toBe("/halcones/");
    expect(manifest.id).toBe("/halcones/");
    expect(manifest.start_url.startsWith("/halcones")).toBe(true);
  });

  it("se abre como app, sin barra del navegador", () => {
    expect(manifest.display).toBe("standalone");
  });

  it("declara íconos de 192 y 512 y uno recortable", () => {
    const bySizes = manifest.icons.map((i) => `${i.sizes}:${i.purpose}`);
    expect(bySizes).toEqual(["192x192:any", "512x512:any", "512x512:maskable"]);
    for (const icon of manifest.icons) {
      expect(icon.src.startsWith("/halcones/icono/")).toBe(true);
      expect(isIconFile(icon.src.split("/").pop()!)).toBe(true);
    }
  });
});

describe("isIconFile", () => {
  it("acepta solo los archivos que se generan", () => {
    for (const file of Object.keys(ICON_FILES)) expect(isIconFile(file)).toBe(true);
    for (const bad of ["64.png", "../512.png", "512", "", "constructor", "__proto__", "toString"]) {
      expect(isIconFile(bad)).toBe(false);
    }
  });
});
