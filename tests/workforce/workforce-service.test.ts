import { describe, expect, it } from "vitest";
import {
  computeWorkforceMetrics,
  DEFAULT_DEPARTMENTS,
  KNOWN_AI_AGENTS,
} from "@/lib/workforce/service";
import type { WorkforceMember } from "@/types/workforce";

describe("J10 NEXUS Hybrid Workforce Service", () => {
  it("provides recognized autonomous AI agents for supervisor assignment", () => {
    expect(KNOWN_AI_AGENTS.length).toBeGreaterThanOrEqual(4);
    const agentIds = KNOWN_AI_AGENTS.map((a) => a.id);
    expect(agentIds).toContain("sales-agent");
    expect(agentIds).toContain("support-agent");
    expect(agentIds).toContain("marketing-agent");
  });

  it("covers core organizational departments", () => {
    expect(DEFAULT_DEPARTMENTS).toContain("Leadership");
    expect(DEFAULT_DEPARTMENTS).toContain("Sales & Revenue");
    expect(DEFAULT_DEPARTMENTS).toContain("Marketing & Growth");
    expect(DEFAULT_DEPARTMENTS).toContain("Customer Support");
  });

  it("calculates hybrid leverage ratio and labor ROI metrics", () => {
    const members: WorkforceMember[] = [
      {
        id: "m-1",
        name: "Alice Founder",
        role: "CEO",
        department: "Leadership",
        email: "alice@test.com",
        status: "active",
        assignedAgents: ["sales-agent", "support-agent"],
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01",
      },
      {
        id: "m-2",
        name: "Bob Marketer",
        role: "Growth Lead",
        department: "Marketing & Growth",
        email: "bob@test.com",
        status: "active",
        assignedAgents: ["marketing-agent"],
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01",
      },
    ];

    const summary = computeWorkforceMetrics(members, 8, 4000);

    expect(summary.totalHumanStaff).toBe(2);
    expect(summary.activeAIAgents).toBe(8);
    expect(summary.hybridLeverageRatio).toBe(4.0);
    // 4000 tasks * 15m / 60m = 1000 hours
    expect(summary.totalHoursSavedThisMonth).toBe(1000);
    // 1000 hours * $45/hr = $45,000
    expect(summary.laborSavingsDollars).toBe(45000);
    expect(summary.departmentCounts["Leadership"]).toBe(1);
    expect(summary.departmentCounts["Marketing & Growth"]).toBe(1);
  });
});
