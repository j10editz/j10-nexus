import { NextResponse } from "next/server";
import { createWebhookServiceClient } from "@/lib/integrations/webhooks/service-client";
import { persistCanonicalTelegramInbound } from "@/lib/omnichannel/provider-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    // 1. Verify webhook secret token if TELEGRAM_WEBHOOK_SECRET is set
    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
    if (expectedSecret) {
      const receivedSecret = request.headers.get("x-telegram-bot-api-secret-token")?.trim();
      if (!receivedSecret || receivedSecret !== expectedSecret) {
        return NextResponse.json({ error: "Invalid webhook secret token" }, { status: 401 });
      }
    }

    const update = await request.json();
    if (!update || (!update.message && !update.edited_message)) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const supabase = createWebhookServiceClient();

    // 2. Find active workspace
    const { data: workspaces } = await supabase
      .from("workspaces")
      .select("id")
      .eq("status", "active")
      .limit(1);

    const workspaceId = workspaces?.[0]?.id;
    if (!workspaceId) {
      console.warn("Telegram webhook received but no active workspace found in database");
      return NextResponse.json({ ok: true, warning: "no_active_workspace" });
    }

    const origin = new URL(request.url).origin;
    const result = await persistCanonicalTelegramInbound(supabase, {
      workspaceId,
      update,
      origin,
    });

    return NextResponse.json({ ok: true, result });
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
