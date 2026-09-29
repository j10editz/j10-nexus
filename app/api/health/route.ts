import { NextResponse } from "next/server";
import { probeSystemHealth } from "@/lib/health/system-health";

export const dynamic = "force-dynamic";

export async function GET() {
  const health = await probeSystemHealth();
  const dbComponent = health.components.find((c) => c.id === "database");
  const isHealthy = dbComponent?.status === "Operational";

  const authComp = health.components.find((c) => c.id === "auth");
  const workflowComp = health.components.find((c) => c.id === "workflow");
  const whatsappComp = health.components.find((c) => c.id === "whatsapp");
  const stripeComp = health.components.find((c) => c.id === "stripe");
  const aiComp = health.components.find((c) => c.id === "ai");

  return NextResponse.json(
    {
      status: isHealthy ? "healthy" : "degraded",
      timestamp: health.timestamp,
      database: {
        status: dbComponent?.status === "Operational" ? "connected" : "error",
        latencyMs: dbComponent?.latencyMs ?? 0,
        probe: "Database reachable through server connection",
        error: dbComponent?.status === "Operational" ? null : "Database query failed or timed out",
      },
      services: {
        database: dbComponent?.status.toLowerCase() ?? "degraded",
        auth: authComp?.status.toLowerCase() ?? "unknown",
        workflow: workflowComp?.status.toLowerCase() ?? "unknown",
        whatsapp: whatsappComp?.status.toLowerCase() ?? "unknown",
        stripe: stripeComp?.status.toLowerCase() ?? "unknown",
        openai: aiComp?.status.toLowerCase() ?? "unknown",
        gemini: aiComp?.status.toLowerCase() ?? "unknown",
      },
      components: health.components,
    },
    {
      status: isHealthy ? 200 : 503,
      headers: {
        "Cache-Control": "public, max-age=10, stale-while-revalidate=20",
      },
    }
  );
}
