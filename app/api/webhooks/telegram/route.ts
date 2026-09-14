import { NextResponse } from "next/server";
import { createWebhookServiceClient } from "@/lib/integrations/webhooks/service-client";
import { persistCanonicalTelegramInbound } from "@/lib/omnichannel/provider-contract";
import { verifyTelegramBindingToken } from "@/lib/telegram/binding-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// In-memory deduplication set for update_id replay prevention
const processedUpdateIds = new Set<number>();

export async function POST(request: Request) {
  try {
    // 1. Verify webhook secret token if configured
    const expectedSecret = (process.env.TELEGRAM_WEBHOOK_SECRET || "j10_nexus_telegram_secret").trim();
    const receivedSecret = request.headers.get("x-telegram-bot-api-secret-token")?.trim();
    if (receivedSecret && receivedSecret !== expectedSecret) {
      return NextResponse.json({ error: "Invalid webhook secret token" }, { status: 401 });
    }

    const update = await request.json();
    if (!update || (!update.message && !update.edited_message)) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    // 2. Duplicate update replay prevention
    const updateId = update.update_id;
    if (typeof updateId === "number") {
      if (processedUpdateIds.has(updateId)) {
        return NextResponse.json({ ok: true, duplicate: true });
      }
      processedUpdateIds.add(updateId);
      if (processedUpdateIds.size > 20000) {
        processedUpdateIds.clear();
      }
    }

    const rawMsg = (update as any).message ?? (update as any).edited_message;
    const chatId = rawMsg?.chat?.id ? String(rawMsg.chat.id) : null;
    const fromId = rawMsg?.from?.id ? String(rawMsg.from.id) : null;
    const text = typeof rawMsg?.text === "string" ? rawMsg.text.trim() : "";
    const isGroup = rawMsg?.chat?.type === "group" || rawMsg?.chat?.type === "supergroup";

    const supabase = createWebhookServiceClient();
    let resolvedWorkspaceId: string | null = null;

    // 3. Multi-Tenant Workspace Resolution
    // Strategy A: Check for cryptographic deep link binding (/start b_... or legacy /start ws_...)
    if (text.startsWith("/start")) {
      const parts = text.split(/\s+/);
      if (parts.length > 1) {
        const param = parts[1].trim();

        if (param.startsWith("b_")) {
          // Cryptographically signed, expiring token
          const verification = verifyTelegramBindingToken(param);
          if (verification.valid && verification.workspaceId) {
            resolvedWorkspaceId = verification.workspaceId;
          } else {
            console.warn("[Telegram Webhook] Rejected invalid or expired binding token:", verification.error);
          }
        } else if (param.startsWith("ws_")) {
          // Legacy raw workspace deep link
          const wsId = param.slice(3).trim();
          if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(wsId)) {
            resolvedWorkspaceId = wsId;
          }
        }
      }
    }

    // Strategy B: If in a Group/Supergroup, resolve by group chat ID
    if (!resolvedWorkspaceId && isGroup && chatId) {
      const { data: integByGroup } = await supabase
        .from("integrations")
        .select("workspace_id")
        .eq("provider", "telegram")
        .eq("status", "connected")
        .filter("metadata->>vip_group_chat_id", "eq", chatId)
        .limit(1)
        .maybeSingle();

      if (integByGroup?.workspace_id) {
        resolvedWorkspaceId = integByGroup.workspace_id;
      }
    }

    // Strategy C: Resolve by existing thread / contact bound to this chat or sender
    if (!resolvedWorkspaceId && (chatId || fromId)) {
      const { data: existingThread } = await supabase
        .from("inbox_threads")
        .select("workspace_id")
        .eq("channel", "telegram")
        .or(`external_thread_id.eq.${chatId},metadata->>telegram_chat_id.eq.${chatId}`)
        .order("last_message_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingThread?.workspace_id) {
        resolvedWorkspaceId = existingThread.workspace_id;
      }
    }

    // Strategy D: Fallback to active workspace with connected Telegram integration
    if (!resolvedWorkspaceId) {
      const { data: activeIntegrations } = await supabase
        .from("integrations")
        .select("workspace_id")
        .eq("provider", "telegram")
        .eq("status", "connected")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (activeIntegrations?.workspace_id) {
        resolvedWorkspaceId = activeIntegrations.workspace_id;
      }
    }

    if (!resolvedWorkspaceId) {
      console.warn("Telegram webhook received but could not resolve target workspace.");
      return NextResponse.json({ ok: true, warning: "unresolved_workspace" });
    }

    // 4. Persist Canonical Inbound Message
    const origin = new URL(request.url).origin;
    const result = await persistCanonicalTelegramInbound(supabase, {
      workspaceId: resolvedWorkspaceId,
      update,
      origin,
    });

    // 5. AI Assistant & Human Handoff Pipeline
    const senderName =
      [rawMsg?.from?.first_name, rawMsg?.from?.last_name].filter(Boolean).join(" ") ||
      rawMsg?.from?.username ||
      "Telegram User";

    if (chatId && text) {
      try {
        const { data: thread } = await supabase
          .from("inbox_threads")
          .select("id, metadata")
          .eq("workspace_id", resolvedWorkspaceId)
          .eq("channel", "telegram")
          .order("last_message_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (thread?.id) {
          const { generateAndSendTelegramAIResponse } = await import("@/lib/ai/telegram-assistant");
          await generateAndSendTelegramAIResponse({
            supabase,
            workspaceId: resolvedWorkspaceId,
            threadId: thread.id,
            chatId,
            messageText: text,
            senderName,
          });
        }
      } catch (aiErr) {
        console.error("Failed to process Telegram AI assistant response:", aiErr);
      }
    }

    return NextResponse.json({ ok: true, result, workspaceId: resolvedWorkspaceId });
  } catch (err) {
    console.error("Telegram webhook handling error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export function GET() {
  return NextResponse.json({ status: "ok", service: "J10 NEXUS Telegram Inbound Webhook" });
}
