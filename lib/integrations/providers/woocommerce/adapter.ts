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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractString(input: Record<string, unknown>, key: string, label: string): string {
  const val = input[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new IntegrationRuntimeError(`${label} is required.`, {
      code: "INVALID_WOOCOMMERCE_INPUT",
      category: "validation",
      status: 400,
    });
  }
  return val.trim();
}

async function readWooCommerceCredentials(
  context: IntegrationRuntimeInvocationContext,
): Promise<{ siteUrl: string; authHeader: string }> {
  const creds = await context.credentials.read(["site_url", "store_url", "access_token", "consumer_key", "consumer_secret"]);
  const siteUrl = (creds.site_url || creds.store_url || "").replace(/\/+$/, "");

  if (!siteUrl) {
    throw new IntegrationRuntimeError("WooCommerce site_url is missing.", {
      code: "WOOCOMMERCE_SITE_URL_MISSING",
      category: "authentication",
      status: 401,
    });
  }

  if (creds.access_token) {
    return { siteUrl, authHeader: `Bearer ${creds.access_token}` };
  }

  if (creds.consumer_key && creds.consumer_secret) {
    const encoded = Buffer.from(`${creds.consumer_key}:${creds.consumer_secret}`).toString("base64");
    return { siteUrl, authHeader: `Basic ${encoded}` };
  }

  throw new IntegrationRuntimeError("WooCommerce credentials (access_token or consumer_key + consumer_secret) are missing.", {
    code: "WOOCOMMERCE_AUTH_MISSING",
    category: "authentication",
    status: 401,
  });
}

async function executeWooCommerceAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const { capabilityId, input, mode } = invocation;
  const inputObj = isRecord(input) ? input : {};

  if (mode === "sandbox" || mode === "simulate") {
    return {
      success: true,
      responseStatus: 200,
      providerRequestId: `sim_wc_${Date.now()}`,
      rateLimit: null,
      metadata: {
        mode,
        simulated: true,
        capabilityId,
        id: `wc_${Date.now()}`,
        echo: inputObj,
      },
    };
  }

  const { siteUrl, authHeader } = await readWooCommerceCredentials(invocation);

  switch (capabilityId) {
    case "woocommerce.create_order": {
      const lineItems = Array.isArray(inputObj.line_items) ? inputObj.line_items : [];
      if (lineItems.length === 0) {
        throw new IntegrationRuntimeError("line_items array is required.", {
          code: "INVALID_WOOCOMMERCE_INPUT",
          category: "validation",
          status: 400,
        });
      }

      const res = await fetch(`${siteUrl}/wp-json/wc/v3/orders`, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          line_items: lineItems,
          billing: isRecord(inputObj.billing) ? inputObj.billing : undefined,
          shipping: isRecord(inputObj.shipping) ? inputObj.shipping : undefined,
          payment_method: typeof inputObj.payment_method === "string" ? inputObj.payment_method : "other",
          status: typeof inputObj.status === "string" ? inputObj.status : "processing",
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data?.message || "Failed to create WooCommerce order.", {
          code: "WOOCOMMERCE_CREATE_ORDER_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: res.headers.get("x-request-id") || null,
        rateLimit: null,
        metadata: data,
      };
    }

    case "woocommerce.update_product": {
      const productId = inputObj.product_id ?? inputObj.id;
      if (!productId) {
        throw new IntegrationRuntimeError("product_id or id is required.", {
          code: "INVALID_WOOCOMMERCE_INPUT",
          category: "validation",
          status: 400,
        });
      }

      const bodyPayload: Record<string, unknown> = {};
      if (inputObj.regular_price !== undefined) bodyPayload.regular_price = String(inputObj.regular_price);
      if (inputObj.stock_quantity !== undefined) bodyPayload.stock_quantity = Number(inputObj.stock_quantity);
      if (typeof inputObj.name === "string") bodyPayload.name = inputObj.name.trim();

      const res = await fetch(`${siteUrl}/wp-json/wc/v3/products/${encodeURIComponent(String(productId))}`, {
        method: "PUT",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(bodyPayload),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data?.message || "Failed to update WooCommerce product.", {
          code: "WOOCOMMERCE_UPDATE_PRODUCT_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: res.headers.get("x-request-id") || null,
        rateLimit: null,
        metadata: data,
      };
    }

    case "woocommerce.issue_refund": {
      const orderId = inputObj.order_id ?? inputObj.id;
      if (!orderId) {
        throw new IntegrationRuntimeError("order_id is required.", {
          code: "INVALID_WOOCOMMERCE_INPUT",
          category: "validation",
          status: 400,
        });
      }

      const amount = inputObj.amount;
      if (amount === undefined || amount === null) {
        throw new IntegrationRuntimeError("amount is required to issue refund.", {
          code: "INVALID_WOOCOMMERCE_INPUT",
          category: "validation",
          status: 400,
        });
      }

      const reason = typeof inputObj.reason === "string" ? inputObj.reason.trim() : "Automated refund";

      const res = await fetch(`${siteUrl}/wp-json/wc/v3/orders/${encodeURIComponent(String(orderId))}/refunds`, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: String(amount),
          reason,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data?.message || "Failed to issue WooCommerce refund.", {
          code: "WOOCOMMERCE_REFUND_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: res.headers.get("x-request-id") || null,
        rateLimit: null,
        metadata: data,
      };
    }

    default:
      throw new IntegrationRuntimeError(`Unsupported capability: ${capabilityId}`, {
        code: "UNSUPPORTED_CAPABILITY",
        category: "validation",
        status: 400,
      });
  }
}

async function checkWooCommerceHealth(
  context: IntegrationRuntimeInvocationContext,
): Promise<IntegrationRuntimeHealthResult> {
  const started = Date.now();
  try {
    const { siteUrl, authHeader } = await readWooCommerceCredentials(context);

    const res = await fetch(`${siteUrl}/wp-json/wc/v3/system_status`, {
      headers: {
        Authorization: authHeader,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const data = await res.json().catch(() => ({}));
    const latency = Date.now() - started;
    const environment = isRecord(data) && isRecord(data.environment) ? data.environment : null;
    const siteTitle = environment && typeof environment.site_title === "string" ? environment.site_title : siteUrl;

    return {
      healthy: res.ok,
      checkedAt: new Date().toISOString(),
      latencyMs: latency,
      externalAccountId: siteUrl,
      externalAccountLabel: siteTitle,
      metadata: { status: res.status },
    };
  } catch (err: unknown) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: { reason: err instanceof Error ? err.message : "WooCommerce health check failed." },
    };
  }
}

export const WOOCOMMERCE_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.woocommerce.runtime",
    adapterVersion: "1.0.0",
    providerId: "woocommerce",
    state: "installed",
    authType: "access_token",
    environments: ["development", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      "woocommerce.create_order",
      "woocommerce.update_product",
      "woocommerce.issue_refund",
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
  healthCheck: checkWooCommerceHealth,
  executeAction: executeWooCommerceAction,
};
