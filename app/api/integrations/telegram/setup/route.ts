import { NextResponse } from "next/server";
import { createWebhookServiceClient } from "@/lib/integrations/webhooks/service-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleSetup(request);
}

export async function POST(request: Request) {
  return handleSetup(request);
}

async function handleSetup(request: Request) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    return NextResponse.json({
      success: false,
      error: "TELEGRAM_BOT_TOKEN is not configured in environment variables",
    }, { status: 400 });
  }

  try {
    // 1. Check Bot with getMe
    const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const meData = await meRes.json();
    if (!meRes.ok || !meData.ok) {
      return NextResponse.json({
        success: false,
        error: "Telegram getMe failed: " + (meData.description || meRes.statusText),
      }, { status: 400 });
    }

    // 2. Determine App URL
    const origin = process.env.J10_APP_URL?.trim() || new URL(request.url).origin;
    const webhookUrl = `${origin}/api/webhooks/telegram`;
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();

    // 3. Register webhook with Telegram Bot API
    const setWebhookUrl = new URL(`https://api.telegram.org/bot${token}/setWebhook`);
    setWebhookUrl.searchParams.set("url", webhookUrl);
    setWebhookUrl.searchParams.set("allowed_updates", JSON.stringify(["message", "edited_message"]));
    if (secret) {
      setWebhookUrl.searchParams.set("secret_token", secret);
    }

    const setRes = await fetch(setWebhookUrl.toString());
    const setData = await setRes.json();

    // 4. Verify webhook info
    const infoRes = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
    const infoData = await infoRes.json();

    // 5. Ensure workspace exists in staging database
    let workspaceCreated = false;
    let workspaceId: string | null = null;
    try {
      const supabase = createWebhookServiceClient();
      const { data: existingWorkspaces } = await supabase.from("workspaces").select("id").limit(1);
      if (!existingWorkspaces || existingWorkspaces.length === 0) {
        const { data: newWs } = await supabase.from("workspaces").insert({
          name: "J10 NEXUS Workspace",
          brand_name: "J10 NEXUS",
          plan: "growth",
          status: "active",
        }).select("id").single();
        workspaceCreated = true;
        workspaceId = newWs?.id || null;
      } else {
        workspaceId = existingWorkspaces[0].id;
      }
    } catch (dbErr) {
      console.warn("Workspace lookup in setup route non-blocking warning:", dbErr);
    }

    return NextResponse.json({
      success: true,
      message: "Telegram webhook registered and active!",
      bot: meData.result,
      webhookUrl,
      telegramResponse: setData,
      currentWebhookInfo: infoData.result,
      workspaceId,
      workspaceCreated,
    });
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}
