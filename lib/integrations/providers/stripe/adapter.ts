import "server-only";

import type {
  IntegrationConnectorRuntimeAdapter,
  IntegrationRuntimeActionInvocation,
  IntegrationRuntimeHealthResult,
  IntegrationRuntimeInvocationContext,
  IntegrationRuntimeResult,
} from "@/types/integration-runtime";
import {
  INTEGRATION_RUNTIME_SCHEMA_VERSION,
  IntegrationRuntimeError,
} from "@/types/integration-runtime";

const REQUEST_TIMEOUT_MS = 15_000;
const STRIPE_API_BASE = "https://api.stripe.com/v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractString(input: Record<string, unknown>, key: string, label: string): string {
  const val = input[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new IntegrationRuntimeError(`${label} is required.`, {
      code: "INVALID_STRIPE_INPUT",
      category: "validation",
      status: 400,
    });
  }
  return val.trim();
}

async function readStripeSecretKey(
  context: IntegrationRuntimeInvocationContext,
): Promise<string> {
  const creds = await context.credentials.read(["secret_key"]);
  const secretKey = creds.secret_key || process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    throw new IntegrationRuntimeError("Stripe Secret Key is not configured in vault.", {
      code: "STRIPE_AUTH_MISSING",
      category: "authentication",
      status: 401,
    });
  }

  return secretKey;
}

