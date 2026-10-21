/**
 * La validación del slug en TypeScript (src/lib/slug.ts) y la de la base de datos
 * (restricciones de la tabla school) deben decir lo mismo.
 */
import { afterAll, describe, expect, it } from "vitest";
import { createAdminClient } from "./db";
import { RESERVED_SLUGS, isValidSlug } from "../lib/slug";

const admin = createAdminClient();
const inserted: string[] = [];

afterAll(async () => {
  if (inserted.length) await admin.from("school").delete().in("slug", inserted);
});

async function dbAccepts(slug: string): Promise<boolean> {
  const { error } = await admin.from("school").insert({ name: "Prueba de slug", slug });
  if (!error) inserted.push(slug);
  return !error;
}

describe("slug: TypeScript y base de datos coinciden", () => {
  it("la base rechaza todas las palabras reservadas", async () => {
    for (const slug of RESERVED_SLUGS) {
      expect(await dbAccepts(slug), slug).toBe(false);
    }
  });

  it.each([
    "test-iso-sync-1",
    "t-1",
    `test-iso-${"x".repeat(21)}`, // 30 caracteres
  ])("ambos aceptan %s", async (slug) => {
    expect(isValidSlug(slug)).toBe(true);
    expect(await dbAccepts(slug)).toBe(true);
  });

  it.each([
    "ab",
    "x".repeat(31),
    "Mayuscula",
    "con espacio",
    "con_guion",
    "-empieza",
    "termina-",
    "ñandu",
    "",
  ])("ambos rechazan %j", async (slug) => {
    expect(isValidSlug(slug)).toBe(false);
    expect(await dbAccepts(slug)).toBe(false);
  });
});
