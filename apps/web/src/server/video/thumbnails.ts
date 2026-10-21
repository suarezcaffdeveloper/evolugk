import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { VideoProvider } from "./provider";

const THUMBNAIL_TTL_SECONDS = 60 * 60;

/**
 * Miniaturas firmadas para las listas (spec 03, RF-34). Quien llama pasa solo ids de videos que ya
 * se verificó que la persona puede ver: acá solo se firma. Si falta la clave de firma o el
 * proveedor falla, devuelve un mapa vacío y la lista muestra un marcador en lugar de la miniatura.
 */
export async function thumbnailUrls(
  db: SupabaseClient,
  provider: VideoProvider,
  schoolId: string,
  videoIds: string[],
): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  if (videoIds.length === 0) return urls;

  const { data } = await db
    .from("video")
    .select("id, provider_playback_id")
    .eq("school_id", schoolId)
    .eq("processing_status", "ready")
    .in("id", videoIds);

  await Promise.all(
    (data ?? []).map(async (row) => {
      if (!row.provider_playback_id) return;
      try {
        const tokens = await provider.signPlayback(
          row.provider_playback_id as string,
          THUMBNAIL_TTL_SECONDS,
        );
        urls.set(
          row.id as string,
          `https://image.mux.com/${row.provider_playback_id}/thumbnail.jpg?width=480&fit_mode=smartcrop&token=${tokens.thumbnail}`,
        );
      } catch {
        // Sin miniatura: la lista sigue funcionando.
      }
    }),
  );
  return urls;
}
