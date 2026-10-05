import { describe, expect, it, vi } from "vitest";
import { adaptIntegrationWebhookEvent } from "@/lib/integrations/external-trigger-adapter";
import {
  dispatchTwilioInboundMessage,
  dispatchInstagramInboundMessage,
  dispatchShopifyOrderEvent,
} from "@/lib/omnichannel/dispatcher";
import type { IntegrationWebhookEvent } from "@/types/integration-webhook";

describe("Unified Omnichannel Queue Routing & Dispatcher", () => {
  describe("1. External Trigger Webhook Adapter Invariants", () => {
    it("adapts inbound Twilio SMS webhook to canonical external trigger", () => {
      const webhookEvent: IntegrationWebhookEvent = {
        id: "evt_tw_123",
        workspaceId: "ws_omni_test",
        endpointId: "ep_tw_123",
        integrationId: "int_tw_123",
        providerId: "twilio",
        userId: "ws_omni_test",
        eventType: "sms_received",
        externalEventId: "SM1234567890abcdef",
        requestId: "req_tw_1",
        receivedAt: new Date().toISOString(),
        occurredAt: new Date().toISOString(),
        headers: { "x-twilio-signature": "sig_valid" },
        payload: {
          MessageSid: "SM1234567890abcdef",
          From: "+15551234567",
          To: "+15559876543",
          Body: "Hi J10, I want to book an executive consultation",
          FromCity: "Miami",
          FromState: "FL",
        },
        payloadSha256: "sha256_tw_mock",
        signatureStatus: "valid",
        replayKey: "replay_tw_123",
        attemptCount: 1,
        maxAttempts: 3,
        processingStatus: "adapted",
        normalizedEvent: null,
        adaptedAt: null,
        processedAt: null,
        failureCode: null,
        failureMessage: null,
        retryable: true,
        nextRetryAt: null,
        lastAttemptedAt: null,
        lastErrorAt: null,
      };

      const trigger = adaptIntegrationWebhookEvent(webhookEvent);
      expect(trigger.capabilityId).toBe("twilio.message.received");
      expect(trigger.workspaceId).toBe("ws_omni_test");
      expect(trigger.subject.type).toBe("twilio_sms");
      expect(trigger.actor?.id).toBe("+15551234567");
      expect(trigger.data.body).toContain("executive consultation");
    });

    it("adapts inbound Instagram DM webhook to canonical external trigger", () => {
      const webhookEvent: IntegrationWebhookEvent = {
        id: "evt_ig_123",
        workspaceId: "ws_omni_test",
        endpointId: "ep_ig_123",
        integrationId: "int_ig_123",
        providerId: "instagram-business",
        userId: "ws_omni_test",
        eventType: "message_received",
        externalEventId: "mid_ig_999",
        requestId: "req_ig_1",
        receivedAt: new Date().toISOString(),
        occurredAt: new Date().toISOString(),
        headers: { "x-hub-signature-256": "sha256=sig_valid" },
        payload: {
          object: "instagram",
          entry: [
            {
              id: "ig_account_1",
              time: Date.now(),
              messaging: [
                {
                  sender: { id: "ig_user_456", username: "vip_buyer" },
                  recipient: { id: "ig_account_1" },
                  message: { mid: "mid_ig_999", text: "What are your concierge rates?" },
                },
              ],
            },
          ],
        },
        payloadSha256: "sha256_ig_mock",
        signatureStatus: "valid",
        replayKey: "replay_ig_123",
        attemptCount: 1,
        maxAttempts: 3,
        processingStatus: "adapted",
        normalizedEvent: null,
        adaptedAt: null,
        processedAt: null,
        failureCode: null,
        failureMessage: null,
        retryable: true,
        nextRetryAt: null,
        lastAttemptedAt: null,
        lastErrorAt: null,
      };

      const trigger = adaptIntegrationWebhookEvent(webhookEvent);
      expect(trigger.capabilityId).toBe("instagram.message.received");
      expect(trigger.workspaceId).toBe("ws_omni_test");
      expect(trigger.subject.type).toBe("instagram_message");
      expect(trigger.actor?.label).toBe("vip_buyer");
      expect(trigger.data.text).toContain("concierge rates");
    });
  });

  describe("2. Unified Omnichannel Dispatcher Pipeline", () => {
    function createMockSupabase() {
      return {
        rpc: vi.fn((proc: string) => {
          if (proc === "record_lead_intake") {
            return Promise.resolve({
              data: {
                success: true,
                intake_id: "intake_mock_123",
                contact_id: "contact_mock_123",
                thread_id: "thread_mock_123",
                message_id: "msg_mock_123",
                canonical_event_id: null,
              },
              error: null,
            });
          }
          return Promise.resolve({ data: { success: true }, error: null });
        }),
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          insert: vi.fn().mockResolvedValue({ data: [{ id: "mock_inserted_id" }], error: null }),
          update: vi.fn().mockReturnThis(),
          upsert: vi.fn().mockResolvedValue({ data: [{ id: "mock_upserted_id" }], error: null }),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { id: "mock_single_id" }, error: null }),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
      } as any;
    }

    it("dispatches Twilio SMS through canonical lead intake and inbox queues", async () => {
      const mockSupabase = createMockSupabase();

      const result = await dispatchTwilioInboundMessage(mockSupabase, {
        workspaceId: "00000000-0000-0000-0000-000000000001",
        fromPhone: "+1 (555) 345-6789",
        toPhone: "+1 (555) 999-0000",
        body: "Interested in the enterprise plan",
        messageSid: "SM_test_999",
      });

      expect(result.success).toBe(true);
      expect(result.channel).toBe("twilio_sms");
      expect(result.jobEnqueued).toBe(true);
    });

    it("dispatches Instagram DM through canonical lead intake and inbox queues", async () => {
      const mockSupabase = createMockSupabase();

      const result = await dispatchInstagramInboundMessage(mockSupabase, {
        workspaceId: "00000000-0000-0000-0000-000000000001",
        senderId: "17841400000000000",
        recipientId: "17841499999999999",
        text: "Please send portfolio link",
        messageMid: "mid.123456789",
        senderUsername: "celebrity_client",
      });

      expect(result.success).toBe(true);
      expect(result.channel).toBe("instagram_dm");
      expect(result.jobEnqueued).toBe(true);
    });

    it("dispatches Shopify Order Event into the unified follow-up queue", async () => {
      const mockSupabase = createMockSupabase();

      const result = await dispatchShopifyOrderEvent(mockSupabase, {
        workspaceId: "00000000-0000-0000-0000-000000000001",
        topic: "orders/create",
        orderId: "1001",
        customerEmail: "buyer@example.com",
        customerPhone: "+15554443322",
        customerName: "Alex Mercer",
        totalPrice: "499.00",
        currency: "USD",
      });

      expect(result.success).toBe(true);
      expect(result.channel).toBe("shopify_event");
      expect(result.jobEnqueued).toBe(true);
    });
  });
});
