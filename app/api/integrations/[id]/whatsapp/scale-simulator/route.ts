import { NextResponse } from "next/server";

import {
  createIntegrationApiClient,
  getAuthenticatedIntegrationUser,
  integrationApiErrorResponse,
  parseRequestObject,
} from "@/lib/integrations/api";
import { getIntegrationConnectionById } from "@/lib/integrations/database";
import {
  INITIAL_SCALE_METRICS,
  runScaleStressTest,
  SAMPLE_WEBHOOK_INSPECTOR_LOGS,
  type ScaleMetrics,
  type WebhookInspectorEvent,
} from "@/lib/whatsapp/scale-simulator";

type RouteContext = { params: Promise<{ id: string }> };

// In-memory cache for simulator state
let liveMetrics: ScaleMetrics = { ...INITIAL_SCALE_METRICS };
let liveLogs: WebhookInspectorEvent[] = [...SAMPLE_WEBHOOK_INSPECTOR_LOGS];

async function load(context: RouteContext) {
  const { id } = await context.params;
  const supabase = await createIntegrationApiClient();
  const user = await getAuthenticatedIntegrationUser(supabase);
  if (!user) {
    return {
      response: NextResponse.json(
        { success: false, error: "Unauthorized." },
        { status: 401 }
      ),
    };
  }
  const connection = await getIntegrationConnectionById(supabase, user.id, id);
  if (!connection || connection.providerId !== "whatsapp-business") {
    return {
      response: NextResponse.json(
        { success: false, error: "WhatsApp Business connection was not found." },
        { status: 404 }
      ),
    };
  }
  return { id, supabase, user, connection };
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const result = await load(context);
    if (result.response) return result.response;

    return NextResponse.json({
      success: true,
      metrics: liveMetrics,
      logs: liveLogs,
    });
  } catch (error) {
    return integrationApiErrorResponse(error, "Could not load scale simulator metrics.");
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const result = await load(context);
    if (result.response) return result.response;

    const body = parseRequestObject(await request.json());
    const batchSize = typeof body.batchSize === "number" ? body.batchSize : 25;

    const stressResult = runScaleStressTest(batchSize);

    // Update live metrics with results
    liveMetrics = {
      ...liveMetrics,
      avgLatencyMs: stressResult.avgLatencyMs,
      currentThroughputMps: stressResult.throughputMps,
      peakThroughputMps: Math.max(liveMetrics.peakThroughputMps, stressResult.throughputMps),
      totalProcessedEvents: liveMetrics.totalProcessedEvents + stressResult.batchSize,
    };

    // Prepend latest stress test events
    liveLogs = [...stressResult.events, ...liveLogs].slice(0, 50);

    return NextResponse.json({
      success: true,
      stressResult,
      updatedMetrics: liveMetrics,
      logs: liveLogs,
    });
  } catch (error) {
    return integrationApiErrorResponse(error, "Could not execute scale stress test.");
  }
}
