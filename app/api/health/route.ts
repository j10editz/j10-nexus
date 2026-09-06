import { NextResponse } from "next/server";
import { probeDatabaseReachability } from "@/lib/health/probe";

export const dynamic = "force-dynamic";

export async function GET() {
  const health = await probeDatabaseReachability();

  const stripeConfigured = Boolean(
    process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET
  );
  const whatsappConfigured = Boolean(
    process.env.WHATSAPP_ACCESS_TOKEN || process.env.META_WHATSAPP_TOKEN
  );
  const openaiConfigured = Boolean(process.env.OPENAI_API_KEY);

  return NextResponse.json(
    {
      status: health.reachable ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      database: {
        status: health.reachable ? "connected" : "error",
        latencyMs: health.latencyMs,
        probe: health.label,
        error: health.error ?? null,
      },
      services: {
        database: health.reachable ? "operational" : "degraded",
        stripe: stripeConfigured ? "configured" : "not_configured",
        whatsapp: whatsappConfigured ? "configured" : "not_configured",
        openai: openaiConfigured ? "configured" : "not_configured",
      },
    },
    {
      status: health.reachable ? 200 : 503,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}
