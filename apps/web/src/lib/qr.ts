/**
 * Supabase devuelve el QR de la inscripción como una imagen SVG incrustada en una URL `data:`
 * con el SVG sin codificar (con espacios, saltos de línea y `<`). Se codifica para obtener una
 * URL válida que cualquier navegador y componente acepte.
 */
export function toSafeSvgDataUri(raw: string): string {
  const comma = raw.indexOf(",");
  if (!raw.startsWith("data:image/svg+xml") || comma === -1) {
    throw new Error("El código QR no tiene el formato esperado.");
  }
  const payload = raw.slice(comma + 1);
  // Si ya viene codificado (con %XX) no se codifica dos veces.
  const alreadyEncoded = !/[<>"\s]/.test(payload) && /%[0-9A-Fa-f]{2}/.test(payload);
  return `data:image/svg+xml;charset=utf-8,${alreadyEncoded ? payload : encodeURIComponent(payload)}`;
}
