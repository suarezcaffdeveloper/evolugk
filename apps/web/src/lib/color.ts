/**
 * Utilidades de color y contraste (WCAG 2.x).
 *
 * El color de cada escuela se usa como acento en su portal. `resolveAccent`
 * lo ajusta para que, en modo claro y en modo oscuro, el texto sobre el acento
 * sea legible (>= 4.5:1) y el acento se distinga del fondo (>= 3:1).
 */

export type Rgb = { r: number; g: number; b: number };
export type Hsl = { h: number; s: number; l: number };

const HEX_RE = /^#?([0-9a-f]{6})$/i;

/** Fondos y tinta de referencia del brief (ver DESIGN-BRIEF.md). */
export const REFERENCE = {
  light: { canvas: "#FBF7F2", surface: "#FFFFFF", ink: "#1F1A17" },
  dark: { canvas: "#16120F", surface: "#201A16", ink: "#F5EEE6" },
} as const;

export const MIN_TEXT_CONTRAST = 4.5;
export const MIN_UI_CONTRAST = 3;

export function isHex(value: string): boolean {
  return HEX_RE.test(value.trim());
}

export function hexToRgb(hex: string): Rgb {
  const match = HEX_RE.exec(hex.trim());
  if (!match) throw new Error(`Color hexadecimal inválido: ${hex}`);
  const n = parseInt(match[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const toHex = (v: number) =>
    Math.round(Math.min(255, Math.max(0, v)))
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s, l };
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rn = 0;
  let gn = 0;
  let bn = 0;
  if (h < 60) [rn, gn, bn] = [c, x, 0];
  else if (h < 120) [rn, gn, bn] = [x, c, 0];
  else if (h < 180) [rn, gn, bn] = [0, c, x];
  else if (h < 240) [rn, gn, bn] = [0, x, c];
  else if (h < 300) [rn, gn, bn] = [x, 0, c];
  else [rn, gn, bn] = [c, 0, x];
  return { r: (rn + m) * 255, g: (gn + m) * 255, b: (bn + m) * 255 };
}

function channelToLinear(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * channelToLinear(r) + 0.7152 * channelToLinear(g) + 0.0722 * channelToLinear(b);
}

/** Relación de contraste WCAG entre dos colores (1 a 21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export type AccentMode = "light" | "dark";

export type ResolvedAccentMode = {
  /** Color de fondo de botones y detalles. */
  accent: string;
  /** Color del texto sobre el acento (blanco o tinta, el que mejor contraste dé). */
  onAccent: string;
  /** Contraste entre el acento y su texto. */
  textContrast: number;
  /** Contraste entre el acento y el fondo de la página. */
  uiContrast: number;
  /** Si hubo que modificar el color original. */
  adjusted: boolean;
};

export type ResolvedAccent = {
  light: ResolvedAccentMode;
  dark: ResolvedAccentMode;
};

const WHITE = "#FFFFFF";
const DARK_INK = "#1F1A17";

/** Elige blanco o tinta oscura según cuál contraste más con el acento. */
function bestOnColor(accent: string): { color: string; ratio: number } {
  const white = contrastRatio(accent, WHITE);
  const ink = contrastRatio(accent, DARK_INK);
  return white >= ink ? { color: WHITE, ratio: white } : { color: DARK_INK, ratio: ink };
}

function evaluate(accent: string, mode: AccentMode) {
  const on = bestOnColor(accent);
  return {
    onAccent: on.color,
    textContrast: on.ratio,
    uiContrast: contrastRatio(accent, REFERENCE[mode].canvas),
  };
}

function meetsContrast(result: ReturnType<typeof evaluate>): boolean {
  return result.textContrast >= MIN_TEXT_CONTRAST && result.uiContrast >= MIN_UI_CONTRAST;
}

function resolveMode(original: string, mode: AccentMode): ResolvedAccentMode {
  const initial = evaluate(original, mode);
  if (meetsContrast(initial)) return { accent: original, ...initial, adjusted: false };

  // Modo claro: se oscurece hasta cumplir; modo oscuro: se aclara hasta cumplir.
  const hsl = rgbToHsl(hexToRgb(original));
  const direction = mode === "light" ? -1 : 1;
  let l = hsl.l;
  let candidate = original;
  let result = initial;

  for (let i = 0; i < 100 && !meetsContrast(result); i += 1) {
    l = Math.min(0.97, Math.max(0.03, l + direction * 0.01));
    candidate = rgbToHex(hslToRgb({ ...hsl, l }));
    result = evaluate(candidate, mode);
  }

  return { accent: candidate, ...result, adjusted: true };
}

/**
 * Devuelve el acento de una escuela listo para ambos modos.
 * Lanza un error si el valor no es un color hexadecimal de 6 dígitos.
 */
export function resolveAccent(hex: string): ResolvedAccent {
  if (!isHex(hex)) throw new Error(`Color hexadecimal inválido: ${hex}`);
  const normalized = rgbToHex(hexToRgb(hex));
  return {
    light: resolveMode(normalized, "light"),
    dark: resolveMode(normalized, "dark"),
  };
}
