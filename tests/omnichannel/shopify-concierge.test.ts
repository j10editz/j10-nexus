import { describe, expect, it, vi } from "vitest";
import {
  deriveShopifyEventKey,
  processShopifyConciergeEvent,
} from "@/lib/omnichannel/shopify-concierge";

describe("Shopify Post-Purchase AI Concierge Engine", () => {
  describe("1. Idempotency Key Derivation", () => {
    it("derives deterministic idempotency key per order topic", () => {
      const key1 = deriveShopifyEventKey({
        workspaceId: "ws_shopify_123",
        topic: "orders/create",
        orderId: "1001",
      });

      const key2 = deriveShopifyEventKey({
        workspaceId: "ws_shopify_123",
        topic: "orders/create",
        orderId: "1001",
      });

      expect(key1).toBe(key2);
      expect(key1).toContain("sh_orders_create_1001");
    });
  });

  describe("2. Concierge Event Processing", () => {
    function createMockSupabase() {
      return {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          insert: vi.fn().mockResolvedValue({ data: [{ id: "mock_created_id" }], error: null }),
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: "mock_thread_1" }, error: null }),
        })),
        rpc: vi.fn().mockResolvedValue({ data: { success: true }, error: null }),
      } as any;
    }

    it("processes order creation event and sends confirmation message", async () => {
      const mockSupabase = createMockSupabase();

      const result = await processShopifyConciergeEvent(mockSupabase, {
        workspaceId: "00000000-0000-0000-0000-000000000001",
        topic: "orders/create",
        orderId: "1002",
        customerName: "Elena Rostova",
        customerPhone: "+15559876543",
        totalPrice: "850.00",
        currency: "USD",
      });

      expect(result.success).toBe(true);
      expect(result.actionTaken).toBe("order_confirmation_sent");
      expect(result.targetChannel).toBe("sms");
      expect(result.messageSent).toContain("Elena");
      expect(result.messageSent).toContain("#1002");
    });

    it("processes order fulfillment event and dispatches tracking link", async () => {
      const mockSupabase = createMockSupabase();

      const result = await processShopifyConciergeEvent(mockSupabase, {
        workspaceId: "00000000-0000-0000-0000-000000000001",
        topic: "orders/fulfilled",
        orderId: "1002",
        customerName: "Elena Rostova",
        customerPhone: "+15559876543",
        trackingNumber: "1Z9999999999999999",
        trackingUrl: "https://ups.com/track/1Z9999999999999999",
      });

      expect(result.success).toBe(true);
      expect(result.actionTaken).toBe("tracking_dispatched");
      expect(result.messageSent).toContain("1Z9999999999999999");
    });

    it("processes abandoned checkout event and dispatches cart recovery link", async () => {
      const mockSupabase = createMockSupabase();

      const result = await processShopifyConciergeEvent(mockSupabase, {
        workspaceId: "00000000-0000-0000-0000-000000000001",
        topic: "checkouts/abandoned",
        checkoutId: "chk_998877",
        customerName: "Julian Vance",
        customerEmail: "julian@example.com",
        recoveryUrl: "https://j10.vip/cart?token=chk_998877",
      });

      expect(result.success).toBe(true);
      expect(result.actionTaken).toBe("cart_recovery_sent");
      expect(result.targetChannel).toBe("inbox");
      expect(result.messageSent).toContain("https://j10.vip/cart?token=chk_998877");
    });
  });
});
