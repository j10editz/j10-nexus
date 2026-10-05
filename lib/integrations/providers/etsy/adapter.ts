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
const ETSY_API_BASE = "https://openapi.etsy.com/v3";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractString(input: Record<string, unknown>, key: string, label: string): string {
  const val = input[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new IntegrationRuntimeError(`${label} is required.`, {
      code: "INVALID_ETSY_INPUT",
      category: "validation",
      status: 400,
    });
  }
  return val.trim();
}

async function readEtsyCredentials(
  context: IntegrationRuntimeInvocationContext,
): Promise<{ token: string; apiKey?: string; shopId?: string }> {
  const creds = await context.credentials.read(["access_token", "api_key", "keystring", "shop_id"]);
  const token = creds.access_token;

  if (!token) {
    throw new IntegrationRuntimeError("Etsy access token is missing.", {
      code: "ETSY_AUTH_MISSING",
      category: "authentication",
      status: 401,
    });
  }

  return { token, apiKey: creds.api_key || creds.keystring, shopId: creds.shop_id };
}

async function executeEtsyAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const { capabilityId, input, mode } = invocation;
  const inputObj = isRecord(input) ? input : {};

  if (mode === "sandbox" || mode === "simulate") {
    return {
      success: true,
      responseStatus: 200,
      providerRequestId: `sim_etsy_${Date.now()}`,
      rateLimit: null,
      metadata: {
        mode,
        simulated: true,
        capabilityId,
        id: `etsy_${Date.now()}`,
        echo: inputObj,
      },
    };
  }

  const { token, apiKey, shopId } = await readEtsyCredentials(invocation);
  const targetShopId = typeof inputObj.shop_id === "string" ? inputObj.shop_id : (shopId || "default_shop");

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  if (apiKey) headers["x-api-key"] = apiKey;

  switch (capabilityId) {
    case "etsy.create_listing": {
      const title = extractString(inputObj, "title", "title");
      const description = typeof inputObj.description === "string" ? inputObj.description : "Handmade item on Nexus store.";

      const res = await fetch(`${ETSY_API_BASE}/application/shops/${encodeURIComponent(targetShopId)}/listings`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          title,
          description,
          price: typeof inputObj.price === "number" ? inputObj.price : 25.00,
          quantity: typeof inputObj.quantity === "number" ? inputObj.quantity : 1,
          who_made: typeof inputObj.who_made === "string" ? inputObj.who_made : "i_did",
          when_made: typeof inputObj.when_made === "string" ? inputObj.when_made : "2020_2024",
          taxonomy_id: typeof inputObj.taxonomy_id === "number" ? inputObj.taxonomy_id : 1,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data?.error || "Failed to create Etsy listing.", {
          code: "ETSY_LISTING_FAILED",
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

    case "etsy.update_inventory": {
      const listingId = inputObj.listing_id ?? inputObj.id;
      if (!listingId) {
        throw new IntegrationRuntimeError("listing_id is required.", {
          code: "INVALID_ETSY_INPUT",
          category: "validation",
          status: 400,
        });
      }

      const res = await fetch(`${ETSY_API_BASE}/application/listings/${encodeURIComponent(String(listingId))}/inventory`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          products: Array.isArray(inputObj.products) ? inputObj.products : [
            {
              sku: typeof inputObj.sku === "string" ? inputObj.sku : "SKU_DEFAULT",
              offerings: [
                {
                  price: typeof inputObj.price === "number" ? inputObj.price : 25.00,
                  quantity: typeof inputObj.quantity === "number" ? inputObj.quantity : 10,
                  is_enabled: true,
                },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data?.error || "Failed to update Etsy inventory.", {
          code: "ETSY_INVENTORY_FAILED",
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

    case "etsy.update_receipt": {
      const receiptId = inputObj.receipt_id ?? inputObj.id;
      if (!receiptId) {
        throw new IntegrationRuntimeError("receipt_id is required.", {
          code: "INVALID_ETSY_INPUT",
          category: "validation",
          status: 400,
        });
      }

      const res = await fetch(`${ETSY_API_BASE}/application/shops/${encodeURIComponent(targetShopId)}/receipts/${encodeURIComponent(String(receiptId))}/tracking`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          tracking_code: typeof inputObj.tracking_code === "string" ? inputObj.tracking_code : "TRACK123456",
          carrier_name: typeof inputObj.carrier_name === "string" ? inputObj.carrier_name : "usps",
          send_bcc: false,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data?.error || "Failed to update Etsy receipt/tracking.", {
          code: "ETSY_RECEIPT_FAILED",
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

async function checkEtsyHealth(
  context: IntegrationRuntimeInvocationContext,
): Promise<IntegrationRuntimeHealthResult> {
  const started = Date.now();
  try {
    const creds = await context.credentials.read(["access_token", "api_key", "keystring"]);
    const token = creds.access_token;
    if (!token) {
      return {
        healthy: false,
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        externalAccountId: null,
        externalAccountLabel: null,
        metadata: { reason: "Missing access token" },
      };
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };
    const apiKey = creds.api_key || creds.keystring;
    if (apiKey) headers["x-api-key"] = apiKey;

    const res = await fetch(`${ETSY_API_BASE}/application/users/me`, {
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const data = await res.json().catch(() => ({}));
    const latency = Date.now() - started;
    const userId = isRecord(data) && data.user_id ? String(data.user_id) : "etsy_user";
    const primaryEmail = isRecord(data) && typeof data.primary_email === "string" ? data.primary_email : `Etsy User (${userId})`;

    return {
      healthy: res.ok,
      checkedAt: new Date().toISOString(),
      latencyMs: latency,
      externalAccountId: userId,
      externalAccountLabel: primaryEmail,
      metadata: { status: res.status },
    };
  } catch (err: unknown) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: { reason: err instanceof Error ? err.message : "Etsy health check failed." },
    };
  }
}

export const ETSY_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.etsy.runtime",
    adapterVersion: "1.0.0",
    providerId: "etsy",
    state: "installed",
    authType: "oauth2",
    environments: ["development", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      "etsy.create_listing",
      "etsy.update_inventory",
      "etsy.update_receipt",
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
  healthCheck: checkEtsyHealth,
  executeAction: executeEtsyAction,
};
