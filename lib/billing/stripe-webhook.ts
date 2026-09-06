import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SubscriptionStatus } from "./entitlements";

const SIGNATURE_TOLERANCE_SECONDS = 300; // 5 minutes

export interface StripeWebhookVerificationResult {
  valid: boolean;
  error?: string;
}

export const STRIPE_PRICE_ALLOWLIST: Record<
  string,
  { planId: "starter" | "growth" | "enterprise"; monthlyMessageLimit: number }
> = {
  price_starter_monthly: { planId: "starter", monthlyMessageLimit: 1_000 },
  price_growth_monthly: { planId: "growth", monthlyMessageLimit: 10_000 },
  price_enterprise_monthly: { planId: "enterprise", monthlyMessageLimit: 100_000 },
  tier_enterprise_annual: { planId: "enterprise", monthlyMessageLimit: 100_000 },
  starter: { planId: "starter", monthlyMessageLimit: 1_000 },
  growth: { planId: "growth", monthlyMessageLimit: 10_000 },
  enterprise: { planId: "enterprise", monthlyMessageLimit: 100_000 },
};

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

export function resolvePlanLimits(planKey: string): {
  planId: "starter" | "growth" | "enterprise";
  monthlyMessageLimit: number;
} {
  const normalized = planKey.trim().toLowerCase();
  if (STRIPE_PRICE_ALLOWLIST[normalized]) {
    return STRIPE_PRICE_ALLOWLIST[normalized];
  }
  if (normalized.includes("enterprise")) {
    return { planId: "enterprise", monthlyMessageLimit: 100_000 };
  }
  if (normalized.includes("growth")) {
    return { planId: "growth", monthlyMessageLimit: 10_000 };
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
): Promise<{ processed: boolean; action: string; subscriptionId?: string; error?: string }> {
  const obj = event.data.object;

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const stripeSubId = obj.id as string;
      const stripeCustomerId = obj.customer as string;
      const statusRaw = obj.status as string;
      const currentPeriodEndSec = obj.current_period_end as number | undefined;
      const currentPeriodStartSec = obj.current_period_start as number | undefined;

      const allowedStatuses: Record<string, SubscriptionStatus> = {
        active: "active",
        trialing: "trialing",
        past_due: "past_due",
        canceled: "canceled",
        unpaid: "unpaid",
      };
      const status: SubscriptionStatus | undefined = allowedStatuses[statusRaw];
      if (!status) {
        return { processed: false, action: "unknown_subscription_status" };
      }

      // Do not fabricate billing-period timestamps: require valid period boundaries
      if (!currentPeriodEndSec || !currentPeriodStartSec) {
        return {
          processed: false,
          action: "quarantined_missing_period_timestamps",
          error: "Subscription event missing period start/end timestamps",
        };
      }

      const currentPeriodEnd = new Date(currentPeriodEndSec * 1000).toISOString();
      const currentPeriodStart = new Date(currentPeriodStartSec * 1000).toISOString();

      // Resolve plan via price allowlist; unknown prices must be quarantined, NOT defaulted to starter
      const rawPrice =
        obj.items?.data?.[0]?.price?.lookup_key ||
        obj.items?.data?.[0]?.price?.id ||
        obj.plan?.id;

      if (!rawPrice) {
        return {
          processed: false,
          action: "quarantined_missing_price",
          error: "Subscription event missing price identifier",
        };
      }

      const normalizedPrice = String(rawPrice).trim().toLowerCase();
      const resolvedPlan = STRIPE_PRICE_ALLOWLIST[normalizedPrice];
      if (!resolvedPlan) {
        return {
          processed: false,
          action: "quarantined_unknown_price",
          error: `Price ${rawPrice} is not in the authoritative Stripe price allowlist`,
        };
      }

      const { planId, monthlyMessageLimit } = resolvedPlan;

      // 7-day grace period for past_due
      const gracePeriodEnd =
        status === "past_due"
          ? new Date(Date.now() + 7 * 86400000).toISOString()
          : null;

      // Check if this subscription already exists by stripe_subscription_id
      const { data: existing, error: existingErr } = await supabase
        .from("workspace_subscriptions")
        .select("id, workspace_id, messages_used_this_period, current_period_end")
        .eq("stripe_subscription_id", stripeSubId)
        .maybeSingle();

      if (existingErr) {
        return { processed: false, action: "database_read_failed", error: existingErr.message };
      }

      if (existing) {
        // If billing period rolled over, reset usage
        const periodRolledOver =
          new Date(currentPeriodEnd).getTime() >
          new Date(existing.current_period_end).getTime();

        const { error: updateErr } = await supabase
          .from("workspace_subscriptions")
          .update({
            status,
            plan_id: planId,
            provenance: "stripe",
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

        if (updateErr) {
          return { processed: false, action: "database_update_failed", error: updateErr.message };
        }

        return { processed: true, action: "updated", subscriptionId: existing.id };
      }

      // Authoritative workspace resolution:
      // Never trust arbitrary metadata workspace_id and never accept merely truthy internal_checkout_id!
      let authoritativeWorkspaceId: string | null = null;

      // 1. Check existing customer mapping
      if (stripeCustomerId) {
        const { data: existingCustomerSub } = await supabase
          .from("workspace_subscriptions")
          .select("workspace_id")
          .eq("stripe_customer_id", stripeCustomerId)
          .limit(1)
          .maybeSingle();

        if (existingCustomerSub?.workspace_id) {
          authoritativeWorkspaceId = existingCustomerSub.workspace_id;
        }
      }

      // 2. Check authoritative checkout record if customer mapping did not resolve
      const internalCheckoutId = obj.metadata?.internal_checkout_id;
      if (!authoritativeWorkspaceId && internalCheckoutId) {
        const { data: checkoutRecord, error: coErr } = await supabase
          .from("payment_checkouts")
          .select("id, workspace_id, stripe_customer_id")
          .eq("id", internalCheckoutId)
          .maybeSingle();

        if (!coErr && checkoutRecord) {
          // Verify customer relationship if provided
          if (
            !checkoutRecord.stripe_customer_id ||
            checkoutRecord.stripe_customer_id === stripeCustomerId
          ) {
            authoritativeWorkspaceId = checkoutRecord.workspace_id;
          }
        }
      }

      if (!authoritativeWorkspaceId) {
        // Unknown or unmatched subscription events are quarantined, not marked processed
        return {
          processed: false,
          action: "quarantined_unmatched_workspace",
          error: "Could not authoritatively resolve workspace for subscription",
        };
      }

      // Verify workspace exists
      const { data: wsRecord, error: wsErr } = await supabase
        .from("workspaces")
        .select("id")
        .eq("id", authoritativeWorkspaceId)
        .maybeSingle();

      if (wsErr || !wsRecord) {
        return {
          processed: false,
          action: "quarantined_workspace_not_found",
          error: "Authoritative workspace does not exist",
        };
      }

      const { data: created, error: createErr } = await supabase
        .from("workspace_subscriptions")
        .upsert(
          {
            workspace_id: wsRecord.id,
            stripe_customer_id: stripeCustomerId,
            stripe_subscription_id: stripeSubId,
            plan_id: planId,
            status,
            provenance: "stripe",
            monthly_message_limit: monthlyMessageLimit,
            messages_used_this_period: 0,
            current_period_start: currentPeriodStart,
            current_period_end: currentPeriodEnd,
            grace_period_end: gracePeriodEnd,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "workspace_id" },
        )
        .select("id")
        .single();

      if (createErr) {
        return { processed: false, action: "database_insert_failed", error: createErr.message };
      }

      return {
        processed: true,
        action: "created",
        subscriptionId: created?.id,
      };
    }

    case "customer.subscription.deleted": {
      const stripeSubId = obj.id as string;
      const { error: delErr } = await supabase
        .from("workspace_subscriptions")
        .update({
          status: "canceled",
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_subscription_id", stripeSubId);

      if (delErr) {
        return { processed: false, action: "database_delete_failed", error: delErr.message };
      }

      return { processed: true, action: "canceled" };
    }

    case "invoice.payment_failed": {
      const stripeSubId = (obj.subscription || obj.lines?.data?.[0]?.subscription) as string | undefined;
      if (stripeSubId) {
        const { error: failErr } = await supabase
          .from("workspace_subscriptions")
          .update({
            status: "past_due",
            grace_period_end: new Date(Date.now() + 7 * 86400000).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_subscription_id", stripeSubId);

        if (failErr) {
          return { processed: false, action: "database_fail_update_failed", error: failErr.message };
        }
      }
      return { processed: true, action: "marked_past_due" };
    }

    case "invoice.payment_succeeded": {
      const stripeSubId = (obj.subscription || obj.lines?.data?.[0]?.subscription) as string | undefined;
      if (stripeSubId) {
        const { error: succErr } = await supabase
          .from("workspace_subscriptions")
          .update({
            status: "active",
            grace_period_end: null,
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_subscription_id", stripeSubId);

        if (succErr) {
          return { processed: false, action: "database_success_update_failed", error: succErr.message };
        }
      }
      return { processed: true, action: "cleared_past_due" };
    }

    default:
      return { processed: false, action: "ignored" };
  }
}

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
    const { error: upsertErr } = await supabase
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

    if (upsertErr) {
      return {
        processed: false,
        action: "idempotency_record_failed",
        error: upsertErr.message,
      };
    }
  }

  const obj = event.data.object;

  switch (event.type) {
    case "checkout.session.completed": {
      const metadata = obj.metadata || {};
      const internalCheckoutId = metadata.internal_checkout_id;

      // Authoritative checkout record resolution
      let checkoutQuery = supabase.from("payment_checkouts").select("*");
      if (internalCheckoutId) {
        checkoutQuery = checkoutQuery.eq("id", internalCheckoutId);
      } else {
        checkoutQuery = checkoutQuery.eq("stripe_checkout_session_id", obj.id);
      }

      const { data: checkout, error: checkoutErr } = await checkoutQuery.maybeSingle();

      if (checkoutErr || !checkout) {
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
        return { processed: false, action: "unmatched_checkout", error: "Checkout not found" };
      }

      // Tenant isolation: verify workspace metadata
      const wsId = metadata.workspace_id;
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
      const { error: coUpdateErr } = await supabase
        .from("payment_checkouts")
        .update({
          status: "paid",
          stripe_payment_intent_id: obj.payment_intent || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", checkout.id);

      if (coUpdateErr) {
        return { processed: false, action: "checkout_update_failed", error: coUpdateErr.message };
      }

      // Create ledger entry
      const { data: ledgerEntry, error: ledgerErr } = await supabase
        .from("payment_ledger")
        .insert({
          workspace_id: resolvedWsId,
          checkout_id: checkout.id,
          provider: "stripe",
          provider_event_id: eventId,
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

      if (ledgerErr) {
        return { processed: false, action: "ledger_insert_failed", error: ledgerErr.message };
      }

      // Append confirmation to thread if attached
      const threadId = metadata.thread_id;
      const contactId = metadata.contact_id;
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

    default: {
      const subResult = await processStripeSubscriptionEvent(supabase, event);

      if (eventId) {
        await supabase
          .from("webhook_events")
          .update({
            processing_status: subResult.processed ? "processed" : "ignored",
            error_code: subResult.processed ? null : subResult.action,
            error_message_sanitized: subResult.error ?? null,
            processed_at: new Date().toISOString(),
          })
          .eq("provider", "stripe")
          .eq("provider_event_id", eventId);
      }

      return subResult;
    }
  }
}