async function executeStripeAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const { capabilityId, input, mode } = invocation;
  const inputObj = isRecord(input) ? input : {};

  if (mode === "sandbox" || mode === "simulate") {
    return {
      success: true,
      responseStatus: 200,
      providerRequestId: `sim_stripe_${Date.now()}`,
      rateLimit: null,
      metadata: {
        mode,
        simulated: true,
        capabilityId,
        paymentLinkId: `plink_sim_${Date.now()}`,
        url: `https://buy.stripe.com/test_plink_${Date.now()}`,
        refundId: `re_sim_${Date.now()}`,
        subscriptionId: inputObj.subscription_id || `sub_sim_${Date.now()}`,
        status: "active",
        tier: "pro",
        timestamp: new Date().toISOString(),
      },
    };
  }

  const secretKey = await readStripeSecretKey(invocation);

  switch (capabilityId) {
    case "stripe.payment_link.create": {
      const priceId = extractString(inputObj, "price_id", "Stripe Price ID");
      const quantity = typeof inputObj.quantity === "number" ? inputObj.quantity : 1;

      const params = new URLSearchParams({
        "line_items[0][price]": priceId,
        "line_items[0][quantity]": String(quantity),
      });

      const res = await fetch(`${STRIPE_API_BASE}/payment_links`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data.error?.message || "Failed to create Stripe payment link.", {
          code: "STRIPE_API_ERROR",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: res.headers.get("request-id") || null,
        rateLimit: null,
        metadata: {
          mode: "live",
          paymentLinkId: data.id,
          url: data.url,
          active: data.active,
        },
      };
    }

    case "stripe.payment.refund": {
      const paymentIntentId = typeof inputObj.payment_intent === "string" ? inputObj.payment_intent : undefined;
      const chargeId = typeof inputObj.charge === "string" ? inputObj.charge : undefined;
      const amount = typeof inputObj.amount === "number" ? String(inputObj.amount) : undefined;
      const reason = typeof inputObj.reason === "string" ? inputObj.reason : "requested_by_customer";

      if (!paymentIntentId && !chargeId) {
        throw new IntegrationRuntimeError("Either payment_intent or charge ID is required to create a refund.", {
          code: "STRIPE_REFUND_TARGET_MISSING",
          category: "validation",
          status: 400,
        });
      }

      const params = new URLSearchParams();
      if (paymentIntentId) params.set("payment_intent", paymentIntentId);
      if (chargeId) params.set("charge", chargeId);
      if (amount) params.set("amount", amount);
      if (reason) params.set("reason", reason);

      const res = await fetch(`${STRIPE_API_BASE}/refunds`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data.error?.message || "Failed to process Stripe refund.", {
          code: "STRIPE_API_ERROR",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: res.headers.get("request-id") || null,
        rateLimit: null,
        metadata: {
          mode: "live",
          refundId: data.id,
          status: data.status,
          amount: data.amount,
          currency: data.currency,
        },
      };
    }

    case "stripe.subscription.cancel": {
      const subscriptionId = extractString(inputObj, "subscription_id", "Stripe Subscription ID");

      const res = await fetch(`${STRIPE_API_BASE}/subscriptions/${encodeURIComponent(subscriptionId)}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${secretKey}`,
        },
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data.error?.message || "Failed to cancel Stripe subscription.", {
          code: "STRIPE_API_ERROR",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: res.headers.get("request-id") || null,
        rateLimit: null,
        metadata: {
          mode: "live",
          subscriptionId: data.id,
          status: data.status,
          canceledAt: data.canceled_at,
        },
      };
    }

    case "stripe.subscription.sync": {
      const customerId = extractString(inputObj, "customer_id", "Stripe Customer ID");

      const res = await fetch(
        `${STRIPE_API_BASE}/subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=5`,
        {
          headers: {
            Authorization: `Bearer ${secretKey}`,
          },
          signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data.error?.message || "Failed to query Stripe customer subscriptions.", {
          code: "STRIPE_API_ERROR",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      const subscriptions = Array.isArray(data.data) ? data.data : [];
      const activeSub = subscriptions.find((sub: any) => sub.status === "active" || sub.status === "trialing");

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: res.headers.get("request-id") || null,
        rateLimit: null,
        metadata: {
          mode: "live",
          customerId,
          hasActiveSubscription: Boolean(activeSub),
          activeSubscriptionId: activeSub?.id || null,
          status: activeSub?.status || "none",
          currentPeriodEnd: activeSub?.current_period_end
            ? new Date(activeSub.current_period_end * 1000).toISOString()
            : null,
          totalSubscriptions: subscriptions.length,
        },
      };
    }

    default:
      throw new IntegrationRuntimeError(`Unsupported capability ${capabilityId} for Stripe adapter.`, {
        code: "UNSUPPORTED_STRIPE_CAPABILITY",
        category: "validation",
        status: 400,
      });
  }
}

async function checkStripeHealth(
  context: IntegrationRuntimeInvocationContext,
): Promise<IntegrationRuntimeHealthResult> {
  const creds = await context.credentials.read(["secret_key"]);
  const secretKey = creds.secret_key || process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs: 0,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: {
        reason: "Stripe secret key missing in credentials vault.",
      },
    };
  }

  const startTime = Date.now();
  try {
    const res = await fetch(`${STRIPE_API_BASE}/balance`, {
      headers: { Authorization: `Bearer ${secretKey}` },
      signal: context.signal || AbortSignal.timeout(10_000),
    });

    const latencyMs = Date.now() - startTime;
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      const available = Array.isArray(data.available) && data.available[0] ? data.available[0] : {};
      return {
        healthy: true,
        checkedAt: new Date().toISOString(),
        latencyMs,
        externalAccountId: "stripe_account",
        externalAccountLabel: "Stripe Payments & Billing API",
        metadata: {
          currency: available.currency || "usd",
          livemode: data.livemode,
        },
      };
    }

    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: {
        reason: `Stripe Balance API returned HTTP ${res.status}`,
      },
    };
  } catch (err) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - startTime,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: {
        reason: err instanceof Error ? err.message : "Failed to connect to Stripe API",
      },
    };
  }
}

export const STRIPE_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.stripe.runtime",
    adapterVersion: "1.0.0",
    providerId: "stripe",
    state: "installed",
    authType: "secret_key",
    environments: ["development", "sandbox", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      "stripe.payment_link.create",
      "stripe.payment.refund",
      "stripe.subscription.cancel",
      "stripe.subscription.sync",
    ].map((capabilityId) => ({
      capabilityId,
      kind: "action" as const,
      modes: ["simulate", "sandbox", "live"] as const,
      requiredScopes: [],
      supportsIdempotency: true,
    })),
    supportsHealthChecks: true,
    supportsTokenRefresh: false,
    supportsTokenRevocation: false,
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
    maxConcurrency: 10,
  },
  healthCheck: checkStripeHealth,
  executeAction: executeStripeAction,
};
