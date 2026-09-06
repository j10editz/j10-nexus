import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  executeGovernedToolAction,
  computePayloadSignature,
} from "@/lib/governance/runner";
import {
  upsertAgentPermissions,
} from "@/lib/governance/permissions";
import {
  upsertAgentBudget,
  evaluateBudgetAllowance,
} from "@/lib/governance/budgets";
import {
  createApprovalGate,
  resolveApprovalGate,
} from "@/lib/governance/approvals";
import {
  getWorkspaceRoiSummary,
  recordRoiAttribution,
} from "@/lib/governance/roi";

// Mock Supabase Store for Governance State
const mockStore: Record<string, any[]> = {
  ai_agent_permissions: [],
  ai_agent_budgets: [],
  ai_agent_approval_gates: [],
  ai_agent_roi_attributions: [],
  ai_agent_traces: [],
  ai_agent_trace_steps: [],
  ai_agent_versions: [],
};

vi.mock("@/lib/auth", () => ({
  createServerSupabaseClient: () => ({
    from: (table: string) => {
      let currentData = mockStore[table] || [];
      const builder: any = {
        select: vi.fn(() => builder),
        eq: vi.fn((field: string, val: any) => {
          currentData = currentData.filter((row: any) => row[field] === val);
          return builder;
        }),
        gt: vi.fn((field: string, val: any) => {
          currentData = currentData.filter((row: any) => row[field] > val);
          return builder;
        }),
        order: vi.fn(() => builder),
        single: vi.fn(async () => {
          const item = currentData[0] || null;
          return { data: item, error: item ? null : { message: "Not found" } };
        }),
        maybeSingle: vi.fn(async () => {
          return { data: currentData[0] || null, error: null };
        }),
        insert: vi.fn((payload: any) => {
          const item = {
            id: payload.id || `mock-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            ...payload,
          };
          if (!mockStore[table]) mockStore[table] = [];
          mockStore[table].push(item);
          currentData = [item];
          return builder;
        }),
        update: vi.fn((payload: any) => {
          for (const row of currentData) {
            Object.assign(row, payload);
          }
          return builder;
        }),
        upsert: vi.fn((payload: any) => {
          const item = {
            id: payload.id || `mock-${Date.now()}`,
            ...payload,
          };
          const idx = (mockStore[table] || []).findIndex(
            (r: any) => r.workspace_id === payload.workspace_id && r.agent_id === payload.agent_id
          );
          if (idx >= 0) {
            mockStore[table][idx] = { ...mockStore[table][idx], ...payload };
            currentData = [mockStore[table][idx]];
          } else {
            if (!mockStore[table]) mockStore[table] = [];
            mockStore[table].push(item);
            currentData = [item];
          }
          return builder;
        }),
        then: (resolve: any, reject?: any) => {
          return Promise.resolve({ data: currentData, error: null }).then(resolve, reject);
        },
      };
      return builder;
    },
  }),
}));

describe("Tier 4: Actual Route Callers & Production Governance Verification", () => {
  const workspaceId = "ws-prod-gov-test";
  const agentId = "autonomous-exec-agent";

  beforeEach(() => {
    Object.keys(mockStore).forEach((k) => (mockStore[k] = []));
  });

  describe("1. Static Contract & Wiring Verification of Actual Production Routes", () => {
    it("proves app/api/ai-tasks/[id]/run/route.ts contains agent budget enforcement before execution", () => {
      const source = readFileSync(
        resolve(process.cwd(), "app/api/ai-tasks/[id]/run/route.ts"),
        "utf8"
      );
      expect(source).toContain("evaluateBudgetAllowance");
      expect(source).toContain("recordAgentExecutionSpend");
      expect(source).toContain("BUDGET_EXHAUSTED");
      expect(source).toContain("status: 403");
    });

    it("proves app/api/integrations/[id]/actions/route.ts contains tool permission and budget enforcement", () => {
      const source = readFileSync(
        resolve(process.cwd(), "app/api/integrations/[id]/actions/route.ts"),
        "utf8"
      );
      expect(source).toContain("checkToolPermission");
      expect(source).toContain("TOOL_PERMISSION_DENIED");
      expect(source).toContain("evaluateBudgetAllowance");
      expect(source).toContain("BUDGET_EXHAUSTED");
      expect(source).toContain("status: 403");
    });
  });

  describe("2. Behavioral Verification: Denied Tool & Exhausted Budget Enforcement", () => {
    it("proves a denied tool prevents execution and returns explicit permission denial", async () => {
      // Configure agent permissions with an explicitly denied tool
      await upsertAgentPermissions(workspaceId, agentId, {
        allowedTools: ["crm.read", "inbox.read"],
        deniedTools: ["stripe.refund", "system.destructive_write"],
      });

      const executorSpy = vi.fn(async () => ({ refunded: true }));

      const mockSupabase = {
        from: (table: string) => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    workspace_id: workspaceId,
                    agent_id: agentId,
                    allowed_tools: ["crm.read", "inbox.read"],
                    denied_tools: ["stripe.refund"],
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      } as any;

      const result = await executeGovernedToolAction(mockSupabase, {
        workspaceId,
        agentId,
        toolName: "stripe.refund",
        payload: { customerId: "cus_99", amountUsd: 50 },
        executor: executorSpy,
      });

      expect(result.success).toBe(false);
      expect(result.executed).toBe(false);
      expect(result.blockedBy).toBe("permission");
      expect(result.error).toContain("explicitly blocked");
      expect(executorSpy).not.toHaveBeenCalled();
    });

    it("proves an exhausted budget prevents execution and halts invocation", async () => {
      // Set daily budget limit of $5, with current spend already at $5
      await upsertAgentBudget(workspaceId, agentId, {
        dailyBudgetUsd: 5.0,
        monthlyBudgetUsd: 50.0,
        maxCostPerExecutionUsd: 1.0,
        overBudgetPolicy: "hard_stop",
      });

      // Allow CRM operations in permissions so execution advances to budget gate
      mockStore.ai_agent_permissions = [
        {
          id: "perm-1",
          workspace_id: workspaceId,
          agent_id: agentId,
          allowed_tools: ["*"],
          denied_tools: [],
        },
      ];

      // Seed state so budget is exhausted
      const todayStr = new Date().toISOString().split("T")[0];
      mockStore.ai_agent_budgets = [
        {
          id: "b-1",
          workspace_id: workspaceId,
          agent_id: agentId,
          daily_budget_usd: 5.0,
          monthly_budget_usd: 50.0,
          current_daily_spend_usd: 5.0, // 100% exhausted
          current_monthly_spend_usd: 5.0,
          max_cost_per_execution_usd: 1.0,
          over_budget_policy: "hard_stop",
          last_reset_date: todayStr,
        },
      ];

      const budgetCheck = await evaluateBudgetAllowance(workspaceId, agentId, 0.05);
      expect(budgetCheck.canExecute).toBe(false);
      expect(budgetCheck.actionRequired).toBe("hard_stop");
      expect(budgetCheck.dailyUtilizationPercent).toBeGreaterThanOrEqual(100);

      const executorSpy = vi.fn(async () => ({ sent: true }));
      const mockSupabase = {
        from: (table: string) => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    allowed_tools: ["*"],
                    denied_tools: [],
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      } as any;

      const result = await executeGovernedToolAction(mockSupabase, {
        workspaceId,
        agentId,
        toolName: "crm.contact_update",
        payload: { contactId: "c-1" },
        estimatedCostUsd: 0.1,
        executor: executorSpy,
      });

      expect(result.success).toBe(false);
      expect(result.executed).toBe(false);
      expect(result.blockedBy).toBe("budget");
      expect(result.error).toContain("Execution denied by budget policy");
      expect(executorSpy).not.toHaveBeenCalled();
    });
  });

  describe("3. Single-Use Payload-Bound Approvals", () => {
    it("proves approvals are bound to exact payload signature and consumed once", async () => {
      const authorizedPayload = { recipient: "+15552345678", template: "enterprise_onboarding", credits: 50 };
      const tamperedPayload = { recipient: "+15552345678", template: "enterprise_onboarding", credits: 5000 };

      // Compute deterministic payload signature
      const authSig = computePayloadSignature(authorizedPayload);
      const tampSig = computePayloadSignature(tamperedPayload);
      expect(authSig).not.toBe(tampSig);

      // Allow marketing.mass_broadcast so execution reaches the approval gate
      mockStore.ai_agent_permissions = [
        {
          id: "perm-2",
          workspace_id: workspaceId,
          agent_id: agentId,
          allowed_tools: ["marketing.mass_broadcast"],
          denied_tools: [],
        },
      ];

      // Create and approve gate with exact authorized payload
      const gate = await createApprovalGate(workspaceId, {
        agentId,
        actionType: "marketing.mass_broadcast",
        actionPayload: authorizedPayload,
        reason: "Outbound campaign launch",
      });

      await resolveApprovalGate(workspaceId, gate.id, "usr-reviewer-1", "approved");

      let gateState: "approved" | "consumed" = "approved";

      const mockSupabase = {
        from: (table: string) => {
          if (table === "ai_agent_permissions") {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({
                      data: { allowed_tools: ["marketing.mass_broadcast"], denied_tools: [] },
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === "ai_agent_budgets") {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({
                      data: {
                        daily_budget_usd: 100,
                        monthly_budget_usd: 1000,
                        current_daily_spend_usd: 0,
                        current_monthly_spend_usd: 0,
                        max_cost_per_execution_usd: 50,
                        over_budget_policy: "allow",
                      },
                      error: null,
                    }),
                  }),
                }),
              }),
              update: () => ({
                eq: () => ({
                  eq: async () => ({ error: null }),
                }),
              }),
            };
          }
          if (table === "ai_agent_approval_gates") {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    single: async () => ({
                      data: {
                        id: gate.id,
                        workspace_id: workspaceId,
                        agent_id: agentId,
                        action_type: "marketing.mass_broadcast",
                        action_payload: authorizedPayload,
                        status: gateState,
                      },
                      error: null,
                    }),
                  }),
                }),
              }),
              update: (updates: any) => ({
                eq: () => ({
                  eq: () => ({
                    select: () => ({
                      maybeSingle: async () => {
                        if (gateState === "approved" && updates.status === "consumed") {
                          gateState = "consumed";
                          return { data: { id: gate.id }, error: null };
                        }
                        return { data: null, error: null };
                      },
                    }),
                  }),
                }),
              }),
            };
          }
          throw new Error(`Unexpected table: ${table}`);
        },
      } as any;

      const executorSpy = vi.fn(async () => ({ dispatched: true }));

      // Attempt 1: Execute with tampered payload -> rejected with payload_mismatch
      const tamperedAttempt = await executeGovernedToolAction(mockSupabase, {
        workspaceId,
        agentId,
        toolName: "marketing.mass_broadcast",
        payload: tamperedPayload,
        approvalGateId: gate.id,
        executor: executorSpy,
      });

      expect(tamperedAttempt.success).toBe(false);
      expect(tamperedAttempt.blockedBy).toBe("payload_mismatch");
      expect(tamperedAttempt.error).toContain("does not match approved payload signature");
      expect(executorSpy).not.toHaveBeenCalled();

      // Attempt 2: Execute with exact authorized payload -> succeeds and consumes gate
      const authorizedAttempt = await executeGovernedToolAction(mockSupabase, {
        workspaceId,
        agentId,
        toolName: "marketing.mass_broadcast",
        payload: authorizedPayload,
        approvalGateId: gate.id,
        executor: executorSpy,
      });

      expect(authorizedAttempt.success).toBe(true);
      expect(authorizedAttempt.executed).toBe(true);
      expect(executorSpy).toHaveBeenCalledTimes(1);
      expect(gateState).toBe("consumed");

      // Attempt 3: Replay attack with same approval gate -> rejected as single_use
      const replayAttempt = await executeGovernedToolAction(mockSupabase, {
        workspaceId,
        agentId,
        toolName: "marketing.mass_broadcast",
        payload: authorizedPayload,
        approvalGateId: gate.id,
        executor: executorSpy,
      });

      expect(replayAttempt.success).toBe(false);
      expect(replayAttempt.blockedBy).toBe("approval");
      expect(replayAttempt.error).toContain("Requires 'approved'");
      expect(executorSpy).toHaveBeenCalledTimes(1); // Still only 1 call
    });
  });

  describe("4. Separation of Verified Won Revenue from Estimated Labor Savings", () => {
    it("proves genuine ROI attribution separates verified payment revenue from labor savings", async () => {
      // Record won deal revenue ($3,500) with 3 hours of labor saved ($135)
      await recordRoiAttribution(workspaceId, {
        agentId,
        contactId: "ct-rev-1",
        dealValueUsd: 3500,
        hoursSaved: 3.0,
        modelCostUsd: 0.15,
        attributionType: "won_deal",
      });

      // Record standalone labor savings (4 hours = $180) with $0 deal value
      await recordRoiAttribution(workspaceId, {
        agentId,
        hoursSaved: 4.0,
        modelCostUsd: 0.08,
        dealValueUsd: 0,
        attributionType: "labor_saved",
      });

      const summary = await getWorkspaceRoiSummary(workspaceId);

      // Verified deal revenue is strictly $3,500
      expect(summary.totalAttributedRevenue).toBe(3500.0);
      // Labor savings is strictly 7 hrs * $45/hr = $315.00
      expect(summary.totalLaborSavings).toBe(315.0);
      // Gross value combines both ($3,815.00)
      expect(summary.totalGrossValue).toBe(3815.0);
      // Compute cost is $0.23
      expect(summary.totalComputeCost).toBe(0.23);
      // Net ROI is $3,814.77
      expect(summary.netRoiUsd).toBe(3814.77);
      expect(summary.totalHoursSaved).toBe(7.0);
    });
  });
});
