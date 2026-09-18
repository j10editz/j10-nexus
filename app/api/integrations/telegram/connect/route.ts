import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getActiveWorkspaceContext } from "@/lib/workspaces/server";
import { createServerSupabaseClient, createAdminSupabaseClient } from "@/lib/auth";
import { storeIntegrationCredentials } from "@/lib/integrations/credentials";
import { createTelegramBindingToken } from "@/lib/telegram/binding-token";

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
    const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();

    // Option 1: 1-Click Activate Official J10 Nexus Bot (Internal / VIP group only)
    if (action === "activate_official" || !token) {
      const officialToken = process.env.TELEGRAM_BOT_TOKEN;
      if (!officialToken) {
        return NextResponse.json(
          { success: false, error: "Official Telegram Bot token is not configured on the server environment." },
          { status: 500 }
        );
      }
      if (!webhookSecret) {
        return NextResponse.json(
          { success: false, error: "Telegram webhook secret is not configured on the server environment." },
          { status: 500 },
        );
      }
      const botUsername = "j10_nexus_leads_bot";
      const botId = "8687561980";

      // Register Webhook for Official Bot to canonical endpoint
      const officialWebhookUrl = `${appUrl}/api/webhooks/telegram`;
      const whRes = await fetch(`https://api.telegram.org/bot${officialToken}/setWebhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: officialWebhookUrl,
          secret_token: webhookSecret,
          drop_pending_updates: false,
          allowed_updates: ["message", "edited_message", "callback_query", "chat_join_request"],
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
        bot_id: botId,
        bot_username: botUsername,
        bot_name: "J10 NEXUS Official Bot",
        connected_at: new Date().toISOString(),
        is_official: true,
        webhook_configured: whData?.ok ?? false,
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
          throw new Error("Failed to create official Telegram integration row.");
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

      // Generate expiring opaque cryptographic binding token (Correction 1: SHA-256 in DB, <= 64 chars)
      const { token: bindingToken } = await createTelegramBindingToken(adminClient, {
        workspaceId: wsId,
        purpose: "lead_intake",
        createdByUserId: context.user?.id,
      });

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

    // Option 2: Connect Custom Bot Token (Client-owned dedicated bot for paid direct messaging)
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

    // Check existing integration row
    const { data: existing } = await supabase
      .from("integrations")
      .select("id, metadata, public_configuration")
      .eq("workspace_id", wsId)
      .eq("provider", "telegram")
      .maybeSingle();

    // Mandatory Correction 3: Each custom bot MUST have a unique endpoint key and unique webhook secret
    const endpointKey = existing?.metadata?.webhook_endpoint_key || crypto.randomUUID();
    const customWebhookSecret = crypto.randomBytes(32).toString("hex");
    const customWebhookUrl = `${appUrl}/api/webhooks/telegram/${endpointKey}`;

    const safeMetadata = {
      ...(existing?.metadata || {}),
      bot_id: String(botInfo.id),
      bot_username: botInfo.username,
      bot_name: botInfo.first_name,
      connected_at: new Date().toISOString(),
      is_official: false,
      webhook_endpoint_key: endpointKey,
      webhook_url: customWebhookUrl,
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

    // Upsert endpoint row in integration_webhook_endpoints
    await adminClient
      .from("integration_webhook_endpoints")
      .upsert({
        workspace_id: wsId,
        integration_id: integrationId!,
        user_id: context.user?.id,
        provider: "telegram",
        environment: "production",
        endpoint_key: endpointKey,
        status: "active",
        max_payload_bytes: 5242880,
        updated_at: new Date().toISOString(),
      }, { onConflict: "endpoint_key" });

    // Store custom bot token & unique webhook secret strictly in Encrypted Credential Vault
    await storeIntegrationCredentials(
      adminClient,
      wsId,
      {
        connectionId: integrationId!,
        values: {
          bot_token: cleanToken,
          webhook_secret: customWebhookSecret,
        },
      }
    );

    // Register Webhook to dedicated custom endpoint URL with unique secret_token
    const whRes = await fetch(`https://api.telegram.org/bot${cleanToken}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: customWebhookUrl,
        secret_token: customWebhookSecret,
        drop_pending_updates: false,
        allowed_updates: ["message", "edited_message", "callback_query", "chat_join_request"],
      }),
    });
    const whData = await whRes.json();

    return NextResponse.json({
      success: true,
      message: `Custom Telegram bot @${botInfo.username} connected securely in vault!`,
      bot: {
        username: botInfo.username,
        name: botInfo.first_name,
        botId: String(botInfo.id),
        shareLink: `https://t.me/${botInfo.username}`,
        endpointKey,
        webhookConfigured: whData?.ok ?? false,
      },
    });
  } catch (error) {
    console.error("POST /api/integrations/telegram/connect error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to connect Telegram bot." },
      { status: 500 }
    );
  }
}
