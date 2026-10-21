import { requireSchoolAdmin } from "@/server/auth/guards";
import { buildTemplate } from "@/server/goalkeeper-import-file";

/** Plantilla de importación (spec 01, RF-35). Solo la administración. */
export async function GET(
  request: Request,
  { params }: RouteContext<"/[slug]/panel/arqueros/importar/plantilla">,
) {
  const { slug } = await params;
  await requireSchoolAdmin(slug);

  const format = new URL(request.url).searchParams.get("formato") === "csv" ? "csv" : "xlsx";
  const { body, type } = await buildTemplate(format);
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="plantilla-arqueros.${format}"`,
      "Cache-Control": "no-store",
    },
  });
}
