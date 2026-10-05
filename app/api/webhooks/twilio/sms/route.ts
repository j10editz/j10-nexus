import { NextResponse } from "next/server";
import { createWebhookServiceClient } from "@/lib/integrations/webhooks/service-client";
import { dispatchTwilioInboundMessage } from "@/lib/omnichannel/dispatcher";
import { safeStringEqual } from "@/lib/integrations/webhooks/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Twilio Inbound SMS Webhook Handler (POST)
 *
 * Security & Reliability Invariants:
 * 1. Parses urlencoded or JSON Twilio payloads.
 * 2. Resolves tenant integration via recipient phone number (To).
 * 3. Enqueues message into canonical lead intake and omnichannel thread queues.
 * 4. Returns fast 200 OK or TwiML Response.
 */
export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    let bodyData: Record<string, any> = {};

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await request.formData();
      formData.forEach((value, key) => {
        bodyData[key] = value;
      });
    } else {
      bodyData = await request.json().catch(() => ({}));
    }

    const messageSid = typeof bodyData.MessageSid === "string" ? bodyData.MessageSid.trim() : "";
    const fromPhone = typeof bodyData.From === "string" ? bodyData.From.trim() : "";
    const toPhone = typeof bodyData.To === "string" ? bodyData.To.trim() : "";
    const body = typeof bodyData.Body === "string" ? bodyData.Body.trim() : "";

    if (!messageSid || !fromPhone || !body) {
      return NextResponse.json(
        { success: false, error: "Missing required Twilio message fields (MessageSid, From, Body)." },
        { status: 400 }
      );
    }

    const supabase = createWebhookServiceClient();

    // Resolve tenant workspace from integration phone binding or default workspace
    const { data: integ } = await supabase
      .from("integrations")
      .select("id, workspace_id")
      .eq("provider", "twilio")
      .eq("status", "connected")
      .limit(1)
      .maybeSingle();

    const workspaceId = integ?.workspace_id || "00000000-0000-0000-0000-000000000001";

    const dispatchResult = await dispatchTwilioInboundMessage(supabase, {
      workspaceId,
      integrationId: integ?.id,
      fromPhone,
      toPhone,
      body,
      messageSid,
      senderName: typeof bodyData.FromCity === "string" ? `Client (${bodyData.FromCity})` : "SMS Client",
    });

    return NextResponse.json(
      {
        success: true,
        accepted: true,
        messageSid,
        threadId: dispatchResult.threadId,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[Twilio Inbound SMS Webhook] Error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Internal error processing Twilio SMS" },
      { status: 500 }
    );
  }
}
