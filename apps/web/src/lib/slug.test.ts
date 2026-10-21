import { describe, expect, it } from "vitest";
import { RESERVED_SLUGS, isValidSlug, normalizeSlug } from "./slug";

describe("isValidSlug", () => {
  it.each(["abc", "guantes-del-sur", "escuela1", "a-b", "x".repeat(30), "1-2-3"])(
    "acepta %s",
    (slug) => {
      expect(isValidSlug(slug)).toBe(true);
    },
  );

  it.each([
    ["muy corto", "ab"],
    ["vacío", ""],
    ["muy largo", "x".repeat(31)],
    ["con mayúsculas", "Sur"],
    ["con espacio", "del sur"],
    ["con guion bajo", "del_sur"],
    ["con tilde", "ñandú"],
    ["empieza con guion", "-sur"],
    ["termina con guion", "sur-"],
    ["con punto", "sur.com"],
    ["con barra", "sur/x"],
  ])("rechaza un slug %s", (_label, slug) => {
    expect(isValidSlug(slug)).toBe(false);
  });

  it.each(RESERVED_SLUGS)("rechaza la palabra reservada %s", (slug) => {
    expect(isValidSlug(slug)).toBe(false);
  });
});

describe("normalizeSlug", () => {
  it("pasa a minúsculas y quita espacios", () => {
    expect(normalizeSlug("  Guantes-Del-SUR ")).toBe("guantes-del-sur");
  });
});
