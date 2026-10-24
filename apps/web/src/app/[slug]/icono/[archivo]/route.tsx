import { ImageResponse } from "next/og";
import { initialsOf } from "@/components/school-logo";
import { ICON_FILES, iconColors, isIconFile } from "@/lib/pwa";
import { getSchoolBranding } from "@/server/tenant";

/**
 * Ícono de la app instalada de una escuela: sus iniciales sobre su color, como el avatar que ya
 * se ve en la pantalla (spec 04, RF-40). Todavía no hay forma de cargar un logo, así que no se lee
 * ninguna dirección externa. Una escuela inexistente o suspendida responde 404.
 */
export async function GET(_request: Request, { params }: RouteContext<"/[slug]/icono/[archivo]">) {
  const { slug, archivo } = await params;
  if (!isIconFile(archivo)) return new Response(null, { status: 404 });
  const school = await getSchoolBranding(slug);
  if (!school) return new Response(null, { status: 404 });

  const { size, kind } = ICON_FILES[archivo];
  const { background, text } = iconColors(school.primaryColor);
  const initials = initialsOf(school.name);
  // Los recortables y los de iOS llevan el fondo hasta el borde; los comunes, esquinas redondeadas.
  const radius = kind === "any" ? Math.round(size * 0.22) : 0;
  // Con una sola letra se puede agrandar; con dos hay que dejar margen para la zona segura.
  const fontSize = Math.round(size * (initials.length > 1 ? 0.36 : 0.46));

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background,
        color: text,
        borderRadius: radius,
        fontSize,
        // next/og solo trae la fuente en peso normal y no lee woff2 (el formato de las fuentes
        // del producto): un trazo del mismo color engrosa las letras sin cargar otra fuente.
        WebkitTextStroke: `${Math.round(size * 0.022)}px ${text}`,
        letterSpacing: "-0.02em",
      }}
    >
      {initials}
    </div>,
    {
      width: size,
      height: size,
      headers: { "Cache-Control": "public, max-age=3600" },
    },
  );
}
