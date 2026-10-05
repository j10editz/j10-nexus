import { NextResponse } from "next/server";
import { createWebhookServiceClient } from "@/lib/integrations/webhooks/service-client";
import { dispatchShopifyOrderEvent } from "@/lib/omnichannel/dispatcher";
import {
  hmacSha256Base64,
  safeStringEqual,
} from "@/lib/integrations/webhooks/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Shopify Order & Checkout Webhook Route Handler (POST)
 */
export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const topic = request.headers.get("x-shopify-topic") || "orders/create";
    const shopDomain = request.headers.get("x-shopify-shop-domain") || "";
    const hmacHeader = request.headers.get("x-shopify-hmac-sha256") || "";

    const webhookSecret =
      process.env.SHOPIFY_WEBHOOK_SIGNING_SECRET?.trim() ||
      process.env.SHOPIFY_API_SECRET?.trim() ||
      "";

    // Enforce HMAC-SHA256 Base64 check when secret is configured
    if (webhookSecret && hmacHeader) {
      const calculatedHmac = hmacSha256Base64(webhookSecret, rawBody);
      if (!safeStringEqual(hmacHeader, calculatedHmac)) {
        return NextResponse.json(
          { success: false, error: "Invalid Shopify webhook HMAC signature." },
          { status: 401 }
        );
      }
    }

    let payload: Record<string, any>;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { success: false, error: "Malformed JSON payload." },
        { status: 400 }
      );
    }

    const orderId = payload.id ? String(payload.id) : undefined;
    const checkoutId = payload.token ? String(payload.token) : undefined;
    const customer = payload.customer || {};
    const customerEmail = customer.email || payload.email || undefined;
    const customerPhone = customer.phone || payload.phone || undefined;
    const customerName = [customer.first_name, customer.last_name].filter(Boolean).join(" ") || undefined;
    const totalPrice = payload.total_price || payload.total_price_usd || undefined;
    const currency = payload.currency || "USD";

    const supabase = createWebhookServiceClient();

    // Resolve workspace by connected Shopify integration
    const { data: integ } = await supabase
      .from("integrations")
      .select("id, workspace_id")
      .eq("provider", "shopify")
      .eq("status", "connected")
      .limit(1)
      .maybeSingle();

    const workspaceId = integ?.workspace_id || "00000000-0000-0000-0000-000000000001";

    const result = await dispatchShopifyOrderEvent(supabase, {
      workspaceId,
      integrationId: integ?.id,
      topic,
      orderId,
      checkoutId,
      customerEmail,
      customerPhone,
      customerName,
      totalPrice,
      currency,
    });

    return NextResponse.json(
      {
        success: true,
        accepted: true,
        topic,
        orderId,
        jobEnqueued: result.jobEnqueued,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[Shopify Webhook Handler] Error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Internal error processing Shopify webhook" },
      { status: 500 }
    );
  }
}
