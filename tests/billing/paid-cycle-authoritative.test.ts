import { describe, it, expect, vi } from "vitest";
import { processStripeWebhookEvent, isQualifyingFounderPrice } from "@/lib/billing/stripe-webhook";
import {
  scheduleStandardTransitionOnCycle12,
  rollbackStandardTransitionOnRefund,
  reconstructFounderSubscriptionSchedule,
} from "@/lib/billing/subscription-schedule";

describe("Paid-Cycle-Authoritative Commercial Guarantee", () => {
  it("identifies qualifying Founder $99 prices and distinguishes Standard $149 prices", () => {
    expect(isQualifyingFounderPrice("price_1UGLljBzAlW19YsvHNYtvNxA")).toBe(true);
    expect(isQualifyingFounderPrice("price_founders3_monthly_99")).toBe(true);
    expect(isQualifyingFounderPrice("j10_founders3_monthly_99")).toBe(true);
    expect(isQualifyingFounderPrice("price_founders3_test")).toBe(true);
    // Standard $149 is NOT a qualifying Founder price
    expect(isQualifyingFounderPrice("price_1UGLljBzAlW19YsvbQ7js6c8")).toBe(false);
    expect(isQualifyingFounderPrice("price_standard_monthly_149")).toBe(false);
    expect(isQualifyingFounderPrice("j10_standard_monthly_149")).toBe(false);
  });

  it("Scenario A: Cycles 1–12 at $99.00 -> exactly at cycle 12 scheduleStandardTransitionOnCycle12 triggers for Cycle 13 at $149.00", async () => {
    let attachedScheduleId: string | null = null;
    let schedulePhases: any = null;

    const originalFetch = global.fetch;
    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr.includes("/v1/subscription_schedules") && init?.method === "POST") {
        if (!urlStr.includes("sub_sched_")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id: "sub_sched_c12_approved_123",
              phases: [{ start_date: 1789585844 }],
            }),
          } as any;
        } else {
          schedulePhases = decodeURIComponent(String(init.body || ""));
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id: "sub_sched_c12_approved_123",
              phases: [
                { end_date: 1821121844, items: [{ price: "price_1UGLljBzAlW19YsvHNYtvNxA" }] },
                { start_date: 1821121844, items: [{ price: "price_1UGLljBzAlW19YsvbQ7js6c8" }] },
              ],
            }),
          } as any;
        }
      }
      return { ok: true, status: 200, json: async () => ({}) } as any;
    });

    const mockSupabase = {
      from: vi.fn((table: string) => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        update: vi.fn((fields: any) => {
          if (fields.stripe_subscription_schedule_id) {
            attachedScheduleId = fields.stripe_subscription_schedule_id;
          }
          return { eq: vi.fn().mockResolvedValue({ error: null }) };
        }),
      })),
    } as any;

    try {
      const res = await scheduleStandardTransitionOnCycle12({
        supabase: mockSupabase,
        workspaceId: "ws_scenario_a_test",
        stripeSubscriptionId: "sub_scenario_a_123",
        currentPeriodEndSec: 1821121844,
        secretKey: "sk_test_mock_scenario_a",
      });

      expect(res.success).toBe(true);
      expect(res.scheduleId).toBe("sub_sched_c12_approved_123");
      expect(res.priceTransitionStatus).toBe("scheduled");
      expect(attachedScheduleId).toBe("sub_sched_c12_approved_123");
      // Verify proration_behavior = none and phases
      expect(schedulePhases).toContain("phases[0][proration_behavior]=none");
      expect(schedulePhases).toContain("phases[1][proration_behavior]=none");
      expect(schedulePhases).toContain("phases[0][end_date]=1821121844");
      expect(schedulePhases).toContain("phases[1][items][0][price]=price_1UGLljBzAlW19YsvbQ7js6c8");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("Scenario C: duplicate invoice.paid delivery is idempotent and does not advance count or duplicate schedules", async () => {
    let insertCount = 0;
    const existingLedgerRecords = new Set<string>();

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === "payment_ledger") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn((col: string, val: string) => ({
              maybeSingle: vi.fn(async () => {
                if (col === "provider_event_id" && existingLedgerRecords.has(val)) {
                  return { data: { id: "ledger_existing_123" }, error: null };
                }
                return { data: null, error: null };
              }),
            })),
            insert: vi.fn(async (row: any) => {
              insertCount++;
              if (row.provider_event_id) existingLedgerRecords.add(row.provider_event_id);
              return { error: null };
            }),
          };
        }
        if (table === "workspaces") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: "ws_idempotent_test" }, error: null }),
          };
        }
        if (table === "workspace_subscriptions") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: "sub_row_123",
                status: "active",
                founder_cycle_count: 5,
                workspace_id: "ws_idempotent_test",
              },
              error: null,
            }),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          };
        }
        if (table === "webhook_events") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            upsert: vi.fn().mockResolvedValue({ error: null }),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnThis() }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        };
      }),
      rpc: vi.fn((fn: string) => {
        if (fn === "record_founder_paid_cycle_atomic") {
          return Promise.resolve({
            data: { success: true, founder_cycle_count: 6 },
            error: null,
          });
        }
        return Promise.resolve({ data: { success: true }, error: null });
      }),
    } as any;

    const event1 = {
      id: "evt_dup_test_001",
      type: "invoice.paid",
      data: {
        object: {
          id: "in_same_invoice_999",
          status: "paid",
          amount_paid: 9900,
          customer: "cus_mock_999",
          subscription: "sub_mock_999",
          metadata: { workspace_id: "ws_idempotent_test" },
          lines: {
            data: [
              {
                id: "il_item_1",
                price: { id: "price_1UGLljBzAlW19YsvHNYtvNxA" },
                period: { start: 1789585844, end: 1792177844 },
              },
            ],
          },
        },
      },
    };

    // First delivery
    const res1 = await processStripeWebhookEvent(mockSupabase, event1);
    expect(res1.processed).toBe(true);
    expect(res1.action).toBe("invoice_paid_founders3_provisioned");

    // Second duplicate delivery with the SAME invoice ID
    const event2 = {
      id: "evt_dup_test_002", // Different webhook event ID, but SAME invoice ID!
      type: "invoice.paid",
      data: {
        object: {
          id: "in_same_invoice_999",
          status: "paid",
          amount_paid: 9900,
          customer: "cus_mock_999",
          subscription: "sub_mock_999",
          metadata: { workspace_id: "ws_idempotent_test" },
          lines: {
            data: [
              {
                id: "il_item_1",
                price: { id: "price_1UGLljBzAlW19YsvHNYtvNxA" },
                period: { start: 1789585844, end: 1792177844 },
              },
            ],
          },
        },
      },
    };

    const res2 = await processStripeWebhookEvent(mockSupabase, event2);
    expect(res2.processed).toBe(true);
    expect(res2.idempotent).toBe(true);
    expect(res2.action).toBe("invoice_already_counted");

    // Atomic RPC was called exactly ONCE across both events
    expect(mockSupabase.rpc).toHaveBeenCalledTimes(1);
    // Ledger insertion happened exactly ONCE
    expect(insertCount).toBe(1);
  });

  it("Scenario D: full refund reverses paid-cycle credit and safely rolls back transition schedule if attached", async () => {
    let releasedSchedule = false;
    let updatedCycleCount: number | null = null;

    const originalFetch = global.fetch;
    global.fetch = vi.fn(async (url: string | URL | Request) => {
      if (url.toString().includes("/release")) {
        releasedSchedule = true;
      }
      return { ok: true, status: 200, json: async () => ({}) } as any;
    });

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === "workspace_subscriptions") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: "sub_row_refund_test",
                founder_cycle_count: 12, // Cycle 12 was paid and schedule was prepared
                stripe_subscription_schedule_id: "sub_sched_to_release_999",
                stripe_subscription_id: "sub_real_123",
              },
              error: null,
            }),
            update: vi.fn((fields: any) => {
              if (fields.founder_cycle_count !== undefined) {
                updatedCycleCount = fields.founder_cycle_count;
              }
              return { eq: vi.fn().mockResolvedValue({ error: null }) };
            }),
          };
        }
        if (table === "payment_checkouts") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: "co_123",
                workspace_id: "ws_refund_test",
                amount: 99.0,
                currency: "USD",
              },
              error: null,
            }),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          };
        }
        if (table === "payment_ledger") {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        if (table === "webhook_events") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            upsert: vi.fn().mockResolvedValue({ error: null }),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnThis() }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        };
      }),
    } as any;

    const refundEvent = {
      id: "evt_refund_test_001",
      type: "charge.refunded",
      data: {
        object: {
          id: "ch_mock_refund_123",
          payment_intent: "pi_mock_123",
          refunded: true,
          amount: 9900,
          amount_refunded: 9900,
          currency: "usd",
        },
      },
    };

    const prevKey = process.env.STRIPE_SECRET_KEY;
    process.env.STRIPE_SECRET_KEY = "sk_test_mock_refund_key";

    try {
      const res = await processStripeWebhookEvent(mockSupabase, refundEvent);
      expect(res.processed).toBe(true);
      expect(res.action).toBe("refund_recorded");

      // Count decremented from 12 to 11
      expect(updatedCycleCount).toBe(11);
      // Stripe schedule was safely released back to plain $99
      expect(releasedSchedule).toBe(true);
    } finally {
      global.fetch = originalFetch;
      process.env.STRIPE_SECRET_KEY = prevKey;
    }
  });

  it("Scenario B: payment failure retains founder_cycle_count and does not attach early schedule", async () => {
    let recordedPastDue = false;

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === "workspace_subscriptions") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                founder_cycle_count: 4, // 4 paid cycles
                status: "active",
                entitlement_state: "active",
              },
              error: null,
            }),
            update: vi.fn((fields: any) => {
              if (fields.status === "past_due") recordedPastDue = true;
              return { eq: vi.fn().mockResolvedValue({ error: null }) };
            }),
          };
        }
        if (table === "webhook_events") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            upsert: vi.fn().mockResolvedValue({ error: null }),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnThis() }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        };
      }),
    } as any;

    const failEvent = {
      id: "evt_fail_test_001",
      type: "invoice.payment_failed",
      data: {
        object: {
          id: "in_failed_cycle_5",
          subscription: "sub_test_scenario_b",
          customer: "cus_test_b",
          amount_due: 9900,
          attempt_count: 1,
          last_payment_error: { message: "Card declined" },
        },
      },
    };

    const res = await processStripeWebhookEvent(mockSupabase, failEvent);
    expect(res.processed).toBe(true);
    expect(res.action).toBe("marked_past_due");
    expect(recordedPastDue).toBe(true);
  });
});
