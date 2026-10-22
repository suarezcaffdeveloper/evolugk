import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/server/cron-auth";
import { createConfiguredTransport } from "@/server/email/transport";
import { createServiceClient } from "@/server/supabase";
import { flushVideoNotices, retryProviderCleanup } from "@/server/videos";
import { getVideoProvider } from "@/server/video";

/**
 * Tarea de mantenimiento de videos: reintenta los borrados pendientes en el proveedor y manda los
 * mails de "video publicado" cuya ventana de 30 minutos ya pasó. La llama un programador externo
 * (por ejemplo, Vercel Cron cada pocos minutos) con `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const db = createServiceClient();
  const [cleanup, notices] = await Promise.all([
    retryProviderCleanup(db, getVideoProvider()),
    flushVideoNotices(db, createConfiguredTransport()),
  ]);
  return NextResponse.json({ cleanup, notices });
}
