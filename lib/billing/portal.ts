import type { SupabaseClient } from "@supabase/supabase-js";
import { getOrCreateStripeCustomer } from "./checkout";

export interface BillingPortalSessionResult {
  url: string;
  customerId: string;
  mode: "live" | "simulated";
}

/**
 * Creates a Stripe Customer Billing Portal session for self-serve subscription management,
 * payment method updates, and invoice history.
 */
export async function createBillingPortalSession(
  supabase: SupabaseClient,
  {
    workspaceId,
    returnUrl,
  }: {
    workspaceId: string;
    returnUrl?: string;
  }
): Promise<BillingPortalSessionResult> {
  const defaultReturn = "https://j10-nexus.vercel.app/dashboard/settings/billing";
  const resolvedReturnUrl = returnUrl || defaultReturn;

  // Retrieve customer ID from workspace_subscriptions
  const { data: sub } = await supabase
    .from("workspace_subscriptions")
    .select("stripe_customer_id")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  let customerId = sub?.stripe_customer_id;

  if (!customerId) {
    // Generate or fetch customer if not present
    const res = await getOrCreateStripeCustomer(supabase, { workspaceId });
    customerId = res.customerId;
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (secretKey && secretKey.startsWith("sk_")) {
    try {
      const params = new URLSearchParams({
        customer: customerId,
        return_url: resolvedReturnUrl,
      });

      const res = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });

      const data = await res.json();
      if (res.ok && data.url) {
        return {
          url: data.url,
          customerId,
          mode: "live",
        };
      }
    } catch (err) {
      console.warn("Stripe Billing Portal API call failed, falling back to simulated session:", err);
    }
  }

  // Simulated portal URL
  const portalSessionId = `bps_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const url = `https://billing.stripe.com/p/session/${portalSessionId}`;

  return {
    url,
    customerId,
    mode: "simulated",
  };
}
