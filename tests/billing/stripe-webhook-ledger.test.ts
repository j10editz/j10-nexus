import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import {
  processStripeWebhookEvent,
  verifyStripeWebhookSignature,
} from "@/lib/billing/stripe-webhook";
import { createStripePaymentLink } from "@/lib/stripe";

describe("Stripe Webhook Idempotency, Tenant Isolation & Payment Ledger", () => {
  const testSecret = "whsec_test_secret_stripe_12345";

  function generateValidHeader(rawBody: string, timestamp = Math.floor(Date.now() / 1000)) {
    const payload = `${timestamp}.${rawBody}`;
    const sig = createHmac("sha256", testSecret).update(payload).digest("hex");
    return {
      header: `t=${timestamp},v1=${sig}`,
      timestamp,
    };
  }

  describe("A. Webhook Signature Security", () => {
    it("accepts authentic signed webhook deliveries within time tolerance", () => {
      const body = JSON.stringify({ id: "evt_test_101", type: "checkout.session.completed" });
      const { header, timestamp } = generateValidHeader(body);

      const verification = verifyStripeWebhookSignature({
        rawBody: body,
        signatureHeader: header,
        secret: testSecret,
        now: timestamp * 1000,
      });

      expect(verification.valid).toBe(true);
      expect(verification.error).toBeUndefined();
    });

    it("rejects forged or modified payloads with invalid signature", () => {
      const originalBody = JSON.stringify({ id: "evt_test_101", amount: 4800 });
      const tamperedBody = JSON.stringify({ id: "evt_test_101", amount: 0 });
      const { header, timestamp } = generateValidHeader(originalBody);

      const verification = verifyStripeWebhookSignature({
        rawBody: tamperedBody,
        signatureHeader: header,
        secret: testSecret,
        now: timestamp * 1000,
      });

      expect(verification.valid).toBe(false);
      expect(verification.error).toContain("failed");
    });
  });

  describe("B. Webhook Idempotency & Duplicate Prevention", () => {
    it("returns idempotent=true and skips processing for already processed events", async () => {
      const processedEvents = new Map<string, string>([
        ["evt_duplicate_999", "processed"],
      ]);

      const mockSupabase = {
        from: (table: string) => {
          if (table === "webhook_events") {
            return {
              select: () => ({
                eq: (_col1: string, _val1: string) => ({
                  eq: (_col2: string, val2: string) => ({
                    maybeSingle: () => {
                      if (processedEvents.has(val2)) {
                        return Promise.resolve({
                          data: { id: "we_existing_1", processing_status: "processed" },
                          error: null,
                        });
                      }
                      return Promise.resolve({ data: null, error: null });
                    },
                  }),
                }),
              }),
              upsert: () => Promise.resolve({ error: null }),
            };
          }
          throw new Error(`Unexpected table access: ${table}`);
        },
      };

      const duplicateEvent = {
        id: "evt_duplicate_999",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_duplicate_session",
          },
        },
      };

      const result = await processStripeWebhookEvent(mockSupabase as any, duplicateEvent);

      expect(result.processed).toBe(true);
      expect(result.idempotent).toBe(true);
      expect(result.action).toBe("already_processed");
    });
  });

  describe("C. Checkout Session Completed & Ledger Recording", () => {
    it("reconciles checkout, updates payment ledger, and appends inbox confirmation", async () => {
      let updatedCheckoutStatus = "";
      let createdLedgerRecord: any = null;
      let createdInboxMessage: any = null;
      let updatedThreadStage = "";

      const mockCheckout = {
        id: "chk_internal_555",
        workspace_id: "ws-workspace-alpha",
        thread_id: "thread-wa-alpha",
        contact_id: "con-marcus-1",
        amount: 4800,
        currency: "USD",
        status: "pending",
        checkout_url: "https://checkout.stripe.com/pay/cs_test_555",
      };

      const mockSupabase = {
        from: (table: string) => {
          if (table === "webhook_events") {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: () => Promise.resolve({ data: null, error: null }),
                  }),
                }),
              }),
              upsert: () => Promise.resolve({ error: null }),
              update: () => ({
                eq: () => ({
                  eq: () => Promise.resolve({ error: null }),
                }),
              }),
            };
          }

          if (table === "payment_checkouts") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: () => Promise.resolve({ data: mockCheckout, error: null }),
                }),
              }),
              update: (payload: any) => {
                updatedCheckoutStatus = payload.status;
                return {
                  eq: () => Promise.resolve({ error: null }),
                };
              },
            };
          }

          if (table === "payment_ledger") {
            return {
              insert: (payload: any) => {
                createdLedgerRecord = payload;
                return {
                  select: () => ({
                    single: () => Promise.resolve({ data: { id: "led_auto_101" }, error: null }),
                  }),
                };
              },
            };
          }

          if (table === "inbox_messages") {
            return {
              insert: (payload: any) => {
                createdInboxMessage = payload;
                return Promise.resolve({ error: null });
              },
            };
          }

          if (table === "inbox_threads") {
            return {
              update: (payload: any) => {
                updatedThreadStage = payload.metadata?.dealStage;
                return {
                  eq: () => ({
                    eq: () => Promise.resolve({ error: null }),
                  }),
                };
              },
            };
          }

          if (table === "contacts") {
            return {
              update: () => ({
                eq: () => ({
                  eq: () => Promise.resolve({ error: null }),
                }),
              }),
            };
          }

          throw new Error(`Unexpected table: ${table}`);
        },
      };

      const checkoutEvent = {
        id: "evt_stripe_live_checkout_completed",
        type: "checkout.session.completed",
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: "cs_test_555",
            amount_total: 480000, // in cents
            currency: "usd",
            payment_intent: "pi_stripe_succeeded_888",
            metadata: {
              workspace_id: "ws-workspace-alpha",
              thread_id: "thread-wa-alpha",
              contact_id: "con-marcus-1",
              internal_checkout_id: "chk_internal_555",
            },
            customer_details: {
              email: "marcus@aegis.com",
            },
          },
        },
      };

      const result = await processStripeWebhookEvent(mockSupabase as any, checkoutEvent);

      expect(result.processed).toBe(true);
      expect(result.action).toBe("checkout_completed");
      expect(result.checkoutId).toBe("chk_internal_555");
      expect(result.ledgerId).toBe("led_auto_101");

      // Verify payment_checkouts updated
      expect(updatedCheckoutStatus).toBe("paid");

      // Verify payment_ledger entry
      expect(createdLedgerRecord.workspace_id).toBe("ws-workspace-alpha");
      expect(createdLedgerRecord.amount).toBe(4800);
      expect(createdLedgerRecord.currency).toBe("USD");
      expect(createdLedgerRecord.status).toBe("succeeded");
      expect(createdLedgerRecord.provider_event_id).toBe("evt_stripe_live_checkout_completed");

      // Verify inbox message appended
      expect(createdInboxMessage.workspace_id).toBe("ws-workspace-alpha");
      expect(createdInboxMessage.thread_id).toBe("thread-wa-alpha");
      expect(createdInboxMessage.direction).toBe("outbound");
      expect(createdInboxMessage.message_type).toBe("system");
      expect(createdInboxMessage.content).toContain("$4,800.00 USD");
      expect(createdInboxMessage.metadata?.ledgerVerified).toBe(true);

      // Verify thread dealStage updated
      expect(updatedThreadStage).toBe("won");
    });
  });

  describe("D. Cross-Tenant Tampering Protection", () => {
    it("quarantines and rejects events with conflicting workspace_id metadata", async () => {
      let quarantinedStatus = "";
      let quarantinedErrorCode = "";

      const mockCheckoutInWorkspaceA = {
        id: "chk_workspace_a",
        workspace_id: "ws-workspace-A",
        thread_id: "thread-a",
        amount: 2500,
        currency: "USD",
        status: "pending",
      };

      const mockSupabase = {
        from: (table: string) => {
          if (table === "webhook_events") {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: () => Promise.resolve({ data: null, error: null }),
                  }),
                }),
              }),
              upsert: () => Promise.resolve({ error: null }),
              update: (payload: any) => {
                quarantinedStatus = payload.processing_status;
                quarantinedErrorCode = payload.error_code;
                return {
                  eq: () => ({
                    eq: () => Promise.resolve({ error: null }),
                  }),
                };
              },
            };
          }

          if (table === "payment_checkouts") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: () => Promise.resolve({ data: mockCheckoutInWorkspaceA, error: null }),
                }),
              }),
            };
          }

          throw new Error(`Unexpected table: ${table}`);
        },
      };

      // Attacker attempts to forge metadata claiming event belongs to Workspace B
      const maliciousEvent = {
        id: "evt_malicious_cross_tenant",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_tampered_session",
            amount_total: 250000,
            metadata: {
              workspace_id: "ws-workspace-B", // Discrepancy! Checkout belongs to ws-workspace-A
              internal_checkout_id: "chk_workspace_a",
            },
          },
        },
      };

      const result = await processStripeWebhookEvent(mockSupabase as any, maliciousEvent);

      expect(result.processed).toBe(false);
      expect(result.action).toBe("quarantined");
      expect(result.error).toContain("Tenant metadata mismatch");
      expect(quarantinedStatus).toBe("failed");
      expect(quarantinedErrorCode).toBe("TENANT_MISMATCH");
    });
  });

  describe("E. Sandbox vs Live Structure Separation", () => {
    it("clearly tags simulated sessions with provider_mode=sandbox", async () => {
      const sandboxSession = await createStripePaymentLink({
        title: "Test Sandbox Rollout",
        amount: 1500,
      });

      expect(sandboxSession.mode).toBe("simulated");
      expect(sandboxSession.provider_mode).toBe("sandbox");
      expect(sandboxSession.sessionId).toMatch(/^cs_test_/);
      expect(sandboxSession.checkoutUrl).toContain("checkout.stripe.com");
    });
  });
});
