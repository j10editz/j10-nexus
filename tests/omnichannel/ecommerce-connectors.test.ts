import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { SHOPIFY_RUNTIME_ADAPTER } from "@/lib/integrations/providers/shopify/adapter";
import { STRIPE_RUNTIME_ADAPTER } from "@/lib/integrations/providers/stripe/adapter";
import { getIntegrationRuntimeAdapter, listIntegrationRuntimeAdapters } from "@/lib/integrations/runtime-registry";
import type {
  IntegrationRuntimeActionInvocation,
  IntegrationRuntimeInvocationContext,
} from "@/types/integration-runtime";

function createMockContext(
  providerId: string,
  credentialsRecord: Record<string, string> = {},
  publicConfiguration: Record<string, string | number | boolean | null> = {},
): IntegrationRuntimeInvocationContext {
  return {
    requestId: "req_ecom_123",
    correlationId: "corr_ecom_123",
    userId: "usr_ecom_123",
    environment: "development",
    signal: new AbortController().signal,
    connection: {
      id: `conn_${providerId}_1`,
      workspaceId: "ws_test_ecom",
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
      publicConfiguration,
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
  publicConfiguration: Record<string, string | number | boolean | null> = {},
): IntegrationRuntimeActionInvocation {
  const context = createMockContext(providerId, credentialsRecord, publicConfiguration);
  return {
    ...context,
    capabilityId,
    mode,
    idempotencyKey: `idem_${Date.now()}`,
    input,
  };
}

describe("Batch 3 E-Commerce Connectors (Shopify & Stripe) Certification & Runtime Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. Runtime Registry Verification
  // =========================================================================
  describe("1. Runtime Registry Registration", () => {
    it("registers Shopify and Stripe in the runtime registry", () => {
      const adapters = listIntegrationRuntimeAdapters();
      const providerIds = adapters.map((a) => a.manifest.providerId);

      expect(providerIds).toContain("shopify");
      expect(providerIds).toContain("stripe");
    });

    it("retrieves adapters by exact provider ID", () => {
      const shopify = getIntegrationRuntimeAdapter("shopify");
      expect(shopify).toBeDefined();
      expect(shopify?.manifest.adapterId).toBe("j10.shopify.runtime");

      const stripe = getIntegrationRuntimeAdapter("stripe");
      expect(stripe).toBeDefined();
      expect(stripe?.manifest.adapterId).toBe("j10.stripe.runtime");
    });
  });

  // =========================================================================
  // 2. Shopify Runtime Adapter Execution
  // =========================================================================
  describe("2. Shopify Runtime Adapter", () => {
    it("executes simulated/sandbox action with mock order and inventory", async () => {
      const invocation = createMockActionInvocation(
        "shopify.inventory.lookup",
        "shopify",
        { inventory_item_id: "inv_998877" },
        "sandbox",
      );

      const result = await SHOPIFY_RUNTIME_ADAPTER.executeAction!(invocation);

      expect(result.success).toBe(true);
      expect(result.metadata.mode).toBe("sandbox");
      expect(result.metadata.inventoryItemId).toBe("inv_998877");
      expect(result.metadata.available).toBe(42);
    });

    it("adds tags to a live Shopify order via Admin REST API", async () => {
      let capturedUrl = "";
      let capturedBody: any = null;

      vi.spyOn(global, "fetch")
        .mockImplementationOnce(async () => {
          return new Response(JSON.stringify({ order: { id: "order_1001", tags: "VIP, High-Value" } }), {
            status: 200,
          });
        })
        .mockImplementationOnce(async (url, init) => {
          capturedUrl = String(url);
          capturedBody = JSON.parse(init?.body as string);
          return new Response(JSON.stringify({ order: { id: "order_1001", tags: "VIP, High-Value, J10_Qualified" } }), {
            status: 200,
          });
        });

      const invocation = createMockActionInvocation(
        "shopify.order.add_tag",
        "shopify",
        { order_id: "order_1001", tag: "J10_Qualified" },
        "live",
        { admin_access_token: "shpat_test_token_123" },
        { store_domain: "j10-apparel.myshopify.com" },
      );

      const result = await SHOPIFY_RUNTIME_ADAPTER.executeAction!(invocation);

      expect(result.success).toBe(true);
      expect(result.metadata.orderId).toBe("order_1001");
      expect(result.metadata.tags).toContain("J10_Qualified");
      expect(capturedUrl).toBe("https://j10-apparel.myshopify.com/admin/api/2024-01/orders/order_1001.json");
      expect(capturedBody.order.tags).toBe("VIP, High-Value, J10_Qualified");
    });

    it("fulfills a live Shopify order with tracking details", async () => {
      let capturedBody: any = null;

      vi.spyOn(global, "fetch").mockImplementationOnce(async (_url, init) => {
        capturedBody = JSON.parse(init?.body as string);
        return new Response(
          JSON.stringify({
            fulfillment: { id: 987654321, order_id: "order_2002", status: "success" },
          }),
          { status: 201 },
        );
      });

      const invocation = createMockActionInvocation(
        "shopify.order.fulfill",
        "shopify",
        {
          order_id: "order_2002",
          tracking_number: "1Z999AA10123456784",
          tracking_company: "UPS",
        },
        "live",
        { admin_access_token: "shpat_test_token_123" },
        { store_domain: "j10-apparel.myshopify.com" },
      );

      const result = await SHOPIFY_RUNTIME_ADAPTER.executeAction!(invocation);

      expect(result.success).toBe(true);
      expect(result.metadata.fulfillmentId).toBe(987654321);
      expect(result.metadata.status).toBe("success");
      expect(capturedBody.fulfillment.tracking_number).toBe("1Z999AA10123456784");
    });

    it("adjusts live Shopify inventory levels", async () => {
      let capturedBody: any = null;

      vi.spyOn(global, "fetch").mockImplementationOnce(async (_url, init) => {
        capturedBody = JSON.parse(init?.body as string);
        return new Response(
          JSON.stringify({
            inventory_level: { inventory_item_id: "inv_item_555", location_id: "loc_888", available: 15 },
          }),
          { status: 200 },
        );
      });

      const invocation = createMockActionInvocation(
        "shopify.inventory.adjust",
        "shopify",
        {
          inventory_item_id: "inv_item_555",
          location_id: "loc_888",
          available_adjustment: -2,
        },
        "live",
        { admin_access_token: "shpat_test_token_123" },
        { store_domain: "j10-apparel.myshopify.com" },
      );

      const result = await SHOPIFY_RUNTIME_ADAPTER.executeAction!(invocation);

      expect(result.success).toBe(true);
      expect(result.metadata.inventoryItemId).toBe("inv_item_555");
      expect(result.metadata.available).toBe(15);
      expect(capturedBody.available_adjustment).toBe(-2);
    });

    it("queries live inventory availability across locations", async () => {
      vi.spyOn(global, "fetch").mockImplementationOnce(async () => {
        return new Response(
          JSON.stringify({
            inventory_levels: [
              { inventory_item_id: 111, location_id: 10, available: 8 },
              { inventory_item_id: 111, location_id: 20, available: 12 },
            ],
          }),
          { status: 200 },
        );
      });

      const invocation = createMockActionInvocation(
        "shopify.inventory.lookup",
        "shopify",
        { inventory_item_id: "111" },
        "live",
        { admin_access_token: "shpat_test_token_123" },
        { store_domain: "j10-apparel.myshopify.com" },
      );

      const result = await SHOPIFY_RUNTIME_ADAPTER.executeAction!(invocation);

      expect(result.success).toBe(true);
      expect(result.metadata.totalAvailable).toBe(20);
      expect(result.metadata.locations).toHaveLength(2);
    });

    it("generates cart abandonment recovery link with discount code", async () => {
      const invocation = createMockActionInvocation(
        "shopify.cart.abandonment_recover",
        "shopify",
        { checkout_token: "chk_abc123xyz", discount_code: "SAVE15NOW" },
        "live",
        { admin_access_token: "shpat_test_token_123" },
        { store_domain: "j10-apparel.myshopify.com" },
      );

      const result = await SHOPIFY_RUNTIME_ADAPTER.executeAction!(invocation);

      expect(result.success).toBe(true);
      expect(result.metadata.checkoutToken).toBe("chk_abc123xyz");
      expect(result.metadata.discountCode).toBe("SAVE15NOW");
      expect(result.metadata.recoveryUrl).toBe(
        "https://j10-apparel.myshopify.com/checkouts/chk_abc123xyz?discount=SAVE15NOW",
      );
    });

    it("checks Shopify health status via shop.json query", async () => {
      vi.spyOn(global, "fetch").mockImplementationOnce(async () => {
        return new Response(
          JSON.stringify({
            shop: {
              id: 99887766,
              name: "J10 Luxury Boutique",
              currency: "USD",
              email: "support@j10nexus.com",
            },
          }),
          { status: 200 },
        );
      });

      const context = createMockContext(
        "shopify",
        { admin_access_token: "shpat_valid_token" },
        { store_domain: "j10-luxury.myshopify.com" },
      );

      const health = await SHOPIFY_RUNTIME_ADAPTER.healthCheck!(context);

      expect(health.healthy).toBe(true);
      expect(health.externalAccountLabel).toBe("J10 Luxury Boutique");
      expect(health.metadata.currency).toBe("USD");
    });
  });

  // =========================================================================
  // 3. Stripe Runtime Adapter Execution
  // =========================================================================
  describe("3. Stripe Runtime Adapter", () => {
    it("executes simulated/sandbox action with mock payment link and sub", async () => {
      const invocation = createMockActionInvocation(
        "stripe.subscription.sync",
        "stripe",
        { customer_id: "cus_sim_123" },
        "sandbox",
      );

      const result = await STRIPE_RUNTIME_ADAPTER.executeAction!(invocation);

      expect(result.success).toBe(true);
      expect(result.metadata.mode).toBe("sandbox");
      expect(result.metadata.status).toBe("active");
      expect(result.metadata.tier).toBe("pro");
    });

    it("creates a live Stripe payment link", async () => {
      let capturedUrl = "";
      let capturedBody: any = null;

      vi.spyOn(global, "fetch").mockImplementationOnce(async (url, init) => {
        capturedUrl = String(url);
        capturedBody = init?.body;
        return new Response(
          JSON.stringify({
            id: "plink_1NxyzLive99",
            url: "https://buy.stripe.com/test_1NxyzLive99",
            active: true,
          }),
          { status: 200 },
        );
      });

      const invocation = createMockActionInvocation(
        "stripe.payment_link.create",
        "stripe",
        { price_id: "price_1Nxyz999", quantity: 1 },
        "live",
        { secret_key: "sk_test_51MockStripeKey" },
      );

      const result = await STRIPE_RUNTIME_ADAPTER.executeAction!(invocation);

      expect(result.success).toBe(true);
      expect(result.metadata.paymentLinkId).toBe("plink_1NxyzLive99");
      expect(result.metadata.url).toBe("https://buy.stripe.com/test_1NxyzLive99");
      expect(capturedUrl).toBe("https://api.stripe.com/v1/payment_links");
      expect(capturedBody).toContain("price_1Nxyz999");
    });

    it("processes a live Stripe payment refund", async () => {
      vi.spyOn(global, "fetch").mockImplementationOnce(async () => {
        return new Response(
          JSON.stringify({
            id: "re_1NabcRefund99",
            status: "succeeded",
            amount: 4900,
            currency: "usd",
          }),
          { status: 200 },
        );
      });

      const invocation = createMockActionInvocation(
        "stripe.payment.refund",
        "stripe",
        { payment_intent: "pi_3NxyzIntent99", amount: 4900 },
        "live",
        { secret_key: "sk_test_51MockStripeKey" },
      );

      const result = await STRIPE_RUNTIME_ADAPTER.executeAction!(invocation);

      expect(result.success).toBe(true);
      expect(result.metadata.refundId).toBe("re_1NabcRefund99");
      expect(result.metadata.amount).toBe(4900);
    });

    it("cancels a live Stripe subscription", async () => {
      let capturedUrl = "";

      vi.spyOn(global, "fetch").mockImplementationOnce(async (url) => {
        capturedUrl = String(url);
        return new Response(
          JSON.stringify({
            id: "sub_1NxyzSub99",
            status: "canceled",
            canceled_at: 1715000000,
          }),
          { status: 200 },
        );
      });

      const invocation = createMockActionInvocation(
        "stripe.subscription.cancel",
        "stripe",
        { subscription_id: "sub_1NxyzSub99" },
        "live",
        { secret_key: "sk_test_51MockStripeKey" },
      );

      const result = await STRIPE_RUNTIME_ADAPTER.executeAction!(invocation);

      expect(result.success).toBe(true);
      expect(result.metadata.subscriptionId).toBe("sub_1NxyzSub99");
      expect(result.metadata.status).toBe("canceled");
      expect(capturedUrl).toBe("https://api.stripe.com/v1/subscriptions/sub_1NxyzSub99");
    });

    it("synchronizes customer subscription state & entitlements", async () => {
      vi.spyOn(global, "fetch").mockImplementationOnce(async () => {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: "sub_live_cust_111",
                status: "active",
                current_period_end: 1720000000,
              },
            ],
          }),
          { status: 200 },
        );
      });

      const invocation = createMockActionInvocation(
        "stripe.subscription.sync",
        "stripe",
        { customer_id: "cus_998877" },
        "live",
        { secret_key: "sk_test_51MockStripeKey" },
      );

      const result = await STRIPE_RUNTIME_ADAPTER.executeAction!(invocation);

      expect(result.success).toBe(true);
      expect(result.metadata.customerId).toBe("cus_998877");
      expect(result.metadata.hasActiveSubscription).toBe(true);
      expect(result.metadata.activeSubscriptionId).toBe("sub_live_cust_111");
      expect(result.metadata.status).toBe("active");
    });

    it("checks Stripe API health with balance endpoint", async () => {
      vi.spyOn(global, "fetch").mockImplementationOnce(async () => {
        return new Response(
          JSON.stringify({
            available: [{ amount: 845000, currency: "usd" }],
            livemode: true,
          }),
          { status: 200 },
        );
      });

      const context = createMockContext("stripe", { secret_key: "sk_live_valid_key" });
      const health = await STRIPE_RUNTIME_ADAPTER.healthCheck!(context);

      expect(health.healthy).toBe(true);
      expect(health.externalAccountLabel).toBe("Stripe Payments & Billing API");
      expect(health.metadata.currency).toBe("usd");
      expect(health.metadata.livemode).toBe(true);
    });
  });
});
