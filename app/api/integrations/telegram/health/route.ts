import { NextResponse } from "next/server";
import { getActiveWorkspaceContext } from "@/lib/workspaces/server";
import { createServerSupabaseClient, createAdminSupabaseClient } from "@/lib/auth";
import { getIntegrationCredentials } from "@/lib/integrations/credentials";

export const dynamic = "force-dynamic";

/**
 * Mandatory Correction 12: Webhook Health Monitoring Endpoint
 * Validates Telegram bot connectivity, webhook configuration, vault credentials, and delivery metrics.
 */
export async function GET(req: Request) {
  try {
    const context = await getActiveWorkspaceContext();
    if (!context) {
      return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
    }

    const wsId = context.workspace.id;
    const supabase = createServerSupabaseClient();
    const adminClient = createAdminSupabaseClient();

    // 1. Fetch Telegram integration record
    const { data: integ } = await supabase
      .from("integrations")
      .select("id, status, metadata, public_configuration, updated_at")
      .eq("workspace_id", wsId)
      .eq("provider", "telegram")
      .maybeSingle();

    if (!integ) {
      return NextResponse.json({
        success: true,
        status: "unconnected",
        message: "Telegram integration is not configured for this workspace.",
      });
    }

    // 2. Vault credential check
    let vaultHealthy = false;
    let botToken: string | undefined = undefined;
    try {
      const creds = await getIntegrationCredentials(adminClient, wsId, integ.id);
      botToken = creds?.values?.bot_token || creds?.values?.telegramBotToken;
      if (botToken) {
        vaultHealthy = true;
      }
    } catch {
      vaultHealthy = false;
    }

    // Fallback to official token for official bot
    if (!botToken && integ.metadata?.is_official) {
      botToken = process.env.TELEGRAM_BOT_TOKEN;
      if (botToken) vaultHealthy = true;
    }

    if (!botToken) {
      return NextResponse.json({
        success: false,
        status: "unhealthy",
        error: "Telegram credentials could not be decrypted from vault.",
        vaultHealthy: false,
      }, { status: 500 });
    }

    // 3. Telegram API getWebhookInfo check
    let webhookInfo: any = null;
    let botInfo: any = null;
    let telegramReachable = false;

    try {
      const [whRes, meRes] = await Promise.all([
        fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`),
        fetch(`https://api.telegram.org/bot${botToken}/getMe`),
      ]);

      const [whData, meData] = await Promise.all([whRes.json(), meRes.json()]);

      if (whData?.ok) {
        webhookInfo = whData.result;
        telegramReachable = true;
      }
      if (meData?.ok) {
        botInfo = meData.result;
      }
    } catch (apiErr) {
      console.error("Failed to query Telegram API for health check:", apiErr);
    }

    // 4. Inbound / Outbound delivery stats for this workspace
    const { data: outboxStats } = await supabase
      .from("inbox_messages")
      .select("delivery_status, retry_count")
      .eq("workspace_id", wsId)
      .eq("provider", "telegram")
      .eq("direction", "outbound")
      .order("created_at", { ascending: false })
      .limit(100);

    const totalSampled = outboxStats?.length || 0;
    const sentCount = outboxStats?.filter((m) => m.delivery_status === "sent" || m.delivery_status === "delivered").length || 0;
    const failedCount = outboxStats?.filter((m) => m.delivery_status === "failed").length || 0;

    const isPermanentEndpoint = webhookInfo?.url
      ? !webhookInfo.url.includes("trycloudflare.com") && webhookInfo.url.startsWith("https://")
      : false;

    const hasWebhookError = Boolean(webhookInfo?.last_error_message);

    return NextResponse.json({
      success: true,
      status: telegramReachable && vaultHealthy && !hasWebhookError ? "healthy" : "warning",
      timestamp: new Date().toISOString(),
      workspaceId: wsId,
      bot: {
        id: botInfo?.id || integ.metadata?.bot_id,
        username: botInfo?.username || integ.metadata?.bot_username,
        name: botInfo?.first_name || integ.metadata?.bot_name,
        isOfficial: Boolean(integ.metadata?.is_official),
      },
      vault: {
        healthy: vaultHealthy,
        storage: "encrypted_vault",
      },
      webhook: {
        url: webhookInfo?.url || null,
        isPermanentHttps: isPermanentEndpoint,
        hasCustomCertificate: webhookInfo?.has_custom_certificate || false,
        pendingUpdateCount: webhookInfo?.pending_update_count || 0,
        lastErrorDate: webhookInfo?.last_error_date ? new Date(webhookInfo.last_error_date * 1000).toISOString() : null,
        lastErrorMessage: webhookInfo?.last_error_message || null,
        maxConnections: webhookInfo?.max_connections || 40,
        allowedUpdates: webhookInfo?.allowed_updates || [],
      },
      deliveryMetrics: {
        sampledOutbound: totalSampled,
        sent: sentCount,
        failed: failedCount,
        successRate: totalSampled > 0 ? `${((sentCount / totalSampled) * 100).toFixed(1)}%` : "100%",
      },
    });
  } catch (err) {
    console.error("GET /api/integrations/telegram/health error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Health check failed." },
      { status: 500 }
    );
  }
}
