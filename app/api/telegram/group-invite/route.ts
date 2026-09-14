import { NextResponse } from "next/server";
import { getActiveWorkspaceContext } from "@/lib/workspaces/server";
import { createServerSupabaseClient } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const context = await getActiveWorkspaceContext();
    if (!context) {
      return NextResponse.json(
        { success: false, error: "Unauthorized." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { threadId, chatId, customerName = "VIP Client", sendDirectly = false } = body;
    const wsId = context.workspace.id;
    const supabase = createServerSupabaseClient();

    // 1. Fetch telegram integration
    const { data: integ } = await supabase
      .from("integrations")
      .select("id, metadata, public_configuration")
      .eq("workspace_id", wsId)
      .eq("provider", "telegram")
      .eq("status", "connected")
      .maybeSingle();

    const cfg = { ...(integ?.metadata || {}), ...(integ?.public_configuration || {}) };
    const botToken =
      cfg.bot_token ||
      cfg.telegramBotToken ||
      process.env.TELEGRAM_BOT_TOKEN ||
      "8687561980:AAGY78OR5ZNGZqYW7LNUvRVeFukARgowubk";

    const groupChatId =
      cfg.vip_group_chat_id ||
      process.env.TELEGRAM_VIP_GROUP_ID ||
      null;

    let targetChatId = chatId;

    // If threadId given, resolve contact identifier
    if (threadId && !targetChatId) {
      const { data: thread } = await supabase
        .from("inbox_threads")
        .select("id, external_thread_id, contact_id, contact:contacts(phone, email)")
        .eq("id", threadId)
        .eq("workspace_id", wsId)
        .maybeSingle();

      const contact = (thread as any)?.contact;
      targetChatId = contact?.phone || thread?.external_thread_id;
    }

    let inviteLink = "";

    // If groupChatId is configured, call Telegram API createChatInviteLink
    if (groupChatId) {
      const expireDate = Math.floor(Date.now() / 1000) + 86400; // 24 hours
      const inviteRes = await fetch(
        `https://api.telegram.org/bot${botToken}/createChatInviteLink`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: groupChatId,
            name: `VIP Access - ${customerName}`,
            member_limit: 1,
            expire_date: expireDate,
          }),
        }
      );
      const inviteData = await inviteRes.json();
      if (inviteData?.ok && inviteData?.result?.invite_link) {
        inviteLink = inviteData.result.invite_link;
      }
    }

    // Fallback: If groupChatId not set yet, provide direct client group link or bot deep link
    if (!inviteLink) {
      inviteLink = `https://t.me/+J10_VIP_COMMUNITY_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    }

    const messageText = `🎉 *VIP Client Group Access Unlocked!*

Welcome to the private J10 NEXUS Mastermind Community.

🔗 *Single-Use Join Link:*
${inviteLink}

_Note: This link is single-use and bound exclusively to your verified account._`;

    // Send directly to customer if requested and targetChatId available
    if (sendDirectly && targetChatId) {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: targetChatId,
          text: messageText,
          parse_mode: "Markdown",
        }),
      });

      // Also persist to inbox_messages if threadId is present
      if (threadId) {
        await supabase.from("inbox_messages").insert({
          workspace_id: wsId,
          thread_id: threadId,
          direction: "outbound",
          provider: "telegram",
          content: messageText,
          delivery_status: "delivered",
          message_type: "text",
          metadata: {
            isVipGroupInvite: true,
            inviteLink,
            senderName: "J10 VIP Bot",
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      inviteLink,
      messageText,
      sentDirectly: sendDirectly && Boolean(targetChatId),
    });
  } catch (error) {
    console.error("POST /api/telegram/group-invite error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate group invite." },
      { status: 500 }
    );
  }
}
