import { describe, expect, it } from "vitest";
import { PLANS, PUBLIC_PLANS } from "@/lib/billing/plans";
import { resolvePlanLimits } from "@/lib/billing/stripe-webhook";

describe("Billing Subscription API & Tier Alignment", () => {
  it("defines the approved pricing across public tiers and private Founders 3 pilot", () => {
    expect(PLANS).toHaveLength(5);
    expect(PUBLIC_PLANS).toHaveLength(4);

    const starter = PLANS.find((p) => p.id === "starter");
    const growth = PLANS.find((p) => p.id === "growth");
    const business = PLANS.find((p) => p.id === "business");
    const enterprise = PLANS.find((p) => p.id === "enterprise");
    const founders = PLANS.find((p) => p.id === "founders3");

    expect(starter).toBeDefined();
    expect(growth).toBeDefined();
    expect(business).toBeDefined();
    expect(enterprise).toBeDefined();
    expect(founders).toBeDefined();

    // Starter: $19/mo, $190/yr
    expect(starter?.price).toBe(19);
    expect(starter?.annualPrice).toBe(190);
    expect(starter?.messageLimit).toBe(1000);
    expect(starter?.aiEmployees).toBe(2);

    // Growth: $49/mo, $490/yr
    expect(growth?.price).toBe(49);
    expect(growth?.annualPrice).toBe(490);
    expect(growth?.messageLimit).toBe(10000);
    expect(growth?.aiEmployees).toBe(10);
    expect(growth?.popular).toBe(true);

    // Business: $99/mo, $990/yr
    expect(business?.price).toBe(99);
    expect(business?.annualPrice).toBe(990);
    expect(business?.messageLimit).toBe(30000);
    expect(business?.aiEmployees).toBe(25);

    // Enterprise: Starting from $199, quote-only
    expect(enterprise?.price).toBe(199);
    expect(enterprise?.quoteOnly).toBe(true);
    expect(enterprise?.messageLimit).toBe(100000);

    // Founders 3: $29/mo for 12 months, then standard Growth $49/mo
    expect(founders?.price).toBe(29);
    expect(founders?.standardPrice).toBe(49);
    expect(founders?.introductoryCycleDuration).toBe(12);
    expect(founders?.privateOnly).toBe(true);
    expect(founders?.messageLimit).toBe(10000);
    expect(founders?.aiEmployees).toBe(10);
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
