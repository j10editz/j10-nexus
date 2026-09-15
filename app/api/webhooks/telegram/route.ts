import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createWebhookServiceClient } from "@/lib/integrations/webhooks/service-client";
import { persistCanonicalTelegramInbound } from "@/lib/omnichannel/provider-contract";
import { consumeTelegramBindingToken } from "@/lib/telegram/binding-token";
import { consumeTelegramBusinessSession, findVerifiedSessionByTelegramUserId } from "@/lib/telegram/connection-session";
import {
  getTelegramBusinessConnectionById,
  upsertTelegramBusinessConnection,
  markBusinessConnectionDisconnected,
  verifyBusinessConnectionCanReply,
} from "@/lib/telegram/business-connections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// In-memory deduplication set for update_id replay prevention
const processedUpdateIds = new Set<number>();

/**
 * Constant-time comparison for webhook secret tokens to prevent timing attacks.
 */
function verifySecretToken(received?: string | null, expected?: string | null): boolean {
  if (!received || !expected) return false;
  const bufRecv = Buffer.from(received.trim());
  const bufExp = Buffer.from(expected.trim());
  if (bufRecv.length !== bufExp.length) return false;
  return crypto.timingSafeEqual(bufRecv, bufExp);
}

export async function POST(request: Request) {
  try {
    // 0. Check maintenance mode
    if (process.env.TELEGRAM_MAINTENANCE_MODE === "true") {
      return NextResponse.json(
        { status: "maintenance", message: "Telegram ingress temporarily paused for maintenance window" },
        { status: 503 }
      );
    }

    // 1. Strictly verify webhook secret token using constant-time comparison
    const expectedSecret = (process.env.TELEGRAM_WEBHOOK_SECRET || "j10_nexus_telegram_secret").trim();
    const receivedSecret = request.headers.get("x-telegram-bot-api-secret-token");
    if (!verifySecretToken(receivedSecret, expectedSecret)) {
      return NextResponse.json(
        { error: "Unauthorized: Missing or invalid X-Telegram-Bot-Api-Secret-Token" },
        { status: 401 }
      );
    }

    const update = await request.json();
    if (
      !update ||
      (!update.update_id &&
        !update.message &&
        !update.edited_message &&
        !update.business_message &&
        !update.edited_business_message &&
        !update.business_connection &&
        !update.deleted_business_messages &&
        !update.chat_join_request &&
        !update.callback_query)
    ) {
      return NextResponse.json({ ok: true });
    }

    // 2. Duplicate update replay prevention (bot-scoped + update_id)
    const updateId = update.update_id;
    if (typeof updateId === "number") {
      if (processedUpdateIds.has(updateId)) {
        return NextResponse.json({ ok: true });
      }
      processedUpdateIds.add(updateId);
      if (processedUpdateIds.size > 20000) {
        processedUpdateIds.clear();
      }
    }

    const supabase = createWebhookServiceClient();

    // Feature Flag Guard: Keep Telegram Business Secretary Mode disabled by default
    const isSecretaryModeEnabled = process.env.ENABLE_TELEGRAM_BUSINESS_SECRETARY === "true";
    if (
      !isSecretaryModeEnabled &&
      (update.business_connection ||
        update.business_message ||
        update.edited_business_message ||
        update.deleted_business_messages)
    ) {
      console.log("[Telegram Webhook] Telegram Business Secretary Mode is disabled by feature flag. Ignoring update.");
      return NextResponse.json({ ok: true });
    }

    // 3. Handle VIP Group Join Requests
    if (update.chat_join_request) {
      const cjr = update.chat_join_request;
      const groupChatId = String(cjr.chat?.id);
      const joiningUserId = String(cjr.from?.id);
      const inviteLinkStr = cjr.invite_link?.invite_link;

      const { data: membership } = await supabase
        .from("telegram_group_memberships")
        .select("id, workspace_id, contact_id, status")
        .eq("group_chat_id", groupChatId)
        .or(`invite_link.eq.${inviteLinkStr},telegram_user_id.eq.${joiningUserId}`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (membership && membership.status !== "banned") {
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
          await fetch(`https://api.telegram.org/bot${botToken}/approveChatJoinRequest`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: groupChatId,
              user_id: Number(joiningUserId),
            }),
          });

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

          return NextResponse.json({ ok: true });
        }
      }

      return NextResponse.json({ ok: true });
    }

    // 4. Handle Telegram Business Connection Updates (Only when Secretary Mode feature flag is enabled)
    if (isSecretaryModeEnabled && update.business_connection) {
      const bc = update.business_connection;
      const bcId = String(bc.id);
      const tgUserId = String(bc.user?.id);
      const tgUsername = bc.user?.username || null;
      const userChatId = String(bc.user_chat_id || tgUserId);
      const canReply = Boolean(bc.can_reply);
      const isEnabled = Boolean(bc.is_enabled);

      let targetWorkspaceId: string | null = null;
      const existingConn = await getTelegramBusinessConnectionById(supabase, bcId);

      if (existingConn) {
        targetWorkspaceId = existingConn.workspace_id;
      } else {
        const verifiedSession = await findVerifiedSessionByTelegramUserId(supabase, tgUserId);
        if (verifiedSession.status === "matched" && verifiedSession.workspaceId) {
          targetWorkspaceId = verifiedSession.workspaceId;
        } else if (verifiedSession.status === "ambiguous") {
          console.warn("[Telegram Webhook] Ambiguous business connection session:", verifiedSession.error);
          return NextResponse.json({ ok: true });
        } else {
          console.warn("[Telegram Webhook] No verified session found for business connection:", tgUserId);
          return NextResponse.json({ ok: true });
        }
      }

      if (targetWorkspaceId) {
        await upsertTelegramBusinessConnection(supabase, {
          workspaceId: targetWorkspaceId,
          businessConnectionId: bcId,
          telegramUserId: tgUserId,
          telegramUsername: tgUsername,
          userChatId,
          canReply,
          isEnabled,
          rights: bc,
        });

        if (!isEnabled) {
          await markBusinessConnectionDisconnected(supabase, bcId);
        }

        return NextResponse.json({ ok: true });
      } else {
        console.warn(`[Telegram Webhook] Received business_connection for user ${tgUserId} but found no linked workspace.`);
        return NextResponse.json({ ok: true });
      }
    }

    // 5. Handle Deleted Business Messages (Only when Secretary Mode feature flag is enabled)
    if (isSecretaryModeEnabled && update.deleted_business_messages) {
      const del = update.deleted_business_messages;
      const messageIds = (del.message_ids || []).map(String);

      if (messageIds.length > 0) {
        await supabase
          .from("inbox_messages")
          .update({
            metadata: { deleted_by_telegram: true, deleted_at: new Date().toISOString() },
            delivery_status: "failed",
          })
          .in("external_message_id", messageIds);
      }

      return NextResponse.json({ ok: true });
    }

    // 6. Extract Inbound Message Payload (Standard or Business)
    const isBusinessMessage = Boolean(isSecretaryModeEnabled && (update.business_message || update.edited_business_message));
    const rawMsg =
      (update as any).message ??
      (update as any).edited_message ??
      (isSecretaryModeEnabled ? ((update as any).business_message ?? (update as any).edited_business_message) : null);

    if (!rawMsg) {
      return NextResponse.json({ ok: true });
    }

    const chatId = rawMsg?.chat?.id ? String(rawMsg.chat.id) : null;
    const fromId = rawMsg?.from?.id ? String(rawMsg.from.id) : null;
    const text = typeof rawMsg?.text === "string" ? rawMsg.text.trim() : "";
    const isGroup = rawMsg?.chat?.type === "group" || rawMsg?.chat?.type === "supergroup";
    const businessConnectionId =
      isSecretaryModeEnabled && typeof rawMsg?.business_connection_id === "string"
        ? rawMsg.business_connection_id
        : isSecretaryModeEnabled && typeof (update as any).business_connection_id === "string"
        ? (update as any).business_connection_id
        : undefined;

    let resolvedWorkspaceId: string | null = null;

    // 7. Multi-Tenant Workspace Resolution
    // Strategy A1: Telegram Business Connection Resolution (Flag-guarded)
    if (isSecretaryModeEnabled && isBusinessMessage && businessConnectionId) {
      const permissionCheck = await verifyBusinessConnectionCanReply(supabase, businessConnectionId);
      if (permissionCheck.allowed && permissionCheck.connection) {
        resolvedWorkspaceId = permissionCheck.connection.workspace_id;
      } else {
        console.warn(`[Telegram Webhook] Business message dropped: ${permissionCheck.reason || "Rights inactive"}`);
        return NextResponse.json({ ok: true });
      }
    }

    // Strategy A2: Check for deep link onboarding / session binding (/start)
    if (!resolvedWorkspaceId && text.startsWith("/start")) {
      const parts = text.split(/\s+/);
      if (parts.length > 1) {
        const param = parts[1].trim();

        // Mode 1: Telegram Business Onboarding Session (/start tb_...)
        if (isSecretaryModeEnabled && param.startsWith("tb_")) {
          const sessionVerification = await consumeTelegramBusinessSession(
            supabase,
            param,
            fromId || "",
            rawMsg?.from?.username
          );

          if (sessionVerification.valid && sessionVerification.workspaceId) {
            const botToken = process.env.TELEGRAM_BOT_TOKEN;
            if (botToken && chatId) {
              await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  chat_id: chatId,
                  text: "✅ <b>J10 NEXUS Connection Verified!</b>\n\nYour session has been securely verified for your workspace.\n\n<b>Next Step:</b>\n1. Open Telegram <b>Settings → Telegram Business → Chatbots</b>\n2. Add <b>@j10_nexus_leads_bot</b>\n3. Ensure <b>Reply to messages</b> is enabled.\n\nJ10 NEXUS Secretary Mode will automatically activate for your selected conversations!",
                  parse_mode: "HTML",
                }),
              });
            }
            return NextResponse.json({ ok: true });
          } else {
            console.warn("[Telegram Webhook] Rejected invalid or expired business session token:", sessionVerification.error);
            return NextResponse.json({ ok: true });
          }
        }

        // Mode 2: Shared Bot Lead Intake Binding (/start b_...)
        if (param.startsWith("b_")) {
          const verification = await consumeTelegramBindingToken(supabase, param);
          if (verification.valid && verification.workspaceId) {
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
                return NextResponse.json({ ok: true });
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

    // Strategy C: Resolve by existing thread strictly scoped by receiving_bot_id + telegram_chat_id
    if (!resolvedWorkspaceId && chatId) {
      const { data: existingThread } = await supabase
        .from("inbox_threads")
        .select("workspace_id")
        .eq("channel", "telegram")
        .eq("external_thread_id", chatId)
        .or("metadata->>receiving_bot_id.eq.official,metadata->>receiving_bot_id.is.null")
        .order("last_message_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingThread?.workspace_id) {
        resolvedWorkspaceId = existingThread.workspace_id;
      }
    }

    // Strict Invariant: Strategy D is completely removed.
    // Unresolved updates NEVER persist into any tenant. Return HTTP 200 with sanitized logging.
    if (!resolvedWorkspaceId) {
      console.warn(`[Telegram Webhook] Unbound update for chat ${chatId} dropped without tenant assignment.`);
      return NextResponse.json({ ok: true });
    }

    // 8. Resolve Integration Identity server-side (never trust client/webhook JSON)
    const { data: integ } = await supabase
      .from("integrations")
      .select("id")
      .eq("workspace_id", resolvedWorkspaceId)
      .eq("provider", "telegram")
      .limit(1)
      .maybeSingle();

    const integrationId = integ?.id || null;
    const receivingBotId = integrationId ? String(integrationId) : "official";

    // 9. Commit Ingress Transactionally (Thread + Message + Durable Job in ONE DB Transaction)
    const senderName =
      [rawMsg?.from?.first_name, rawMsg?.from?.last_name].filter(Boolean).join(" ") ||
      rawMsg?.from?.username ||
      "Telegram User";

    const { error: txError } = await supabase.rpc("ingest_telegram_update_transactional", {
      p_workspace_id: resolvedWorkspaceId,
      p_receiving_bot_id: receivingBotId,
      p_update_id: update.update_id,
      p_chat_id: chatId,
      p_sender_id: String(rawMsg?.from?.id || chatId),
      p_sender_name: senderName,
      p_message_text: text || null,
      p_business_connection_id: isBusinessMessage ? businessConnectionId : null,
      p_is_business_message: isBusinessMessage,
      p_external_message_id: String(rawMsg?.message_id || ""),
      p_metadata: {
        raw_update: update,
        origin: new URL(request.url).origin,
      },
      p_integration_id: integrationId,
    });

    if (txError) {
      console.error("[Telegram Webhook] Transactional ingress error:", txError);
      return NextResponse.json({ ok: false, error: txError.message }, { status: 500 });
    }

    // Also persist canonical lead intake if new contact
    try {
      const origin = new URL(request.url).origin;
      await persistCanonicalTelegramInbound(supabase, {
        workspaceId: resolvedWorkspaceId,
        update,
        origin,
      });
    } catch (intakeErr) {
      console.warn("[Telegram Webhook] Non-blocking canonical lead intake warning:", intakeErr);
    }

    // 10. Non-blocking Background Worker Trigger:
    // Webhook returns HTTP 200 immediately without awaiting Gemini generation or Telegram outbound dispatch
    const workerSecret = (process.env.TELEGRAM_WORKER_SECRET || "j10_staging_worker_8f92a1c74b8e3092d65a").trim();
    if (workerSecret) {
      const origin = new URL(request.url).origin;
      fetch(`${origin}/api/workers/telegram-ai`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${workerSecret}`,
          "Content-Type": "application/json",
        },
      }).catch((workerErr) => {
        console.warn("[Telegram Webhook] Non-blocking worker trigger notice:", workerErr?.message || workerErr);
      });
    }

    // 11. Fast Return to Telegram: return strictly { ok: true }
    // Never expose internal workspace_id, job_id, or database results to provider
    return NextResponse.json({ ok: true });
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
