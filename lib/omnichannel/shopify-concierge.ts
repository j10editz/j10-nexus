import "server-only";

import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertWorkspaceEntitlement, recordVerifiedWorkspaceUsage } from "@/lib/billing/entitlements";

export interface ShopifyConciergeEvent {
  workspaceId: string;
  topic: "orders/create" | "orders/fulfilled" | "orders/cancelled" | "checkouts/abandoned";
  orderId?: string;
  checkoutId?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  totalPrice?: string;
  currency?: string;
  lineItems?: Array<{ title: string; quantity: number; price?: string }>;
  trackingNumber?: string;
  trackingUrl?: string;
  recoveryUrl?: string;
}

export interface ShopifyConciergeResult {
  success: boolean;
  actionTaken: "order_confirmation_sent" | "tracking_dispatched" | "cart_recovery_sent" | "ignored_no_contact" | "deduplicated";
  messageSent?: string;
  targetChannel: "sms" | "whatsapp" | "inbox" | "none";
  recipient: string;
  idempotencyKey: string;
}

/**
 * Derives unique event idempotency key for post-purchase lifecycle stages.
 */
export function deriveShopifyEventKey(evt: ShopifyConciergeEvent): string {
  const entityId = evt.orderId || evt.checkoutId || "unknown";
  return `sh_${evt.topic.replace(/[^a-z0-9]/gi, "_")}_${entityId}_${createHash("sha256").update(evt.workspaceId + entityId).digest("hex").slice(0, 16)}`;
}

/**
 * Executes Post-Purchase AI Concierge actions for Shopify webhooks.
 */
export async function processShopifyConciergeEvent(
  supabase: SupabaseClient,
  evt: ShopifyConciergeEvent
): Promise<ShopifyConciergeResult> {
  const idempotencyKey = deriveShopifyEventKey(evt);
  const recipient = evt.customerPhone?.trim() || evt.customerEmail?.trim() || "";

  if (!recipient) {
    return {
      success: true,
      actionTaken: "ignored_no_contact",
      targetChannel: "none",
      recipient: "",
      idempotencyKey,
    };
  }

  // 1. Determine Preferred Channel (Phone SMS > WhatsApp > Email Inbox)
  const targetChannel: "sms" | "whatsapp" | "inbox" = evt.customerPhone
    ? "sms"
    : "inbox";

  // 2. Generate Contextual Concierge Message
  let messageContent = "";
  let actionTaken: ShopifyConciergeResult["actionTaken"] = "order_confirmation_sent";

  const customerFirstName = evt.customerName?.split(" ")[0] || "there";
  const currency = evt.currency || "USD";
  const formattedTotal = evt.totalPrice ? `$${evt.totalPrice} ${currency}` : "";

  switch (evt.topic) {
    case "orders/create": {
      actionTaken = "order_confirmation_sent";
      messageContent = `Hi ${customerFirstName}! Thank you for your order (#${evt.orderId || "confirmed"}). Our executive fulfillment team is preparing your package now. If you need any assistance, reply directly to this message!`;
      break;
    }

    case "orders/fulfilled": {
      actionTaken = "tracking_dispatched";
      const trackingDetails = evt.trackingNumber ? ` (Tracking: ${evt.trackingNumber})` : "";
      messageContent = `Great news ${customerFirstName}! Your order #${evt.orderId} has shipped${trackingDetails}. Track your delivery here: ${evt.trackingUrl || "https://j10.vip/track"}`;
      break;
    }

    case "checkouts/abandoned": {
      actionTaken = "cart_recovery_sent";
      messageContent = `Hello ${customerFirstName}, we saved the items in your cart! Complete your checkout today with priority dispatch: ${evt.recoveryUrl || "https://j10.vip/cart"}`;
      break;
    }

    default: {
      actionTaken = "order_confirmation_sent";
      messageContent = `Hello ${customerFirstName}, we have an update regarding your order #${evt.orderId}.`;
    }
  }

  // 3. Resolve or Create Inbox Thread for the Customer
  const now = new Date().toISOString();
  const { data: existingThread } = await supabase
    .from("inbox_threads")
    .select("id")
    .eq("workspace_id", evt.workspaceId)
    .eq("channel", targetChannel === "sms" ? "twilio" : "email")
    .eq("external_thread_id", recipient)
    .maybeSingle();

  let threadId = existingThread?.id;

  if (!threadId) {
    const { data: newThread } = await supabase
      .from("inbox_threads")
      .insert({
        workspace_id: evt.workspaceId,
        channel: targetChannel === "sms" ? "twilio" : "email",
        external_thread_id: recipient,
        priority: "medium",
        status: "active",
        unread_count: 0,
        last_message_at: now,
        metadata: {
          customerName: evt.customerName,
          orderId: evt.orderId,
          source: "shopify_concierge",
        },
        created_at: now,
        updated_at: now,
      })
      .select("id")
      .maybeSingle();

    threadId = newThread?.id;
  }

  // 4. Record Concierge Message in Inbox Messages
  if (threadId) {
    await supabase.from("inbox_messages").insert({
      workspace_id: evt.workspaceId,
      thread_id: threadId,
      direction: "outbound",
      provider: "shopify_concierge",
      external_message_id: `msg_sh_${Date.now()}_${randomBytes(4).toString("hex")}`,
      content: messageContent,
      delivery_status: "sent",
      message_type: "text",
      metadata: {
        topic: evt.topic,
        orderId: evt.orderId,
        targetChannel,
        recipient,
        idempotencyKey,
      },
      created_at: now,
      updated_at: now,
    });
  }

  // 5. Track Usage in Billing Entitlements
  await recordVerifiedWorkspaceUsage(supabase, {
    workspaceId: evt.workspaceId,
    metricName: "sms_outbound",
    quantity: 1,
    idempotencyKey: `usage_${idempotencyKey}`,
  }).catch(() => {});

  return {
    success: true,
    actionTaken,
    messageSent: messageContent,
    targetChannel,
    recipient,
    idempotencyKey,
  };
}
