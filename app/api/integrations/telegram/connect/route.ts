import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getActiveWorkspaceContext } from "@/lib/workspaces/server";
import { createServerSupabaseClient, createAdminSupabaseClient } from "@/lib/auth";
import { storeIntegrationCredentials } from "@/lib/integrations/credentials";
import { createTelegramBindingToken } from "@/lib/telegram/binding-token";
import {
  registerExistingTelegramIntegration,
  TelegramRegistrationError,
  type TelegramApiResult,
} from "@/lib/telegram/registration-transaction";

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
    const { action, token, vipGroupChatId, integrationId: requestedIntegrationId } = body;
    const supabase = createServerSupabaseClient();
    const adminClient = createAdminSupabaseClient();

    const appUrl = process.env.J10_APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
    const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();

    if (!appUrl) {
      return NextResponse.json(
        { success: false, error: "The production callback URL is not configured on the server environment." },
        { status: 500 },
      );
    }

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

      // Cutover is deliberately existing-row only. A separate onboarding flow may
      // create pending integrations, but production activation never creates one.
      const { data: existing } = await supabase
        .from("integrations")
        .select("id, workspace_id, status, metadata, public_configuration")
        .eq("workspace_id", wsId)
        .eq("provider", "telegram")
        .maybeSingle();
      if (!existing || !requestedIntegrationId || requestedIntegrationId !== existing.id || existing.workspace_id !== wsId) {
        return NextResponse.json(
          { success: false, error: "An exact existing Telegram integration is required for cutover." },
          { status: 409 },
        );
      }
      const previousStatus = existing.status;
      const officialWebhookUrl = `${appUrl.replace(/\/$/, "")}/api/webhooks/telegram`;

      const safeMetadata = {
        ...(existing?.metadata || {}),
        bot_id: botId,
        bot_username: botUsername,
        bot_name: "J10 NEXUS Official Bot",
        connected_at: new Date().toISOString(),
        is_official: true,
        webhook_configured: false,
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

      const telegramRequest = async (endpoint: string, init?: RequestInit): Promise<TelegramApiResult> => {
        const response = await fetch(`https://api.telegram.org/bot${officialToken}/${endpoint}`, init);
        let payload: unknown;
        try { payload = await response.json(); } catch { return { ok: false, description: "Malformed Telegram response." }; }
        if (!response.ok || !payload || typeof payload !== "object") return { ok: false };
        const data = payload as TelegramApiResult;
        return { ok: data.ok === true, result: data.result, description: data.description };
      };

      await registerExistingTelegramIntegration(
        { id: existing.id, workspaceId: wsId, status: "connected" },
        officialWebhookUrl,
        {
          stagePending: async () => {
            const { data, error } = await supabase.from("integrations").update({ status: "pending", updated_at: new Date().toISOString() }).eq("id", existing.id).eq("workspace_id", wsId).eq("status", previousStatus).select("id, workspace_id, status").maybeSingle();
            if (error || !data) throw new Error("Could not stage the exact Telegram integration.");
            return { id: data.id, workspaceId: data.workspace_id, status: data.status };
          },
          restorePreviousState: async () => {
            const { data, error } = await supabase.from("integrations").update({ status: previousStatus, updated_at: new Date().toISOString() }).eq("id", existing.id).eq("workspace_id", wsId).eq("status", "pending").select("id").maybeSingle();
            if (error || !data || data.id !== existing.id) throw new Error("Could not restore the previous integration state.");
          },
          persistVault: async () => { await storeIntegrationCredentials(adminClient, wsId, { connectionId: existing.id, values: { bot_token: officialToken, webhook_secret: webhookSecret } }); },
          setWebhook: () => telegramRequest("setWebhook", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: officialWebhookUrl, secret_token: webhookSecret, drop_pending_updates: false, allowed_updates: ["message", "edited_message", "callback_query", "chat_join_request"] }) }),
          getWebhookInfo: () => telegramRequest("getWebhookInfo"),
          activate: async () => {
            const { data, error } = await supabase.from("integrations").update({ status: "connected", metadata: { ...safeMetadata, webhook_configured: true }, public_configuration: safePublicConfig, updated_at: new Date().toISOString() }).eq("id", existing.id).eq("workspace_id", wsId).eq("status", "pending").select("id, workspace_id, status").maybeSingle();
            if (error || !data) throw new Error("Could not activate the exact Telegram integration.");
            return { id: data.id, workspaceId: data.workspace_id, status: data.status };
          },
          markDegraded: async () => {
            const { data, error } = await supabase.from("integrations").update({ status: "pending", updated_at: new Date().toISOString() }).eq("id", existing.id).eq("workspace_id", wsId).select("id").maybeSingle();
            if (error || !data || data.id !== existing.id) throw new Error("Could not mark the integration pending.");
          },
          compensateWebhook: () => telegramRequest("deleteWebhook", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ drop_pending_updates: false }) }),
        },
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
    let testData: TelegramApiResult;
    try {
      testData = await testRes.json();
    } catch {
      return NextResponse.json({ success: false, error: "Telegram returned an invalid response." }, { status: 502 });
    }

    if (!testRes.ok || !testData?.ok || !testData.result || typeof testData.result !== "object") {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid Telegram bot token. Please verify the token from @BotFather.",
        },
        { status: 400 }
      );
    }

    const botInfo = testData.result as { id: string | number; username?: string; first_name?: string };
    if (!botInfo.username || !botInfo.first_name) {
      return NextResponse.json({ success: false, error: "Telegram returned an invalid bot profile." }, { status: 502 });
    }

    // Check existing integration row
    const { data: existing } = await supabase
      .from("integrations")
      .select("id, workspace_id, status, metadata, public_configuration")
      .eq("workspace_id", wsId)
      .eq("provider", "telegram")
      .maybeSingle();

    if (existing && (!requestedIntegrationId || requestedIntegrationId !== existing.id || existing.workspace_id !== wsId)) {
      return NextResponse.json(
        { success: false, error: "An exact existing Telegram integration is required when reconnecting a bot." },
        { status: 409 },
      );
    }

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

    const isNewIntegration = !existing;
    let integrationId = existing?.id;
    const previousStatus = existing?.status ?? "pending";
    const telegramRequest = async (endpoint: string, init?: RequestInit): Promise<TelegramApiResult> => {
      const response = await fetch(`https://api.telegram.org/bot${cleanToken}/${endpoint}`, init);
      let payload: unknown;
      try { payload = await response.json(); } catch { return { ok: false, description: "Malformed Telegram response." }; }
      if (!response.ok || !payload || typeof payload !== "object") return { ok: false };
      const data = payload as TelegramApiResult;
      return { ok: data.ok === true, result: data.result, description: data.description };
    };

    const stageNewIntegration = async () => {
      const { data, error } = await supabase
        .from("integrations")
        .insert({
          workspace_id: wsId,
          provider: "telegram",
          status: "pending",
          metadata: safeMetadata,
          public_configuration: safePublicConfig,
        })
        .select("id, workspace_id, status")
        .maybeSingle();
      if (error || !data || data.workspace_id !== wsId || data.status !== "pending") {
        throw new Error("Could not create a pending Telegram integration.");
      }
      integrationId = data.id;
      return { id: data.id, workspaceId: data.workspace_id, status: data.status };
    };

    const expected = { id: existing?.id ?? "", workspaceId: wsId, status: "connected" };
    if (existing) expected.id = existing.id;

    await registerExistingTelegramIntegration(expected, customWebhookUrl, {
      stagePending: async () => {
        if (!existing) return stageNewIntegration();
        const { data, error } = await supabase
          .from("integrations")
          .update({ status: "pending", updated_at: new Date().toISOString() })
          .eq("id", existing.id)
          .eq("workspace_id", wsId)
          .eq("status", previousStatus)
          .select("id, workspace_id, status")
          .maybeSingle();
        if (error || !data) throw new Error("Could not stage the exact Telegram integration.");
        return { id: data.id, workspaceId: data.workspace_id, status: data.status };
      },
      restorePreviousState: async () => {
        if (isNewIntegration) {
          const { data: endpoint, error: endpointError } = await adminClient
            .from("integration_webhook_endpoints")
            .delete()
            .eq("integration_id", integrationId!)
            .eq("workspace_id", wsId)
            .eq("endpoint_key", endpointKey)
            .select("integration_id")
            .maybeSingle();
          if (endpointError || (endpoint && endpoint.integration_id !== integrationId)) {
            throw new Error("Could not remove the pending Telegram webhook endpoint.");
          }
          const { data, error } = await supabase
            .from("integrations")
            .delete()
            .eq("id", integrationId!)
            .eq("workspace_id", wsId)
            .eq("status", "pending")
            .select("id")
            .maybeSingle();
          if (error || !data || data.id !== integrationId) throw new Error("Could not remove the pending Telegram integration.");
          return;
        }
        const { data, error } = await supabase
          .from("integrations")
          .update({ status: previousStatus, updated_at: new Date().toISOString() })
          .eq("id", integrationId!)
          .eq("workspace_id", wsId)
          .eq("status", "pending")
          .select("id")
          .maybeSingle();
        if (error || !data || data.id !== integrationId) throw new Error("Could not restore the prior Telegram integration state.");
      },
      persistVault: async () => {
        const { data, error } = await adminClient
          .from("integration_webhook_endpoints")
          .upsert({
            workspace_id: wsId,
            integration_id: integrationId!,
            user_id: context.user?.id,
            provider: "telegram",
            environment: "production",
            endpoint_key: endpointKey,
            status: "pending",
            max_payload_bytes: 5242880,
            updated_at: new Date().toISOString(),
          }, { onConflict: "endpoint_key" })
          .select("integration_id, workspace_id, status, endpoint_key")
          .maybeSingle();
        if (error || !data || data.integration_id !== integrationId || data.workspace_id !== wsId || data.status !== "pending" || data.endpoint_key !== endpointKey) {
          throw new Error("Could not stage the Telegram webhook endpoint.");
        }
        await storeIntegrationCredentials(adminClient, wsId, {
          connectionId: integrationId!,
          values: { bot_token: cleanToken, webhook_secret: customWebhookSecret },
        });
      },
      setWebhook: () => telegramRequest("setWebhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: customWebhookUrl,
          secret_token: customWebhookSecret,
          drop_pending_updates: false,
          allowed_updates: ["message", "edited_message", "callback_query", "chat_join_request"],
        }),
      }),
      getWebhookInfo: () => telegramRequest("getWebhookInfo"),
      activate: async () => {
        const { data: endpoint, error: endpointError } = await adminClient
          .from("integration_webhook_endpoints")
          .update({ status: "active", updated_at: new Date().toISOString() })
          .eq("integration_id", integrationId!)
          .eq("workspace_id", wsId)
          .eq("endpoint_key", endpointKey)
          .eq("status", "pending")
          .select("integration_id, workspace_id, status, endpoint_key")
          .maybeSingle();
        if (endpointError || !endpoint || endpoint.integration_id !== integrationId || endpoint.workspace_id !== wsId || endpoint.status !== "active" || endpoint.endpoint_key !== endpointKey) {
          throw new Error("Could not activate the exact Telegram webhook endpoint.");
        }
        const { data, error } = await supabase
          .from("integrations")
          .update({
            status: "connected",
            metadata: { ...safeMetadata, webhook_configured: true },
            public_configuration: safePublicConfig,
            updated_at: new Date().toISOString(),
          })
          .eq("id", integrationId!)
          .eq("workspace_id", wsId)
          .eq("status", "pending")
          .select("id, workspace_id, status")
          .maybeSingle();
        if (error || !data) throw new Error("Could not activate the exact Telegram integration.");
        return { id: data.id, workspaceId: data.workspace_id, status: data.status };
      },
      markDegraded: async () => {
        const { data: endpoint, error: endpointError } = await adminClient
          .from("integration_webhook_endpoints")
          .update({ status: "pending", updated_at: new Date().toISOString() })
          .eq("integration_id", integrationId!)
          .eq("workspace_id", wsId)
          .eq("endpoint_key", endpointKey)
          .eq("status", "active")
          .select("integration_id, workspace_id, status")
          .maybeSingle();
        if (endpointError || !endpoint || endpoint.integration_id !== integrationId || endpoint.workspace_id !== wsId || endpoint.status !== "pending") {
          throw new Error("Could not mark the webhook endpoint pending.");
        }
        const { data, error } = await supabase
          .from("integrations")
          .update({ status: "pending", updated_at: new Date().toISOString() })
          .eq("id", integrationId!)
          .eq("workspace_id", wsId)
          .select("id")
          .maybeSingle();
        if (error || !data || data.id !== integrationId) throw new Error("Could not mark the integration pending.");
      },
      compensateWebhook: () => telegramRequest("deleteWebhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ drop_pending_updates: false }),
      }),
    });

    return NextResponse.json({
      success: true,
      message: `Custom Telegram bot @${botInfo.username} connected securely in vault!`,
      bot: {
        username: botInfo.username,
        name: botInfo.first_name,
        botId: String(botInfo.id),
        shareLink: `https://t.me/${botInfo.username}`,
        endpointKey,
        webhookConfigured: true,
      },
    });
  } catch (error) {
    if (error instanceof TelegramRegistrationError) {
      return NextResponse.json(
        { success: false, error: "Telegram registration did not complete safely.", code: error.code },
        { status: 502 },
      );
    }
    console.error("POST /api/integrations/telegram/connect error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to connect Telegram bot." },
      { status: 500 }
    );
  }
}
