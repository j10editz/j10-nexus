import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  getTrialRuntimeStatus,
  assertWorkspaceEntitlement,
  getWorkspaceEntitlements,
  BillingRequiredError,
  activateWorkspaceTrial,
} from "../../lib/billing/entitlements";
import { getPlanById } from "../../lib/billing/plans";
import { generateGroundedGroupAnswer } from "../../lib/whatsapp/group-knowledge";
import { TrialCountdown } from "../../components/trial/TrialCountdown";
import { TrialDashboardBanner } from "../../components/trial/TrialDashboardBanner";

const root = process.cwd();

describe("Phase 2A — Canonical 72-Hour Trial Experience Hardening", () => {
  describe("1. Accurate Activation Copy & 14-Day Eradication", () => {
    const canonicalActivationCopy = "Your 72-hour free trial starts after you complete and approve Outcome Onboarding.";

    it("ensures LaunchHome.tsx uses exact activation copy and zero 14-day copy", () => {
      const home = readFileSync(resolve(root, "components/marketing/LaunchHome.tsx"), "utf8");
      expect(home).toContain("Start Free 72-Hour Trial");
      expect(home).toContain(canonicalActivationCopy);
      expect(home).not.toMatch(/14-day\s+free\s+trial/i);
      expect(home).not.toMatch(/14-day\s+trial/i);
    });

    it("ensures Footer.tsx uses exact activation copy and zero 14-day copy", () => {
      const footer = readFileSync(resolve(root, "components/Footer.tsx"), "utf8");
      expect(footer).toContain("Start Free 72-Hour Trial");
      expect(footer).toContain(canonicalActivationCopy);
      expect(footer).not.toMatch(/14-day\s+trial/i);
    });

    it("ensures app/login/page.tsx features exact activation copy and zero 14-day copy", () => {
      const login = readFileSync(resolve(root, "app/login/page.tsx"), "utf8");
      expect(login).toContain("Create Account & Start Trial");
      expect(login).toContain(canonicalActivationCopy);
      expect(login).not.toMatch(/14-day\s+free\s+trial/i);
    });

    it("ensures components/Pricing.tsx features exact activation copy", () => {
      const pricing = readFileSync(resolve(root, "components/Pricing.tsx"), "utf8");
      expect(pricing).toContain("Start 72-Hour Free Trial");
      expect(pricing).toContain(canonicalActivationCopy);
      expect(pricing).not.toMatch(/14-day\s+trial/i);
    });

    it("ensures app/onboarding/page.tsx features exact activation copy", () => {
      const onboarding = readFileSync(resolve(root, "app/onboarding/page.tsx"), "utf8");
      expect(onboarding).toContain(canonicalActivationCopy);
      expect(onboarding).not.toMatch(/14-day\s+trial/i);
    });

    it("ensures app/onboarding/outcome/page.tsx features exact activation copy", () => {
      const outcomePage = readFileSync(resolve(root, "app/onboarding/outcome/page.tsx"), "utf8");
      expect(outcomePage).toContain(canonicalActivationCopy);
      expect(outcomePage).not.toMatch(/14-day\s+trial/i);
    });

    it("ensures app/api/billing/trial/route.ts references 72-hour trial exclusively", () => {
      const trialRoute = readFileSync(resolve(root, "app/api/billing/trial/route.ts"), "utf8");
      expect(trialRoute).toContain("Complete and approve Outcome Onboarding to activate the 72-hour trial.");
      expect(trialRoute).not.toMatch(/14-day/i);
    });

    it("never claims the trial begins immediately upon empty workspace creation", () => {
      const home = readFileSync(resolve(root, "components/marketing/LaunchHome.tsx"), "utf8");
      const onboarding = readFileSync(resolve(root, "app/onboarding/page.tsx"), "utf8");
      expect(home).not.toMatch(/trial begins immediately upon creating a workspace/i);
      expect(home).not.toMatch(/trial starts immediately when you create a workspace/i);
      expect(onboarding).not.toMatch(/trial starts immediately/i);
    });

    it("ensures lib/billing/entitlements.ts defaults trial activation to 3 days (72 hours)", () => {
      const entitlements = readFileSync(resolve(root, "lib/billing/entitlements.ts"), "utf8");
      expect(entitlements).toContain("Activates a 72-hour (3-day) trial for eligible workspaces.");
      expect(entitlements).toContain("durationDays = 3");
      expect(entitlements).not.toContain("durationDays = 14");
    });

    it("ensures lib/whatsapp/group-knowledge.ts grounds trial questions with 72-hour trial facts and exact activation copy", () => {
      const result = generateGroundedGroupAnswer({ query: "!ai can I test with a free trial?" });
      expect(result.grounded).toBe(true);
      expect(result.answer).toContain("72-hour free trial");
      expect(result.answer).toContain(canonicalActivationCopy);
      expect(result.answer).not.toMatch(/14-day\s+trial/i);
    });
  });

  describe("2. Demo Mode Labeling in TrialCountdown", () => {
    it("removes generic demo mode label when isDemoMode is false or omitted", () => {
      const serverNow = "2026-10-01T12:00:00.000Z";
      const endsAt = "2026-10-03T12:00:00.000Z";
      const html = renderToStaticMarkup(
        createElement(TrialCountdown, { endsAt, serverNow, status: "active" })
      );

      expect(html).not.toContain("WhatsApp is in interactive demo mode");
      expect(html).not.toContain("interactive demo mode");
      expect(html).toContain("Autonomous AI workforce active. AI and automations are fully enabled for testing.");
    });

    it("only displays demo mode wording when isDemoMode is explicitly true", () => {
      const serverNow = "2026-10-01T12:00:00.000Z";
      const endsAt = "2026-10-03T12:00:00.000Z";
      const html = renderToStaticMarkup(
        createElement(TrialCountdown, {
          endsAt,
          serverNow,
          status: "active",
          isDemoMode: true,
          demoLabel: "Explicit Sandbox Demo Environment",
        })
      );

      expect(html).toContain("Explicit Sandbox Demo Environment");
      expect(html).toContain("Demo");
    });
  });

  describe("3. Provenance of 6 Subscription States", () => {
    // State 1: trialing with more than 12 hours
    it("State 1: trialing with > 12 hours displays normal countdown and no urgency/lock banner", () => {
      const serverNow = new Date("2026-10-01T12:00:00.000Z");
      const trialEndsAt = new Date("2026-10-03T12:00:00.000Z").toISOString(); // 48h later

      const status = getTrialRuntimeStatus(
        { provenance: "trial", trialStatus: "active", trialEndsAt, trialEnd: null },
        serverNow
      );
      expect(status).toBe("active");

      const html = renderToStaticMarkup(
        createElement(TrialCountdown, { endsAt: trialEndsAt, serverNow: serverNow.toISOString(), status: "active" })
      );
      expect(html).toContain('data-trial-state="active"');
      expect(html).toContain("48h 0m remaining");
      expect(html).not.toContain("Ending Soon");
      expect(html).not.toContain("Trial Expired");
    });

    // State 2: trialing with 12 hours or less
    it("State 2: trialing with <= 12 hours displays amber warning and checkout CTA", () => {
      const serverNow = new Date("2026-10-03T02:00:00.000Z");
      const trialEndsAt = new Date("2026-10-03T12:00:00.000Z").toISOString(); // 10h remaining

      const status = getTrialRuntimeStatus(
        { provenance: "trial", trialStatus: "active", trialEndsAt, trialEnd: null },
        serverNow
      );
      expect(status).toBe("active");

      const html = renderToStaticMarkup(
        createElement(TrialCountdown, { endsAt: trialEndsAt, serverNow: serverNow.toISOString(), status: "active" })
      );
      expect(html).toContain('data-trial-state="under_12h"');
      expect(html).toContain("10h 0m remaining");
      expect(html).toContain("Ending Soon");
      expect(html).toContain('data-testid="trial-checkout-cta"');
      expect(html).toContain("Select Plan &amp; Keep AI Active");
    });

    // State 3: expired trial with no paid entitlement
    it("State 3: expired trial with no paid entitlement renders red upgrade state and disables execution", async () => {
      const serverNow = new Date("2026-10-03T12:00:01.000Z");
      const trialEndsAt = new Date("2026-10-03T12:00:00.000Z").toISOString();

      const status = getTrialRuntimeStatus(
        { provenance: "trial", trialStatus: "expired", trialEndsAt, trialEnd: null },
        serverNow
      );
      expect(status).toBe("expired");

      const html = renderToStaticMarkup(
        createElement(TrialCountdown, { endsAt: trialEndsAt, serverNow: serverNow.toISOString(), status: "expired" })
      );
      expect(html).toContain('data-trial-state="expired"');
      expect(html).toContain("Trial Expired");
      expect(html).toContain("Execution Paused");
      expect(html).toContain('data-testid="trial-checkout-cta"');

      // Server assertion throws TRIAL_EXPIRED
      const mockSupabase = {
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: "sub_mock_expired",
                  workspace_id: "ws_mock_expired",
                  plan_id: "growth",
                  status: "trialing",
                  provenance: "trial",
                  trial_started_at: "2026-09-20T12:00:00.000Z",
                  trial_ends_at: trialEndsAt,
                  trial_status: "expired",
                  monthly_message_limit: 250,
                  messages_used_this_period: 0,
                },
                error: null,
              }),
            }),
          }),
        }),
      } as any;

      await expect(
        assertWorkspaceEntitlement(mockSupabase, "ws_mock_expired")
      ).rejects.toMatchObject({
        code: "BILLING_REQUIRED",
        reason: "TRIAL_EXPIRED",
      });
    });

    // State 4: active paid subscription with an old/expired trial_ends_at
    it("State 4: active paid subscription with old/expired trial_ends_at is never locked and AI execution allowed", async () => {
      const serverNow = new Date("2026-10-01T12:00:00.000Z");
      const oldTrialEndsAt = "2026-05-01T12:00:00.000Z"; // Ended months ago

      // getTrialRuntimeStatus returns null for paid subscriptions (provenance !== "trial")
      const runtimeStatus = getTrialRuntimeStatus(
        {
          provenance: "stripe",
          trialStatus: "expired",
          trialEndsAt: oldTrialEndsAt,
          trialEnd: null,
        },
        serverNow
      );
      expect(runtimeStatus).toBeNull();

      const mockSupabase = {
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: "sub_paid_active",
                  workspace_id: "ws_paid_active",
                  plan_id: "growth",
                  status: "active",
                  provenance: "stripe",
                  monthly_message_limit: 1000,
                  messages_used_this_period: 12,
                  current_period_end: "2026-11-01T12:00:00.000Z",
                  trial_ends_at: oldTrialEndsAt,
                  trial_status: "expired",
                },
                error: null,
              }),
            }),
          }),
        }),
      } as any;

      // Must succeed without throwing TRIAL_EXPIRED
      const sub = await assertWorkspaceEntitlement(mockSupabase, "ws_paid_active");
      expect(sub.id).toBe("sub_paid_active");
      expect(sub.status).toBe("active");

      const entitlements = await getWorkspaceEntitlements(mockSupabase, "ws_paid_active");
      expect(entitlements.isEntitled).toBe(true);
      expect(entitlements.trialActive).toBe(false);
    });

    // State 5: paid cancellation scheduled at period end
    it("State 5: paid cancellation scheduled at period end remains fully accessible until period end", async () => {
      const serverNow = new Date("2026-10-01T12:00:00.000Z");
      const futurePeriodEnd = "2026-10-25T12:00:00.000Z";

      const mockSupabase = {
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: "sub_cancel_scheduled",
                  workspace_id: "ws_cancel_scheduled",
                  plan_id: "growth",
                  status: "active",
                  cancel_at_period_end: true,
                  provenance: "stripe",
                  monthly_message_limit: 1000,
                  messages_used_this_period: 50,
                  current_period_end: futurePeriodEnd,
                },
                error: null,
              }),
            }),
          }),
        }),
      } as any;

      // Entitlement remains active while within current period
      const sub = await assertWorkspaceEntitlement(mockSupabase, "ws_cancel_scheduled");
      expect(sub.id).toBe("sub_cancel_scheduled");
      expect(sub.cancelAtPeriodEnd).toBe(true);

      const entitlements = await getWorkspaceEntitlements(mockSupabase, "ws_cancel_scheduled");
      expect(entitlements.isEntitled).toBe(true);
    });

    // State 6: loading or missing subscription data
    it("State 6: missing or loading subscription data never flashes expired banner", () => {
      // Countdown with null endsAt and non-expired status returns null (no banner rendered)
      const html = renderToStaticMarkup(
        createElement(TrialCountdown, { endsAt: null, status: null })
      );
      expect(html).toBe("");
    });
  });

  describe("4. Secure Client Boundary & Sanitization", () => {
    it("verifies zero service-role keys exist in client components", () => {
      const countdownCode = readFileSync(resolve(root, "components/trial/TrialCountdown.tsx"), "utf8");
      const contextCode = readFileSync(resolve(root, "components/trial/TrialContext.tsx"), "utf8");
      const bannerCode = readFileSync(resolve(root, "components/trial/TrialDashboardBanner.tsx"), "utf8");
      const taskDispatcher = readFileSync(resolve(root, "components/ai-employees/WorkforceTaskDispatcher.tsx"), "utf8");

      expect(countdownCode).not.toContain("SERVICE_ROLE");
      expect(contextCode).not.toContain("SERVICE_ROLE");
      expect(bannerCode).not.toContain("SERVICE_ROLE");
      expect(taskDispatcher).not.toContain("SERVICE_ROLE");
    });

    it("verifies outcome route sanitizes trial_ends_at to null for paid active subscriptions", () => {
      const outcomeRoute = readFileSync(resolve(root, "app/api/onboarding/outcome/route.ts"), "utf8");
      expect(outcomeRoute).toContain("trial_ends_at: isPaidActive ? null : subscription.trial_ends_at");
      expect(outcomeRoute).toContain("isPaidActive");
    });
  });

  describe("5. Component Resilience: Hydration, Timer Cleanup, and Zero-State Transition", () => {
    it("cleans up timer and listeners in TrialCountdown", () => {
      const countdownCode = readFileSync(resolve(root, "components/trial/TrialCountdown.tsx"), "utf8");
      expect(countdownCode).toContain("window.clearInterval(timer)");
      expect(countdownCode).toContain("window.removeEventListener(\"focus\", tick)");
      expect(countdownCode).toContain("document.removeEventListener(\"visibilitychange\", handleVisibility)");
    });

    it("transitions directly to expired state when remaining <= 0 without requiring reload", () => {
      let currentState = "";
      const endsAt = "2026-10-01T12:00:00.000Z";
      const serverNow = "2026-10-01T12:00:01.000Z"; // Exactly past 0

      const html = renderToStaticMarkup(
        createElement(TrialCountdown, {
          endsAt,
          serverNow,
          status: "active",
          onStateChange: (s) => {
            currentState = s;
          },
        })
      );

      expect(html).toContain('data-trial-state="expired"');
      expect(html).toContain("Trial Expired");
    });
  });

  describe("6. Authenticated Checkout Flow and Approved Pricing Alignment", () => {
    it("confirms checkout CTAs link to authenticated pricing flow and not a fake Stripe URL", () => {
      const htmlActive = renderToStaticMarkup(
        createElement(TrialCountdown, {
          endsAt: "2026-10-03T12:00:00.000Z",
          serverNow: "2026-10-01T12:00:00.000Z",
          status: "active",
        })
      );
      expect(htmlActive).toContain('href="/pricing"');
      expect(htmlActive).not.toContain("buy.stripe.com");

      const htmlExpired = renderToStaticMarkup(
        createElement(TrialCountdown, {
          endsAt: "2026-10-01T12:00:00.000Z",
          serverNow: "2026-10-01T12:00:01.000Z",
          status: "expired",
        })
      );
      expect(htmlExpired).toContain('href="/pricing"');
      expect(htmlExpired).not.toContain("buy.stripe.com");
    });

    it("confirms app/api/billing/checkout/route.ts requires admin auth and uses server-side price resolution", () => {
      const checkoutRoute = readFileSync(resolve(root, "app/api/billing/checkout/route.ts"), "utf8");
      expect(checkoutRoute).toContain('requireApiWorkspaceContext("admin")');
      expect(checkoutRoute).toContain("createWorkspaceSubscriptionCheckout");
      expect(checkoutRoute).toContain("Authoritative server-side pricing resolution");
    });
  });
});
