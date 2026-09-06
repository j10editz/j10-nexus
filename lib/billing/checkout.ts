import type { SupabaseClient } from "@supabase/supabase-js";
import { getPlanById, type PlanId } from "./plans";

export interface CreateSubscriptionCheckoutOptions {
  workspaceId: string;
  planId: PlanId;
  interval?: "month" | "year";
  customerEmail?: string;
  actorUserId?: string;
  successUrl?: string;
  cancelUrl?: string;
}

export interface SubscriptionCheckoutResult {
  checkoutUrl: string;
  sessionId: string;
  planId: PlanId;
  amount: number;
  interval: string;
  mode: "live" | "simulated";
  providerMode: "live" | "sandbox";
  internalCheckoutId: string;
}

/**
 * Creates or retrieves a Stripe Customer for a given workspace.
 */
export async function getOrCreateStripeCustomer(
  supabase: SupabaseClient,
  {
    workspaceId,
    email,
    workspaceName,
  }: {
    workspaceId: string;
    email?: string;
    workspaceName?: string;
  }
): Promise<{ customerId: string; isNew: boolean }> {
  // Check if workspace already has a stripe_customer_id in workspace_subscriptions
  const { data: sub } = await supabase
    .from("workspace_subscriptions")
    .select("stripe_customer_id")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (sub?.stripe_customer_id) {
    return { customerId: sub.stripe_customer_id, isNew: false };
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (secretKey && secretKey.startsWith("sk_")) {
    try {
      const params = new URLSearchParams({
        "metadata[workspace_id]": workspaceId,
      });
      if (email) params.append("email", email);
      if (workspaceName) params.append("name", workspaceName);

      const res = await fetch("https://api.stripe.com/v1/customers", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });

      const customer = await res.json();
      if (res.ok && customer?.id) {
        // Save customer ID in workspace_subscriptions
        await supabase
          .from("workspace_subscriptions")
          .update({
            stripe_customer_id: customer.id,
            updated_at: new Date().toISOString(),
          })
          .eq("workspace_id", workspaceId);

        return { customerId: customer.id, isNew: true };
      }
    } catch (err) {
      console.warn("Stripe customer creation failed, falling back to simulated customer ID:", err);
    }
  }

  // Simulated fallback
  const simulatedId = `cus_sim_${workspaceId.replace(/-/g, "").slice(0, 14)}`;
  await supabase
    .from("workspace_subscriptions")
    .update({
      stripe_customer_id: simulatedId,
      updated_at: new Date().toISOString(),
    })
    .eq("workspace_id", workspaceId);

  return { customerId: simulatedId, isNew: true };
}

/**
 * Creates a Stripe Subscription Checkout Session for a workspace.
 */
export async function createWorkspaceSubscriptionCheckout(
  supabase: SupabaseClient,
  options: CreateSubscriptionCheckoutOptions
): Promise<SubscriptionCheckoutResult> {
  const plan = getPlanById(options.planId);
  const interval = options.interval || "month";
  const amount = interval === "year" && plan.annualPrice ? plan.annualPrice * 12 : plan.price;
  const secretKey = process.env.STRIPE_SECRET_KEY;

  const defaultSuccess = "https://j10-nexus.vercel.app/dashboard/settings/billing?status=success&session_id={CHECKOUT_SESSION_ID}";
  const defaultCancel = "https://j10-nexus.vercel.app/dashboard/settings/billing?status=cancelled";
  const successUrl = options.successUrl || defaultSuccess;
  const cancelUrl = options.cancelUrl || defaultCancel;

  // 1. Resolve or create internal checkout record first for authoritative binding
  const { data: checkoutRecord, error: coErr } = await supabase
    .from("payment_checkouts")
    .insert({
      workspace_id: options.workspaceId,
      amount,
      currency: "USD",
      status: "open",
      provider_mode: secretKey && secretKey.startsWith("sk_") ? "live" : "sandbox",
      metadata: {
        checkout_type: "subscription_checkout",
        plan_id: plan.id,
        interval,
        actor_user_id: options.actorUserId || null,
      },
    })
    .select("id")
    .single();

  if (coErr || !checkoutRecord) {
    throw new Error(`Failed to create internal payment checkout record: ${coErr?.message}`);
  }

  const internalCheckoutId = checkoutRecord.id;

  // 2. Resolve Stripe Customer
  const { customerId } = await getOrCreateStripeCustomer(supabase, {
    workspaceId: options.workspaceId,
    email: options.customerEmail,
  });

  // 3. Live Stripe Checkout Session Creation
  if (secretKey && secretKey.startsWith("sk_")) {
    try {
      const params = new URLSearchParams({
        "payment_method_types[0]": "card",
        "mode": "subscription",
        "customer": customerId,
        "client_reference_id": options.workspaceId,
        "success_url": successUrl,
        "cancel_url": cancelUrl,
        "line_items[0][price_data][currency]": "usd",
        "line_items[0][price_data][product_data][name]": `J10 NEXUS ${plan.name} Tier`,
        "line_items[0][price_data][product_data][description]": plan.description.slice(0, 500),
        "line_items[0][price_data][unit_amount]": String(Math.round(amount * 100)),
        "line_items[0][price_data][recurring][interval]": interval,
        "line_items[0][quantity]": "1",
        "metadata[workspace_id]": options.workspaceId,
        "metadata[plan_id]": plan.id,
        "metadata[internal_checkout_id]": internalCheckoutId,
        "subscription_data[metadata][workspace_id]": options.workspaceId,
        "subscription_data[metadata][plan_id]": plan.id,
        "subscription_data[metadata][internal_checkout_id]": internalCheckoutId,
      });

      const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });

      const data = await res.json();
      if (res.ok && data.url) {
        // Update checkout record with Stripe session details
        await supabase
          .from("payment_checkouts")
          .update({
            checkout_url: data.url,
            stripe_checkout_session_id: data.id,
            stripe_customer_id: customerId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", internalCheckoutId);

        return {
          checkoutUrl: data.url,
          sessionId: data.id,
          planId: plan.id,
          amount,
          interval,
          mode: "live",
          providerMode: "live",
          internalCheckoutId,
        };
      }
    } catch (err) {
      console.warn("Stripe Checkout API call failed, falling back to simulated sandbox session:", err);
    }
  }

  // 4. Deterministic Simulated Sandbox Checkout Session
  const sessionId = `cs_sub_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const checkoutUrl = `https://checkout.stripe.com/c/pay/${sessionId}#j10_sub_${plan.id}`;

  await supabase
    .from("payment_checkouts")
    .update({
      checkout_url: checkoutUrl,
      stripe_checkout_session_id: sessionId,
      stripe_customer_id: customerId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", internalCheckoutId);

  return {
    checkoutUrl,
    sessionId,
    planId: plan.id,
    amount,
    interval,
    mode: "simulated",
    providerMode: "sandbox",
    internalCheckoutId,
  };
}
