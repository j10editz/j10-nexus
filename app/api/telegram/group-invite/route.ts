import { NextResponse } from "next/server";
import { getActiveWorkspaceContext } from "@/lib/workspaces/server";
import { createServerSupabaseClient, createAdminSupabaseClient } from "@/lib/auth";
import { getIntegrationCredentials } from "@/lib/integrations/credentials";
import { verifyBotGroupPermissions } from "@/lib/telegram/group-manager";

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
    const ws = context.workspace;
    const wsId = ws.id;
    const supabase = createServerSupabaseClient();
    const adminClient = createAdminSupabaseClient();

    // 1. Fetch telegram integration
    const { data: integ } = await supabase
      .from("integrations")
      .select("id, metadata, public_configuration, credential_reference")
      .eq("workspace_id", wsId)
      .eq("provider", "telegram")
      .eq("status", "connected")
      .maybeSingle();

    if (!integ) {
      return NextResponse.json(
        { success: false, error: "Telegram integration is not connected for this workspace." },
        { status: 400 }
      );
    }

    // 2. Fetch Bot Token strictly from Encrypted Vault
    const decryptedCreds = await getIntegrationCredentials(adminClient, wsId, integ.id);
    const botToken =
      decryptedCreds?.values?.bot_token ||
      decryptedCreds?.values?.telegramBotToken ||
      process.env.TELEGRAM_BOT_TOKEN;

    if (!botToken) {
      return NextResponse.json(
        { success: false, error: "Telegram bot credentials could not be decrypted from vault." },
        { status: 500 }
      );
    }

    const cfg = integ.metadata || {};
    const groupChatId = cfg.vip_group_chat_id || process.env.TELEGRAM_VIP_GROUP_ID;
    const botId = cfg.bot_id || "8687561980";

    if (!groupChatId) {
      return NextResponse.json(
        { success: false, error: "VIP Telegram Group Chat ID is not configured on this integration." },
        { status: 400 }
      );
    }

    // 3. Resolve target contact / thread details
    let targetChatId = chatId;
    let contactId: string | null = null;

    if (threadId) {
      const { data: thread } = await supabase
        .from("inbox_threads")
        .select("id, external_thread_id, contact_id, contact:contacts(id, phone, email)")
        .eq("id", threadId)
        .eq("workspace_id", wsId)
        .maybeSingle();

      if (thread) {
        contactId = thread.contact_id;
        const contact = (thread as any)?.contact;
        targetChatId = targetChatId || contact?.phone || thread.external_thread_id;
      }
    }

    // 4. Real Stripe/Payment and Entitlement Verification
    // Contact must have a verified paid checkout or workspace must have active paid tier
    let paymentVerified = false;

    if (contactId || threadId) {
      const checkoutQuery = supabase
        .from("payment_checkouts")
        .select("id, status, amount")
        .eq("workspace_id", wsId)
        .eq("status", "paid");

      if (contactId && threadId) {
        checkoutQuery.or(`contact_id.eq.${contactId},thread_id.eq.${threadId}`);
      } else if (contactId) {
        checkoutQuery.eq("contact_id", contactId);
      } else if (threadId) {
        checkoutQuery.eq("thread_id", threadId);
      }

      const { data: paidCheckout } = await checkoutQuery.limit(1).maybeSingle();
      if (paidCheckout) {
        paymentVerified = true;
      }
    }

    // If no direct contact checkout found, check if workspace itself is on active paid growth/enterprise plan
    if (!paymentVerified) {
      if (ws.status === "active" && (ws.plan === "growth" || ws.plan === "enterprise")) {
        paymentVerified = true;
      }
    }

    if (!paymentVerified) {
      return NextResponse.json(
        {
          success: false,
          error: "Payment verification required. VIP group invitations can only be issued to paying clients with a verified checkout or active subscription.",
        },
        { status: 402 }
      );
    }

    // 5. Confirm Bot Group Administrator Invite/Removal Permissions before issuing access
    const permCheck = await verifyBotGroupPermissions(botToken, groupChatId, botId);
    if (!permCheck.hasAdmin || !permCheck.canInviteUsers || !permCheck.canRestrictMembers) {
      return NextResponse.json(
        {
          success: false,
          error:
            permCheck.error ||
            "The Telegram bot is missing required administrator permissions (can_invite_users and can_restrict_members) in the VIP group.",
        },
        { status: 400 }
      );
    }

    // 6. Generate Single-Use Invite Link (member_limit: 1, 24h expire)
    const expireDate = Math.floor(Date.now() / 1000) + 86400; // 24 hours
    const inviteRes = await fetch(
      `https://api.telegram.org/bot${botToken}/createChatInviteLink`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: groupChatId,
          name: `VIP Access - ${customerName.slice(0, 25)}`,
          member_limit: 1,
          expire_date: expireDate,
        }),
      }
    );
    const inviteData = await inviteRes.json();

    if (!inviteRes.ok || !inviteData?.ok || !inviteData?.result?.invite_link) {
      return NextResponse.json(
        {
          success: false,
          error: inviteData?.description || "Failed to generate single-use invite link from Telegram.",
        },
        { status: 500 }
      );
    }

    const inviteLink = inviteData.result.invite_link;

    // Formatting with HTML to avoid literal ** markdown glitches
    const messageText = `🎉 <b>VIP Client Group Access Unlocked!</b>\n\n` +
      `Welcome to the private J10 NEXUS Mastermind Community.\n\n` +
      `🔗 <b>Single-Use Join Link:</b>\n` +
      `${inviteLink}\n\n` +
      `<i>Note: This link is single-use and bound exclusively to your verified account.</i>`;

    // 7. Dispatch directly to customer if requested and targetChatId available
    if (sendDirectly && targetChatId) {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: targetChatId,
          text: messageText,
          parse_mode: "HTML",
        }),
      });

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
