import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  calculateAgencySubscriptionRevenue,
  createClientWorkspace,
  PLAN_PRICING,
  SEED_WORKSPACES,
} from "@/lib/workspaces/service";

describe("White-Label & Multi-Tenancy Workspace Engine", () => {
  it("calculates accurate agency subscription revenue across client tenants", () => {
    const stats = calculateAgencySubscriptionRevenue(SEED_WORKSPACES);

    // Seed workspaces: Apex ($999), Lumina ($499), Vanguard ($499) = $1,997
    expect(stats.totalMonthlyRevenue).toBe(1997);
    expect(stats.activeClientCount).toBe(3);
    expect(stats.averageRevenuePerClient).toBeGreaterThan(0);
  });

  it("creates and provisions a new client workspace with monthly rate", () => {
    const newWs = createClientWorkspace(
      {
        name: "Horizon Wealth Advisory",
        brandName: "Horizon Private Wealth AI",
        plan: "enterprise",
        monthlySubscriptionPrice: PLAN_PRICING.enterprise,
        clientContactName: "David Vance",
        clientContactEmail: "david@horizon.com",
      },
      SEED_WORKSPACES,
    );

    expect(newWs.id).toBeDefined();
    expect(newWs.name).toBe("Horizon Wealth Advisory");
    expect(newWs.slug).toBe("horizon-wealth-advisory");
    expect(newWs.type).toBe("client");
    expect(newWs.plan).toBe("enterprise");
    expect(newWs.monthlySubscriptionPrice).toBe(999);
    expect(newWs.status).toBe("active");
  });

  it("strictly enforces zero emojis across all workspace configurations", () => {
    const emojiRegex =
      /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/u;

    for (const ws of SEED_WORKSPACES) {
      expect(ws.name).not.toMatch(emojiRegex);
      expect(ws.brandName).not.toMatch(emojiRegex);
      expect(ws.clientContactName).not.toMatch(emojiRegex);
    }
  });

  it("verifies WorkspaceSwitcher component and plan options", () => {
    const componentContent = readFileSync(
      resolve(process.cwd(), "components/dashboard/WorkspaceSwitcher.tsx"),
      "utf8",
    );

    expect(componentContent).toContain("Client Subscription MRR");
    expect(componentContent).toContain("Onboard Client Workspace");
    expect(componentContent).toContain("starter");
    expect(componentContent).toContain("growth");
    expect(componentContent).toContain("enterprise");

    const emojiRegex =
      /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/u;
    expect(componentContent).not.toMatch(emojiRegex);
  });
});
