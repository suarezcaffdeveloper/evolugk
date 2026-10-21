import { NextResponse } from "next/server";
import { applyProviderEvent, retryProviderCleanup } from "@/server/videos";
import { createServiceClient } from "@/server/supabase";
import { getVideoProvider } from "@/server/video";

/**
 * Avisos de Mux (spec 03, RF-05 y RF-11): subida recibida, video listo o con error. Es público a
 * propósito —Mux no tiene sesión—, pero cada aviso se acepta solo con firma válida y reciente.
 * Una firma inválida recibe 401 y no cambia nada. Es idempotente: Mux reintenta los avisos.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const provider = getVideoProvider();

  let event;
  try {
    event = await provider.parseWebhook(rawBody, request.headers);
  } catch {
    return NextResponse.json({ error: "Firma inválida." }, { status: 401 });
  }

  const db = createServiceClient();
  try {
    await applyProviderEvent(db, provider, event);
    // Aprovecha el pedido para reintentar borrados pendientes en el proveedor (mejor esfuerzo).
    await retryProviderCleanup(db, provider, 5);
  } catch {
    // Mux reintenta los avisos que no reciben 2xx.
    return NextResponse.json({ error: "No se pudo procesar el aviso." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
