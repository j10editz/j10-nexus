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

  // Atomically record canonical Stage 1 lead intake, contact, thread, message, and durable outbox job
  try {
    const rawText = await clone.text();
    if (rawText) {
      const update = JSON.parse(rawText);
      const supabase = createWebhookServiceClient();
      const endpoint = await getIntegrationWebhookEndpointByKey(supabase, endpointKey);

      if (endpoint) {
        const rawMsg = (update as any).message ?? (update as any).edited_message;
        const chatId = rawMsg?.chat?.id ? String(rawMsg.chat.id) : null;
        const text = typeof rawMsg?.text === "string" ? rawMsg.text.trim() : "";
        const senderName =
          [rawMsg?.from?.first_name, rawMsg?.from?.last_name].filter(Boolean).join(" ") ||
          rawMsg?.from?.username ||
          "Telegram User";

        if (chatId) {
          // Transactional ingress: commits thread, message, and durable AI job atomically
          await supabase.rpc("ingest_telegram_update_transactional", {
            p_workspace_id: endpoint.workspaceId,
            p_receiving_bot_id: endpoint.integrationId || endpointKey,
            p_update_id: update.update_id,
            p_chat_id: chatId,
            p_sender_id: String(rawMsg?.from?.id || chatId),
            p_sender_name: senderName,
            p_message_text: text || null,
            p_business_connection_id: null,
            p_is_business_message: false,
            p_external_message_id: String(rawMsg?.message_id || ""),
            p_metadata: {
              raw_update: update,
              custom_endpoint_key: endpointKey,
            },
            p_integration_id: endpoint.integrationId || null,
          });

          // Best-effort immediate worker invocation for low latency
          const workerSecret = process.env.TELEGRAM_WORKER_SECRET?.trim();
          if (workerSecret) {
            const origin = new URL(clone.url).origin;
            fetch(`${origin}/api/workers/telegram-ai`, {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${workerSecret}`,
                "Content-Type": "application/json",
              },
            }).catch((wErr) => {
              console.warn("[Custom Telegram Webhook] Worker invocation notice:", wErr?.message || wErr);
            });
          }
        }

        // Canonical lead intake record
        try {
          await persistCanonicalTelegramInbound(supabase, {
            workspaceId: endpoint.workspaceId,
            update,
            origin: new URL(clone.url).origin,
          });
        } catch (intakeErr) {
          console.warn("[Custom Telegram Webhook] Canonical lead intake warning:", intakeErr);
        }
      }
    }
  } catch (err) {
    console.error("Canonical Telegram persistence or durable job enqueue failed:", err);
  }

  return response;
}

export function GET() {
  return NextResponse.json({ success: false, error: "Method not allowed." }, { status: 405 });
}
