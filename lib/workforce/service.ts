import type { WorkforceMember, WorkforceSummary } from "@/types/workforce";

export const DEFAULT_DEPARTMENTS = [
  "Leadership",
  "Sales & Revenue",
  "Marketing & Growth",
  "Customer Support",
  "Engineering",
  "Operations",
] as const;

export const KNOWN_AI_AGENTS = [
  { id: "sales-agent", name: "J10 Sales Outreach Agent", role: "WhatsApp Inbound & Qualification" },
  { id: "support-agent", name: "J10 Support Resolution Bot", role: "24/7 Knowledge Base Answers" },
  { id: "marketing-agent", name: "J10 Campaign Broadcast Bot", role: "Audience Copy & Re-engagement" },
  { id: "finance-agent", name: "J10 Invoicing & Reconciliation Bot", role: "Payment Reminders & Ledger Sync" },
];

export function computeWorkforceMetrics(
  members: WorkforceMember[],
  activeAIAgentCount: number = 0,
  tasksAutomatedThisMonth: number = 0
): WorkforceSummary {
  const departmentCounts: Record<string, number> = {};

  for (const m of members) {
    departmentCounts[m.department] = (departmentCounts[m.department] || 0) + 1;
  }

  // 15 mins saved per automated workflow task / message
  const totalHoursSaved = Math.round((tasksAutomatedThisMonth * 15) / 60);
  // Average blended enterprise wage $45/hr
  const laborSavingsDollars = totalHoursSaved * 45;

  const totalHumans = Math.max(1, members.length);
  const hybridLeverageRatio = Number((activeAIAgentCount / totalHumans).toFixed(1));

  return {
    totalHumanStaff: members.length,
    activeAIAgents: activeAIAgentCount,
    totalHoursSavedThisMonth: totalHoursSaved,
    laborSavingsDollars,
    hybridLeverageRatio,
    departmentCounts,
  };
}
