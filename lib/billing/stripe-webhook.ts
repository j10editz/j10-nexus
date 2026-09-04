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
