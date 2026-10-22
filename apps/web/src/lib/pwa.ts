/**
 * App instalable de cada escuela (spec 04, RF-40): su manifest y los íconos que lo acompañan.
 * Todo sale de la marca de la escuela (nombre y color); acá solo hay reglas puras.
 */
import { initialsOf } from "@/components/school-logo";
import { isHex, resolveAccent } from "@/lib/color";

/** Fondo de la pantalla de carga al abrir la app instalada: el del tema claro del producto. */
export const SPLASH_BACKGROUND = "#fbf7f2";

/** Color del producto, para escuelas que todavía no eligieron el suyo. */
export const DEFAULT_ACCENT = "#C2410C";

/** Los íconos que se generan. El nombre del archivo es lo que va en la dirección. */
export const ICON_FILES = {
  "192.png": { size: 192, kind: "any" },
  "512.png": { size: 512, kind: "any" },
  // Android recorta este ícono con la forma que elija: el fondo llega al borde y las iniciales
  // quedan dentro de la zona segura (el círculo central del 80%).
  "maskable-512.png": { size: 512, kind: "maskable" },
  // iOS rellena la transparencia con negro y aplica sus propias esquinas: sin bordes redondeados.
  "180.png": { size: 180, kind: "apple" },
} as const;

export type IconFile = keyof typeof ICON_FILES;

export function isIconFile(value: string): value is IconFile {
  return Object.hasOwn(ICON_FILES, value);
}

/** Nombre corto bajo el ícono: el nombre entero si entra, o las iniciales si es muy largo. */
export const SHORT_NAME_MAX = 12;
export function shortNameOf(name: string): string {
  const clean = name.trim().replace(/\s+/g, " ");
  if (clean.length <= SHORT_NAME_MAX) return clean;
  const first = clean.split(" ")[0];
  return first.length <= SHORT_NAME_MAX ? first : initialsOf(clean);
}

/** Colores del ícono de una escuela: su color con contraste garantizado para las iniciales. */
export function iconColors(primaryColor: string | null) {
  const base = primaryColor && isHex(primaryColor) ? primaryColor : DEFAULT_ACCENT;
  const { light } = resolveAccent(base);
  return { background: light.accent, text: light.onAccent };
}

export type ManifestInput = { slug: string; name: string; background: string };

/** Manifest de la escuela. `start_url` es la portada: si hay sesión de familia, sigue al portal. */
export function buildManifest({ slug, name, background }: ManifestInput) {
  const base = `/${slug}`;
  const icon = (file: IconFile, purpose: "any" | "maskable") => ({
    src: `${base}/icono/${file}`,
    sizes: `${ICON_FILES[file].size}x${ICON_FILES[file].size}`,
    type: "image/png",
    purpose,
  });
  return {
    id: `${base}/`,
    name,
    short_name: shortNameOf(name),
    description: `Seguimiento de los arqueros de ${name}.`,
    lang: "es-AR",
    dir: "ltr",
    // La app instalada vive solo dentro de la escuela: otras escuelas se abren en el navegador.
    scope: `${base}/`,
    start_url: `${base}?origen=app`,
    display: "standalone",
    orientation: "portrait",
    background_color: SPLASH_BACKGROUND,
    theme_color: background,
    icons: [icon("192.png", "any"), icon("512.png", "any"), icon("maskable-512.png", "maskable")],
  };
}
