import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const startTime = Date.now();
  let dbStatus: "connected" | "error" | "timeout" = "error";
  let dbError: string | null = null;
  let latencyMs = 0;

  try {
    const supabase = createAdminSupabaseClient();

    const timeoutPromise = new Promise<{ timeout: true }>((resolve) =>
      setTimeout(() => resolve({ timeout: true }), 2000)
    );

    const probePromise = supabase
      .from("workspaces")
      .select("id")
      .limit(1)
      .then((res) => ({ timeout: false as const, ...res }));

    const result = await Promise.race([probePromise, timeoutPromise]);

    latencyMs = Date.now() - startTime;

    if (result.timeout) {
      dbStatus = "timeout";
      dbError = "Database probe timed out after 2000ms";
    } else if (result.error) {
      dbStatus = "error";
      dbError = result.error.message;
    } else {
      dbStatus = "connected";
    }
  } catch (err) {
    latencyMs = Date.now() - startTime;
    dbStatus = "error";
    dbError = err instanceof Error ? err.message : "Unknown database connection error";
  }

  const stripeConfigured = Boolean(
    process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET
  );
  const whatsappConfigured = Boolean(
    process.env.WHATSAPP_ACCESS_TOKEN || process.env.META_WHATSAPP_TOKEN
  );
  const openaiConfigured = Boolean(process.env.OPENAI_API_KEY);

  const overallHealthy = dbStatus === "connected";

  return NextResponse.json(
    {
      status: overallHealthy ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      database: {
        status: dbStatus,
        latencyMs,
        error: dbError,
      },
      services: {
        database: dbStatus === "connected" ? "operational" : "degraded",
        stripe: stripeConfigured ? "configured" : "not_configured",
        whatsapp: whatsappConfigured ? "configured" : "not_configured",
        openai: openaiConfigured ? "configured" : "not_configured",
      },
    },
    {
      status: overallHealthy ? 200 : 503,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}
