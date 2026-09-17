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
  // Tenant verification: ensure workspace exists and caller has authority
  const { data: ws, error: wsErr } = await supabase
    .from("workspaces")
    .select("id")
    .eq("id", workspaceId)
    .maybeSingle();

  if (wsErr || !ws) {
    throw new Error(`Unauthorized or invalid workspace ID for portal session: ${workspaceId}`);
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.NODE_ENV === "production"
      ? "https://j10-nexus.vercel.app"
      : "http://localhost:3000");
  const defaultReturn = `${appUrl}/dashboard/settings/billing?portal_return=true`;
  let resolvedReturnUrl = returnUrl || defaultReturn;
  if (!resolvedReturnUrl.includes("portal_return=true")) {
    resolvedReturnUrl += (resolvedReturnUrl.includes("?") ? "&" : "?") + "portal_return=true";
  }

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
      if (!res.ok || !data.url) {
        throw new Error(
          `Stripe Billing Portal session creation failed: ${data?.error?.message || res.statusText || "Unknown error"}`
        );
      }

      return {
        url: data.url,
        customerId,
        mode: "live",
      };
    } catch (err) {
      if (err instanceof Error) throw err;
      throw new Error(`Stripe portal session creation failed: ${String(err)}`);
    }
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("Stripe billing portal is not configured in production environment.");
  }

  // Offline Testing Sandbox only
  const portalSessionId = `bps_test_offline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const url = `https://billing.stripe.com/p/session/${portalSessionId}`;

  return {
    url,
    customerId,
    mode: "simulated",
  };
}
