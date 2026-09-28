import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolvePlanPriceId, validateStripePriceForCheckout, createWorkspaceSubscriptionCheckout } from "@/lib/billing/checkout";
import { createStripePaymentLink } from "@/lib/stripe";

describe("Launch Phase 2: P0 Blockers Certification Suite", () => {
  const originalEnv = { ...process.env };

  function setNodeEnv(val?: string) {
    if (val === undefined) {
      delete (process.env as any).NODE_ENV;
    } else {
      (process.env as any).NODE_ENV = val;
    }
  }

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe("P0-1: /api/inbox/threads Route Authentication & UUID Boundaries", () => {
    it("ensures /api/inbox/threads route validates authenticated user and UUID workspace id", () => {
      const routeContent = readFileSync(
        resolve(process.cwd(), "app/api/inbox/threads/route.ts"),
        "utf8"
      );

      // Must require active context AND user identity
      expect(routeContent).toContain("getActiveWorkspaceContext");
      expect(routeContent).toContain("if (!context || !context.user)");
      expect(routeContent).toContain("Unauthorized");

      // Must validate UUID syntax before querying database
      expect(routeContent).toContain("UUID_REGEX");
      expect(routeContent).toContain("Active workspace required.");
    });

    it("ensures /api/inbox/threads/[id] route enforces same authentication and UUID boundary", () => {
      const routeContent = readFileSync(
        resolve(process.cwd(), "app/api/inbox/threads/[id]/route.ts"),
        "utf8"
      );

      expect(routeContent).toContain("if (!context || !context.user)");
      expect(routeContent).toContain("UUID_REGEX");
    });
  });

  describe("P0-2: Multi-Plan Stripe Checkout Price Resolution", () => {
    it("resolves configured price IDs across tiers (starter, growth, business, founders3) and treats enterprise as quote-only", () => {
      process.env.STRIPE_FOUNDERS3_PRICE_ID = "price_f3_monthly";
      process.env.STRIPE_STARTER_PRICE_ID = "price_starter_monthly";
      process.env.STRIPE_STARTER_ANNUAL_PRICE_ID = "price_starter_annual";
      process.env.STRIPE_GROWTH_PRICE_ID = "price_growth_monthly";
      process.env.STRIPE_GROWTH_ANNUAL_PRICE_ID = "price_growth_annual";
      process.env.STRIPE_BUSINESS_PRICE_ID = "price_business_monthly";
      process.env.STRIPE_BUSINESS_ANNUAL_PRICE_ID = "price_business_annual";

      expect(resolvePlanPriceId("founders3")).toBe("price_f3_monthly");
      expect(resolvePlanPriceId("starter")).toBe("price_starter_monthly");
      expect(resolvePlanPriceId("starter", "year")).toBe("price_starter_annual");
      expect(resolvePlanPriceId("growth")).toBe("price_growth_monthly");
      expect(resolvePlanPriceId("growth", "year")).toBe("price_growth_annual");
      expect(resolvePlanPriceId("business")).toBe("price_business_monthly");
      expect(resolvePlanPriceId("business", "year")).toBe("price_business_annual");
      expect(resolvePlanPriceId("enterprise")).toBeUndefined();
    });

    it("fails closed in production with plan-specific error when Price ID is missing", async () => {
      setNodeEnv("production");
      process.env.STRIPE_SECRET_KEY = "sk_live_test_mock_key";
      delete process.env.STRIPE_GROWTH_PRICE_ID;
      delete process.env.STRIPE_GROWTH_ANNUAL_PRICE_ID;

      const res = await validateStripePriceForCheckout({
        secretKey: "sk_live_test_mock_key",
        planId: "growth",
      });

      expect(res.valid).toBe(false);
      expect(res.error).toContain("Missing STRIPE_GROWTH_PRICE_ID");
      expect(res.error).toContain("growth");
    });

    it("preserves exact Founders3 missing price error message required by legacy tests", async () => {
      setNodeEnv("production");
      process.env.STRIPE_SECRET_KEY = "sk_live_test_mock_key";
      delete process.env.STRIPE_FOUNDERS3_PRICE_ID;
      delete process.env.STRIPE_STANDARD_PRICE_ID;

      const res = await validateStripePriceForCheckout({
        secretKey: "sk_live_test_mock_key",
        planId: "founders3",
      });

      expect(res.valid).toBe(false);
      expect(res.error).toContain("Missing STRIPE_FOUNDERS3_PRICE_ID");
    });

    it("safely rejects enterprise checkout attempts", async () => {
      const mockSupabase = {} as any;
      await expect(
        createWorkspaceSubscriptionCheckout(mockSupabase, {
          workspaceId: "ws_test_ent",
          planId: "enterprise",
        })
      ).rejects.toThrow(/Enterprise plans require a custom quote/);
    });

    it("creates checkout session for growth tier ($49) when price ID is configured", async () => {
      process.env.STRIPE_GROWTH_PRICE_ID = "price_growth_test_123";
      delete process.env.STRIPE_SECRET_KEY; // Sandbox mode

      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          single: vi.fn().mockResolvedValue({ data: { id: "co_123" }, error: null }),
          update: vi.fn().mockReturnThis(),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: "co_123" }, error: null }),
            }),
          }),
        })),
      } as any;

      const checkout = await createWorkspaceSubscriptionCheckout(mockSupabase, {
        workspaceId: "ws_test_growth_123",
        planId: "growth",
      });

      expect(checkout.planId).toBe("growth");
      expect(checkout.amount).toBe(49);
      expect(checkout.checkoutUrl).toBeDefined();
    });
  });

  describe("P0-3: Fake Checkout Link Elimination & Production Fail-Closed", () => {
    it("ensures inbox chat UI never generates fake random cs_test URLs", () => {
      const inboxPageContent = readFileSync(
        resolve(process.cwd(), "app/dashboard/inbox/page.tsx"),
        "utf8"
      );

      // Must not construct fake cs_test link using Math.random
      expect(inboxPageContent).not.toMatch(/cs_test_\$\{Math\.random/);
      expect(inboxPageContent).toContain("if (!response.ok || !data.checkoutUrl)");
    });

    it("createStripePaymentLink throws in production when STRIPE_SECRET_KEY is missing", async () => {
      setNodeEnv("production");
      delete process.env.STRIPE_SECRET_KEY;

      await expect(
        createStripePaymentLink({
          title: "Production Diagnostic Package",
          amount: 2500,
        })
      ).rejects.toThrow(/Stripe billing secret key is missing in production environment/);
    });

    it("createStripePaymentLink throws in production if Stripe API fails, never falling back to sandbox link", async () => {
      setNodeEnv("production");
      process.env.STRIPE_SECRET_KEY = "sk_live_mock_secret_key";

      // Mock fetch to simulate 500 error from Stripe
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: false,
        statusText: "Internal Stripe Error",
        json: async () => ({ error: { message: "Card processor unavailable" } }),
      } as any);

      await expect(
        createStripePaymentLink({
          title: "Emergency Pipe Relining",
          amount: 5000,
        })
      ).rejects.toThrow(/Stripe API call failed: Card processor unavailable/);

      fetchSpy.mockRestore();
    });
  });

  describe("P0-4: Dashboard Authentication Lockdown & Middleware Boundary", () => {
    it("ensures getActiveWorkspaceContext returns null when no user session exists", () => {
      const serverWorkspacesCode = readFileSync(
        resolve(process.cwd(), "lib/workspaces/server.ts"),
        "utf8"
      );

      // getActiveWorkspaceContext must check user and return null (never DEMO_WORKSPACE_CONTEXT)
      expect(serverWorkspacesCode).toMatch(/const user = await getCurrentUser\(\);\s+if \(!user\) \{\s+return null;\s+\}/);
      expect(serverWorkspacesCode).not.toContain("return DEMO_WORKSPACE_CONTEXT;");

      // requireWorkspaceContext must check user first and redirect to login
      expect(serverWorkspacesCode).toMatch(/const user = await getCurrentUser\(\);\s+if \(!user\) \{\s+const loginUrl = returnUrl \? `\/login\?next=\$\{encodeURIComponent\(returnUrl\)\}` : "\/login";\s+redirect\(loginUrl\);\s+\}/);
    });

    it("ensures middleware.ts checks Supabase user and redirects unauthenticated requests from /dashboard to /login", () => {
      const middlewareContent = readFileSync(
        resolve(process.cwd(), "middleware.ts"),
        "utf8"
      );

      expect(middlewareContent).toContain('pathname.startsWith("/dashboard")');
      expect(middlewareContent).toContain("supabase.auth.getUser()");
      expect(middlewareContent).toContain('NextResponse.redirect(loginUrl)');
      expect(middlewareContent).not.toContain("Allow /dashboard to serve the Demo Revenue Command Center for guest visitors");
    });
  });
});
