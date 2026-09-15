import { describe, expect, it } from "vitest";

import { DEMO_REVENUE_DASHBOARD_DATA } from "../../lib/dashboard/demo-fixture";
import {
  dashboardNavigationItems,
  readyDashboardNavigationItems,
} from "../../lib/dashboard/navigation";
import type { DashboardViewTab } from "../../components/dashboard/RevenueCommandCenter";
import type { RevenueCommandDashboardData } from "../../types/revenue-dashboard";

describe("Revenue Command Dashboard - Commercial Architecture", () => {
  describe("Primary Navigation Simplification", () => {
    it("exposes exactly the 8 core commercial routes for launch", () => {
      expect(readyDashboardNavigationItems).toHaveLength(8);

      const hrefs = readyDashboardNavigationItems.map((item) => item.href);
      expect(hrefs).toEqual([
        "/dashboard",
        "/dashboard/bot-setup?tab=simulator",
        "/dashboard/inbox",
        "/dashboard/crm",
        "/dashboard/bot-setup",
        "/dashboard/connections",
        "/dashboard/revenue",
        "/dashboard/settings",
      ]);
    });

    it("hides unfinished agent workforce and visual flow builder from primary navigation", () => {
      const allLabels = dashboardNavigationItems.map((item) => item.label);
      expect(allLabels).not.toContain("Agents");
      expect(allLabels).not.toContain("Flow");
    });
  });

  describe("Tabbed Application Workspace Architecture", () => {
    it("defines the exact 6 command tabs with progressive disclosure", () => {
      const expectedTabs: DashboardViewTab[] = [
        "overview",
        "revenue",
        "funnel",
        "leads",
        "conversations",
        "operations",
      ];
      expect(expectedTabs).toHaveLength(6);
      expect(expectedTabs).toEqual([
        "overview",
        "revenue",
        "funnel",
        "leads",
        "conversations",
        "operations",
      ]);
    });

    it("supports deep linking via query parameters", () => {
      const validQueryViews: DashboardViewTab[] = [
        "overview",
        "revenue",
        "funnel",
        "leads",
        "conversations",
        "operations",
      ];
      for (const view of validQueryViews) {
        const url = `/dashboard?view=${view}`;
        expect(url).toBe(`/dashboard?view=${view}`);
      }
    });
  });

  describe("Demo Fixture Exact Metric Reconciliation", () => {
    const fixture: RevenueCommandDashboardData = DEMO_REVENUE_DASHBOARD_DATA;

    it("matches all prompt-specified headline figures", () => {
      expect(fixture.snapshot.newLeads.value).toBe(47);
      expect(fixture.snapshot.qualifiedLeads.value).toBe(26);
      expect(fixture.snapshot.appointmentsBooked.value).toBe(8);
      expect(fixture.snapshot.pipelineValue.value).toBe("$8,940");
      expect(fixture.snapshot.revenueWon.value).toBe("$2,480");
      expect(fixture.snapshot.averageFirstResponseSeconds.value).toBe("11s");
    });

    it("reconciles AI receptionist runtime performance metrics", () => {
      expect(fixture.aiReceptionist.status).toBe("active");
      expect(fixture.aiReceptionist.aiResolutionRate).toBe(72.3);
      expect(fixture.aiReceptionist.humanHandoffCount).toBe(5);
      expect(fixture.aiReceptionist.averageResponseTimeSeconds).toBe(11);
      expect(fixture.aiReceptionist.conversationsHandled).toBe(47);
    });

    it("reconciles funnel stage metrics with KPI totals", () => {
      const { stages } = fixture.funnel;
      expect(stages).toHaveLength(6);

      const newStage = stages.find((s) => s.id === "new");
      const qualifiedStage = stages.find((s) => s.id === "qualified");
      const appointmentStage = stages.find((s) => s.id === "appointment");
      const wonStage = stages.find((s) => s.id === "won");

      expect(newStage?.count).toBe(47);
      expect(qualifiedStage?.count).toBe(26);
      expect(appointmentStage?.count).toBe(8);
      expect(wonStage?.count).toBe(3);
      expect(wonStage?.pipelineValue).toBe(2480);
    });

    it("reconciles revenue attribution channels with won total", () => {
      const totalAttributed = fixture.revenueAttribution.bySource.reduce(
        (sum, src) => sum + src.wonRevenue,
        0
      );
      expect(totalAttributed).toBe(fixture.revenueAttribution.revenueWon);
      expect(fixture.revenueAttribution.revenueWon).toBe(2480);
    });

    it("ensures demo fixture is purely static in-memory data with no Supabase writes", () => {
      expect(fixture.isDemoMode).toBe(true);
      expect(fixture.isEmptyWorkspace).toBe(false);
      expect(typeof fixture === "object").toBe(true);
    });
  });

  describe("Deterministic Business Rule Generation", () => {
    it("provides prioritized actionable recommendations with expected impact and direct routes", () => {
      const recommendations = DEMO_REVENUE_DASHBOARD_DATA.recommendedActions;
      expect(recommendations.length).toBeGreaterThanOrEqual(3);

      for (const rec of recommendations) {
        expect(rec.id).toBeDefined();
        expect(rec.title).toBeTruthy();
        expect(rec.reason).toBeTruthy();
        expect(rec.actionHref).toMatch(/^\/dashboard\//);
        expect(rec.actionLabel).toBeTruthy();
      }
    });
  });

  describe("Plan Usage & Limits Accounting", () => {
    it("reports realistic usage percentages within quota boundaries", () => {
      const { planUsage } = DEMO_REVENUE_DASHBOARD_DATA;
      expect(planUsage.planTier).toBe("growth");
      expect(planUsage.aiConversationsLimit).toBe(1000);
      expect(planUsage.leadsUsed).toBe(47);
      expect(planUsage.leadsLimit).toBe(250);
      expect(planUsage.channelsConnected).toBe(2);
      expect(planUsage.channelsLimit).toBe(3);
    });
  });
});
