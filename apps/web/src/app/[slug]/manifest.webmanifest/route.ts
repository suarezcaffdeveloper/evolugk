import { buildManifest, iconColors } from "@/lib/pwa";
import { getSchoolBranding } from "@/server/tenant";

/**
 * Manifest de la app instalable de una escuela (spec 04, RF-40): su nombre, su color y sus
 * íconos. Una escuela inexistente o suspendida responde 404, igual que el resto de sus pantallas
 * (spec 00, RF-02): no se distingue un caso del otro.
 */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/[slug]/manifest.webmanifest">,
) {
  const { slug } = await params;
  const school = await getSchoolBranding(slug);
  if (!school) return new Response(null, { status: 404 });

  const { background } = iconColors(school.primaryColor);
  return Response.json(buildManifest({ slug: slug.toLowerCase(), name: school.name, background }), {
    headers: {
      "Content-Type": "application/manifest+json",
      // Corto: si la escuela cambia su nombre o color, la app instalada lo toma pronto.
      "Cache-Control": "public, max-age=300",
    },
  });
}
