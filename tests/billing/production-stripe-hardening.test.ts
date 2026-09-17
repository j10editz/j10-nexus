import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  validateStripePriceForCheckout,
  createWorkspaceSubscriptionCheckout,
} from "@/lib/billing/checkout";
import {
  isQualifyingFounderPrice,
  getAuthoritativePriceConfig,
  isTestPriceId,
  processStripeWebhookEvent,
} from "@/lib/billing/stripe-webhook";
import {
  scheduleStandardTransitionOnCycle12,
  reconstructFounderSubscriptionSchedule,
  resolveSchedulePrices,
} from "@/lib/billing/subscription-schedule";

function setNodeEnv(val?: string) {
  if (val === undefined) {
    delete (process.env as any).NODE_ENV;
  } else {
    (process.env as any).NODE_ENV = val;
  }
}

describe("Production Stripe Price-Wiring Hardening Regression Tests", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe("Invariant 1: Production fails closed when live Price environment variables are missing", () => {
    it("validateStripePriceForCheckout fails closed when STRIPE_FOUNDERS3_PRICE_ID is missing in production", async () => {
      setNodeEnv("production");
      delete process.env.STRIPE_FOUNDERS3_PRICE_ID;

      const res = await validateStripePriceForCheckout({
        secretKey: "sk_live_mock_secret_key",
        planId: "founders3",
      });

      expect(res.valid).toBe(false);
      expect(res.error).toContain("Missing STRIPE_FOUNDERS3_PRICE_ID");
    });

    it("createWorkspaceSubscriptionCheckout throws when STRIPE_FOUNDERS3_PRICE_ID is missing in production", async () => {
      setNodeEnv("production");
      process.env.STRIPE_SECRET_KEY = "sk_live_mock_secret_key";
      delete process.env.STRIPE_FOUNDERS3_PRICE_ID;

      const mockSupabase = {} as any;

      await expect(
        createWorkspaceSubscriptionCheckout(mockSupabase, {
          workspaceId: "ws_prod_test",
          planId: "founders3",
          invitationCode: "F3-TEST-CODE",
        })
      ).rejects.toThrow("Missing STRIPE_FOUNDERS3_PRICE_ID");
    });

    it("resolveSchedulePrices throws in production when either price variable is missing", () => {
      setNodeEnv("production");
      delete process.env.STRIPE_FOUNDERS3_PRICE_ID;
      process.env.STRIPE_STANDARD_PRICE_ID = "price_live_std_149";

      expect(() => resolveSchedulePrices("sk_live_mock")).toThrow("Missing STRIPE_FOUNDERS3_PRICE_ID or STRIPE_STANDARD_PRICE_ID");

      process.env.STRIPE_FOUNDERS3_PRICE_ID = "price_live_f3_99";
      delete process.env.STRIPE_STANDARD_PRICE_ID;

      expect(() => resolveSchedulePrices("sk_live_mock")).toThrow("Missing STRIPE_FOUNDERS3_PRICE_ID or STRIPE_STANDARD_PRICE_ID");
    });

    it("scheduleStandardTransitionOnCycle12 fails closed in production when price env vars are missing", async () => {
      setNodeEnv("production");
      delete process.env.STRIPE_FOUNDERS3_PRICE_ID;
      delete process.env.STRIPE_STANDARD_PRICE_ID;

      const mockSupabase = {
        from: vi.fn(),
      } as any;

      const result = await scheduleStandardTransitionOnCycle12({
        supabase: mockSupabase,
        workspaceId: "ws_test_prod",
        stripeSubscriptionId: "sub_test_123",
        currentPeriodEndSec: 1792177844,
        secretKey: "sk_live_test_key",
      });

      expect(result.success).toBe(false);
      expect(result.priceTransitionStatus).toBe("transition_failed");
      expect(result.error).toContain("Missing STRIPE_FOUNDERS3_PRICE_ID or STRIPE_STANDARD_PRICE_ID");
    });
  });

  describe("Invariant 2: Checkout uses the configured $99 Price ID and strictly forbids inline price_data in production", () => {
    it("passes configured STRIPE_FOUNDERS3_PRICE_ID explicitly into line_items and contains NO price_data", async () => {
      setNodeEnv("production");
      process.env.STRIPE_SECRET_KEY = "sk_live_real_format_key";
      process.env.STRIPE_FOUNDERS3_PRICE_ID = "price_live_founder_official_99";

      let capturedCheckoutParams: URLSearchParams | null = null;

      vi.spyOn(global, "fetch").mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = url.toString();
        if (urlStr.includes("/v1/prices/")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id: "price_live_founder_official_99",
              active: true,
              currency: "usd",
              unit_amount: 9900,
              livemode: true,
              recurring: { interval: "month" },
            }),
          } as any;
        }
        if (urlStr.includes("/v1/customers") && init?.method === "POST") {
          return {
            ok: true,
            status: 200,
            json: async () => ({ id: "cus_live_test_123" }),
          } as any;
        }
        if (urlStr.includes("/v1/checkout/sessions") && init?.method === "POST") {
          capturedCheckoutParams = new URLSearchParams(String(init.body || ""));
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id: "cs_live_session_789",
              url: "https://checkout.stripe.com/pay/cs_live_session_789",
              managed_payments: { enabled: false },
            }),
          } as any;
        }
        return { ok: false, status: 404, json: async () => ({}) } as any;
      });

      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === "workspace_subscriptions") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
            };
          }
          if (table === "payment_checkouts") {
            return {
              insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: "co_int_prod_test" },
                    error: null,
                  }),
                }),
              }),
              update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
            };
          }
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }),
        rpc: vi.fn((fn: string) => {
          if (fn === "reserve_founders3_slot_atomic") {
            return Promise.resolve({
              data: { success: true, reservation_id: "res_prod_123", remaining_slots: 2 },
              error: null,
            });
          }
          return Promise.resolve({ data: { success: true }, error: null });
        }),
      } as any;

      const result = await createWorkspaceSubscriptionCheckout(mockSupabase, {
        workspaceId: "ws_prod_checkout_test",
        planId: "founders3",
        invitationCode: "F3-PROD-CODE",
      });

      expect(result.sessionId).toBe("cs_live_session_789");
      expect(result.mode).toBe("live");
      expect(result.providerMode).toBe("live");
      expect(capturedCheckoutParams).not.toBeNull();

      // Check explicit line item price ID:
      expect(capturedCheckoutParams!.get("line_items[0][price]")).toBe("price_live_founder_official_99");
      expect(capturedCheckoutParams!.get("line_items[0][quantity]")).toBe("1");

      // Verify ZERO inline price_data fields exist:
      expect(capturedCheckoutParams!.has("line_items[0][price_data][currency]")).toBe(false);
      expect(capturedCheckoutParams!.has("line_items[0][price_data][unit_amount]")).toBe(false);
      expect(capturedCheckoutParams!.has("line_items[0][price_data][product_data][name]")).toBe(false);

      // Verify managed_payments.enabled=false invariant
      expect(capturedCheckoutParams!.get("managed_payments[enabled]")).toBe("false");
    });
  });

  describe("Invariant 3: Configured live Price IDs are accepted by webhook processing", () => {
    it("recognizes configured STRIPE_FOUNDERS3_PRICE_ID and STRIPE_STANDARD_PRICE_ID and approved lookup keys", () => {
      setNodeEnv("production");
      process.env.STRIPE_FOUNDERS3_PRICE_ID = "price_live_f3_monthly_99";
      process.env.STRIPE_STANDARD_PRICE_ID = "price_live_std_monthly_149";

      // 1. Live Founders Price
      expect(isQualifyingFounderPrice("price_live_f3_monthly_99")).toBe(true);
      expect(getAuthoritativePriceConfig("price_live_f3_monthly_99")).toEqual({
        planId: "founders3",
        monthlyMessageLimit: 1_000,
      });

      // 2. Live Standard Price
      expect(isQualifyingFounderPrice("price_live_std_monthly_149")).toBe(false); // Standard is not qualifying founder $99
      expect(getAuthoritativePriceConfig("price_live_std_monthly_149")).toEqual({
        planId: "founders3",
        monthlyMessageLimit: 1_000,
      });

      // 3. Approved Lookup Keys
      expect(isQualifyingFounderPrice("j10_founders3_monthly_99")).toBe(true);
      expect(getAuthoritativePriceConfig("j10_founders3_monthly_99")).toEqual({
        planId: "founders3",
        monthlyMessageLimit: 1_000,
      });
      expect(isQualifyingFounderPrice("j10_standard_monthly_149")).toBe(false);
      expect(getAuthoritativePriceConfig("j10_standard_monthly_149")).toEqual({
        planId: "founders3",
        monthlyMessageLimit: 1_000,
      });
    });

    it("accepts and provisions invoice.paid event with configured live price ID in production", async () => {
      setNodeEnv("production");
      process.env.STRIPE_FOUNDERS3_PRICE_ID = "price_live_f3_monthly_99";
      process.env.STRIPE_STANDARD_PRICE_ID = "price_live_std_monthly_149";

      const mockSupabase = {
        from: vi.fn((table: string) => {
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
          if (table === "workspace_subscriptions") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: () => Promise.resolve({
                    data: {
                      id: "sub_db_prod_1",
                      workspace_id: "ws_prod_accepted",
                      status: "active",
                      entitlement_state: "active",
                      founder_cycle_count: 1,
                      current_period_end: "2026-10-16T12:00:00Z",
                    },
                    error: null,
                  }),
                }),
              }),
              update: () => ({
                eq: () => Promise.resolve({ error: null }),
              }),
            };
          }
          if (table === "workspaces") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: () => Promise.resolve({
                    data: { id: "ws_prod_accepted" },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === "payment_ledger") {
            return {
              insert: () => Promise.resolve({ error: null }),
            };
          }
          return {};
        }),
        rpc: vi.fn((fn: string) => {
          if (fn === "record_founder_paid_cycle_atomic") {
            return Promise.resolve({
              data: { success: true, founder_cycle_count: 2 },
              error: null,
            });
          }
          return Promise.resolve({ data: { success: true }, error: null });
        }),
      };

      const event = {
        id: "evt_live_invoice_paid",
        type: "invoice.paid",
        data: {
          object: {
            id: "in_live_paid_123",
            customer: "cus_live_123",
            subscription: "sub_live_123",
            amount_paid: 9900,
            metadata: { workspace_id: "ws_prod_accepted" },
            lines: {
              data: [
                {
                  id: "il_item_live",
                  price: { id: "price_live_f3_monthly_99" },
                  period: { start: 1789585844, end: 1792177844 },
                  metadata: {
                    workspace_id: "ws_prod_accepted",
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
    });
  });

  describe("Invariant 4: Unknown or test Price IDs are rejected in production", () => {
    it("rejects test price IDs and unknown price IDs in production", () => {
      setNodeEnv("production");
      process.env.STRIPE_FOUNDERS3_PRICE_ID = "price_live_f3_monthly_99";
      process.env.STRIPE_STANDARD_PRICE_ID = "price_live_std_monthly_149";

      // Test price IDs must return false / null in production
      expect(isTestPriceId("price_1UGLljBzAlW19YsvHNYtvNxA")).toBe(true);
      expect(isQualifyingFounderPrice("price_1UGLljBzAlW19YsvHNYtvNxA")).toBe(false);
      expect(getAuthoritativePriceConfig("price_1UGLljBzAlW19YsvHNYtvNxA")).toBeNull();

      expect(isTestPriceId("price_founders3_test")).toBe(true);
      expect(isQualifyingFounderPrice("price_founders3_test")).toBe(false);
      expect(getAuthoritativePriceConfig("price_founders3_test")).toBeNull();

      // Unknown IDs
      expect(isQualifyingFounderPrice("price_unknown_unregistered")).toBe(false);
      expect(getAuthoritativePriceConfig("price_unknown_unregistered")).toBeNull();
    });

    it("validateStripePriceForCheckout rejects test Price objects when using live Stripe secret key", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: "price_mock_test_in_live",
          active: true,
          currency: "usd",
          unit_amount: 9900,
          livemode: false, // Inconsistent mode! Test price object with sk_live
          recurring: { interval: "month" },
        }),
      } as any);

      const res = await validateStripePriceForCheckout({
        secretKey: "sk_live_production_key_123",
        priceId: "price_mock_test_in_live",
        planId: "founders3",
      });

      expect(res.valid).toBe(false);
      expect(res.error).toContain("Stripe-mode inconsistency");
      expect(res.error).toContain("Test-mode price");
    });

    it("validateStripePriceForCheckout rejects wrong amounts for Founder $99", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: "price_wrong_amount",
          active: true,
          currency: "usd",
          unit_amount: 10900, // Invalid! Must be 9900
          livemode: true,
          recurring: { interval: "month" },
        }),
      } as any);

      const res = await validateStripePriceForCheckout({
        secretKey: "sk_live_production_key_123",
        priceId: "price_wrong_amount",
        planId: "founders3",
      });

      expect(res.valid).toBe(false);
      expect(res.error).toContain("unit_amount must be 9900");
    });

    it("quarantines unknown price IDs in invoice.paid webhook during production", async () => {
      setNodeEnv("production");
      process.env.STRIPE_FOUNDERS3_PRICE_ID = "price_live_f3_monthly_99";
      process.env.STRIPE_STANDARD_PRICE_ID = "price_live_std_monthly_149";

      const mockSupabase = {
        from: vi.fn(() => ({
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
        })),
      };

      const event = {
        id: "evt_unknown_price_invoice",
        type: "invoice.paid",
        data: {
          object: {
            id: "in_unknown_123",
            customer: "cus_live_123",
            subscription: "sub_live_123",
            amount_paid: 9900,
            metadata: { workspace_id: "ws_prod_quarantine" },
            lines: {
              data: [
                {
                  id: "il_item_unknown",
                  price: { id: "price_unregistered_ad_hoc_123" },
                  period: { start: 1789585844, end: 1792177844 },
                },
              ],
            },
          },
        },
      };

      const result = await processStripeWebhookEvent(mockSupabase as any, event);
      expect(result.processed).toBe(false);
      expect(result.action).toBe("quarantined_unknown_price");
      expect(result.error).toContain("is not in the authoritative Stripe price allowlist");
    });
  });

  describe("Invariant 5: Cycle-12 transition strictly uses STRIPE_STANDARD_PRICE_ID", () => {
    it("uses STRIPE_STANDARD_PRICE_ID when creating Cycle 12 subscription schedule", async () => {
      setNodeEnv("production");
      process.env.STRIPE_FOUNDERS3_PRICE_ID = "price_live_f3_9900";
      process.env.STRIPE_STANDARD_PRICE_ID = "price_live_std_14900";

      let capturedPhaseBody: string | null = null;

      vi.spyOn(global, "fetch").mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = url.toString();
        if (urlStr.includes("/v1/subscription_schedules") && init?.method === "POST") {
          if (!urlStr.includes("sub_sched_")) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                id: "sub_sched_prod_c12_123",
                phases: [{ start_date: 1789585844 }],
              }),
            } as any;
          } else {
            capturedPhaseBody = decodeURIComponent(String(init.body || ""));
            return {
              ok: true,
              status: 200,
              json: async () => ({
                id: "sub_sched_prod_c12_123",
                phases: [
                  { items: [{ price: "price_live_f3_9900" }], end_date: 1792177844 },
                  { items: [{ price: "price_live_std_14900" }] },
                ],
              }),
            } as any;
          }
        }
        return { ok: false, status: 404, json: async () => ({}) } as any;
      });

      const mockSupabase = {
        from: vi.fn(() => ({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        })),
      } as any;

      const res = await scheduleStandardTransitionOnCycle12({
        supabase: mockSupabase,
        workspaceId: "ws_prod_c12",
        stripeSubscriptionId: "sub_prod_c12_target",
        currentPeriodEndSec: 1792177844,
        secretKey: "sk_live_mock_c12_key",
      });

      expect(res.success).toBe(true);
      expect(res.scheduleId).toBe("sub_sched_prod_c12_123");
      expect(res.priceTransitionStatus).toBe("scheduled");

      expect(capturedPhaseBody).not.toBeNull();
      // Phase 0 must be the live founder price
      expect(capturedPhaseBody).toContain("phases[0][items][0][price]=price_live_f3_9900");
      // Phase 1 must be the live standard transition price
      expect(capturedPhaseBody).toContain("phases[1][items][0][price]=price_live_std_14900");
    });
  });

  describe("Invariant 6: Test-mode billing tests continue to work in non-production", () => {
    it("allows test price fallbacks when NODE_ENV is not production", () => {
      setNodeEnv(undefined);
      delete process.env.STRIPE_FOUNDERS3_PRICE_ID;
      delete process.env.STRIPE_STANDARD_PRICE_ID;

      // In non-production test mode, test IDs are accepted
      expect(isQualifyingFounderPrice("price_1UGLljBzAlW19YsvHNYtvNxA")).toBe(true);
      expect(isQualifyingFounderPrice("price_founders3_test")).toBe(true);
      expect(getAuthoritativePriceConfig("price_1UGLljBzAlW19YsvHNYtvNxA")).toEqual({
        planId: "founders3",
        monthlyMessageLimit: 1_000,
      });

      const prices = resolveSchedulePrices("sk_test_mock_secret");
      expect(prices.fPrice).toBe("price_1UGLljBzAlW19YsvHNYtvNxA");
      expect(prices.stdPrice).toBe("price_1UGLljBzAlW19YsvbQ7js6c8");
    });
  });
});
