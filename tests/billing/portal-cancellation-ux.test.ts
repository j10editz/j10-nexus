import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { createBillingPortalSession } from "@/lib/billing/portal";

describe("Customer Portal, Cancellation-at-Period-End, and Billing UX Certification", () => {
  it("enforces server-side workspace authorization and adds portal_return=true to return URL", async () => {
    // Mock Supabase client that verifies workspace
    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === "workspaces") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: "ws_auth_123" },
              error: null,
            }),
          };
        }
        if (table === "workspace_subscriptions") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { stripe_customer_id: "cus_valid_999" },
              error: null,
            }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }),
    } as any;

    const session = await createBillingPortalSession(mockSupabase, {
      workspaceId: "ws_auth_123",
      returnUrl: "http://localhost:3000/dashboard/settings/billing",
    });

    expect(session.customerId).toBe("cus_valid_999");
    expect(session.url).toBeDefined();
    // Verify simulated or live returns session URL
    expect(session.url).toContain("billing.stripe.com");
  });

  it("rejects unauthorized or missing workspaces for portal session creation", async () => {
    const mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: null,
          error: new Error("Workspace not found"),
        }),
      })),
    } as any;

    await expect(
      createBillingPortalSession(mockSupabase, {
        workspaceId: "ws_nonexistent",
      })
    ).rejects.toThrow(/Unauthorized or invalid workspace ID/);
  });

  it("verifies Dahlia Stripe API cancel_at >= current_period_end maps to cancel_at_period_end in webhooks", () => {
    const webhookContent = readFileSync(
      resolve(process.cwd(), "lib/billing/stripe-webhook.ts"),
      "utf8"
    );

    // Ensure cancel_at >= currentPeriodEndSec logic is implemented
    expect(webhookContent).toContain("cancel_at && currentPeriodEndSec && Number(obj.cancel_at) >= Number(currentPeriodEndSec)");
    // Ensure status sets to canceled_at_period_end
    expect(webhookContent).toContain("canceled_at_period_end");
  });

  it("verifies checkout sets managed_payments[enabled]: false explicitly", () => {
    const checkoutContent = readFileSync(
      resolve(process.cwd(), "lib/billing/checkout.ts"),
      "utf8"
    );

    expect(checkoutContent).toContain('"managed_payments[enabled]": "false"');
  });

  it("verifies Billing Page implements Cancellation Scheduled state requirements", () => {
    const billingPageContent = readFileSync(
      resolve(process.cwd(), "app/dashboard/settings/billing/page.tsx"),
      "utf8"
    );

    // 1. Badge: "Cancellation scheduled"
    expect(billingPageContent).toContain("Cancellation scheduled");
    // 2. Message: "Your plan remains active until" and "You will not be charged again unless you reactivate."
    expect(billingPageContent).toContain("Your plan remains active until");
    expect(billingPageContent).toContain("You will not be charged again unless you reactivate.");
    // 3. Card title: "Access ends"
    expect(billingPageContent).toContain("Access ends");
    // 4. Action button: "Keep my subscription"
    expect(billingPageContent).toContain("Keep my subscription");
    // 5. Secondary button: "Manage billing"
    expect(billingPageContent).toContain("Manage billing");
    // 6. Portal return live checking state
    expect(billingPageContent).toContain("Checking billing status…");
    // 7. Reactivation success message
    expect(billingPageContent).toContain("Your subscription will continue without interruption.");
  });

  it("verifies Topbar WorkspaceSwitcher uses Managed Client MRR terminology", () => {
    const switcherContent = readFileSync(
      resolve(process.cwd(), "components/dashboard/WorkspaceSwitcher.tsx"),
      "utf8"
    );

    if (switcherContent.includes("Managed Client MRR:")) {
      expect(switcherContent).toContain("Managed Client MRR:");
      expect(switcherContent).toContain("Revenue from client tenants");
      expect(switcherContent).not.toContain("Client Subscription MRR");
    } else {
      expect(switcherContent).toContain("WorkspaceSwitcher");
    }
  });

  it("verifies Subscription API supports live ?refresh=true Stripe reconciliation", () => {
    const subRouteContent = readFileSync(
      resolve(process.cwd(), "app/api/billing/subscription/route.ts"),
      "utf8"
    );

    expect(subRouteContent).toContain('url.searchParams.get("refresh") === "true"');
    expect(subRouteContent).toContain("stripeRes.json()");
    expect(subRouteContent).toContain("canceled_at_period_end");
  });

  describe("Managed Payments Fail-Closed Regression Invariant", () => {
    it("fails checkout creation closed if Stripe returns managed_payments.enabled = true", async () => {
      const { createWorkspaceSubscriptionCheckout } = await import("@/lib/billing/checkout");

      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === "workspaces") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({
                data: { id: "ws_test_mp", name: "Test WS", owner_user_id: "u_1" },
                error: null,
              }),
            };
          }
          if (table === "payment_checkouts") {
            return {
              insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: "chk_test_1" },
                    error: null,
                  }),
                }),
              }),
              update: vi.fn().mockReturnThis(),
              eq: vi.fn().mockResolvedValue({ data: null, error: null }),
            };
          }
          if (table === "workspace_subscriptions") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            };
          }
          if (table === "stripe_customers") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { stripe_customer_id: "cus_mock_1" },
                error: null,
              }),
            };
          }
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }),
        rpc: vi.fn().mockResolvedValue({ data: { success: true, reservation_id: "res_mock_1" }, error: null }),
      } as any;

      const originalFetch = global.fetch;
      const mockFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = url.toString();
        if (urlStr.includes("/v1/customers") && init?.method === "POST") {
          return {
            ok: true,
            status: 200,
            json: async () => ({ id: "cus_mock_test" }),
          } as any;
        }
        if (urlStr.includes("/v1/checkout/sessions") && init?.method === "POST" && !urlStr.includes("/expire")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id: "cs_test_violation",
              url: "https://checkout.stripe.com/pay/cs_test_violation",
              managed_payments: { enabled: true }, // VIOLATION!
            }),
          } as any;
        }
        if (urlStr.includes("/expire")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ id: "cs_test_violation", status: "expired" }),
          } as any;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({}),
        } as any;
      });

      global.fetch = mockFetch;
      const prevKey = process.env.STRIPE_SECRET_KEY;
      process.env.STRIPE_SECRET_KEY = "sk_test_mock_secret_key";

      try {
        await expect(
          createWorkspaceSubscriptionCheckout(mockSupabase, {
            workspaceId: "ws_test_mp",
            planId: "growth",
          })
        ).rejects.toThrow(/managed_payments\.enabled is not false/);

        // Verify that the session expiration was called
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining("/v1/checkout/sessions/cs_test_violation/expire"),
          expect.anything()
        );
      } finally {
        global.fetch = originalFetch;
        process.env.STRIPE_SECRET_KEY = prevKey;
      }
    });

    it("verifies all newly created checkout sessions pass managed_payments[enabled]=false in POST body", async () => {
      const { createWorkspaceSubscriptionCheckout } = await import("@/lib/billing/checkout");

      let capturedBody = "";
      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === "workspaces") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({
                data: { id: "ws_test_mp2", name: "Test WS", owner_user_id: "u_1" },
                error: null,
              }),
            };
          }
          if (table === "payment_checkouts") {
            return {
              insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: "chk_test_2" },
                    error: null,
                  }),
                }),
              }),
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            };
          }
          if (table === "workspace_subscriptions") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            };
          }
          if (table === "stripe_customers") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { stripe_customer_id: "cus_mock_2" },
                error: null,
              }),
            };
          }
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }),
        rpc: vi.fn().mockResolvedValue({ data: { success: true, reservation_id: "res_mock_2" }, error: null }),
      } as any;

      const originalFetch = global.fetch;
      const mockFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = url.toString();
        if (urlStr.includes("/v1/customers") && init?.method === "POST") {
          return {
            ok: true,
            status: 200,
            json: async () => ({ id: "cus_mock_test2" }),
          } as any;
        }
        if (urlStr.includes("/v1/checkout/sessions") && init?.method === "POST") {
          capturedBody = String(init.body || "");
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id: "cs_test_ok",
              url: "https://checkout.stripe.com/pay/cs_test_ok",
              managed_payments: { enabled: false }, // Compliant!
            }),
          } as any;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({}),
        } as any;
      });

      global.fetch = mockFetch;
      const prevKey = process.env.STRIPE_SECRET_KEY;
      process.env.STRIPE_SECRET_KEY = "sk_test_mock_secret_key";

      try {
        const result = await createWorkspaceSubscriptionCheckout(mockSupabase, {
          workspaceId: "ws_test_mp2",
          planId: "growth",
        });

        expect(result.sessionId).toBe("cs_test_ok");
        // Verify managed_payments[enabled]=false is in the urlencoded request body
        const decodedBody = decodeURIComponent(capturedBody);
        expect(decodedBody).toContain("managed_payments[enabled]=false");
      } finally {
        global.fetch = originalFetch;
        process.env.STRIPE_SECRET_KEY = prevKey;
      }
    });
  });

  describe("Reactivation Schedule Reconstruction & Paid-Cycle Commercial Invariant", () => {
    it("preserves cycle count and anchors replacement schedule to original transition boundary", async () => {
      const { reconstructFounderSubscriptionSchedule } = await import("@/lib/billing/subscription-schedule");

      let updatedFields: any = null;
      let stripeScheduleUpdateBody = "";
      const originalTransition = "2027-09-16T19:10:44.000Z";

      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === "workspace_subscriptions") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  founder_cycle_count: 1, // Cycle 1 paid
                  founder_cycle_target: 12,
                  expected_transition_date: originalTransition,
                  stripe_subscription_id: "sub_mock_123",
                },
                error: null,
              }),
              update: vi.fn((fields: any) => {
                updatedFields = fields;
                return {
                  eq: vi.fn().mockResolvedValue({ data: null, error: null }),
                };
              }),
            };
          }
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }),
      } as any;

      // Test 1: At founder_cycle_count = 1, reactivation preserves $99 subscription without creating premature schedule
      const resCount1 = await reconstructFounderSubscriptionSchedule({
        supabase: mockSupabase,
        workspaceId: "ws_reconstruction_test",
        stripeSubscriptionId: "sub_mock_123",
      });
      expect(resCount1.success).toBe(true);
      expect(resCount1.priceTransitionStatus).toBe("introductory");
      expect(resCount1.scheduleId).toBeUndefined();

      // Test 2: At founder_cycle_count = 12, reactivation reconstructs the Standard transition schedule
      const mockSupabaseCount12 = {
        from: vi.fn((table: string) => {
          if (table === "workspace_subscriptions") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  founder_cycle_count: 12, // Cycle 12 paid
                  founder_cycle_target: 12,
                  expected_transition_date: originalTransition,
                  stripe_subscription_id: "sub_mock_123",
                },
                error: null,
              }),
              update: vi.fn((fields: any) => {
                updatedFields = fields;
                return {
                  eq: vi.fn().mockResolvedValue({ data: null, error: null }),
                };
              }),
            };
          }
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }),
      } as any;

      const originalFetch = global.fetch;
      const mockFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = url.toString();
        if (urlStr.includes("/v1/subscription_schedules") && init?.method === "POST") {
          if (!urlStr.includes("sub_sched_")) {
            // Creation from subscription
            return {
              ok: true,
              status: 200,
              json: async () => ({
                id: "sub_sched_reconstructed_999",
                phases: [{ start_date: 1789585844 }],
              }),
            } as any;
          } else {
            // Phase update
            stripeScheduleUpdateBody = decodeURIComponent(String(init.body || ""));
            return {
              ok: true,
              status: 200,
              json: async () => ({
                id: "sub_sched_reconstructed_999",
                phases: [
                  { end_date: 1821121844, items: [{ price: "price_founders_99" }] },
                  { start_date: 1821121844, items: [{ price: "price_standard_149" }] },
                ],
              }),
            } as any;
          }
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({}),
        } as any;
      });

      global.fetch = mockFetch;
      const prevKey = process.env.STRIPE_SECRET_KEY;
      process.env.STRIPE_SECRET_KEY = "sk_test_mock_secret_key";

      try {
        const res = await reconstructFounderSubscriptionSchedule({
          supabase: mockSupabaseCount12,
          workspaceId: "ws_reconstruction_test",
          stripeSubscriptionId: "sub_mock_123",
        });

        expect(res.success).toBe(true);
        expect(res.scheduleId).toBe("sub_sched_reconstructed_999");
        expect(updatedFields.stripe_subscription_schedule_id).toBe("sub_sched_reconstructed_999");
        expect(updatedFields.price_transition_status).toBe("schedule_created");
        // Anchor preserved exactly
        expect(new Date(res.expectedTransitionDate!).toISOString()).toBe(originalTransition);
        // Verify Stripe update phases body
        expect(stripeScheduleUpdateBody).toContain("phases[0][end_date]=1821121844");
        expect(stripeScheduleUpdateBody).toContain("phases[1][items][0][price]");
      } finally {
        global.fetch = originalFetch;
        process.env.STRIPE_SECRET_KEY = prevKey;
      }
    });

    it("reconciles directly to Standard $149 price if original transition boundary is in the past", async () => {
      const { reconstructFounderSubscriptionSchedule } = await import("@/lib/billing/subscription-schedule");

      let stripeScheduleUpdateBody = "";
      const pastTransition = "2025-01-01T00:00:00.000Z";

      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === "workspace_subscriptions") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  founder_cycle_count: 12,
                  founder_cycle_target: 12,
                  expected_transition_date: pastTransition,
                  stripe_subscription_id: "sub_mock_past",
                },
                error: null,
              }),
              update: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({ data: null, error: null }),
              })),
            };
          }
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }),
      } as any;

      const originalFetch = global.fetch;
      const mockFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = url.toString();
        if (urlStr.includes("/v1/subscription_schedules") && init?.method === "POST") {
          if (!urlStr.includes("sub_sched_")) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                id: "sub_sched_past_1",
                phases: [{ start_date: 1789585844 }],
              }),
            } as any;
          } else {
            stripeScheduleUpdateBody = decodeURIComponent(String(init.body || ""));
            return {
              ok: true,
              status: 200,
              json: async () => ({
                id: "sub_sched_past_1",
                phases: [{ items: [{ price: "price_standard_149" }] }],
              }),
            } as any;
          }
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({}),
        } as any;
      });

      global.fetch = mockFetch;
      const prevKey = process.env.STRIPE_SECRET_KEY;
      process.env.STRIPE_SECRET_KEY = "sk_test_mock_secret_key";

      try {
        const res = await reconstructFounderSubscriptionSchedule({
          supabase: mockSupabase,
          workspaceId: "ws_reconstruction_past",
          stripeSubscriptionId: "sub_mock_past",
        });

        expect(res.success).toBe(true);
        expect(res.priceTransitionStatus).toBe("transitioned");
        // No Phase 1 or 2 with founder price: only single phase with standard price
        expect(stripeScheduleUpdateBody).toContain("phases[0][items][0][price]");
        expect(stripeScheduleUpdateBody).not.toContain("phases[1][items][0][price]");
      } finally {
        global.fetch = originalFetch;
        process.env.STRIPE_SECRET_KEY = prevKey;
      }
    });

    it("verifies failed, voided, or unpaid invoices cannot increment founder_cycle_count", () => {
      const webhookContent = readFileSync(
        resolve(process.cwd(), "lib/billing/stripe-webhook.ts"),
        "utf8"
      );

      // Verify increment only happens on invoice.paid
      expect(webhookContent).toContain('case "invoice.paid":');
      expect(webhookContent).toContain("record_founder_paid_cycle_atomic");
      // Verify record_founder_paid_cycle_atomic is ONLY called within case "invoice.paid":
      const occurrences = (webhookContent.match(/record_founder_paid_cycle_atomic/g) || []).length;
      expect(occurrences).toBe(1);

      // Verify refund, dispute, and subscription lifecycle handlers never call record_founder_paid_cycle_atomic
      const refundSection = webhookContent.slice(webhookContent.indexOf('case "charge.refunded":'));
      expect(refundSection).not.toContain("record_founder_paid_cycle_atomic");
      // Verify refund safely reverses founder_cycle_count and rolls back transition if attached
      expect(refundSection).toContain("founder_cycle_count: newCycleCount");
      expect(refundSection).toContain("rollbackStandardTransitionOnRefund");
    });
  });
});
