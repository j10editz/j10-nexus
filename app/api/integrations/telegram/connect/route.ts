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
    const { action, token, vipGroupChatId } = body;
    const wsId = context.workspace.id;
    const supabase = createServerSupabaseClient();

    // Option 1: 1-Click Activate Official J10 Nexus Bot (Zero Headache)
    if (action === "activate_official" || !token) {
      const officialToken =
        process.env.TELEGRAM_BOT_TOKEN ||
        "8687561980:AAGY78OR5ZNGZqYW7LNUvRVeFukARgowubk";
      const botUsername = "j10_nexus_leads_bot";
      const botId = "8687561980";

      // Ensure webhook is active on Vercel production
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://j10-nexus.vercel.app";
      const webhookUrl = `${appUrl}/api/webhooks/telegram`;
      try {
        await fetch(`https://api.telegram.org/bot${officialToken}/setWebhook`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: webhookUrl,
            drop_pending_updates: false,
            allowed_updates: ["message", "edited_message", "callback_query"],
          }),
        });
      } catch (err) {
        console.warn("Webhook registration notice:", err);
      }

      // Check existing integration row
      const { data: existing } = await supabase
        .from("integrations")
        .select("id, metadata, public_configuration")
        .eq("workspace_id", wsId)
        .eq("provider", "telegram")
        .maybeSingle();

      const metadata = {
        ...(existing?.metadata || {}),
        bot_id: botId,
        bot_username: botUsername,
        bot_token: officialToken,
        gemini_api_key: process.env.GEMINI_API_KEY || "",
        connected_at: new Date().toISOString(),
        is_official: true,
        vip_group_chat_id: vipGroupChatId || existing?.metadata?.vip_group_chat_id || "",
      };

      const publicConfig = {
        ...(existing?.public_configuration || {}),
        bot_id: botId,
        bot_username: botUsername,
        bot_token: officialToken,
        telegramBotToken: officialToken,
        is_official: true,
      };

      if (existing) {
        await supabase
          .from("integrations")
          .update({
            status: "connected",
            metadata,
            public_configuration: publicConfig,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
      } else {
        await supabase.from("integrations").insert({
          workspace_id: wsId,
          provider: "telegram",
          status: "connected",
          metadata,
          public_configuration: publicConfig,
        });
      }

      return NextResponse.json({
        success: true,
        message: "J10 Official Telegram Bot activated successfully!",
        bot: {
          username: botUsername,
          botId,
          shareLink: `https://t.me/${botUsername}?start=ws_${wsId}`,
        },
      });
    }

    // Option 2: Connect Custom Bot Token (BYO Bot like Zernio)
    const cleanToken = token.trim();
    const testRes = await fetch(`https://api.telegram.org/bot${cleanToken}/getMe`);
    const testData = await testRes.json();

    if (!testRes.ok || !testData?.ok) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid Telegram bot token. Please verify the token from @BotFather.",
        },
        { status: 400 }
      );
    }

    const botInfo = testData.result;

    // Register Webhook to J10 NEXUS
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://j10-nexus.vercel.app";
    const webhookUrl = `${appUrl}/api/webhooks/telegram`;
    const whRes = await fetch(`https://api.telegram.org/bot${cleanToken}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        drop_pending_updates: false,
        allowed_updates: ["message", "edited_message", "callback_query"],
      }),
    });
    const whData = await whRes.json();

    // Check existing integration row
    const { data: existing } = await supabase
      .from("integrations")
      .select("id, metadata, public_configuration")
      .eq("workspace_id", wsId)
      .eq("provider", "telegram")
      .maybeSingle();

    const metadata = {
      ...(existing?.metadata || {}),
      bot_id: String(botInfo.id),
      bot_username: botInfo.username,
      bot_name: botInfo.first_name,
      bot_token: cleanToken,
      connected_at: new Date().toISOString(),
      is_official: false,
      webhook_configured: whData?.ok ?? false,
      vip_group_chat_id: vipGroupChatId || existing?.metadata?.vip_group_chat_id || "",
    };

    const publicConfig = {
      ...(existing?.public_configuration || {}),
      bot_id: String(botInfo.id),
      bot_username: botInfo.username,
      bot_token: cleanToken,
      telegramBotToken: cleanToken,
      is_official: false,
    };

    if (existing) {
      await supabase
        .from("integrations")
        .update({
          status: "connected",
          metadata,
          public_configuration: publicConfig,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("integrations").insert({
        workspace_id: wsId,
        provider: "telegram",
        status: "connected",
        metadata,
        public_configuration: publicConfig,
      });
    }

    return NextResponse.json({
      success: true,
      message: `Custom Telegram bot @${botInfo.username} connected and live!`,
      bot: {
        username: botInfo.username,
        name: botInfo.first_name,
        botId: String(botInfo.id),
        shareLink: `https://t.me/${botInfo.username}`,
      },
    });
  } catch (error) {
    console.error("POST /api/integrations/telegram/connect error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to connect Telegram integration." },
      { status: 500 }
    );
  }
}
