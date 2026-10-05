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
const SHOPIFY_API_VERSION = "2024-01";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractString(input: Record<string, unknown>, key: string, label: string): string {
  const val = input[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new IntegrationRuntimeError(`${label} is required.`, {
      code: "INVALID_SHOPIFY_INPUT",
      category: "validation",
      status: 400,
    });
  }
  return val.trim();
}

function normalizeStoreDomain(domain: string): string {
  let cleaned = domain.trim().toLowerCase();
  cleaned = cleaned.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (!cleaned.includes(".")) {
    cleaned = `${cleaned}.myshopify.com`;
  }
  return cleaned;
}

async function readShopifyCredentials(
  context: IntegrationRuntimeInvocationContext,
): Promise<{ storeDomain: string; adminAccessToken: string }> {
  const creds = await context.credentials.read(["admin_access_token", "store_domain"]);
  const storeDomainRaw =
    (context.connection.publicConfiguration.store_domain as string | undefined) || creds.store_domain;
  const adminAccessToken = creds.admin_access_token;

  if (!storeDomainRaw) {
    throw new IntegrationRuntimeError("Shopify Store Domain is missing in configuration.", {
      code: "SHOPIFY_STORE_DOMAIN_MISSING",
      category: "configuration",
      status: 400,
    });
  }

  if (!adminAccessToken) {
    throw new IntegrationRuntimeError("Shopify Admin Access Token is not configured in vault.", {
      code: "SHOPIFY_AUTH_MISSING",
      category: "authentication",
      status: 401,
    });
  }

  return {
    storeDomain: normalizeStoreDomain(storeDomainRaw),
    adminAccessToken,
  };
}

