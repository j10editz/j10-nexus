import { NextResponse } from "next/server";
import { createWebhookServiceClient } from "@/lib/integrations/webhooks/service-client";
import { persistCanonicalTelegramInbound } from "@/lib/omnichannel/provider-contract";
import { consumeTelegramBindingToken } from "@/lib/telegram/binding-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// In-memory deduplication set for update_id replay prevention
const processedUpdateIds = new Set<number>();

export async function POST(request: Request) {
  try {
    // 0. Check maintenance mode
    if (process.env.TELEGRAM_MAINTENANCE_MODE === "true") {
      return NextResponse.json(
        { status: "maintenance", message: "Telegram ingress temporarily paused for maintenance window" },
        { status: 503 }
      );
    }

    // 1. Strictly verify webhook secret token
    const expectedSecret = (process.env.TELEGRAM_WEBHOOK_SECRET || "j10_nexus_telegram_secret").trim();
    const receivedSecret = request.headers.get("x-telegram-bot-api-secret-token")?.trim();
    if (!receivedSecret || receivedSecret !== expectedSecret) {
      return NextResponse.json(
        { error: "Unauthorized: Missing or invalid X-Telegram-Bot-Api-Secret-Token" },
        { status: 401 }
      );
    }

    const update = await request.json();
    if (!update || (!update.update_id && !update.message && !update.chat_join_request && !update.callback_query)) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const supabase = createWebhookServiceClient();

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

    // 3. Mandatory Correction 8: Handle VIP Group Join Requests
    if (update.chat_join_request) {
      const cjr = update.chat_join_request;
      const groupChatId = String(cjr.chat?.id);
      const joiningUserId = String(cjr.from?.id);
      const inviteLinkStr = cjr.invite_link?.invite_link;

      // Find pending or eligible membership
      const { data: membership } = await supabase
        .from("telegram_group_memberships")
        .select("id, workspace_id, contact_id, status")
        .eq("group_chat_id", groupChatId)
        .or(`invite_link.eq.${inviteLinkStr},telegram_user_id.eq.${joiningUserId}`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (membership && membership.status !== "banned") {
        // Fetch bot token for this workspace
        const { data: integ } = await supabase
          .from("integrations")
          .select("id")
          .eq("workspace_id", membership.workspace_id)
          .eq("provider", "telegram")
          .maybeSingle();

        let botToken = process.env.TELEGRAM_BOT_TOKEN;
        if (integ) {
          const { getIntegrationCredentials } = await import("@/lib/integrations/credentials");
          const creds = await getIntegrationCredentials(supabase, membership.workspace_id, integ.id);
          botToken = creds?.values?.bot_token || botToken;
        }

        if (botToken) {
          // Approve verified identity
          await fetch(`https://api.telegram.org/bot${botToken}/approveChatJoinRequest`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: groupChatId,
              user_id: Number(joiningUserId),
            }),
          });

          // Immediately revoke the invite link so it cannot be shared
          if (inviteLinkStr) {
            await fetch(`https://api.telegram.org/bot${botToken}/revokeChatInviteLink`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: groupChatId,
                invite_link: inviteLinkStr,
              }),
            });
          }

          // Mark membership approved and clear plaintext invite_link (Requirement 8)
          await supabase
            .from("telegram_group_memberships")
            .update({
              status: "approved",
              telegram_user_id: joiningUserId,
              invite_link: null,
              joined_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", membership.id);

          return NextResponse.json({ ok: true, approved_join: true, user_id: joiningUserId });
        }
      }

      return NextResponse.json({ ok: true, join_request_declined: true });
    }

    if (!update.message && !update.edited_message) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const rawMsg = (update as any).message ?? (update as any).edited_message;
    const chatId = rawMsg?.chat?.id ? String(rawMsg.chat.id) : null;
    const fromId = rawMsg?.from?.id ? String(rawMsg.from.id) : null;
    const text = typeof rawMsg?.text === "string" ? rawMsg.text.trim() : "";
    const isGroup = rawMsg?.chat?.type === "group" || rawMsg?.chat?.type === "supergroup";

    let resolvedWorkspaceId: string | null = null;

    // 4. Multi-Tenant Workspace Resolution
    // Strategy A: Check for opaque cryptographic deep link binding (/start b_...)
    if (text.startsWith("/start")) {
      const parts = text.split(/\s+/);
      if (parts.length > 1) {
        const param = parts[1].trim();

        if (param.startsWith("b_")) {
          // Mandatory Correction 1: Consume opaque random token with SHA-256 hash in DB
          const verification = await consumeTelegramBindingToken(supabase, param);
          if (verification.valid && verification.workspaceId) {
            // Mandatory Correction 4: Check if user is already bound in a private chat to a different workspace
            if (chatId) {
              const { data: existingBinding } = await supabase
                .from("inbox_threads")
                .select("workspace_id")
                .eq("channel", "telegram")
                .eq("external_thread_id", chatId)
                .order("last_message_at", { ascending: false })
                .limit(1)
                .maybeSingle();

              if (existingBinding?.workspace_id && existingBinding.workspace_id !== verification.workspaceId) {
                console.warn(`[Telegram Webhook] Silent workspace switch rejected for chat ${chatId}. Already bound to ${existingBinding.workspace_id}.`);
                const botToken = process.env.TELEGRAM_BOT_TOKEN;
                if (botToken) {
                  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      chat_id: chatId,
                      text: "⚠️ <b>Active Connection Notice</b>\n\nThis chat is already securely bound to another workspace. To connect to a different business, please use their dedicated client bot or contact support.",
                      parse_mode: "HTML",
                    }),
                  });
                }
                return NextResponse.json({ ok: true, rejected_switch: true });
              }
            }
            resolvedWorkspaceId = verification.workspaceId;
          } else {
            console.warn("[Telegram Webhook] Rejected invalid or expired binding token:", verification.error);
          }
        }
      }
    }

    // Strategy B: If in a Group/Supergroup, resolve strictly by uniquely bound group chat ID
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

    // Strategy C: Resolve by existing thread bound to this chat
    if (!resolvedWorkspaceId && chatId) {
      const { data: existingThread } = await supabase
        .from("inbox_threads")
        .select("workspace_id")
        .eq("channel", "telegram")
        .eq("external_thread_id", chatId)
        .order("last_message_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingThread?.workspace_id) {
        resolvedWorkspaceId = existingThread.workspace_id;
      }
    }

    // Mandatory Correction 4: Never silently switch or fallback to an arbitrary workspace
    if (!resolvedWorkspaceId) {
      console.warn(`[Telegram Webhook] Unbound chat ${chatId} received without valid binding token. Dropping without silent switch.`);
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      if (botToken && chatId && !isGroup) {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: "👋 Welcome to J10 NEXUS.\n\nPlease start the bot using the direct link provided by your business dashboard to securely connect your conversation.",
          }),
        });
      }
      return NextResponse.json({ ok: true, unmapped_chat: true });
    }

    // 5. Persist Canonical Inbound Message
    const origin = new URL(request.url).origin;
    const result = await persistCanonicalTelegramInbound(supabase, {
      workspaceId: resolvedWorkspaceId,
      update,
      origin,
    });

    // 6. AI Assistant & Human Handoff Pipeline
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
          .eq("external_thread_id", chatId)
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
