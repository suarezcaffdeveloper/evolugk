import { NextResponse } from "next/server";
import { argentinaDate } from "@/lib/dates";
import { createConfiguredTransport } from "@/server/email/transport";
import { generateFees, sendFeeNotices } from "@/server/fees";
import { refreshPlatformAlerts, sendOperatorSummary } from "@/server/subscriptions";
import { createServiceClient } from "@/server/supabase";

/**
 * Tarea diaria de las 9:00 (hora de Argentina): genera las cuotas que corresponden, manda los
 * avisos de cuota a las familias, recalcula las alertas del operador y le manda su resumen si hay
 * novedades (spec 06, RF-24; spec 07, RF-30). Es idempotente: correrla dos veces el mismo día no
 * duplica cuotas ni mails. La llama un programador externo con `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const db = createServiceClient();
  const transport = createConfiguredTransport();
  const today = argentinaDate(new Date());

  // En orden: los avisos dependen de las cuotas recién generadas, y el resumen de las alertas.
  const fees = await generateFees(db, today);
  const notices = await sendFeeNotices(db, transport, today);
  const alerts = await refreshPlatformAlerts(db, today);
  const summary = await sendOperatorSummary(db, transport);
  return NextResponse.json({ today, fees, notices, alerts, summary });
}
