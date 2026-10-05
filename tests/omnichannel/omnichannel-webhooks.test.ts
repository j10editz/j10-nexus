import { describe, expect, it, vi, beforeEach } from "vitest";
import { POST as handleTwilioPost } from "@/app/api/webhooks/twilio/sms/route";
import { GET as handleInstagramGet, POST as handleInstagramPost } from "@/app/api/webhooks/instagram/messages/route";
import { POST as handleShopifyPost } from "@/app/api/webhooks/shopify/orders/route";
import { hmacSha256Hex, hmacSha256Base64 } from "@/lib/integrations/webhooks/crypto";

vi.mock("@/lib/integrations/webhooks/service-client", () => ({
  createWebhookServiceClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockResolvedValue({ data: [{ id: "mock_row_1" }], error: null }),
      update: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ data: [{ id: "mock_row_1" }], error: null }),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: "mock_single_1" }, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: "int_test_1", workspace_id: "00000000-0000-0000-0000-000000000001" },
        error: null,
      }),
    })),
    rpc: vi.fn().mockResolvedValue({
      data: {
        success: true,
        intake_id: "intake_test_1",
        contact_id: "contact_test_1",
        thread_id: "thread_test_1",
        message_id: "msg_test_1",
        canonical_event_id: null,
      },
      error: null,
    }),
  })),
}));

describe("Omnichannel Live Webhook Smoke & Ingress Verification", () => {
  describe("1. Twilio Inbound SMS Webhook", () => {
    it("parses valid JSON Twilio SMS payload and accepts with 200", async () => {
      const payload = {
        MessageSid: "SM_mock_live_12345",
        From: "+15551112233",
        To: "+15559990000",
        Body: "I want to schedule an executive audit.",
        FromCity: "Miami",
      };

      const req = new Request("https://j10.vip/api/webhooks/twilio/sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const res = await handleTwilioPost(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.messageSid).toBe("SM_mock_live_12345");
      expect(json.threadId).toBeDefined();
    });

    it("rejects invalid payload missing required fields", async () => {
      const req = new Request("https://j10.vip/api/webhooks/twilio/sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ Body: "missing sender" }),
      });

      const res = await handleTwilioPost(req);
      expect(res.status).toBe(400);
    });
  });

  describe("2. Instagram Direct Messages Webhook", () => {
    beforeEach(() => {
      process.env.META_INSTAGRAM_VERIFY_TOKEN = "test_ig_verify_token";
      process.env.META_INSTAGRAM_APP_SECRET = "test_ig_app_secret";
    });

    it("verifies GET challenge token correctly", async () => {
      const req = new Request(
        "https://j10.vip/api/webhooks/instagram/messages?hub.mode=subscribe&hub.verify_token=test_ig_verify_token&hub.challenge=11223344",
        { method: "GET" }
      );

      const res = await handleInstagramGet(req);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toBe("11223344");
    });

    it("verifies and processes signed inbound Instagram DM with 200 Fast ACK", async () => {
      const payload = {
        object: "instagram",
        entry: [
          {
            id: "ig_page_1",
            time: Date.now(),
            messaging: [
              {
                sender: { id: "ig_user_777", username: "lux_collector" },
                recipient: { id: "ig_page_1" },
                message: { mid: "mid_ig_live_100", text: "Is the private vault open?" },
              },
            ],
          },
        ],
      };

      const rawBody = JSON.stringify(payload);
      const signature = hmacSha256Hex("test_ig_app_secret", rawBody);

      const req = new Request("https://j10.vip/api/webhooks/instagram/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-hub-signature-256": `sha256=${signature}`,
        },
        body: rawBody,
      });

      const res = await handleInstagramPost(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.messageMid).toBe("mid_ig_live_100");
    });
  });

  describe("3. Shopify Orders & Checkout Webhook", () => {
    beforeEach(() => {
      process.env.SHOPIFY_WEBHOOK_SIGNING_SECRET = "test_shopify_secret";
    });

    it("verifies signed Shopify order creation event with HMAC-SHA256 Base64", async () => {
      const payload = {
        id: 998811,
        total_price: "1250.00",
        currency: "USD",
        customer: {
          first_name: "Victoria",
          last_name: "Sterling",
          email: "victoria@example.com",
          phone: "+15552223344",
        },
      };

      const rawBody = JSON.stringify(payload);
      const hmac = hmacSha256Base64("test_shopify_secret", rawBody);

      const req = new Request("https://j10.vip/api/webhooks/shopify/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-shopify-topic": "orders/create",
          "x-shopify-shop-domain": "j10-exclusive.myshopify.com",
          "x-shopify-hmac-sha256": hmac,
        },
        body: rawBody,
      });

      const res = await handleShopifyPost(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.orderId).toBe("998811");
      expect(json.jobEnqueued).toBe(true);
    });
  });
});