async function executeShopifyAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const { capabilityId, input, mode } = invocation;
  const inputObj = isRecord(input) ? input : {};

  if (mode === "sandbox" || mode === "simulate") {
    return {
      success: true,
      responseStatus: 200,
      providerRequestId: `sim_shopify_${Date.now()}`,
      rateLimit: null,
      metadata: {
        mode,
        simulated: true,
        capabilityId,
        orderId: inputObj.order_id || `order_sim_${Date.now()}`,
        fulfillmentId: `ful_sim_${Date.now()}`,
        inventoryItemId: inputObj.inventory_item_id || `inv_sim_${Date.now()}`,
        available: 42,
        recoveryUrl: `https://store.myshopify.com/checkouts/rec_sim_${Date.now()}`,
        timestamp: new Date().toISOString(),
      },
    };
  }

  const { storeDomain, adminAccessToken } = await readShopifyCredentials(invocation);
  const baseUrl = `https://${storeDomain}/admin/api/${SHOPIFY_API_VERSION}`;

  switch (capabilityId) {
    case "shopify.order.add_tag": {
      const orderId = extractString(inputObj, "order_id", "Shopify Order ID");
      const tag = extractString(inputObj, "tag", "Order Tag");

      const getRes = await fetch(`${baseUrl}/orders/${encodeURIComponent(orderId)}.json?fields=id,tags`, {
        headers: {
          "X-Shopify-Access-Token": adminAccessToken,
          "Content-Type": "application/json",
        },
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const getData = await getRes.json().catch(() => ({}));
      if (!getRes.ok) {
        throw new IntegrationRuntimeError(getData.errors || "Failed to fetch Shopify order for tagging.", {
          code: "SHOPIFY_API_ERROR",
          category: "provider",
          status: getRes.status,
          details: getData,
        });
      }

      const existingTags = typeof getData.order?.tags === "string" ? getData.order.tags.split(", ") : [];
      const updatedTags = Array.from(new Set([...existingTags, tag])).filter(Boolean).join(", ");

      const putRes = await fetch(`${baseUrl}/orders/${encodeURIComponent(orderId)}.json`, {
        method: "PUT",
        headers: {
          "X-Shopify-Access-Token": adminAccessToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ order: { id: orderId, tags: updatedTags } }),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const putData = await putRes.json().catch(() => ({}));
      if (!putRes.ok) {
        throw new IntegrationRuntimeError(putData.errors || "Failed to update Shopify order tags.", {
          code: "SHOPIFY_API_ERROR",
          category: "provider",
          status: putRes.status,
          details: putData,
        });
      }

      return {
        success: true,
        responseStatus: putRes.status,
        providerRequestId: putRes.headers.get("x-request-id") || null,
        rateLimit: null,
        metadata: {
          mode: "live",
          orderId,
          tags: updatedTags,
        },
      };
    }

    case "shopify.order.fulfill": {
      const orderId = extractString(inputObj, "order_id", "Shopify Order ID");
      const trackingNumber = typeof inputObj.tracking_number === "string" ? inputObj.tracking_number : undefined;
      const trackingCompany = typeof inputObj.tracking_company === "string" ? inputObj.tracking_company : undefined;

      const payload: Record<string, unknown> = {
        fulfillment: {
          order_id: orderId,
          notify_customer: true,
          tracking_number: trackingNumber,
          tracking_company: trackingCompany,
        },
      };

      const res = await fetch(`${baseUrl}/orders/${encodeURIComponent(orderId)}/fulfillments.json`, {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": adminAccessToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data.errors || "Failed to fulfill Shopify order.", {
          code: "SHOPIFY_API_ERROR",
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
        metadata: {
          mode: "live",
          orderId,
          fulfillmentId: data.fulfillment?.id,
          status: data.fulfillment?.status || "success",
        },
      };
    }

    case "shopify.inventory.adjust": {
      const inventoryItemId = extractString(inputObj, "inventory_item_id", "Inventory Item ID");
      const locationId = extractString(inputObj, "location_id", "Location ID");
      const availableAdjustment =
        typeof inputObj.available_adjustment === "number" ? inputObj.available_adjustment : 0;

      const payload = {
        inventory_item_id: inventoryItemId,
        location_id: locationId,
        available_adjustment: availableAdjustment,
      };

      const res = await fetch(`${baseUrl}/inventory_levels/adjust.json`, {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": adminAccessToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data.errors || "Failed to adjust Shopify inventory level.", {
          code: "SHOPIFY_API_ERROR",
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
        metadata: {
          mode: "live",
          inventoryItemId,
          available: data.inventory_level?.available,
        },
      };
    }

    case "shopify.inventory.lookup": {
      const inventoryItemId = extractString(inputObj, "inventory_item_id", "Inventory Item ID");

      const res = await fetch(
        `${baseUrl}/inventory_levels.json?inventory_item_ids=${encodeURIComponent(inventoryItemId)}`,
        {
          headers: {
            "X-Shopify-Access-Token": adminAccessToken,
            "Content-Type": "application/json",
          },
          signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data.errors || "Failed to lookup Shopify inventory.", {
          code: "SHOPIFY_API_ERROR",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      const levels = Array.isArray(data.inventory_levels) ? data.inventory_levels : [];
      const totalAvailable = levels.reduce(
        (sum: number, lvl: any) => sum + (typeof lvl.available === "number" ? lvl.available : 0),
        0,
      );

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: res.headers.get("x-request-id") || null,
        rateLimit: null,
        metadata: {
          mode: "live",
          inventoryItemId,
          totalAvailable,
          locations: levels,
        },
      };
    }

    case "shopify.cart.abandonment_recover": {
      const checkoutToken = extractString(inputObj, "checkout_token", "Shopify Abandoned Checkout Token");
      const discountCode = typeof inputObj.discount_code === "string" ? inputObj.discount_code : "J10RECOVER10";

      const recoveryUrl = `https://${storeDomain}/checkouts/${encodeURIComponent(checkoutToken)}?discount=${encodeURIComponent(discountCode)}`;

      return {
        success: true,
        responseStatus: 200,
        providerRequestId: `rec_${Date.now()}`,
        rateLimit: null,
        metadata: {
          mode: "live",
          checkoutToken,
          discountCode,
          recoveryUrl,
          dispatchedAt: new Date().toISOString(),
        },
      };
    }

    default:
      throw new IntegrationRuntimeError(`Unsupported capability ${capabilityId} for Shopify adapter.`, {
        code: "UNSUPPORTED_SHOPIFY_CAPABILITY",
        category: "validation",
        status: 400,
      });
  }
}

async function checkShopifyHealth(
  context: IntegrationRuntimeInvocationContext,
): Promise<IntegrationRuntimeHealthResult> {
  const creds = await context.credentials.read(["admin_access_token", "store_domain"]);
  const storeDomainRaw =
    (context.connection.publicConfiguration.store_domain as string | undefined) || creds.store_domain;
  const adminAccessToken = creds.admin_access_token;

  if (!storeDomainRaw || !adminAccessToken) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs: 0,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: {
        reason: "Shopify store domain or admin access token missing in configuration/vault.",
      },
    };
  }

  const storeDomain = normalizeStoreDomain(storeDomainRaw);
  const startTime = Date.now();

  try {
    const res = await fetch(`https://${storeDomain}/admin/api/${SHOPIFY_API_VERSION}/shop.json`, {
      headers: {
        "X-Shopify-Access-Token": adminAccessToken,
        "Content-Type": "application/json",
      },
      signal: context.signal || AbortSignal.timeout(10_000),
    });

    const latencyMs = Date.now() - startTime;
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return {
        healthy: true,
        checkedAt: new Date().toISOString(),
        latencyMs,
        externalAccountId: data.shop?.id ? String(data.shop.id) : storeDomain,
        externalAccountLabel: data.shop?.name || storeDomain,
        metadata: {
          storeDomain,
          shopName: data.shop?.name,
          currency: data.shop?.currency,
          email: data.shop?.email,
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
        reason: `Shopify Shop API returned HTTP ${res.status}`,
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
        reason: err instanceof Error ? err.message : "Failed to connect to Shopify Admin API",
      },
    };
  }
}

export const SHOPIFY_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.shopify.runtime",
    adapterVersion: "1.0.0",
    providerId: "shopify",
    state: "installed",
    authType: "access_token",
    environments: ["development", "sandbox", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      "shopify.order.add_tag",
      "shopify.order.fulfill",
      "shopify.inventory.adjust",
      "shopify.inventory.lookup",
      "shopify.cart.abandonment_recover",
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
  healthCheck: checkShopifyHealth,
  executeAction: executeShopifyAction,
};
