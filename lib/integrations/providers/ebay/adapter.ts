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
const EBAY_API_BASE = "https://api.ebay.com";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractString(input: Record<string, unknown>, key: string, label: string): string {
  const val = input[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new IntegrationRuntimeError(`${label} is required.`, {
      code: "INVALID_EBAY_INPUT",
      category: "validation",
      status: 400,
    });
  }
  return val.trim();
}

async function readEbayCredentials(
  context: IntegrationRuntimeInvocationContext,
): Promise<{ token: string; marketplaceId?: string }> {
  const creds = await context.credentials.read(["access_token", "marketplace_id"]);
  const token = creds.access_token;

  if (!token) {
    throw new IntegrationRuntimeError("eBay access token is missing.", {
      code: "EBAY_AUTH_MISSING",
      category: "authentication",
      status: 401,
    });
  }

  return { token, marketplaceId: creds.marketplace_id };
}

async function executeEbayAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const { capabilityId, input, mode } = invocation;
  const inputObj = isRecord(input) ? input : {};

  if (mode === "sandbox" || mode === "simulate") {
    return {
      success: true,
      responseStatus: 200,
      providerRequestId: `sim_ebay_${Date.now()}`,
      rateLimit: null,
      metadata: {
        mode,
        simulated: true,
        capabilityId,
        id: `ebay_${Date.now()}`,
        echo: inputObj,
      },
    };
  }

  const { token, marketplaceId } = await readEbayCredentials(invocation);

  switch (capabilityId) {
    case "ebay.create_listing": {
      const sku = extractString(inputObj, "sku", "sku");
      const title = extractString(inputObj, "title", "title");

      const res = await fetch(`${EBAY_API_BASE}/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Content-Language": "en-US",
        },
        body: JSON.stringify({
          availability: {
            shipToLocationAvailability: {
              quantity: typeof inputObj.quantity === "number" ? inputObj.quantity : 1,
            },
          },
          product: {
            title,
            description: typeof inputObj.description === "string" ? inputObj.description : "Item on Nexus store.",
            aspects: isRecord(inputObj.aspects) ? inputObj.aspects : undefined,
          },
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data?.errors?.[0]?.message || "Failed to create eBay inventory item/listing.", {
          code: "EBAY_LISTING_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: res.headers.get("rlogid") || null,
        rateLimit: null,
        metadata: data,
      };
    }

    case "ebay.update_inventory": {
      const sku = extractString(inputObj, "sku", "sku");
      const quantity = typeof inputObj.quantity === "number" ? inputObj.quantity : 1;

      const res = await fetch(`${EBAY_API_BASE}/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Content-Language": "en-US",
        },
        body: JSON.stringify({
          availability: {
            shipToLocationAvailability: {
              quantity,
            },
          },
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data?.errors?.[0]?.message || "Failed to update eBay inventory.", {
          code: "EBAY_INVENTORY_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: res.headers.get("rlogid") || null,
        rateLimit: null,
        metadata: data,
      };
    }

    case "ebay.fulfill_order": {
      const orderId = inputObj.order_id ?? inputObj.id;
      if (!orderId) {
        throw new IntegrationRuntimeError("order_id is required.", {
          code: "INVALID_EBAY_INPUT",
          category: "validation",
          status: 400,
        });
      }

      const trackingNumber = typeof inputObj.tracking_number === "string" ? inputObj.tracking_number : "TRACK999999";
      const carrierCode = typeof inputObj.shipping_carrier_code === "string" ? inputObj.shipping_carrier_code : "USPS";

      const res = await fetch(`${EBAY_API_BASE}/sell/fulfillment/v1/order/${encodeURIComponent(String(orderId))}/shipping_fulfillment`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          shippingCarrierCode: carrierCode,
          trackingNumber,
          lineItems: Array.isArray(inputObj.line_items) ? inputObj.line_items : undefined,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data?.errors?.[0]?.message || "Failed to fulfill eBay order.", {
          code: "EBAY_FULFILLMENT_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: res.headers.get("rlogid") || null,
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

async function checkEbayHealth(
  context: IntegrationRuntimeInvocationContext,
): Promise<IntegrationRuntimeHealthResult> {
  const started = Date.now();
  try {
    const creds = await context.credentials.read(["access_token"]);
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

    const res = await fetch(`${EBAY_API_BASE}/sell/account/v1/privilege`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const data = await res.json().catch(() => ({}));
    const latency = Date.now() - started;
    const sellerRegistrationCompleted = isRecord(data) && Boolean(data.sellerRegistrationCompleted);

    return {
      healthy: res.ok,
      checkedAt: new Date().toISOString(),
      latencyMs: latency,
      externalAccountId: "ebay_seller_account",
      externalAccountLabel: sellerRegistrationCompleted ? "eBay Registered Seller" : "eBay Account",
      metadata: { status: res.status, sellerRegistrationCompleted },
    };
  } catch (err: unknown) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: { reason: err instanceof Error ? err.message : "eBay health check failed." },
    };
  }
}

export const EBAY_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.ebay.runtime",
    adapterVersion: "1.0.0",
    providerId: "ebay",
    state: "installed",
    authType: "oauth2",
    environments: ["development", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      "ebay.create_listing",
      "ebay.update_inventory",
      "ebay.fulfill_order",
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
  healthCheck: checkEbayHealth,
  executeAction: executeEbayAction,
};
