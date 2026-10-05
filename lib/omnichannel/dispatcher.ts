import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { recordCanonicalLeadIntake } from "@/lib/leads/intake";

export interface OmnichannelDispatchResult {
  success: boolean;
  channel: string;
  leadIntakeId?: string | null;
  contactId?: string | null;
  threadId?: string | null;
  messageId?: string | null;
  jobEnqueued: boolean;
  ignored?: boolean;
  reason?: string;
}

/**
 * Dispatches an inbound Twilio SMS message into the unified CRM, inbox, and AI workflow.
 */
export async function dispatchTwilioInboundMessage(
  supabase: SupabaseClient,
  args: {
    workspaceId: string;
    integrationId?: string;
    fromPhone: string;
    toPhone: string;
    body: string;
    messageSid: string;
    senderName?: string;
    origin?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<OmnichannelDispatchResult> {
  const { workspaceId, integrationId, fromPhone, toPhone, body, messageSid, senderName, origin = "https://j10-nexus.com" } = args;

  const digits = fromPhone.replace(/\D/g, "");
  const normalizedPhone = digits.length >= 7 ? `+${digits}` : fromPhone;
  const idempotencyKey = `twilio_${workspaceId}_${normalizedPhone}_${messageSid}`;

  const intakeResult = await recordCanonicalLeadIntake(
    supabase,
    {
      workspaceId,
      source: "twilio",
      channel: "sms",
      name: senderName || normalizedPhone,
      email: null,
      phone: normalizedPhone,
      message: body.trim(),
      sourceEventId: messageSid,
      idempotencyKey,
      consents: [
        {
          status: "granted",
          communicationChannel: "sms",
          purpose: "operational",
          disclosureVersion: "v1",
          captureSource: "inbound_twilio_sms",
        },
      ],
      metadata: {
        twilio_message_sid: messageSid,
        twilio_to: toPhone,
        twilio_from: fromPhone,
        integration_id: integrationId,
        ...(args.metadata || {}),
      },
    },
    origin
  );

  return {
    success: true,
    channel: "twilio_sms",
    leadIntakeId: intakeResult?.leadIntakeId || null,
    contactId: intakeResult?.contactId || null,
    threadId: intakeResult?.threadId || null,
    messageId: intakeResult?.messageId || null,
    jobEnqueued: true,
  };
}

/**
 * Dispatches an inbound Instagram DM into the unified CRM, inbox, and AI workflow.
 */
export async function dispatchInstagramInboundMessage(
  supabase: SupabaseClient,
  args: {
    workspaceId: string;
    integrationId?: string;
    senderId: string;
    recipientId: string;
    text: string;
    messageMid: string;
    senderUsername?: string;
    origin?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<OmnichannelDispatchResult> {
  const { workspaceId, integrationId, senderId, recipientId, text, messageMid, senderUsername, origin = "https://j10-nexus.com" } = args;

  const senderDisplayName = senderUsername ? `@${senderUsername.replace(/^@/, "")}` : `Instagram User (${senderId.slice(-4)})`;
  const idempotencyKey = `ig_${workspaceId}_${senderId}_${messageMid}`;

  const intakeResult = await recordCanonicalLeadIntake(
    supabase,
    {
      workspaceId,
      source: "instagram",
      channel: "instagram",
      name: senderDisplayName,
      email: null,
      phone: null,
      message: text.trim(),
      sourceEventId: messageMid,
      idempotencyKey,
      consents: [
        {
          status: "granted",
          communicationChannel: "instagram",
          purpose: "operational",
          disclosureVersion: "v1",
          captureSource: "inbound_instagram_dm",
        },
      ],
      metadata: {
        instagram_sender_id: senderId,
        instagram_recipient_id: recipientId,
        instagram_username: senderUsername || null,
        instagram_message_id: messageMid,
        integration_id: integrationId,
        ...(args.metadata || {}),
      },
    },
    origin
  );

  return {
    success: true,
    channel: "instagram_dm",
    leadIntakeId: intakeResult?.leadIntakeId || null,
    contactId: intakeResult?.contactId || null,
    threadId: intakeResult?.threadId || null,
    messageId: intakeResult?.messageId || null,
    jobEnqueued: true,
  };
}

/**
 * Dispatches a Shopify Order or Customer event into the unified CRM, inbox, and AI follow-up worker.
 */
export async function dispatchShopifyOrderEvent(
  supabase: SupabaseClient,
  args: {
    workspaceId: string;
    integrationId?: string;
    topic: string;
    orderId?: string | number | null;
    checkoutId?: string | null;
    customerEmail?: string | null;
    customerPhone?: string | null;
    customerName?: string | null;
    totalPrice?: string | number | null;
    currency?: string;
    origin?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<OmnichannelDispatchResult> {
  const {
    workspaceId,
    integrationId,
    topic,
    orderId,
    checkoutId,
    customerEmail,
    customerPhone,
    customerName,
    totalPrice,
    currency = "USD",
    origin = "https://j10-nexus.com",
  } = args;

  const entityId = orderId ? String(orderId) : checkoutId || `evt_${Date.now()}`;
  const normalizedPhone = customerPhone ? `+${customerPhone.replace(/\D/g, "")}` : null;
  const displayName = customerName || customerEmail || (normalizedPhone ? `Customer ${normalizedPhone}` : `Shopify Customer #${entityId}`);
  const orderMessage = `Shopify ${topic}: Order #${entityId} for ${currency} ${totalPrice || "0.00"}`;
  const idempotencyKey = `shopify_${workspaceId}_${topic}_${entityId}`;

  const intakeResult = await recordCanonicalLeadIntake(
    supabase,
    {
      workspaceId,
      source: "shopify",
      channel: "website",
      name: displayName,
      email: customerEmail || null,
      phone: normalizedPhone,
      message: orderMessage,
      sourceEventId: String(orderId),
      idempotencyKey,
      consents: [
        {
          status: "granted",
          communicationChannel: "website",
          purpose: "operational",
          disclosureVersion: "v1",
          captureSource: "shopify_order_webhook",
        },
      ],
      metadata: {
        shopify_topic: topic,
        shopify_order_id: String(orderId),
        shopify_total_price: totalPrice,
        shopify_currency: currency,
        ...(args.metadata || {}),
      },
    },
    origin
  );

  return {
    success: true,
    channel: "shopify_event",
    leadIntakeId: intakeResult?.leadIntakeId || null,
    contactId: intakeResult?.contactId || null,
    threadId: intakeResult?.threadId || null,
    messageId: intakeResult?.messageId || null,
    jobEnqueued: true,
  };
}
