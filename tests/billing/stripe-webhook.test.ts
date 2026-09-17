import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import {
  processStripeSubscriptionEvent,
  processStripeWebhookEvent,
  resolvePlanLimits,
  verifyStripeWebhookSignature,
} from "@/lib/billing/stripe-webhook";

describe("Stripe Webhook and Subscription Synchronization", () => {
  const testSecret = "whsec_test_secret_12345";

  function makeValidHeader(rawBody: string, timestamp = Math.floor(Date.now() / 1000)) {
    const payload = `${timestamp}.${rawBody}`;
    const sig = createHmac("sha256", testSecret).update(payload).digest("hex");
    return {
      header: `t=${timestamp},v1=${sig}`,
      timestamp,
    };
  }

  it("verifies authentic Stripe webhook signatures successfully", () => {
    const rawBody = JSON.stringify({ id: "evt_123", type: "customer.subscription.created" });
    const { header, timestamp } = makeValidHeader(rawBody);

    const result = verifyStripeWebhookSignature({
      rawBody,
      signatureHeader: header,
      secret: testSecret,
      now: timestamp * 1000,
    });

    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("rejects missing or malformed signatures", () => {
    const rawBody = "{}";

    const missing = verifyStripeWebhookSignature({
      rawBody,
      signatureHeader: null,
      secret: testSecret,
    });
    expect(missing.valid).toBe(false);
    expect(missing.error).toContain("Missing");

    const malformed = verifyStripeWebhookSignature({
      rawBody,
      signatureHeader: "bad-header",
      secret: testSecret,
    });
    expect(malformed.valid).toBe(false);
    expect(malformed.error).toContain("Malformed");
  });

  it("rejects expired timestamps outside the 5-minute tolerance window", () => {
    const rawBody = "{}";
    const oldTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
    const { header } = makeValidHeader(rawBody, oldTimestamp);

    const result = verifyStripeWebhookSignature({
      rawBody,
      signatureHeader: header,
      secret: testSecret,
      now: Date.now(),
    });

    expect(result.valid).toBe(false);
    expect(result.error).toContain("expired");
  });

  it("rejects signatures signed with an invalid secret", () => {
    const rawBody = JSON.stringify({ id: "evt_123" });
    const { header, timestamp } = makeValidHeader(rawBody);

    const result = verifyStripeWebhookSignature({
      rawBody,
      signatureHeader: header,
      secret: "whsec_wrong_secret",
      now: timestamp * 1000,
    });

    expect(result.valid).toBe(false);
    expect(result.error).toContain("failed");
  });

  it("resolves plan tiers to exact message quotas", () => {
    expect(resolvePlanLimits("starter")).toEqual({ planId: "starter", monthlyMessageLimit: 1_000 });
    expect(resolvePlanLimits("price_growth_monthly")).toEqual({ planId: "growth", monthlyMessageLimit: 10_000 });
    expect(resolvePlanLimits("tier_enterprise_annual")).toEqual({ planId: "enterprise", monthlyMessageLimit: 100_000 });
    expect(resolvePlanLimits("unknown_custom")).toEqual({ planId: "starter", monthlyMessageLimit: 1_000 });
  });

  it("processes subscription cancellation and marks subscription as canceled", async () => {
    let updatedPayload: any = null;
    let filterQuery: any = null;

    const mockSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
        update: (payload: any) => {
          updatedPayload = payload;
          return {
            eq: (col: string, val: any) => {
              filterQuery = { col, val };
              return Promise.resolve({ error: null });
            },
          };
        },
      }),
    };

    const event = {
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: "sub_12345",
          customer: "cus_999",
        },
      },
    };

    const result = await processStripeSubscriptionEvent(mockSupabase as any, event);
    expect(result.processed).toBe(true);
    expect(result.action).toBe("canceled");
    expect(updatedPayload.status).toBe("canceled");
    expect(filterQuery.val).toBe("sub_12345");
  });

  it("processes payment failure and activates a 7-day grace period", async () => {
    let updatedPayload: any = null;

    const mockSupabase = {
      from: () => ({
        update: (payload: any) => {
          updatedPayload = payload;
          return {
            eq: () => Promise.resolve({ error: null }),
          };
        },
      }),
    };

    const event = {
      type: "invoice.payment_failed",
      data: {
        object: {
          subscription: "sub_987",
        },
      },
    };

    const result = await processStripeSubscriptionEvent(mockSupabase as any, event);
    expect(result.processed).toBe(true);
    expect(result.action).toBe("marked_past_due");
    expect(updatedPayload.status).toBe("past_due");
    expect(updatedPayload.grace_period_end).toBeDefined();
  });

  describe("Defect Regressions & Tenant Isolation", () => {
    it("Defect 1: checkout.session.completed does not update nonexistent stripe_customer_id column", async () => {
      let checkoutUpdatedFields: Record<string, any> = {};

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
                  maybeSingle: () =>
                    Promise.resolve({
                      data: {
                        id: "chk_test_123",
                        workspace_id: "ws_alpha_1",
                        amount: 99,
                        currency: "USD",
                        status: "pending",
                      },
                      error: null,
                    }),
                }),
              }),
              update: (fields: any) => {
                checkoutUpdatedFields = fields;
                return {
                  eq: () => Promise.resolve({ error: null }),
                };
              },
            };
          }
          if (table === "payment_ledger") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: () => Promise.resolve({ data: null, error: null }),
                }),
              }),
              insert: () => ({
                select: () => ({
                  single: () => Promise.resolve({ data: { id: "led_test_1" }, error: null }),
                }),
              }),
            };
          }
          return {
            insert: () => Promise.resolve({ error: null }),
            update: () => ({ eq: () => Promise.resolve({ error: null }) }),
          };
        },
      };

      const event = {
        id: "evt_checkout_regression",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_regression_session",
            customer: "cus_should_not_be_written_to_payment_checkouts",
            payment_intent: "pi_regression_1",
            amount_total: 9900,
            currency: "usd",
            metadata: {
              workspace_id: "ws_alpha_1",
              internal_checkout_id: "chk_test_123",
            },
          },
        },
      };

      const result = await processStripeWebhookEvent(mockSupabase as any, event);
      expect(result.processed).toBe(true);
      expect(checkoutUpdatedFields.status).toBe("paid");
      expect(checkoutUpdatedFields.stripe_payment_intent_id).toBe("pi_regression_1");
      expect(checkoutUpdatedFields).not.toHaveProperty("stripe_customer_id");
    });

    it("Defect 2: invoice.paid safely resolves workspace from real Checkout subscription lines.data[0].metadata", async () => {
      let activatedWorkspaceId: string | null = null;

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
          if (table === "workspaces") {
            return {
              select: () => ({
                eq: (_col: string, val: string) => ({
                  maybeSingle: () => Promise.resolve({ data: { id: val }, error: null }),
                }),
              }),
            };
          }
          if (table === "workspace_subscriptions") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: () => Promise.resolve({ data: null, error: null }),
                }),
              }),
              update: () => ({
                eq: () => Promise.resolve({ error: null }),
              }),
            };
          }
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: null, error: null }),
              }),
            }),
            update: () => ({
              eq: () => Promise.resolve({ error: null }),
            }),
          };
        },
        rpc: (fn: string, params: any) => {
          if (fn === "activate_founders3_enrollment_atomic") {
            activatedWorkspaceId = params.p_workspace_id;
            return Promise.resolve({
              data: { success: true, subscription_id: "sub_mock" },
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        },
      };

      const event = {
        id: "evt_invoice_lines_meta",
        type: "invoice.paid",
        data: {
          object: {
            id: "in_lines_test",
            customer: "cus_lines_test",
            subscription: "sub_lines_test",
            amount_paid: 9900,
            metadata: {}, // Empty top-level metadata
            parent: {
              subscription_details: {
                metadata: {
                  workspace_id: "ws_lines_target_123",
                },
              },
            },
            lines: {
              data: [
                {
                  id: "il_item_1",
                  price: { lookup_key: "j10_founders3_monthly_99" },
                  period: { start: 1789585844, end: 1792177844 },
                  metadata: {
                    workspace_id: "ws_lines_target_123",
                    plan_id: "founders3",
                  },
                },
              ],
            },
          },
        },
      };

      const result = await processStripeWebhookEvent(mockSupabase as any, event);
      expect(result.processed).toBe(true);
      expect(result.action).toBe("invoice_paid_founders3_provisioned");
      expect(activatedWorkspaceId).toBe("ws_lines_target_123");
    });

    it("rejects conflicting workspace IDs across metadata instead of silently choosing one", async () => {
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
          return {};
        },
      };

      const eventWithConflictingMetadata = {
        id: "evt_invoice_conflict",
        type: "invoice.paid",
        data: {
          object: {
            id: "in_conflict_test",
            customer: "cus_conflict",
            subscription: "sub_conflict",
            amount_paid: 9900,
            metadata: {
              workspace_id: "ws_victim_alpha",
            },
            lines: {
              data: [
                {
                  id: "il_item_conflict",
                  price: { lookup_key: "j10_founders3_monthly_99" },
                  metadata: {
                    workspace_id: "ws_attacker_beta",
                  },
                },
              ],
            },
          },
        },
      };

      const result = await processStripeWebhookEvent(mockSupabase as any, eventWithConflictingMetadata);
      expect(result.processed).toBe(false);
      expect(result.action).toBe("quarantined_conflicting_workspace_metadata");
      expect(result.error).toContain("Conflicting workspace IDs");
    });

    it("proves tenant isolation: nonexistent or mismatched workspace metadata cannot activate subscriptions", async () => {
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
          if (table === "workspaces") {
            return {
              select: () => ({
                eq: () => ({
                  // Workspace does not exist
                  maybeSingle: () => Promise.resolve({ data: null, error: null }),
                }),
              }),
            };
          }
          return {};
        },
      };

      const eventForFakeWorkspace = {
        id: "evt_tenant_isolation",
        type: "invoice.paid",
        data: {
          object: {
            id: "in_fake_ws",
            customer: "cus_fake",
            subscription: "sub_fake",
            amount_paid: 9900,
            metadata: {
              workspace_id: "ws_nonexistent_99999",
            },
            lines: {
              data: [
                {
                  price: { lookup_key: "j10_founders3_monthly_99" },
                  metadata: {
                    workspace_id: "ws_nonexistent_99999",
                  },
                },
              ],
            },
          },
        },
      };

      const result = await processStripeWebhookEvent(mockSupabase as any, eventForFakeWorkspace);
      expect(result.processed).toBe(false);
      expect(result.action).toBe("quarantined_workspace_not_found");
      expect(result.error).toContain("does not exist");
    });
  });
});
