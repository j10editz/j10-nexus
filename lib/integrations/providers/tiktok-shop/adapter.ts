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
const TTS_API_BASE = "https://open-api.tiktokglobalshop.com";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractString(input: Record<string, unknown>, key: string, label: string): string {
  const val = input[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new IntegrationRuntimeError(`${label} is required.`, {
      code: "INVALID_TIKTOK_SHOP_INPUT",
      category: "validation",
      status: 400,
    });
  }
  return val.trim();
}

async function readTikTokShopCredentials(
  context: IntegrationRuntimeInvocationContext,
): Promise<{ token: string; appKey?: string; shopCipher?: string }> {
  const creds = await context.credentials.read(["access_token", "app_key", "shop_cipher"]);
  const token = creds.access_token;

  if (!token) {
    throw new IntegrationRuntimeError("TikTok Shop access token is missing.", {
      code: "TIKTOK_SHOP_AUTH_MISSING",
      category: "authentication",
      status: 401,
    });
  }

  return { token, appKey: creds.app_key, shopCipher: creds.shop_cipher };
}

async function executeTikTokShopAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const { capabilityId, input, mode } = invocation;
  const inputObj = isRecord(input) ? input : {};

  if (mode === "sandbox" || mode === "simulate") {
    return {
      success: true,
      responseStatus: 200,
      providerRequestId: `sim_tts_${Date.now()}`,
      rateLimit: null,
      metadata: {
        mode,
        simulated: true,
        capabilityId,
        id: `tts_${Date.now()}`,
        echo: inputObj,
      },
    };
  }

  const { token, shopCipher } = await readTikTokShopCredentials(invocation);
  const cipher = typeof inputObj.shop_cipher === "string" ? inputObj.shop_cipher : (shopCipher || "default_cipher");

  switch (capabilityId) {
    case "tiktok-shop.update_product": {
      const productId = inputObj.product_id ?? inputObj.id;
      if (!productId) {
        throw new IntegrationRuntimeError("product_id is required.", {
          code: "INVALID_TIKTOK_SHOP_INPUT",
          category: "validation",
          status: 400,
        });
      }

      const res = await fetch(`${TTS_API_BASE}/product/202309/products/${encodeURIComponent(String(productId))}?shop_cipher=${encodeURIComponent(cipher)}`, {
        method: "PUT",
        headers: {
          "x-tts-access-token": token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          product_name: typeof inputObj.product_name === "string" ? inputObj.product_name : undefined,
          description: typeof inputObj.description === "string" ? inputObj.description : undefined,
          skus: Array.isArray(inputObj.skus) ? inputObj.skus : undefined,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || (data?.code && data.code !== 0)) {
        throw new IntegrationRuntimeError(data?.message || "Failed to update TikTok Shop product.", {
          code: "TIKTOK_SHOP_PRODUCT_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: res.headers.get("x-tts-log-id") || null,
        rateLimit: null,
        metadata: data,
      };
    }

    case "tiktok-shop.update_inventory": {
      const productId = inputObj.product_id ?? inputObj.id;
      if (!productId) {
        throw new IntegrationRuntimeError("product_id is required.", {
          code: "INVALID_TIKTOK_SHOP_INPUT",
          category: "validation",
          status: 400,
        });
      }

      const skus = Array.isArray(inputObj.skus) ? inputObj.skus : [
        {
          id: typeof inputObj.sku_id === "string" ? inputObj.sku_id : "sku_default",
          inventory: [
            {
              quantity: typeof inputObj.quantity === "number" ? inputObj.quantity : 10,
            },
          ],
        },
      ];

      const res = await fetch(`${TTS_API_BASE}/product/202309/products/${encodeURIComponent(String(productId))}/inventory/update?shop_cipher=${encodeURIComponent(cipher)}`, {
        method: "POST",
        headers: {
          "x-tts-access-token": token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          skus,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || (data?.code && data.code !== 0)) {
        throw new IntegrationRuntimeError(data?.message || "Failed to update TikTok Shop inventory.", {
          code: "TIKTOK_SHOP_INVENTORY_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: res.headers.get("x-tts-log-id") || null,
        rateLimit: null,
        metadata: data,
      };
    }

    case "tiktok-shop.fulfill_order": {
      const orderId = inputObj.order_id ?? inputObj.id;
      if (!orderId) {
        throw new IntegrationRuntimeError("order_id is required.", {
          code: "INVALID_TIKTOK_SHOP_INPUT",
          category: "validation",
          status: 400,
        });
      }

      const trackingNumber = typeof inputObj.tracking_number === "string" ? inputObj.tracking_number : "TRACK_TTS_123";
      const shippingProviderId = typeof inputObj.shipping_provider_id === "string" ? inputObj.shipping_provider_id : "sp_default";

      const res = await fetch(`${TTS_API_BASE}/fulfillment/202309/orders/${encodeURIComponent(String(orderId))}/packages?shop_cipher=${encodeURIComponent(cipher)}`, {
        method: "POST",
        headers: {
          "x-tts-access-token": token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tracking_number: trackingNumber,
          shipping_provider_id: shippingProviderId,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || (data?.code && data.code !== 0)) {
        throw new IntegrationRuntimeError(data?.message || "Failed to fulfill TikTok Shop order.", {
          code: "TIKTOK_SHOP_FULFILLMENT_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: res.headers.get("x-tts-log-id") || null,
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

async function checkTikTokShopHealth(
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

    const res = await fetch(`${TTS_API_BASE}/authorization/202309/shops`, {
      headers: {
        "x-tts-access-token": token,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const data = await res.json().catch(() => ({}));
    const latency = Date.now() - started;
    const shops = isRecord(data) && isRecord(data.data) && Array.isArray((data.data as any).shops) ? (data.data as any).shops : [];
    const firstShop = shops[0] || null;
    const shopName = firstShop?.shop_name || "TikTok Shop Seller";
    const shopId = firstShop?.id || "tiktok_shop";

    return {
      healthy: res.ok,
      checkedAt: new Date().toISOString(),
      latencyMs: latency,
      externalAccountId: shopId,
      externalAccountLabel: shopName,
      metadata: { status: res.status, shopCount: shops.length },
    };
  } catch (err: unknown) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: { reason: err instanceof Error ? err.message : "TikTok Shop health check failed." },
    };
  }
}

export const TIKTOK_SHOP_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.tiktok-shop.runtime",
    adapterVersion: "1.0.0",
    providerId: "tiktok-shop",
    state: "installed",
    authType: "oauth2",
    environments: ["development", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      "tiktok-shop.update_product",
      "tiktok-shop.update_inventory",
      "tiktok-shop.fulfill_order",
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
  healthCheck: checkTikTokShopHealth,
  executeAction: executeTikTokShopAction,
};
