import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import {
  processStripeSubscriptionEvent,
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
});
