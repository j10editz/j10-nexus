import { POST as processIntegrationWebhook } from "@/app/api/webhooks/integrations/[endpointKey]/route";
import { NextResponse } from "next/server";
import { createWebhookServiceClient } from "@/lib/integrations/webhooks/service-client";
import { getIntegrationWebhookEndpointByKey } from "@/lib/integrations/webhooks/database";
import { persistCanonicalTelegramInbound } from "@/lib/omnichannel/provider-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ endpointKey: string }> }) {
  const { endpointKey } = await context.params;
  const clone = request.clone();

  // The generic ingress resolves the endpoint to its workspace, decrypts only
  // its credential envelope, verifies Telegram's secret-token header, and
  // records provider replay receipts before adapting an event.
  const response = await processIntegrationWebhook(request, { params: Promise.resolve({ endpointKey }) });

  // If verification failed (e.g. invalid secret, not found, or tenant mismatch), return immediately
  if (!response.ok) {
    return response;
  }

  // Atomically record canonical Stage 1 lead intake, contact, thread, message, and outbox event
  try {
    const rawText = await clone.text();
    if (rawText) {
      const update = JSON.parse(rawText);
      const supabase = createWebhookServiceClient();
      const endpoint = await getIntegrationWebhookEndpointByKey(supabase, endpointKey);
      if (endpoint) {
        await persistCanonicalTelegramInbound(supabase, {
          workspaceId: endpoint.workspaceId,
          update,
          origin: new URL(clone.url).origin,
        });
      }
    }
  } catch (err) {
    console.error("Canonical Telegram persistence failed:", err);
  }

  return response;
}

export function GET() {
  return NextResponse.json({ success: false, error: "Method not allowed." }, { status: 405 });
}

