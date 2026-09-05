import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SubscriptionStatus } from "./entitlements";

const SIGNATURE_TOLERANCE_SECONDS = 300; // 5 minutes

export interface StripeWebhookVerificationResult {
  valid: boolean;
  error?: string;
}

export function verifyStripeWebhookSignature({
  rawBody,
  signatureHeader,
  secret,
  now = Date.now(),
}: {
  rawBody: string;
  signatureHeader: string | null;
  secret: string;
  now?: number;
}): StripeWebhookVerificationResult {
  if (!signatureHeader) {
    return { valid: false, error: "Missing stripe-signature header." };
  }

  const parts = signatureHeader.split(",").map((p) => p.trim());
  let timestamp: number | null = null;
  const signatures: string[] = [];

  for (const part of parts) {
    const [key, value] = part.split("=");
    if (key === "t" && value) {
      const parsed = Number(value);
      if (Number.isInteger(parsed) && parsed > 0) {
        timestamp = parsed;
      }
    } else if (key === "v1" && value) {
      signatures.push(value);
    }
  }

  if (!timestamp || signatures.length === 0) {
    return { valid: false, error: "Malformed stripe-signature header." };
  }

  // Check timestamp freshness
  const ageSeconds = Math.abs(Math.floor(now / 1000) - timestamp);
  if (ageSeconds > SIGNATURE_TOLERANCE_SECONDS) {
    return { valid: false, error: "Stripe webhook signature expired." };
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const expectedSignature = createHmac("sha256", secret)
    .update(signedPayload)
    .digest("hex");

  const expectedBuffer = Buffer.from(expectedSignature, "utf8");
  const match = signatures.some((sig) => {
    const sigBuffer = Buffer.from(sig, "utf8");
    if (sigBuffer.length !== expectedBuffer.length) return false;
    return timingSafeEqual(sigBuffer, expectedBuffer);
  });

  if (!match) {
    return { valid: false, error: "Stripe signature verification failed." };
  }

  return { valid: true };
}

export function resolvePlanLimits(planId: string): {
  planId: string;
  monthlyMessageLimit: number;
} {
  const normalized = planId.toLowerCase();
  if (normalized.includes("growth")) {
    return { planId: "growth", monthlyMessageLimit: 10_000 };
  }
  if (normalized.includes("enterprise")) {
    return { planId: "enterprise", monthlyMessageLimit: 100_000 };
  }
  return { planId: "starter", monthlyMessageLimit: 1_000 };
}

export async function processStripeSubscriptionEvent(
  supabase: SupabaseClient,
  event: {
    type: string;
    data: {
      object: Record<string, any>;
    };
  },
): Promise<{ processed: boolean; action: string; subscriptionId?: string }> {
  const obj = event.data.object;

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const stripeSubId = obj.id as string;
      const stripeCustomerId = obj.customer as string;
      const statusRaw = obj.status as string;
      const currentPeriodEndSec = obj.current_period_end as number;
      const currentPeriodStartSec = obj.current_period_start as number;

      let status: SubscriptionStatus = "active";
      if (statusRaw === "past_due") status = "past_due";
      else if (statusRaw === "canceled") status = "canceled";
      else if (statusRaw === "unpaid") status = "unpaid";
      else if (statusRaw === "trialing") status = "trialing";

      const currentPeriodEnd = currentPeriodEndSec
        ? new Date(currentPeriodEndSec * 1000).toISOString()
        : new Date(Date.now() + 30 * 86400000).toISOString();

      const currentPeriodStart = currentPeriodStartSec
        ? new Date(currentPeriodStartSec * 1000).toISOString()
        : new Date().toISOString();

      // Resolve plan
      const planItem = obj.items?.data?.[0]?.price?.lookup_key ||
        obj.items?.data?.[0]?.price?.id ||
        obj.plan?.id ||
        "starter";
      const { planId, monthlyMessageLimit } = resolvePlanLimits(String(planItem));

      // 7-day grace period for past_due
      const gracePeriodEnd =
        status === "past_due"
          ? new Date(Date.now() + 7 * 86400000).toISOString()
          : null;

      // Check if this subscription already exists by stripe_subscription_id
      const { data: existing } = await supabase
        .from("workspace_subscriptions")
        .select("id, user_id, messages_used_this_period, current_period_end")
        .eq("stripe_subscription_id", stripeSubId)
        .maybeSingle();

      if (existing) {
        // If billing period rolled over, reset usage
        const periodRolledOver =
          new Date(currentPeriodEnd).getTime() >
          new Date(existing.current_period_end).getTime();

        await supabase
          .from("workspace_subscriptions")
          .update({
            status,
            plan_id: planId,
            monthly_message_limit: monthlyMessageLimit,
            current_period_start: currentPeriodStart,
            current_period_end: currentPeriodEnd,
            grace_period_end: gracePeriodEnd,
            messages_used_this_period: periodRolledOver
              ? 0
              : existing.messages_used_this_period,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);

        return { processed: true, action: "updated", subscriptionId: existing.id };
      }

      // If metadata contains user_id, associate directly
      const userId = (obj.metadata?.user_id || obj.metadata?.userId) as string | undefined;
      if (userId) {
        const { data: created } = await supabase
          .from("workspace_subscriptions")
          .upsert(
            {
              user_id: userId,
              stripe_customer_id: stripeCustomerId,
              stripe_subscription_id: stripeSubId,
              plan_id: planId,
              status,
              monthly_message_limit: monthlyMessageLimit,
              messages_used_this_period: 0,
              current_period_start: currentPeriodStart,
              current_period_end: currentPeriodEnd,
              grace_period_end: gracePeriodEnd,
            },
            { onConflict: "user_id" },
          )
          .select("id")
          .single();

        return {
          processed: true,
          action: "created",
          subscriptionId: created?.id,
        };
      }

      return { processed: true, action: "unmatched_user" };
    }

    case "customer.subscription.deleted": {
      const stripeSubId = obj.id as string;
      await supabase
        .from("workspace_subscriptions")
        .update({
          status: "canceled",
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_subscription_id", stripeSubId);

      return { processed: true, action: "canceled" };
    }

    case "invoice.payment_failed": {
      const stripeSubId = (obj.subscription || obj.lines?.data?.[0]?.subscription) as string | undefined;
      if (stripeSubId) {
        await supabase
          .from("workspace_subscriptions")
          .update({
            status: "past_due",
            grace_period_end: new Date(Date.now() + 7 * 86400000).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_subscription_id", stripeSubId);
      }
      return { processed: true, action: "marked_past_due" };
    }

    case "invoice.payment_succeeded": {
      const stripeSubId = (obj.subscription || obj.lines?.data?.[0]?.subscription) as string | undefined;
      if (stripeSubId) {
        await supabase
          .from("workspace_subscriptions")
          .update({
            status: "active",
            grace_period_end: null,
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_subscription_id", stripeSubId);
      }
      return { processed: true, action: "cleared_past_due" };
    }

    default:
      return { processed: false, action: "ignored" };
  }
}

/**
 * Production-grade processor for incoming Stripe webhook events.
 * Guarantees:
 * - Idempotency via webhook_events unique provider_event_id.
 * - Multi-tenant isolation: validates metadata workspace_id matches checkout.
 * - Accurate ledger recording: creates immutable payment_ledger record.
 * - Unified inbox reconciliation: appends payment confirmation message to thread.
 */
export async function processStripeWebhookEvent(
  supabase: SupabaseClient,
  event: {
    id: string;
    type: string;
    created?: number;
    data: {
      object: Record<string, any>;
    };
  },
  payloadHash?: string
): Promise<{
  processed: boolean;
  action: string;
  idempotent?: boolean;
  checkoutId?: string;
  ledgerId?: string;
  subscriptionId?: string;
  error?: string;
}> {
  const eventId = event.id;

  // 1. Idempotency Check: Verify if event has already been processed
  if (eventId) {
    const { data: existingEvent } = await supabase
      .from("webhook_events")
      .select("id, processing_status, workspace_id")
      .eq("provider", "stripe")
      .eq("provider_event_id", eventId)
      .maybeSingle();

    if (existingEvent && existingEvent.processing_status === "processed") {
      return {
        processed: true,
        action: "already_processed",
        idempotent: true,
      };
    }

    // Insert or update webhook_events entry
    await supabase
      .from("webhook_events")
      .upsert(
        {
          provider: "stripe",
          provider_event_id: eventId,
          event_type: event.type,
          processing_status: "received",
          payload_hash: payloadHash || null,
          received_at: new Date().toISOString(),
        },
        { onConflict: "provider,provider_event_id" }
      );
  }

  const obj = event.data.object;

  switch (event.type) {
    case "checkout.session.completed": {
      const metadata = obj.metadata || {};
      const wsId = metadata.workspace_id;
      const contactId = metadata.contact_id;
      const threadId = metadata.thread_id;
      const internalCheckoutId = metadata.internal_checkout_id;

      // Locate internal checkout record
      let checkoutQuery = supabase.from("payment_checkouts").select("*");
      if (internalCheckoutId) {
        checkoutQuery = checkoutQuery.eq("id", internalCheckoutId);
      } else {
        checkoutQuery = checkoutQuery.eq("stripe_checkout_session_id", obj.id);
      }

      const { data: checkout, error: checkoutErr } = await checkoutQuery.maybeSingle();

      if (!checkout) {
        if (eventId) {
          await supabase
            .from("webhook_events")
            .update({
              processing_status: "ignored",
              error_code: "CHECKOUT_NOT_FOUND",
              error_message_sanitized: "No corresponding internal payment_checkouts record was found.",
            })
            .eq("provider", "stripe")
            .eq("provider_event_id", eventId);
        }
        return { processed: true, action: "unmatched_checkout" };
      }

      // Tenant isolation: verify workspace metadata
      if (wsId && wsId !== "sandbox" && checkout.workspace_id && checkout.workspace_id !== wsId) {
        if (eventId) {
          await supabase
            .from("webhook_events")
            .update({
              processing_status: "failed",
              error_code: "TENANT_MISMATCH",
              error_message_sanitized: "Event workspace_id metadata does not match checkout workspace_id.",
            })
            .eq("provider", "stripe")
            .eq("provider_event_id", eventId);
        }
        return {
          processed: false,
          action: "quarantined",
          error: "Tenant metadata mismatch: event belongs to different workspace.",
        };
      }

      const resolvedWsId = checkout.workspace_id;
      const amountTotal =
        Number(obj.amount_total ?? obj.amount_subtotal ?? checkout.amount * 100) / 100;
      const currency = (obj.currency || checkout.currency || "USD").toUpperCase();

      // Update payment_checkouts record to paid
      await supabase
        .from("payment_checkouts")
        .update({
          status: "paid",
          stripe_payment_intent_id: obj.payment_intent || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", checkout.id);

      // Create ledger entry
      const { data: ledgerEntry } = await supabase
        .from("payment_ledger")
        .insert({
          workspace_id: resolvedWsId,
          checkout_id: checkout.id,
          provider: "stripe",
          provider_event_id: eventId || `evt_local_${Date.now()}`,
          event_type: "checkout.session.completed",
          amount: amountTotal,
          currency,
          status: "succeeded",
          provider_mode: checkout.provider_mode || (obj.livemode ? "live" : "test"),
          occurred_at: new Date((obj.created || Date.now() / 1000) * 1000).toISOString(),
          metadata: {
            sessionId: obj.id,
            paymentIntentId: obj.payment_intent,
            customerEmail: obj.customer_details?.email,
          },
        })
        .select("id")
        .single();

      // Append confirmation to thread if attached
      const resolvedThreadId = threadId || checkout.thread_id;
      if (resolvedThreadId) {
        const formattedAmount = amountTotal.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
        const confirmationMessage = `Payment of $${formattedAmount} ${currency} verified via Stripe Checkout. Payment ledger record ${ledgerEntry?.id || ""} created.`;

        await supabase.from("inbox_messages").insert({
          workspace_id: resolvedWsId,
          thread_id: resolvedThreadId,
          direction: "outbound",
          provider: "stripe",
          external_message_id: eventId || null,
          content: confirmationMessage,
          delivery_status: "delivered",
          message_type: "system",
          metadata: {
            stripeCheckoutUrl: checkout.checkout_url,
            amount: amountTotal,
            currency,
            stripePaymentStatus: "paid",
            ledgerVerified: true,
            providerEventId: eventId,
          },
        });

        await supabase
          .from("inbox_threads")
          .update({
            last_message_at: new Date().toISOString(),
            metadata: {
              lastMessageSnippet: confirmationMessage,
              dealStage: "won",
            },
          })
          .eq("id", resolvedThreadId)
          .eq("workspace_id", resolvedWsId);

        // Update contact deal_stage to won
        const resolvedContactId = contactId || checkout.contact_id;
        if (resolvedContactId) {
          await supabase
            .from("contacts")
            .update({
              deal_stage: "won",
              updated_at: new Date().toISOString(),
            })
            .eq("id", resolvedContactId)
            .eq("workspace_id", resolvedWsId);
        }
      }

      // Mark webhook event as processed
      if (eventId) {
        await supabase
          .from("webhook_events")
          .update({
            workspace_id: resolvedWsId,
            processing_status: "processed",
            processed_at: new Date().toISOString(),
          })
          .eq("provider", "stripe")
          .eq("provider_event_id", eventId);
      }

      return {
        processed: true,
        action: "checkout_completed",
        checkoutId: checkout.id,
        ledgerId: ledgerEntry?.id,
      };
    }

    case "checkout.session.expired": {
      const session = obj;
      await supabase
        .from("payment_checkouts")
        .update({
          status: "expired",
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_checkout_session_id", session.id);

      if (eventId) {
        await supabase
          .from("webhook_events")
          .update({
            processing_status: "processed",
            processed_at: new Date().toISOString(),
          })
          .eq("provider", "stripe")
          .eq("provider_event_id", eventId);
      }

      return { processed: true, action: "checkout_expired" };
    }

    case "payment_intent.succeeded": {
      const metadata = obj.metadata || {};
      const wsId = metadata.workspace_id;
      let ledgerId: string | undefined;

      if (wsId && wsId !== "sandbox") {
        const { data: ledger } = await supabase
          .from("payment_ledger")
          .insert({
            workspace_id: wsId,
            provider: "stripe",
            provider_event_id: eventId,
            event_type: "payment_intent.succeeded",
            amount: Number(obj.amount || 0) / 100,
            currency: (obj.currency || "USD").toUpperCase(),
            status: "succeeded",
            occurred_at: new Date((obj.created || Date.now() / 1000) * 1000).toISOString(),
            metadata: { paymentIntentId: obj.id },
          })
          .select("id")
          .single();

        ledgerId = ledger?.id;
      }

      if (eventId) {
        await supabase
          .from("webhook_events")
          .update({
            workspace_id: wsId && wsId !== "sandbox" ? wsId : null,
            processing_status: "processed",
            processed_at: new Date().toISOString(),
          })
          .eq("provider", "stripe")
          .eq("provider_event_id", eventId);
      }

      return { processed: true, action: "payment_intent_succeeded", ledgerId };
    }

    case "payment_intent.payment_failed": {
      const metadata = obj.metadata || {};
      const wsId = metadata.workspace_id;

      if (wsId && wsId !== "sandbox") {
        await supabase.from("payment_ledger").insert({
          workspace_id: wsId,
          provider: "stripe",
          provider_event_id: eventId,
          event_type: "payment_intent.payment_failed",
          amount: Number(obj.amount || 0) / 100,
          currency: (obj.currency || "USD").toUpperCase(),
          status: "failed",
          occurred_at: new Date((obj.created || Date.now() / 1000) * 1000).toISOString(),
          metadata: { paymentIntentId: obj.id, error: obj.last_payment_error?.message },
        });
      }

      if (eventId) {
        await supabase
          .from("webhook_events")
          .update({
            workspace_id: wsId && wsId !== "sandbox" ? wsId : null,
            processing_status: "processed",
            processed_at: new Date().toISOString(),
          })
          .eq("provider", "stripe")
          .eq("provider_event_id", eventId);
      }

      return { processed: true, action: "payment_intent_failed" };
    }

    case "charge.refunded": {
      const metadata = obj.metadata || {};
      const wsId = metadata.workspace_id;

      if (wsId && wsId !== "sandbox") {
        await supabase.from("payment_ledger").insert({
          workspace_id: wsId,
          provider: "stripe",
          provider_event_id: eventId,
          event_type: "charge.refunded",
          amount: Number(obj.amount_refunded || 0) / 100,
          currency: (obj.currency || "USD").toUpperCase(),
          status: "refunded",
          occurred_at: new Date((obj.created || Date.now() / 1000) * 1000).toISOString(),
          metadata: { chargeId: obj.id },
        });
      }

      if (eventId) {
        await supabase
          .from("webhook_events")
          .update({
            workspace_id: wsId && wsId !== "sandbox" ? wsId : null,
            processing_status: "processed",
            processed_at: new Date().toISOString(),
          })
          .eq("provider", "stripe")
          .eq("provider_event_id", eventId);
      }

      return { processed: true, action: "charge_refunded" };
    }

    // Default to subscription lifecycle handler for customer.subscription.* and invoice.*
    default: {
      const subResult = await processStripeSubscriptionEvent(supabase, event);

      if (eventId) {
        await supabase
          .from("webhook_events")
          .update({
            processing_status: subResult.processed ? "processed" : "ignored",
            processed_at: new Date().toISOString(),
          })
          .eq("provider", "stripe")
          .eq("provider_event_id", eventId);
      }

      return subResult;
    }
  }
}
