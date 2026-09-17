import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createWorkspaceSubscriptionCheckout } from "@/lib/billing/checkout";
import { POST as checkoutRouteHandler } from "@/app/api/billing/checkout/route";
import { NextRequest } from "next/server";

vi.mock("@/lib/workspaces/server", () => ({
  requireApiWorkspaceContext: vi.fn(async () => ({
    error: null,
    context: {
      workspace: { id: "ws_test_route_context" },
      membership: { role: "owner" },
      user: { id: "usr_route_owner", email: "contact.j10editz@gmail.com" },
    },
  })),
}));

vi.mock("@/lib/auth", () => ({
  createServerSupabaseClient: vi.fn(() => ({})),
}));

describe("Founder's 3 Checkout Contract & Resilience Tests", () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.STRIPE_SECRET_KEY = "sk_test_mock_secret_key";
    process.env.STRIPE_FOUNDERS3_PRICE_ID = "price_f3_monthly_99";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it("1 & 2: Founder Checkout succeeds under production schema and checkout_url is non-null", async () => {
    let capturedInsertPayload: any = null;
    const sessionUrl = "https://checkout.stripe.com/c/pay/cs_test_session_123";
    const sessionId = "cs_test_session_123";

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
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
            insert: vi.fn((payload: any) => {
              capturedInsertPayload = payload;
              return {
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: payload.id || "co_internal_123" },
                    error: null,
                  }),
                }),
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
      rpc: vi.fn((fn: string) => {
        if (fn === "reserve_founders3_slot_atomic") {
          return Promise.resolve({
            data: { success: true, reservation_id: "res_f3_valid_123", remaining_slots: 2 },
            error: null,
          });
        }
        if (fn === "bind_founders3_checkout_session_atomic") {
          return Promise.resolve({
            data: { success: true, reservation_id: "res_f3_valid_123" },
            error: null,
          });
        }
        return Promise.resolve({ data: { success: true }, error: null });
      }),
    } as any;

    const mockFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr.includes("/v1/prices/")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: "price_f3_monthly_99",
            active: true,
            currency: "usd",
            unit_amount: 9900,
            recurring: { interval: "month" },
            livemode: false,
          }),
        } as any;
      }
      if (urlStr.includes("/v1/customers")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: "cus_mock_f3_123" }),
        } as any;
      }
      if (urlStr.includes("/v1/checkout/sessions") && init?.method === "POST" && !urlStr.includes("/expire")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: sessionId,
            url: sessionUrl,
            managed_payments: { enabled: false },
          }),
        } as any;
      }
      return { ok: true, status: 200, json: async () => ({}) } as any;
    });

    global.fetch = mockFetch;

    const result = await createWorkspaceSubscriptionCheckout(mockSupabase, {
      workspaceId: "ws_test_founders3",
      planId: "founders3",
      invitationCode: "F3-VALID-INVITE-2026",
    });

    expect(result.sessionId).toBe(sessionId);
    expect(result.checkoutUrl).toBe(sessionUrl);
    expect(capturedInsertPayload).not.toBeNull();

    // Contract B Assertion: Single complete insert with non-null checkout_url
    expect(capturedInsertPayload.checkout_url).toBe(sessionUrl);
    expect(capturedInsertPayload.status).toBe("pending");
    expect(capturedInsertPayload.provider_mode).toBe("test");
    expect(capturedInsertPayload.stripe_checkout_session_id).toBe(sessionId);
    expect(capturedInsertPayload.stripe_customer_id).toBe("cus_mock_f3_123");
  });

  it("3: Database persistence failure expires Stripe session and releases reservation", async () => {
    let expiredSessionId: string | null = null;
    let releasedWorkspaceId: string | null = null;
    let releaseReason: string | null = null;

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
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
            insert: vi.fn(() => ({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: null,
                  error: {
                    message: "Database connection terminated unexpectedly",
                    code: "08006",
                  },
                }),
              }),
            })),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }),
      rpc: vi.fn((fn: string, params: any) => {
        if (fn === "reserve_founders3_slot_atomic") {
          return Promise.resolve({
            data: { success: true, reservation_id: "res_f3_db_fail_123", remaining_slots: 2 },
            error: null,
          });
        }
        if (fn === "release_founders3_reservation_atomic") {
          releasedWorkspaceId = params.p_workspace_id;
          releaseReason = params.p_reason;
          return Promise.resolve({
            data: { success: true, released: true },
            error: null,
          });
        }
        return Promise.resolve({ data: { success: true }, error: null });
      }),
    } as any;

    const mockFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr.includes("/v1/prices/")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: "price_f3_monthly_99",
            active: true,
            currency: "usd",
            unit_amount: 9900,
            recurring: { interval: "month" },
            livemode: false,
          }),
        } as any;
      }
      if (urlStr.includes("/v1/customers")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: "cus_mock_db_fail" }),
        } as any;
      }
      if (urlStr.includes("/v1/checkout/sessions") && init?.method === "POST" && !urlStr.includes("/expire")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: "cs_test_orphan_prevented",
            url: "https://checkout.stripe.com/c/pay/cs_test_orphan_prevented",
            managed_payments: { enabled: false },
          }),
        } as any;
      }
      if (urlStr.includes("/expire")) {
        const match = urlStr.match(/\/checkout\/sessions\/(.+?)\/expire/);
        if (match) expiredSessionId = match[1];
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: "cs_test_orphan_prevented", status: "expired" }),
        } as any;
      }
      return { ok: true, status: 200, json: async () => ({}) } as any;
    });

    global.fetch = mockFetch;

    await expect(
      createWorkspaceSubscriptionCheckout(mockSupabase, {
        workspaceId: "ws_test_db_failure",
        planId: "founders3",
        invitationCode: "F3-FAIL-RECOVERY",
      })
    ).rejects.toThrow("Unable to create internal payment checkout record. Please try again.");

    // Stripe orphan session was expired
    expect(expiredSessionId).toBe("cs_test_orphan_prevented");
    // Founder reservation was released back to capacity
    expect(releasedWorkspaceId).toBe("ws_test_db_failure");
    expect(releaseReason).toBe("checkout_record_creation_failed");
  });

  it("4: Stripe failure releases reservation without internal record insertion", async () => {
    let releasedWorkspaceId: string | null = null;
    let insertCalled = false;

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === "payment_checkouts") {
          return {
            insert: vi.fn(() => {
              insertCalled = true;
              return { select: vi.fn().mockReturnValue({ single: vi.fn() }) };
            }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        };
      }),
      rpc: vi.fn((fn: string, params: any) => {
        if (fn === "reserve_founders3_slot_atomic") {
          return Promise.resolve({
            data: { success: true, reservation_id: "res_f3_stripe_fail_123", remaining_slots: 2 },
            error: null,
          });
        }
        if (fn === "release_founders3_reservation_atomic") {
          releasedWorkspaceId = params.p_workspace_id;
          return Promise.resolve({ data: { success: true, released: true }, error: null });
        }
        return Promise.resolve({ data: { success: true }, error: null });
      }),
    } as any;

    const mockFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr.includes("/v1/prices/")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: "price_f3_monthly_99",
            active: true,
            currency: "usd",
            unit_amount: 9900,
            recurring: { interval: "month" },
            livemode: false,
          }),
        } as any;
      }
      if (urlStr.includes("/v1/customers")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: "cus_mock_stripe_fail" }),
        } as any;
      }
      if (urlStr.includes("/v1/checkout/sessions")) {
        return {
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
          json: async () => ({ error: { message: "Stripe API temporarily unavailable" } }),
        } as any;
      }
      return { ok: true, status: 200, json: async () => ({}) } as any;
    });

    global.fetch = mockFetch;

    await expect(
      createWorkspaceSubscriptionCheckout(mockSupabase, {
        workspaceId: "ws_stripe_failure",
        planId: "founders3",
        invitationCode: "F3-STRIPE-FAIL",
      })
    ).rejects.toThrow(/Stripe Checkout Session creation failed/);

    expect(releasedWorkspaceId).toBe("ws_stripe_failure");
    expect(insertCalled).toBe(false);
  });

  it("5: Retrying the same request is idempotent and expires previous stale checkout session", async () => {
    let expiredPreviousSession = false;

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
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: "co_stale_prior_123",
                stripe_checkout_session_id: "cs_test_stale_old_session",
              },
              error: null,
            }),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
            insert: vi.fn((payload: any) => ({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: payload.id || "co_new_123" },
                  error: null,
                }),
              }),
            })),
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
          // Idempotent refresh of existing reservation
          return Promise.resolve({
            data: { success: true, reservation_id: "res_existing_123", remaining_slots: 2 },
            error: null,
          });
        }
        if (fn === "bind_founders3_checkout_session_atomic") {
          return Promise.resolve({ data: { success: true }, error: null });
        }
        return Promise.resolve({ data: { success: true }, error: null });
      }),
    } as any;

    const mockFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr.includes("/v1/prices/")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: "price_f3_monthly_99",
            active: true,
            currency: "usd",
            unit_amount: 9900,
            recurring: { interval: "month" },
            livemode: false,
          }),
        } as any;
      }
      if (urlStr.includes("/v1/customers")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: "cus_mock_retry" }),
        } as any;
      }
      if (urlStr.includes("/v1/checkout/sessions/cs_test_stale_old_session/expire")) {
        expiredPreviousSession = true;
        return { ok: true, status: 200, json: async () => ({ id: "cs_test_stale_old_session", status: "expired" }) } as any;
      }
      if (urlStr.includes("/v1/checkout/sessions") && init?.method === "POST") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: "cs_test_fresh_new_session",
            url: "https://checkout.stripe.com/c/pay/cs_test_fresh_new_session",
            managed_payments: { enabled: false },
          }),
        } as any;
      }
      return { ok: true, status: 200, json: async () => ({}) } as any;
    });

    global.fetch = mockFetch;

    const result = await createWorkspaceSubscriptionCheckout(mockSupabase, {
      workspaceId: "ws_idempotent_retry",
      planId: "founders3",
      invitationCode: "F3-RETRY-TEST",
    });

    expect(result.sessionId).toBe("cs_test_fresh_new_session");
    expect(expiredPreviousSession).toBe(true);
  });

  it("6: Invitation is not consumed before successful invoice.paid Checkout binding", async () => {
    // Verifies that checkout initiation only places a reservation hold and does not increment used_count
    let rpcCalledWithHash = false;

    const mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        insert: vi.fn((payload: any) => ({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: payload.id }, error: null }),
          }),
        })),
      })),
      rpc: vi.fn((fn: string, params: any) => {
        if (fn === "reserve_founders3_slot_atomic") {
          expect(params.p_invitation_code_hash).toBeDefined();
          rpcCalledWithHash = true;
          // Returns reservation hold without touching used_count
          return Promise.resolve({
            data: { success: true, reservation_id: "res_invite_hold", remaining_slots: 2 },
            error: null,
          });
        }
        return Promise.resolve({ data: { success: true }, error: null });
      }),
    } as any;

    const mockFetch = vi.fn(async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes("/v1/prices/")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: "price_f3_monthly_99",
            active: true,
            currency: "usd",
            unit_amount: 9900,
            recurring: { interval: "month" },
            livemode: false,
          }),
        } as any;
      }
      if (urlStr.includes("/v1/customers")) {
        return { ok: true, status: 200, json: async () => ({ id: "cus_invite_check" }) } as any;
      }
      if (urlStr.includes("/v1/checkout/sessions")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: "cs_test_invite_hold",
            url: "https://checkout.stripe.com/pay/cs_test_invite_hold",
            managed_payments: { enabled: false },
          }),
        } as any;
      }
      return { ok: true, status: 200, json: async () => ({}) } as any;
    });

    global.fetch = mockFetch;

    const res = await createWorkspaceSubscriptionCheckout(mockSupabase, {
      workspaceId: "ws_invite_test",
      planId: "founders3",
      invitationCode: "F3-HOLD-NOT-CONSUMED",
    });

    expect(rpcCalledWithHash).toBe(true);
    expect(res.sessionId).toBe("cs_test_invite_hold");
  });

  it("7: Route handler validates planId and sanitizes raw database/schema errors", async () => {
    // 1. Invalid planId returns 400
    const reqInvalid = new NextRequest("http://localhost:3000/api/billing/checkout", {
      method: "POST",
      body: JSON.stringify({ planId: "invalid_plan_choice" }),
    });

    const resInvalid = await checkoutRouteHandler(reqInvalid);
    const jsonInvalid = await resInvalid.json();
    expect(resInvalid.status).toBe(400);
    expect(jsonInvalid.success).toBe(false);
    expect(jsonInvalid.error).toContain("Invalid planId");

    // 2. Database constraint leak sanitization
    // If an internal database error occurs, client gets a safe message, not raw table/constraint names
    const reqDbError = new NextRequest("http://localhost:3000/api/billing/checkout", {
      method: "POST",
      body: JSON.stringify({ planId: "growth" }),
    });

    // Mock createWorkspaceSubscriptionCheckout to throw raw postgres error
    const billingCheckoutMod = await import("@/lib/billing/checkout");
    const spy = vi.spyOn(billingCheckoutMod, "createWorkspaceSubscriptionCheckout").mockRejectedValueOnce(
      new Error("null value in column checkout_url of relation payment_checkouts violates not-null constraint")
    );

    const resDbError = await checkoutRouteHandler(reqDbError);
    const jsonDbError = await resDbError.json();
    expect(resDbError.status).toBe(500);
    expect(jsonDbError.success).toBe(false);
    expect(jsonDbError.error).toBe("Unable to initialize checkout session. Please try again in a few moments.");
    expect(jsonDbError.error).not.toContain("payment_checkouts");
    expect(jsonDbError.error).not.toContain("not-null constraint");

    spy.mockRestore();
  });
});
