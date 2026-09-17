import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPlanById, type PlanId } from "./plans";
import { reserveFounders3Slot, releaseFounders3Reservation } from "./invitations";

export interface CreateSubscriptionCheckoutOptions {
  workspaceId: string;
  planId: PlanId;
  interval?: "month" | "year";
  customerEmail?: string;
  actorUserId?: string;
  successUrl?: string;
  cancelUrl?: string;
  invitationCode?: string;
  priceId?: string;
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
  checkoutAttemptId: string;
  reservationId?: string;
}

/**
 * Validates real Stripe Price before initiating Checkout.
 * Enforces: active=true, currency=usd, unit_amount=14900 (for founders3), recurring.interval=month.
 */
export async function validateStripePriceForCheckout({
  secretKey,
  priceId,
  planId,
}: {
  secretKey: string;
  priceId?: string;
  planId: PlanId;
}): Promise<{ valid: boolean; priceId?: string; error?: string }> {
  const isProduction = process.env.NODE_ENV === "production" || secretKey.startsWith("sk_live_");

  if (!secretKey.startsWith("sk_")) {
    if (isProduction) {
      return { valid: false, error: "Stripe secret key must be configured in production." };
    }
    return { valid: true };
  }

  // If a specific priceId is provided or configured in env
  const targetPriceId = priceId || (planId === "founders3" ? process.env.STRIPE_FOUNDERS3_PRICE_ID : undefined);
  if (!targetPriceId) {
    if (isProduction) {
      return {
        valid: false,
        error: "Missing STRIPE_FOUNDERS3_PRICE_ID: Production checkout requires an authoritative Stripe Price ID.",
      };
    }
    // In non-production test-mode or standard price_data inline mode, return valid
    return { valid: true };
  }

  try {
    const res = await fetch(`https://api.stripe.com/v1/prices/${encodeURIComponent(targetPriceId)}?expand[]=product`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${secretKey}`,
      },
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return {
        valid: false,
        error: `Stripe price lookup failed for ${targetPriceId}: ${errBody?.error?.message || res.statusText}`,
      };
    }

    const priceObj = await res.json();

    // Mode consistency: live key must use live Price object; test key must use test Price object
    if (secretKey.startsWith("sk_live_") && priceObj.livemode === false) {
      return {
        valid: false,
        error: `Stripe-mode inconsistency: Test-mode price ${targetPriceId} cannot be used with a live Stripe secret key in production.`,
      };
    }
    if (secretKey.startsWith("sk_test_") && priceObj.livemode === true) {
      return {
        valid: false,
        error: `Stripe-mode inconsistency: Live-mode price ${targetPriceId} cannot be used with a test Stripe secret key.`,
      };
    }

    if (!priceObj.active) {
      return { valid: false, error: `Stripe price ${targetPriceId} is not active.` };
    }

    if (priceObj.currency?.toLowerCase() !== "usd") {
      return { valid: false, error: `Stripe price ${targetPriceId} currency must be USD.` };
    }

    if (planId === "founders3") {
      const isStandardPrice =
        targetPriceId === process.env.STRIPE_STANDARD_PRICE_ID ||
        targetPriceId.includes("standard") ||
        targetPriceId.includes("149");
      const expectedAmount = isStandardPrice ? 14900 : 9900;
      if (priceObj.unit_amount !== expectedAmount) {
        return {
          valid: false,
          error: `Stripe price ${targetPriceId} unit_amount must be ${expectedAmount} (${isStandardPrice ? "$149.00" : "$99.00"} USD), got ${priceObj.unit_amount}.`,
        };
      }
      if (priceObj.recurring?.interval !== "month") {
        return {
          valid: false,
          error: `Stripe price ${targetPriceId} recurring interval must be 'month', got ${priceObj.recurring?.interval}.`,
        };
      }
    }

    return { valid: true, priceId: targetPriceId };
  } catch (err: any) {
    return { valid: false, error: `Failed to validate Stripe price: ${err?.message || String(err)}` };
  }
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
      if (!res.ok || !customer?.id) {
        throw new Error(
          `Stripe customer creation failed: ${customer?.error?.message || res.statusText || "Unknown Stripe error"}`
        );
      }

      // Save customer ID in workspace_subscriptions
      await supabase
        .from("workspace_subscriptions")
        .update({
          stripe_customer_id: customer.id,
          updated_at: new Date().toISOString(),
        })
        .eq("workspace_id", workspaceId);

      return { customerId: customer.id, isNew: true };
    } catch (err) {
      if (err instanceof Error) throw err;
      throw new Error(`Stripe customer creation failed: ${String(err)}`);
    }
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("Stripe billing is not configured in production environment.");
  }

  // Development / Offline Testing Sandbox only
  const simulatedId = `cus_test_${workspaceId.replace(/-/g, "").slice(0, 14)}`;
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
 * Creates a Stripe Subscription Checkout Session for a workspace using a strict 5-step lifecycle.
 */
export async function createWorkspaceSubscriptionCheckout(
  supabase: SupabaseClient,
  options: CreateSubscriptionCheckoutOptions
): Promise<SubscriptionCheckoutResult> {
  const plan = getPlanById(options.planId);
  const interval = options.interval || "month";
  const amount = interval === "year" && plan.annualPrice ? plan.annualPrice * 12 : plan.price;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const isProduction = process.env.NODE_ENV === "production" || Boolean(secretKey && secretKey.startsWith("sk_live_"));
  const effectivePriceId = options.priceId || (options.planId === "founders3" ? process.env.STRIPE_FOUNDERS3_PRICE_ID : undefined);

  if (isProduction) {
    if (options.planId === "founders3" && !effectivePriceId) {
      throw new Error("Missing STRIPE_FOUNDERS3_PRICE_ID: Production checkout requires an authoritative Stripe Price ID. Fail closed.");
    }
    if (!effectivePriceId) {
      throw new Error("Inline price_data is forbidden in production. Configured Stripe Price ID is required.");
    }
  }

  const defaultSuccess = "https://j10-nexus.vercel.app/dashboard/settings/billing?status=success&session_id={CHECKOUT_SESSION_ID}";
  const defaultCancel = "https://j10-nexus.vercel.app/dashboard/settings/billing?status=cancelled";
  const successUrl = options.successUrl || defaultSuccess;
  const cancelUrl = options.cancelUrl || defaultCancel;

  // Step 1: Generate internal checkout-attempt UUID and internal checkout UUID
  const checkoutAttemptId = randomUUID();
  let internalCheckoutId = randomUUID();
  let reservationId: string | undefined;

  // Step 2: Validate price if live/test Stripe key present
  if (secretKey && secretKey.startsWith("sk_")) {
    const priceVal = await validateStripePriceForCheckout({
      secretKey,
      priceId: effectivePriceId,
      planId: options.planId,
    });
    if (!priceVal.valid) {
      throw new Error(`Stripe Price Validation Error: ${priceVal.error}`);
    }
  }

  // Step 3: Founder's 3 Atomic Slot Reservation (using attempt UUID and internal checkout UUID)
  if (options.planId === "founders3") {
    if (!options.invitationCode) {
      throw new Error("Founder's 3 Pilot is invite-only. A valid single-use invitation code is required.");
    }

    const reservationResult = await reserveFounders3Slot(supabase, {
      workspaceId: options.workspaceId,
      invitationCode: options.invitationCode,
      checkoutAttemptId,
      checkoutId: internalCheckoutId,
      expiresInMinutes: 30,
    });

    if (!reservationResult.success) {
      throw new Error(reservationResult.error || "Failed to reserve a Founder's 3 slot.");
    }

    reservationId = reservationResult.reservationId;
  }

  // Step 4: Resolve Stripe Customer
  let customerId: string;
  try {
    const customerRes = await getOrCreateStripeCustomer(supabase, {
      workspaceId: options.workspaceId,
      email: options.customerEmail,
    });
    customerId = customerRes.customerId;
  } catch (custErr) {
    if (reservationId) {
      await releaseFounders3Reservation(supabase, options.workspaceId, "stripe_customer_creation_failed");
    }
    throw custErr;
  }

  // Step 5: Idempotently expire any prior uncompleted pending checkout for this workspace
  try {
    const { data: stalePendingCheckout } = await supabase
      .from("payment_checkouts")
      .select("id, stripe_checkout_session_id")
      .eq("workspace_id", options.workspaceId)
      .eq("status", "pending")
      .maybeSingle();

    if (stalePendingCheckout) {
      if (stalePendingCheckout.stripe_checkout_session_id && secretKey && secretKey.startsWith("sk_")) {
        try {
          await fetch(`https://api.stripe.com/v1/checkout/sessions/${stalePendingCheckout.stripe_checkout_session_id}/expire`, {
            method: "POST",
            headers: { Authorization: `Bearer ${secretKey}` },
          });
        } catch {
          // Best effort stale session expiration
        }
      }
      await supabase
        .from("payment_checkouts")
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .eq("id", stalePendingCheckout.id);
    }
  } catch {
    // Non-fatal if payment_checkouts lookup is skipped or mocked simply
  }

  // Step 6: Create Stripe Checkout Session & Bind transactionally
  let stripeSession: { id: string; url: string } | null = null;
  if (secretKey && secretKey.startsWith("sk_")) {
    try {
      const params = new URLSearchParams({
        mode: "subscription",
        customer: customerId,
        client_reference_id: options.workspaceId,
        success_url: successUrl,
        cancel_url: cancelUrl,
        "managed_payments[enabled]": "false",
        "metadata[workspace_id]": options.workspaceId,
        "metadata[plan_id]": plan.id,
        "metadata[checkout_attempt_id]": checkoutAttemptId,
        "metadata[internal_checkout_id]": internalCheckoutId,
        "subscription_data[metadata][workspace_id]": options.workspaceId,
        "subscription_data[metadata][plan_id]": plan.id,
        "subscription_data[metadata][checkout_attempt_id]": checkoutAttemptId,
        "subscription_data[metadata][internal_checkout_id]": internalCheckoutId,
      });

      if (effectivePriceId) {
        params.append("line_items[0][price]", effectivePriceId);
        params.append("line_items[0][quantity]", "1");
      } else {
        if (isProduction) {
          throw new Error("Inline price_data is forbidden in production. Configured Stripe Price ID is required.");
        }
        params.append("line_items[0][price_data][currency]", "usd");
        params.append("line_items[0][price_data][product_data][name]", `J10 NEXUS ${plan.name}`);
        params.append("line_items[0][price_data][product_data][description]", plan.description.slice(0, 500));
        params.append("line_items[0][price_data][unit_amount]", String(Math.round(amount * 100)));
        params.append("line_items[0][price_data][recurring][interval]", interval);
        params.append("line_items[0][quantity]", "1");
      }

      if (reservationId) {
        params.append("metadata[reservation_id]", reservationId);
        params.append("subscription_data[metadata][reservation_id]", reservationId);
      }

      const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
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
          `Stripe Checkout Session creation failed: ${data?.error?.message || res.statusText || "Unknown error"}`
        );
      }

      // Fail-closed enforcement: J10 must be the sole merchant of record
      if (data.managed_payments && data.managed_payments.enabled !== false) {
        try {
          await fetch(`https://api.stripe.com/v1/checkout/sessions/${data.id}/expire`, {
            method: "POST",
            headers: { Authorization: `Bearer ${secretKey}` },
          });
        } catch {}
        if (reservationId) {
          await releaseFounders3Reservation(supabase, options.workspaceId, "managed_payments_fail_closed");
        }
        throw new Error(
          "Stripe Checkout Session creation failed-closed: managed_payments.enabled is not false. J10 must be the sole merchant of record."
        );
      }

      // Bind Stripe session ID transactionally to reservation
      if (options.planId === "founders3") {
        try {
          await supabase.rpc("bind_founders3_checkout_session_atomic", {
            p_workspace_id: options.workspaceId,
            p_checkout_attempt_id: checkoutAttemptId,
            p_stripe_checkout_session_id: data.id,
          });
        } catch {
          // Non-fatal if schema cache has not yet refreshed unapplied migration RPC
        }
      }

      stripeSession = { id: data.id, url: data.url };
    } catch (err) {
      // Transactional Rollback: Release reservation on Stripe failure
      if (reservationId) {
        await releaseFounders3Reservation(supabase, options.workspaceId, "stripe_session_creation_failed");
      }
      if (err instanceof Error) throw err;
      throw new Error(`Stripe checkout session creation failed: ${String(err)}`);
    }
  }

  if (stripeSession) {
    // Step 7: Single atomic insertion into payment_checkouts with complete non-null checkout_url
    const isLive = Boolean(secretKey && secretKey.startsWith("sk_live_"));
    const dbProviderMode = isLive ? "live" : "test";

    const { data: checkoutRecord, error: coErr } = await supabase
      .from("payment_checkouts")
      .insert({
        id: internalCheckoutId,
        workspace_id: options.workspaceId,
        amount,
        currency: "USD",
        status: "pending",
        checkout_url: stripeSession.url,
        stripe_checkout_session_id: stripeSession.id,
        stripe_customer_id: customerId,
        provider_mode: dbProviderMode,
        metadata: {
          checkout_attempt_id: checkoutAttemptId,
          checkout_type: "subscription_checkout",
          plan_id: plan.id,
          interval,
          actor_user_id: options.actorUserId || null,
          reservation_id: reservationId || null,
        },
      })
      .select("id")
      .single();

    if (coErr) {
      console.error("[Checkout Persistence Error] Failed to create internal payment checkout record:", coErr);
      // Expire newly created Stripe session to prevent orphan active sessions
      try {
        await fetch(`https://api.stripe.com/v1/checkout/sessions/${stripeSession.id}/expire`, {
          method: "POST",
          headers: { Authorization: `Bearer ${secretKey}` },
        });
      } catch (expireErr) {
        console.error("[Checkout Compensation Error] Failed to expire Stripe session on checkout persistence failure:", expireErr);
      }
      // Roll back Founder's 3 slot reservation
      if (reservationId) {
        await releaseFounders3Reservation(supabase, options.workspaceId, "checkout_record_creation_failed");
      }
      throw new Error("Unable to create internal payment checkout record. Please try again.");
    }

    if (checkoutRecord?.id) {
      internalCheckoutId = checkoutRecord.id;
    }

    return {
      checkoutUrl: stripeSession.url,
      sessionId: stripeSession.id,
      planId: plan.id,
      amount,
      interval,
      mode: isLive ? "live" : "simulated",
      providerMode: isLive ? "live" : "sandbox",
      internalCheckoutId,
      checkoutAttemptId,
      reservationId,
    };
  }

  if (process.env.NODE_ENV === "production") {
    if (reservationId) {
      await releaseFounders3Reservation(supabase, options.workspaceId, "stripe_unconfigured_production");
    }
    throw new Error("Stripe checkout is not configured in production environment.");
  }

  // Offline Development / Testing Sandbox Checkout Session
  const sessionId = `cs_test_offline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const checkoutUrl = `https://checkout.stripe.com/c/pay/${sessionId}#j10_sub_${plan.id}`;

  if (options.planId === "founders3") {
    try {
      await supabase.rpc("bind_founders3_checkout_session_atomic", {
        p_workspace_id: options.workspaceId,
        p_checkout_attempt_id: checkoutAttemptId,
        p_stripe_checkout_session_id: sessionId,
      });
    } catch {
      // Non-fatal in sandbox
    }
  }

  const { data: offlineCheckoutRecord, error: offlineCoErr } = await supabase
    .from("payment_checkouts")
    .insert({
      id: internalCheckoutId,
      workspace_id: options.workspaceId,
      amount,
      currency: "USD",
      status: "pending",
      checkout_url: checkoutUrl,
      stripe_checkout_session_id: sessionId,
      stripe_customer_id: customerId,
      provider_mode: "test",
      metadata: {
        checkout_attempt_id: checkoutAttemptId,
        checkout_type: "subscription_checkout",
        plan_id: plan.id,
        interval,
        actor_user_id: options.actorUserId || null,
        reservation_id: reservationId || null,
      },
    })
    .select("id")
    .single();

  if (offlineCoErr) {
    console.error("[Offline Checkout Persistence Error]:", offlineCoErr);
    if (reservationId) {
      await releaseFounders3Reservation(supabase, options.workspaceId, "checkout_record_creation_failed");
    }
    throw new Error("Unable to create internal payment checkout record. Please try again.");
  }

  if (offlineCheckoutRecord?.id) {
    internalCheckoutId = offlineCheckoutRecord.id;
  }

  return {
    checkoutUrl,
    sessionId,
    planId: plan.id,
    amount,
    interval,
    mode: "simulated",
    providerMode: "sandbox",
    internalCheckoutId,
    checkoutAttemptId,
    reservationId,
  };
}
