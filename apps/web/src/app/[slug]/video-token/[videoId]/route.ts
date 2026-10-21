import { NextResponse } from "next/server";
import { PLAYBACK_TOKEN_SECONDS } from "@/lib/video-schemas";
import { getStaffSession } from "@/server/auth/guards";
import { authorizeFamilyPlayback } from "@/server/guardian/videos";
import { getFamilySession } from "@/server/guardian/session";
import { createServiceClient } from "@/server/supabase";
import { getPlaybackTarget } from "@/server/videos";
import { getVideoProvider } from "@/server/video";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NO_STORE = { "Cache-Control": "no-store" };
const denied = () =>
  NextResponse.json({ error: "No disponible." }, { status: 404, headers: NO_STORE });

/**
 * Emite los tokens firmados (1 hora) para reproducir un video privado (spec 03, RF-22). La
 * autorización se verifica en CADA pedido, no solo al abrir la página: sesión, escuela, y para
 * la familia además el vínculo con el arquero, el consentimiento vigente y que el video esté
 * publicado. El navegador renueva el token antes de que venza mientras la sesión siga válida.
 *
 * Todos los rechazos son un mismo 404: no se revela si el video existe (CA-06).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; videoId: string }> },
) {
  const { slug, videoId } = await params;
  if (!UUID.test(videoId)) return denied();

  const db = createServiceClient();
  let playbackId: string | null = null;

  // El staff ve todos los videos ya procesados de su escuela, borradores incluidos (RF-25).
  const staff = await getStaffSession(slug);
  if (staff) {
    playbackId = (await getPlaybackTarget(db, staff.school.id, videoId))?.playbackId ?? null;
  } else {
    const family = await getFamilySession(slug);
    if (family)
      playbackId = (await authorizeFamilyPlayback(db, family, videoId))?.playbackId ?? null;
  }
  if (!playbackId) return denied();

  try {
    const tokens = await getVideoProvider().signPlayback(playbackId, PLAYBACK_TOKEN_SECONDS);
    return NextResponse.json(
      { playbackId, tokens, expiresInSeconds: PLAYBACK_TOKEN_SECONDS },
      { headers: NO_STORE },
    );
  } catch {
    return NextResponse.json(
      { error: "No pudimos preparar el video. Probá de nuevo en un momento." },
      { status: 503, headers: NO_STORE },
    );
  }
}
