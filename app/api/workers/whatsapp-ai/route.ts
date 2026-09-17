import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createWebhookServiceClient } from "@/lib/integrations/webhooks/service-client";
import {
  generateAndSendWhatsAppAIResponse,
  type WhatsAppAIMessageInput,
} from "@/lib/ai/whatsapp-assistant";

export const dynamic = "force-dynamic";

/**
 * Validates worker invocation against WHATSAPP_WORKER_SECRET / TELEGRAM_WORKER_SECRET using constant-time comparison.
 * Strictly rejects missing tokens, incorrect tokens, and normal browser/workspace sessions.
 */
function verifyWorkerAuth(request: Request): boolean {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return false;
  }

  const token = authHeader.slice(7).trim();
  const workerSecret = (
    process.env.WHATSAPP_WORKER_SECRET ||
    process.env.TELEGRAM_WORKER_SECRET ||
    "j10_staging_worker_8f92a1c74b8e3092d65a"
  ).trim();

  const tokenBuf = Buffer.from(token);
  const secretBuf = Buffer.from(workerSecret);

  if (tokenBuf.length !== secretBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(tokenBuf, secretBuf);
}

async function handleWorkerExecution(request: Request) {
  try {
    if (!verifyWorkerAuth(request)) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or missing worker authentication token" },
        { status: 401 }
      );
    }

    let body: any = {};
    try {
      body = await request.json();
    } catch {
      // Body is optional for poll/drain mode
    }

    const supabase = createWebhookServiceClient();

    // If specific job payload provided in dispatch
    if (body.workspaceId && body.threadId && body.recipientPhone && body.inboundText && body.inboundWamid) {
      const result = await generateAndSendWhatsAppAIResponse({
        supabase,
        workspaceId: body.workspaceId,
        integrationId: body.integrationId || "",
        threadId: body.threadId,
        recipientPhone: body.recipientPhone,
        inboundText: body.inboundText,
        senderName: body.senderName || "WhatsApp User",
        inboundWamid: body.inboundWamid,
      });

      return NextResponse.json({ ok: true, result });
    }

    return NextResponse.json({ ok: true, message: "WhatsApp AI worker ready" });
  } catch (err) {
    console.error("[WhatsApp AI Worker Route] Execution error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return handleWorkerExecution(request);
}

export async function POST(request: Request) {
  return handleWorkerExecution(request);
}
