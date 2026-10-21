import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { isValidSlug, normalizeSlug } from "@/lib/slug";
import { createServiceClient } from "./supabase";

export type SchoolBranding = {
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
};

/** Etiqueta de caché de la marca de una escuela: se invalida al suspenderla o cambiar su marca. */
export const schoolBrandingTag = (slug: string) => `school-branding:${slug}`;

async function fetchSchoolBranding(slug: string): Promise<SchoolBranding | null> {
  "use cache";
  // Vida corta como respaldo; al suspender o editar una escuela se invalida por etiqueta.
  cacheLife({ stale: 30, revalidate: 60, expire: 300 });
  cacheTag(schoolBrandingTag(slug));

  const { data, error } = await createServiceClient().rpc("get_school_branding", { p_slug: slug });
  if (error) throw new Error(`No se pudo resolver la escuela: ${error.message}`);

  const row = data?.[0];
  if (!row) return null;
  return { name: row.name, logoUrl: row.logo_url, primaryColor: row.primary_color };
}

/**
 * Resuelve /{slug} a la marca de su escuela (spec 00, RF-01 a RF-04).
 * Devuelve null si el slug es inválido, no existe o la escuela está suspendida:
 * los tres casos son indistinguibles a propósito (RF-02).
 */
export async function getSchoolBranding(rawSlug: string): Promise<SchoolBranding | null> {
  const slug = normalizeSlug(rawSlug);
  if (!isValidSlug(slug)) return null;
  return fetchSchoolBranding(slug);
}
