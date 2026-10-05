import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { WOOCOMMERCE_RUNTIME_ADAPTER } from "@/lib/integrations/providers/woocommerce/adapter";
import { PAYPAL_RUNTIME_ADAPTER } from "@/lib/integrations/providers/paypal/adapter";
import { SQUARE_RUNTIME_ADAPTER } from "@/lib/integrations/providers/square/adapter";
import { AMAZON_SELLER_RUNTIME_ADAPTER } from "@/lib/integrations/providers/amazon-seller/adapter";
import { ETSY_RUNTIME_ADAPTER } from "@/lib/integrations/providers/etsy/adapter";
import { EBAY_RUNTIME_ADAPTER } from "@/lib/integrations/providers/ebay/adapter";
import { TIKTOK_SHOP_RUNTIME_ADAPTER } from "@/lib/integrations/providers/tiktok-shop/adapter";
import { getIntegrationRuntimeAdapter } from "@/lib/integrations/runtime-registry";
import type {
  IntegrationRuntimeActionInvocation,
  IntegrationRuntimeInvocationContext,
} from "@/types/integration-runtime";

function createMockContext(
  providerId: string,
  credentialsRecord: Record<string, string> = {},
  publicConfig: Record<string, any> = {},
): IntegrationRuntimeInvocationContext {
  return {
    requestId: "req_ecom_123",
    correlationId: "corr_ecom_123",
    userId: "usr_ecom_123",
    environment: "development",
    signal: new AbortController().signal,
    connection: {
      id: `conn_${providerId}_1`,
      workspaceId: "ws_ecom_test",
      userId: "usr_ecom_123",
      providerId: providerId as any,
      name: `${providerId} Connection`,
      status: "connected",
      environment: "development",
      credentialReference: "vault_ref_ecom",
      externalAccountId: null,
      externalAccountLabel: null,
      grantedScopes: [],
      enabledCapabilities: [],
      publicConfiguration: publicConfig,
      lastConnectedAt: new Date().toISOString(),
      lastHealthCheckAt: new Date().toISOString(),
      lastErrorCode: null,
      lastErrorMessage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    credentials: {
      async read(keys: readonly string[]) {
        const result: Record<string, string> = {};
        for (const key of keys) {
          if (credentialsRecord[key] !== undefined) {
            result[key] = credentialsRecord[key];
          }
        }
        return result;
      },
    },
  };
}

function createMockActionInvocation(
  capabilityId: string,
  providerId: string,
  input: Record<string, unknown>,
  mode: "simulate" | "sandbox" | "live" = "live",
  credentialsRecord: Record<string, string> = {},
): IntegrationRuntimeActionInvocation {
  const context = createMockContext(providerId, credentialsRecord);
  return {
    ...context,
    capabilityId,
    mode,
    idempotencyKey: `idem_ecom_${Date.now()}`,
    input,
  };
}

describe("Batch 16: E-commerce & Marketplaces Runtime Connectors", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("WooCommerce Runtime Adapter", () => {
    it("is registered properly in runtime registry", () => {
      const adapter = getIntegrationRuntimeAdapter("woocommerce");
      expect(adapter).toBeDefined();
      expect(adapter!.manifest.providerId).toBe("woocommerce");
      expect(adapter!.manifest.adapterId).toBe("j10.woocommerce.runtime");
      const capIds = adapter!.manifest.capabilities.map((c) => c.capabilityId);
      expect(capIds).toContain("woocommerce.create_order");
      expect(capIds).toContain("woocommerce.update_product");
      expect(capIds).toContain("woocommerce.issue_refund");
    });

    it("executes simulated create order", async () => {
      const invocation = createMockActionInvocation(
        "woocommerce.create_order",
        "woocommerce",
        { line_items: [{ product_id: 12, quantity: 2 }] },
        "simulate",
      );
      const result = await WOOCOMMERCE_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.simulated).toBe(true);
    });

    it("creates order in live mode", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        headers: new Headers(),
        json: async () => ({ id: 987, status: "processing", total: "49.99" }),
      } as any);

      const invocation = createMockActionInvocation(
        "woocommerce.create_order",
        "woocommerce",
        { line_items: [{ product_id: 12, quantity: 2 }] },
        "live",
        { site_url: "https://store.example.com", access_token: "wc_tok_123" },
      );
      const result = await WOOCOMMERCE_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect((result.metadata as any).id).toBe(987);
    });

    it("performs health check", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          environment: { site_title: "My WooCommerce Boutique" },
        }),
      } as any);

      const context = createMockContext("woocommerce", {
        site_url: "https://store.example.com",
        access_token: "wc_tok_123",
      });
      const health = await WOOCOMMERCE_RUNTIME_ADAPTER.healthCheck!(context);
      expect(health.healthy).toBe(true);
      expect(health.externalAccountLabel).toBe("My WooCommerce Boutique");
    });
  });

  describe("PayPal Runtime Adapter", () => {
    it("is registered properly in runtime registry", () => {
      const adapter = getIntegrationRuntimeAdapter("paypal");
      expect(adapter).toBeDefined();
      expect(adapter!.manifest.providerId).toBe("paypal");
      expect(adapter!.manifest.adapterId).toBe("j10.paypal.runtime");
      const capIds = adapter!.manifest.capabilities.map((c) => c.capabilityId);
      expect(capIds).toContain("paypal.create_invoice");
      expect(capIds).toContain("paypal.issue_refund");
      expect(capIds).toContain("paypal.capture_payment");
    });

    it("executes simulated create invoice", async () => {
      const invocation = createMockActionInvocation(
        "paypal.create_invoice",
        "paypal",
        { recipient_email: "client@example.com", amount: "150.00" },
        "simulate",
      );
      const result = await PAYPAL_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.simulated).toBe(true);
    });

    it("creates invoice in live mode", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        headers: new Headers({ "paypal-debug-id": "pp_dbg_123" }),
        json: async () => ({ id: "INV2-ABCD-1234", status: "DRAFT" }),
      } as any);

      const invocation = createMockActionInvocation(
        "paypal.create_invoice",
        "paypal",
        { recipient_email: "client@example.com", amount: "150.00" },
        "live",
        { access_token: "pp_tok_mock" },
      );
      const result = await PAYPAL_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect((result.metadata as any).id).toBe("INV2-ABCD-1234");
    });

    it("performs health check", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          name: "Global Merchants LLC",
          payer_id: "PAYER_998877",
        }),
      } as any);

      const context = createMockContext("paypal", { access_token: "pp_tok_mock" });
      const health = await PAYPAL_RUNTIME_ADAPTER.healthCheck!(context);
      expect(health.healthy).toBe(true);
      expect(health.externalAccountId).toBe("PAYER_998877");
      expect(health.externalAccountLabel).toBe("Global Merchants LLC");
    });
  });

  describe("Square Runtime Adapter", () => {
    it("is registered properly in runtime registry", () => {
      const adapter = getIntegrationRuntimeAdapter("square");
      expect(adapter).toBeDefined();
      expect(adapter!.manifest.providerId).toBe("square");
      expect(adapter!.manifest.adapterId).toBe("j10.square.runtime");
      const capIds = adapter!.manifest.capabilities.map((c) => c.capabilityId);
      expect(capIds).toContain("square.create_payment");
      expect(capIds).toContain("square.create_customer");
      expect(capIds).toContain("square.issue_refund");
    });

    it("executes simulated create customer", async () => {
      const invocation = createMockActionInvocation(
        "square.create_customer",
        "square",
        { given_name: "Alice", email_address: "alice@example.com" },
        "simulate",
      );
      const result = await SQUARE_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.simulated).toBe(true);
    });

    it("creates customer in live mode", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ customer: { id: "cust_sq_1122", given_name: "Alice" } }),
      } as any);

      const invocation = createMockActionInvocation(
        "square.create_customer",
        "square",
        { given_name: "Alice", email_address: "alice@example.com" },
        "live",
        { access_token: "sq_tok_mock" },
      );
      const result = await SQUARE_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect((result.metadata as any).customer.id).toBe("cust_sq_1122");
    });

    it("performs health check", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          merchant: { id: "merch_sq_999", business_name: "Urban Cafe POS" },
        }),
      } as any);

      const context = createMockContext("square", { access_token: "sq_tok_mock" });
      const health = await SQUARE_RUNTIME_ADAPTER.healthCheck!(context);
      expect(health.healthy).toBe(true);
      expect(health.externalAccountId).toBe("merch_sq_999");
      expect(health.externalAccountLabel).toBe("Urban Cafe POS");
    });
  });

  describe("Amazon Seller Runtime Adapter", () => {
    it("is registered properly in runtime registry", () => {
      const adapter = getIntegrationRuntimeAdapter("amazon-seller");
      expect(adapter).toBeDefined();
      expect(adapter!.manifest.providerId).toBe("amazon-seller");
      expect(adapter!.manifest.adapterId).toBe("j10.amazon-seller.runtime");
      const capIds = adapter!.manifest.capabilities.map((c) => c.capabilityId);
      expect(capIds).toContain("amazon-seller.update_inventory");
      expect(capIds).toContain("amazon-seller.update_listing");
      expect(capIds).toContain("amazon-seller.confirm_shipment");
    });

    it("executes simulated shipment confirmation", async () => {
      const invocation = createMockActionInvocation(
        "amazon-seller.confirm_shipment",
        "amazon-seller",
        { order_id: "114-1234567-8901234" },
        "simulate",
      );
      const result = await AMAZON_SELLER_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.simulated).toBe(true);
    });

    it("confirms shipment in live mode", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "x-amzn-requestid": "amz_req_777" }),
        json: async () => ({ orderId: "114-1234567-8901234", status: "SHIPPED" }),
      } as any);

      const invocation = createMockActionInvocation(
        "amazon-seller.confirm_shipment",
        "amazon-seller",
        { order_id: "114-1234567-8901234" },
        "live",
        { access_token: "amz_tok_123" },
      );
      const result = await AMAZON_SELLER_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect((result.metadata as any).status).toBe("SHIPPED");
    });

    it("performs health check", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          payload: [{ participation: { sellerId: "A2EUQ1WTGCTBG2" } }],
        }),
      } as any);

      const context = createMockContext("amazon-seller", { access_token: "amz_tok_123" });
      const health = await AMAZON_SELLER_RUNTIME_ADAPTER.healthCheck!(context);
      expect(health.healthy).toBe(true);
      expect(health.externalAccountId).toBe("A2EUQ1WTGCTBG2");
    });
  });

  describe("Etsy Runtime Adapter", () => {
    it("is registered properly in runtime registry", () => {
      const adapter = getIntegrationRuntimeAdapter("etsy");
      expect(adapter).toBeDefined();
      expect(adapter!.manifest.providerId).toBe("etsy");
      expect(adapter!.manifest.adapterId).toBe("j10.etsy.runtime");
      const capIds = adapter!.manifest.capabilities.map((c) => c.capabilityId);
      expect(capIds).toContain("etsy.create_listing");
      expect(capIds).toContain("etsy.update_inventory");
      expect(capIds).toContain("etsy.update_receipt");
    });

    it("executes simulated create listing", async () => {
      const invocation = createMockActionInvocation(
        "etsy.create_listing",
        "etsy",
        { title: "Handcrafted Ceramic Mug", price: 34.00 },
        "simulate",
      );
      const result = await ETSY_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.simulated).toBe(true);
    });

    it("creates listing in live mode", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        headers: new Headers(),
        json: async () => ({ listing_id: 11223344, title: "Handcrafted Ceramic Mug" }),
      } as any);

      const invocation = createMockActionInvocation(
        "etsy.create_listing",
        "etsy",
        { title: "Handcrafted Ceramic Mug" },
        "live",
        { access_token: "etsy_tok_123", shop_id: "shop_888" },
      );
      const result = await ETSY_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect((result.metadata as any).listing_id).toBe(11223344);
    });

    it("performs health check", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          user_id: 998877,
          primary_email: "artisan@example.com",
        }),
      } as any);

      const context = createMockContext("etsy", { access_token: "etsy_tok_123" });
      const health = await ETSY_RUNTIME_ADAPTER.healthCheck!(context);
      expect(health.healthy).toBe(true);
      expect(health.externalAccountId).toBe("998877");
      expect(health.externalAccountLabel).toBe("artisan@example.com");
    });
  });

  describe("eBay Runtime Adapter", () => {
    it("is registered properly in runtime registry", () => {
      const adapter = getIntegrationRuntimeAdapter("ebay");
      expect(adapter).toBeDefined();
      expect(adapter!.manifest.providerId).toBe("ebay");
      expect(adapter!.manifest.adapterId).toBe("j10.ebay.runtime");
      const capIds = adapter!.manifest.capabilities.map((c) => c.capabilityId);
      expect(capIds).toContain("ebay.create_listing");
      expect(capIds).toContain("ebay.update_inventory");
      expect(capIds).toContain("ebay.fulfill_order");
    });

    it("executes simulated create listing", async () => {
      const invocation = createMockActionInvocation(
        "ebay.create_listing",
        "ebay",
        { sku: "SKU_RETRO_01", title: "Vintage Camera 1978" },
        "simulate",
      );
      const result = await EBAY_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.simulated).toBe(true);
    });

    it("fulfills order in live mode", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        headers: new Headers({ rlogid: "ebay_rlog_001" }),
        json: async () => ({ fulfillmentId: "ful_ebay_999" }),
      } as any);

      const invocation = createMockActionInvocation(
        "ebay.fulfill_order",
        "ebay",
        { order_id: "order_ebay_111", tracking_number: "TRACK777" },
        "live",
        { access_token: "ebay_tok_mock" },
      );
      const result = await EBAY_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect((result.metadata as any).fulfillmentId).toBe("ful_ebay_999");
    });

    it("performs health check", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          sellerRegistrationCompleted: true,
        }),
      } as any);

      const context = createMockContext("ebay", { access_token: "ebay_tok_mock" });
      const health = await EBAY_RUNTIME_ADAPTER.healthCheck!(context);
      expect(health.healthy).toBe(true);
      expect(health.externalAccountLabel).toBe("eBay Registered Seller");
    });
  });

  describe("TikTok Shop Runtime Adapter", () => {
    it("is registered properly in runtime registry", () => {
      const adapter = getIntegrationRuntimeAdapter("tiktok-shop");
      expect(adapter).toBeDefined();
      expect(adapter!.manifest.providerId).toBe("tiktok-shop");
      expect(adapter!.manifest.adapterId).toBe("j10.tiktok-shop.runtime");
      const capIds = adapter!.manifest.capabilities.map((c) => c.capabilityId);
      expect(capIds).toContain("tiktok-shop.update_product");
      expect(capIds).toContain("tiktok-shop.update_inventory");
      expect(capIds).toContain("tiktok-shop.fulfill_order");
    });

    it("executes simulated update product", async () => {
      const invocation = createMockActionInvocation(
        "tiktok-shop.update_product",
        "tiktok-shop",
        { product_id: "prod_tts_123", product_name: "Viral Glow Serum" },
        "simulate",
      );
      const result = await TIKTOK_SHOP_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.simulated).toBe(true);
    });

    it("updates product in live mode", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "x-tts-log-id": "tts_log_123" }),
        json: async () => ({ code: 0, message: "Success", data: { product_id: "prod_tts_123" } }),
      } as any);

      const invocation = createMockActionInvocation(
        "tiktok-shop.update_product",
        "tiktok-shop",
        { product_id: "prod_tts_123", product_name: "Viral Glow Serum" },
        "live",
        { access_token: "tts_act_tok", shop_cipher: "cipher_mock" },
      );
      const result = await TIKTOK_SHOP_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect((result.metadata as any).code).toBe(0);
    });

    it("performs health check", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            shops: [{ id: "shop_tts_5544", shop_name: "Glamour Trends TikTok Shop" }],
          },
        }),
      } as any);

      const context = createMockContext("tiktok-shop", { access_token: "tts_act_tok" });
      const health = await TIKTOK_SHOP_RUNTIME_ADAPTER.healthCheck!(context);
      expect(health.healthy).toBe(true);
      expect(health.externalAccountId).toBe("shop_tts_5544");
      expect(health.externalAccountLabel).toBe("Glamour Trends TikTok Shop");
    });
  });
});
