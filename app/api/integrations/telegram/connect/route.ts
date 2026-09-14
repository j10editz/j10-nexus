import { NextResponse } from "next/server";
import { getActiveWorkspaceContext } from "@/lib/workspaces/server";
import { createServerSupabaseClient, createAdminSupabaseClient } from "@/lib/auth";
import { storeIntegrationCredentials } from "@/lib/integrations/credentials";
import { generateTelegramBindingToken } from "@/lib/telegram/binding-token";

export async function POST(req: Request) {
  try {
    const context = await getActiveWorkspaceContext();
    if (!context) {
      return NextResponse.json(
        { success: false, error: "Unauthorized." },
        { status: 401 }
      );
    }

    const ws = context.workspace;
    const wsId = ws.id;

    // Requirement: Unpaid workspace is rejected
    if (ws.status === "past_due" || ws.status === "suspended") {
      return NextResponse.json(
        {
          success: false,
          error: "Your workspace subscription is past due or suspended. Please upgrade or reactivate billing to connect Telegram.",
        },
        { status: 402 }
      );
    }

    const body = await req.json();
    const { action, token, vipGroupChatId } = body;
    const supabase = createServerSupabaseClient();
    const adminClient = createAdminSupabaseClient();

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://j10-nexus.vercel.app";
    const webhookUrl = `${appUrl}/api/webhooks/telegram`;
    const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET || "j10_nexus_telegram_secret";

    // Option 1: 1-Click Activate Official J10 Nexus Bot (Internal / VIP group only)
    if (action === "activate_official" || !token) {
      const officialToken = process.env.TELEGRAM_BOT_TOKEN;
      if (!officialToken) {
        return NextResponse.json(
          { success: false, error: "Official Telegram Bot token is not configured on the server environment." },
          { status: 500 }
        );
      }
      const botUsername = "j10_nexus_leads_bot";
      const botId = "8687561980";

      // Register Webhook to permanent HTTPS endpoint with secret token
      try {
        await fetch(`https://api.telegram.org/bot${officialToken}/setWebhook`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: webhookUrl,
            secret_token: webhookSecret,
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
        .select("id, metadata, public_configuration, credential_reference")
        .eq("workspace_id", wsId)
        .eq("provider", "telegram")
        .maybeSingle();

      const safeMetadata = {
        ...(existing?.metadata || {}),
        bot_id: botId,
        bot_username: botUsername,
        connected_at: new Date().toISOString(),
        is_official: true,
        vip_group_chat_id: vipGroupChatId || existing?.metadata?.vip_group_chat_id || "",
      };
      // Explicitly purge any token fields from metadata
      delete (safeMetadata as any).bot_token;
      delete (safeMetadata as any).telegramBotToken;

      const safePublicConfig = {
        ...(existing?.public_configuration || {}),
        bot_id: botId,
        bot_username: botUsername,
        is_official: true,
      };
      delete (safePublicConfig as any).bot_token;
      delete (safePublicConfig as any).telegramBotToken;

      let integrationId = existing?.id;
      if (existing) {
        await supabase
          .from("integrations")
          .update({
            status: "connected",
            metadata: safeMetadata,
            public_configuration: safePublicConfig,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
      } else {
        const { data: inserted, error: insErr } = await supabase
          .from("integrations")
          .insert({
            workspace_id: wsId,
            provider: "telegram",
            status: "connected",
            metadata: safeMetadata,
            public_configuration: safePublicConfig,
          })
          .select("id")
          .single();

        if (insErr || !inserted) {
          throw new Error("Failed to create Telegram integration row.");
        }
        integrationId = inserted.id;
      }

      // Store bot token strictly in Encrypted Credential Vault
      await storeIntegrationCredentials(
        adminClient,
        wsId,
        {
          connectionId: integrationId!,
          values: {
            bot_token: officialToken,
            webhook_secret: webhookSecret,
          },
        }
      );

      // Generate expiring cryptographic binding token
      const bindingToken = generateTelegramBindingToken(wsId);

      return NextResponse.json({
        success: true,
        message: "J10 Official Telegram Bot activated securely in vault!",
        bot: {
          username: botUsername,
          botId,
          shareLink: `https://t.me/${botUsername}?start=${bindingToken}`,
          bindingToken,
        },
      });
    }

    // Option 2: Connect Custom Bot Token (Client-owned bot for paid direct messaging)
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

    // Register Webhook to permanent HTTPS endpoint with secret token
    const whRes = await fetch(`https://api.telegram.org/bot${cleanToken}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: webhookSecret,
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

    const safeMetadata = {
      ...(existing?.metadata || {}),
      bot_id: String(botInfo.id),
      bot_username: botInfo.username,
      bot_name: botInfo.first_name,
      connected_at: new Date().toISOString(),
      is_official: false,
      webhook_configured: whData?.ok ?? false,
      vip_group_chat_id: vipGroupChatId || existing?.metadata?.vip_group_chat_id || "",
    };
    delete (safeMetadata as any).bot_token;
    delete (safeMetadata as any).telegramBotToken;

    const safePublicConfig = {
      ...(existing?.public_configuration || {}),
      bot_id: String(botInfo.id),
      bot_username: botInfo.username,
      is_official: false,
    };
    delete (safePublicConfig as any).bot_token;
    delete (safePublicConfig as any).telegramBotToken;

    let integrationId = existing?.id;
    if (existing) {
      await supabase
        .from("integrations")
        .update({
          status: "connected",
          metadata: safeMetadata,
          public_configuration: safePublicConfig,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      const { data: inserted, error: insErr } = await supabase
        .from("integrations")
        .insert({
          workspace_id: wsId,
          provider: "telegram",
          status: "connected",
          metadata: safeMetadata,
          public_configuration: safePublicConfig,
        })
        .select("id")
        .single();

      if (insErr || !inserted) {
        throw new Error("Failed to create custom Telegram integration row.");
      }
      integrationId = inserted.id;
    }

    // Store bot token strictly in Encrypted Credential Vault
    await storeIntegrationCredentials(
      adminClient,
      wsId,
      {
        connectionId: integrationId!,
        values: {
          bot_token: cleanToken,
          webhook_secret: webhookSecret,
        },
      }
    );

    return NextResponse.json({
      success: true,
      message: `Custom Telegram bot @${botInfo.username} connected securely in vault!`,
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
