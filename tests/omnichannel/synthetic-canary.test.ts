import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  detectEscalationTrigger,
  processOmnichannelSecretaryResponse,
} from "@/lib/omnichannel/secretary-engine";
import {
  listDeadLetterEvents,
  replayDeadLetterEvent,
  resolveDeadLetterEvent,
} from "@/lib/integrations/dlq";

describe("Omnichannel Synthetic Canary & DLQ Certification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Multi-Agent SLA Escalation & Takeover Rules", () => {
    it("detects urgent escalation for human takeover keywords", () => {
      const urgentSamples = [
        "Can I please speak to a human representative?",
        "I need a manager immediately, this is urgent!",
        "I will get my lawyer involved if this is not resolved",
        "Please cancel my account and issue a refund",
        "/human please help",
        "I want to talk to someone right now",
      ];

      for (const text of urgentSamples) {
        const result = detectEscalationTrigger(text);
        expect(result.isEscalated).toBe(true);
        expect(result.priority).toBe("urgent");
        expect(result.reason).toContain("Human operator takeover requested");
      }
    });

    it("detects high priority for high-value commercial inquiries", () => {
      const highSamples = [
        "What is your enterprise pricing for 50 seats?",
        "We want to review the custom proposal and contract",
        "I need a demo of your partnership tier",
        "There is a billing issue on our latest invoice",
      ];

      for (const text of highSamples) {
        const result = detectEscalationTrigger(text);
        expect(result.isEscalated).toBe(true);
        expect(result.priority).toBe("high");
        expect(result.reason).toContain("High-value VIP inquiry");
      }
    });

    it("keeps normal operational inquiries at standard priority without escalation", () => {
      const normalSamples = [
        "What are your business hours?",
        "Can you send me the tracking link for my order?",
        "Thank you, that was very helpful!",
        "Where is your office located?",
      ];

      for (const text of normalSamples) {
        const result = detectEscalationTrigger(text);
        expect(result.isEscalated).toBe(false);
        expect(result.priority).toBe("medium");
      }
    });

    it("executes secretary response with automatic thread escalation and takeover notice", async () => {
      const mockInsert = vi.fn().mockResolvedValue({ data: null, error: null });
      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      });

      const mockSupabase: any = {
        from: (table: string) => {
          if (table === "workspaces") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { name: "Apex Global", settings: { ai_persona: { bot_name: "Apex Concierge" } } },
                  }),
                }),
              }),
            };
          }
          if (table === "inbox_messages") {
            return {
              select: () => ({
                eq: () => ({
                  order: () => ({
                    limit: async () => ({ data: [] }),
                  }),
                }),
              }),
              insert: mockInsert,
            };
          }
          if (table === "inbox_threads") {
            return {
              update: mockUpdate,
            };
          }
          return {
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        },
      };

      const result = await processOmnichannelSecretaryResponse(mockSupabase, {
        workspaceId: "ws_test_escalation",
        channel: "twilio_sms",
        threadId: "thread_esc_123",
        recipientIdentifier: "+15550001111",
        inboundText: "I want to speak with a human supervisor right now regarding a dispute",
        senderName: "VIP Client",
      });

      expect(result.success).toBe(true);
      expect(result.isEscalated).toBe(true);
      expect(result.replyText).toContain("escalated your inquiry directly to our senior human concierge team");
      expect(mockInsert).toHaveBeenCalledTimes(1);
      expect(mockUpdate).toHaveBeenCalledTimes(1);
    });
  });

  describe("2. Dead-Letter Queue (DLQ) Ingress Engine", () => {
    it("lists dead-letter events and calculates aggregate health summary", async () => {
      const mockEvents = [
        {
          id: "evt_fail_1",
          endpoint_id: "ep_1",
          integration_id: "int_1",
          user_id: "usr_1",
          provider: "shopify",
          request_id: "req_1",
          event_type: "orders/create",
          external_event_id: "order_999",
          replay_key: "rep_1",
          signature_status: "valid",
          processing_status: "failed",
          payload_sha256: "a".repeat(64),
          payload: { id: 999, total_price: "240.00" },
          headers: { "x-shopify-topic": "orders/create" },
          occurred_at: new Date().toISOString(),
          received_at: new Date().toISOString(),
          processed_at: null,
          failure_code: "CUSTOMER_NOT_FOUND",
          failure_message: "Shopify customer record unresolvable",
          attempt_count: 2,
          max_attempts: 5,
          retryable: true,
          next_retry_at: new Date(Date.now() + 60000).toISOString(),
          last_attempted_at: new Date().toISOString(),
          last_error_at: new Date().toISOString(),
        },
      ];

      const mockSupabase: any = {
        from: (table: string) => {
          if (table === "integration_webhook_events") {
            return {
              select: () => ({
                eq: () => ({
                  in: () => ({
                    order: () => ({
                      limit: async () => ({ data: mockEvents, error: null }),
                    }),
                  }),
                  limit: async () => ({
                    data: [
                      { processing_status: "failed", retryable: true },
                      { processing_status: "processed", retryable: false },
                      { processing_status: "processed", retryable: false },
                    ],
                  }),
                }),
              }),
            };
          }
          return {};
        },
      };

      const result = await listDeadLetterEvents(mockSupabase, "usr_1");
      expect(result.items.length).toBe(1);
      expect(result.items[0].provider).toBe("shopify");
      expect(result.items[0].failureCode).toBe("CUSTOMER_NOT_FOUND");
      expect(result.summary.totalFailed).toBe(1);
      expect(result.summary.totalRetryable).toBe(1);
      expect(result.summary.totalProcessed).toBe(2);
      expect(result.summary.queueHealthPercent).toBe(67);
    });

    it("replays a dead-letter event and transitions status to processed", async () => {
      const mockEvent = {
        id: "evt_replay_test",
        endpoint_id: "ep_shopify",
        integration_id: "int_shopify_123",
        user_id: "usr_test",
        provider: "shopify",
        request_id: "req_replay",
        event_type: "orders/create",
        external_event_id: "ord_1001",
        replay_key: "rep_ord_1001",
        signature_status: "valid",
        processing_status: "failed",
        payload_sha256: "b".repeat(64),
        payload: {
          id: 1001,
          total_price: "450.00",
          currency: "USD",
          email: "buyer@example.com",
          customer: { first_name: "Jane", last_name: "Doe" },
        },
        headers: { "x-shopify-topic": "orders/create" },
        attempt_count: 1,
        max_attempts: 5,
        retryable: true,
      };

      const mockDbUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      });

      const mockSupabase: any = {
        from: (table: string) => {
          if (table === "integration_webhook_events") {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({ data: mockEvent, error: null }),
                  }),
                }),
              }),
              update: mockDbUpdate,
            };
          }
          if (table === "workspaces") {
            return {
              select: () => ({
                eq: () => ({
                  order: () => ({
                    limit: () => ({
                      maybeSingle: async () => ({ data: { id: "ws_test_replay" } }),
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === "integration_operation_logs") {
            return {
              insert: vi.fn().mockResolvedValue({ data: null, error: null }),
            };
          }
          return {
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        },
        rpc: (fn: string) => {
          if (fn === "record_lead_intake") {
            return Promise.resolve({
              data: {
                success: true,
                intake_id: "intake_replay_1",
                thread_id: "thread_replay_1",
                contact_id: "contact_replay_1",
              },
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        },
      };

      const result = await replayDeadLetterEvent(mockSupabase, "usr_test", "evt_replay_test");
      expect(result.success).toBe(true);
      expect(result.processingStatus).toBe("processed");
      expect(result.attemptCount).toBe(2);
      expect(mockDbUpdate).toHaveBeenCalled();
    });

    it("marks dead-letter event as resolved by operator", async () => {
      const mockSupabase: any = {
        from: () => ({
          update: () => ({
            eq: () => ({
              eq: async () => ({ data: null, error: null }),
            }),
          }),
        }),
      };

      const result = await resolveDeadLetterEvent(mockSupabase, "usr_test", "evt_manual_res", "Verified invalid test webhook");
      expect(result.success).toBe(true);
      expect(result.message).toContain("marked as resolved");
    });
  });
});
