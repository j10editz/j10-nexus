import { describe, expect, it } from "vitest";
import { PLANS } from "@/lib/billing/plans";
import { resolvePlanLimits } from "@/lib/billing/stripe-webhook";

describe("Billing Subscription API & Tier Alignment", () => {
  it("defines the Founder's 3 pilot and 3 core commercial tiers with correct limits", () => {
    expect(PLANS).toHaveLength(4);

    const founders = PLANS.find((p) => p.id === "founders3");
    const starter = PLANS.find((p) => p.id === "starter");
    const growth = PLANS.find((p) => p.id === "growth");
    const enterprise = PLANS.find((p) => p.id === "enterprise");

    expect(founders).toBeDefined();
    expect(starter).toBeDefined();
    expect(growth).toBeDefined();
    expect(enterprise).toBeDefined();

    expect(founders?.price).toBe(99);
    expect(founders?.standardPrice).toBe(149);
    expect(founders?.introductoryCycleDuration).toBe(12);
    expect(founders?.messageLimit).toBe(1000);
    expect(founders?.aiEmployees).toBe(3);

    expect(starter?.price).toBe(49);
    expect(starter?.messageLimit).toBe(1000);
    expect(starter?.aiEmployees).toBe(2);

    expect(growth?.price).toBe(149);
    expect(growth?.messageLimit).toBe(10000);
    expect(growth?.aiEmployees).toBe(10);
    expect(growth?.popular).toBe(true);

    expect(enterprise?.price).toBe(499);
    expect(enterprise?.messageLimit).toBe(100000);
  });

  it("aligns API plan limits with Stripe webhook limit resolver", () => {
    for (const plan of PLANS) {
      const resolved = resolvePlanLimits(plan.id);
      expect(resolved.monthlyMessageLimit).toBe(plan.messageLimit);
    }
  });

  it("ensures all plans have distinctive feature arrays and descriptions", () => {
    for (const plan of PLANS) {
      expect(plan.features.length).toBeGreaterThanOrEqual(5);
      expect(plan.description.length).toBeGreaterThan(20);
      expect(plan.interval).toBe("month");
    }
  });
});
