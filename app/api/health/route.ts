import { NextResponse } from "next/server";
import { probeSystemHealth } from "@/lib/health/system-health";

export const dynamic = "force-dynamic";

export async function GET() {
  const health = await probeSystemHealth();
  const overall = health.overallStatus;

  // The API status, HTTP response status, and status page use the same aggregation policy:
  // Outage -> 503
  // Operational, Configured, Degraded -> 200 (with accurate payload)
  const isOutage = overall === "Outage";
  const httpStatus = isOutage ? 503 : 200;

  const dbComponent = health.components.find((c) => c.id === "database");
  const authComp = health.components.find((c) => c.id === "auth");
  const workflowComp = health.components.find((c) => c.id === "workflow");
  const whatsappComp = health.components.find((c) => c.id === "whatsapp");
  const stripeComp = health.components.find((c) => c.id === "stripe");
  const aiComp = health.components.find((c) => c.id === "ai");

  return NextResponse.json(
    {
      status:
        overall === "Operational"
          ? "healthy"
          : overall === "Configured"
          ? "configured"
          : overall.toLowerCase(),
      overallStatus: overall,
      timestamp: health.timestamp,
      database: {
        status: dbComponent?.status === "Operational" ? "connected" : "error",
        latencyMs: dbComponent?.latencyMs ?? 0,
        probe: "Database reachable through server connection",
        error:
          dbComponent?.status === "Operational"
            ? null
            : "Database query failed or timed out",
      },
      services: {
        database: dbComponent?.status.toLowerCase() ?? "unknown",
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
      status: httpStatus,
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30",
      },
    }
  );
}
