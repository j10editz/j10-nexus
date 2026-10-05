import { NextResponse } from "next/server";
import { createWebhookServiceClient } from "@/lib/integrations/webhooks/service-client";
import { dispatchInstagramInboundMessage } from "@/lib/omnichannel/dispatcher";
import {
  hmacSha256Hex,
  normalizeSignatureHex,
  safeStringEqual,
} from "@/lib/integrations/webhooks/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Meta Webhook Challenge Verification for Instagram (GET)
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const expectedToken =
    process.env.META_INSTAGRAM_VERIFY_TOKEN?.trim() ||
    process.env.META_VERIFY_TOKEN?.trim() ||
    "";

  if (
    mode === "subscribe" &&
    challenge &&
    token &&
    expectedToken &&
    safeStringEqual(token, expectedToken)
  ) {
    return new Response(challenge, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }

  return NextResponse.json(
    { success: false, error: "Instagram webhook verification failed." },
    { status: 403 }
  );
}

/**
 * Inbound Instagram DM Webhook (POST)
 */
export async function POST(request: Request) {
  try {
    const rawBody = await request.text();

    const appSecret =
      process.env.META_INSTAGRAM_APP_SECRET?.trim() ||
      process.env.META_APP_SECRET?.trim() ||
      "";

    // If signature secret is configured, enforce strict HMAC-SHA256 validation
    if (appSecret) {
      const receivedSignature = normalizeSignatureHex(
        request.headers.get("x-hub-signature-256")
      );
      const expectedSignature = hmacSha256Hex(appSecret, rawBody);

      if (
        !receivedSignature ||
        !safeStringEqual(receivedSignature, expectedSignature)
      ) {
        return NextResponse.json(
          { success: false, error: "Invalid Instagram webhook signature." },
          { status: 401 }
        );
      }
    }

    let payload: Record<string, any>;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { success: false, error: "Malformed JSON payload." },
        { status: 400 }
      );
    }

    const entry = Array.isArray(payload.entry) ? payload.entry[0] : null;
    const messaging = Array.isArray(entry?.messaging) ? entry.messaging[0] : null;

    if (!messaging || !messaging.message) {
      // Fast 200 ACK for non-message events (read receipts, delivery markers)
      return NextResponse.json({ success: true, ignored: true }, { status: 200 });
    }

    const senderId = typeof messaging.sender?.id === "string" ? messaging.sender.id : "";
    const recipientId = typeof messaging.recipient?.id === "string" ? messaging.recipient.id : "";
    const messageMid = typeof messaging.message?.mid === "string" ? messaging.message.mid : "";
    const text = typeof messaging.message?.text === "string" ? messaging.message.text : "";
    const username = messaging.sender?.username || "Instagram Client";

    if (!senderId || !messageMid || !text) {
      return NextResponse.json(
        { success: true, ignored: true, reason: "missing_content_or_sender" },
        { status: 200 }
      );
    }

    const supabase = createWebhookServiceClient();

    // Resolve tenant workspace from Instagram business account binding or default
    const { data: integ } = await supabase
      .from("integrations")
      .select("id, workspace_id")
      .eq("provider", "instagram-business")
      .eq("status", "connected")
      .limit(1)
      .maybeSingle();

    const workspaceId = integ?.workspace_id || "00000000-0000-0000-0000-000000000001";

    const dispatchResult = await dispatchInstagramInboundMessage(supabase, {
      workspaceId,
      integrationId: integ?.id,
      senderId,
      recipientId,
      text,
      messageMid,
      senderUsername: username,
    });

    return NextResponse.json(
      {
        success: true,
        accepted: true,
        messageMid,
        threadId: dispatchResult.threadId,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[Instagram DM Webhook] Error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Internal error processing Instagram DM" },
      { status: 500 }
    );
  }
}
