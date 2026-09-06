import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  executeGovernedToolAction,
  executeGovernedAgentTask,
  computePayloadSignature,
} from "@/lib/governance/runner";
import {
  createAgentVersion,
  rollbackAgentVersion,
} from "@/lib/governance/versions";
import { upsertAgentPermissions } from "@/lib/governance/permissions";
import { upsertAgentBudget } from "@/lib/governance/budgets";
import {
  createApprovalGate,
  resolveApprovalGate,
} from "@/lib/governance/approvals";
import { resetCircuitBreaker } from "@/lib/governance/reliability";
import { recordRoiAttribution } from "@/lib/governance/roi";

// In-memory mock store for Supabase client
const mockStore: Record<string, any[]> = {
  ai_agent_versions: [],
  ai_agent_permissions: [],
  ai_agent_budgets: [],
  ai_agent_approval_gates: [],
  ai_agent_traces: [],
  ai_agent_trace_steps: [],
  ai_agent_roi_attributions: [],
};

vi.mock("@/lib/auth", () => ({
  createServerSupabaseClient: () => createMockClient(),
}));

function createMockClient() {
  const client: any = {
    from: vi.fn((table: string) => {
      if (!mockStore[table]) mockStore[table] = [];

      let currentData = [...mockStore[table]];
      let limitCount: number | null = null;
      let orderCol: string | null = null;
      let orderAsc = true;
      let pendingUpdate: any = null;

      const applyPendingUpdate = () => {
        if (pendingUpdate) {
          currentData.forEach((row) => {
            Object.assign(row, pendingUpdate, { updated_at: new Date().toISOString() });
            const idx = mockStore[table].findIndex((r: any) => r.id === row.id);
            if (idx >= 0) {
              mockStore[table][idx] = {
                ...mockStore[table][idx],
                ...pendingUpdate,
                updated_at: new Date().toISOString(),
              };
            }
          });
          pendingUpdate = null;
        }
      };

      const builder: any = {
        select: vi.fn(() => builder),
        eq: vi.fn((col: string, val: any) => {
          currentData = currentData.filter((r: any) => r[col] === val);
          return builder;
        }),
        gt: vi.fn((col: string, val: any) => {
          currentData = currentData.filter((r: any) => r[col] > val);
          return builder;
        }),
        order: vi.fn((col: string, opts?: { ascending?: boolean }) => {
          orderCol = col;
          orderAsc = opts?.ascending ?? true;
          currentData.sort((a, b) => {
            if (a[col] < b[col]) return orderAsc ? -1 : 1;
            if (a[col] > b[col]) return orderAsc ? 1 : -1;
            return 0;
          });
          return builder;
        }),
        limit: vi.fn((n: number) => {
          limitCount = n;
          return builder;
        }),
        single: vi.fn(async () => {
          applyPendingUpdate();
          const row = currentData[0] || null;
          return { data: row, error: row ? null : { message: "Not found" } };
        }),
        maybeSingle: vi.fn(async () => {
          applyPendingUpdate();
          const row = currentData[0] || null;
          return { data: row, error: null };
        }),
        insert: vi.fn((payload: any) => {
          const items = Array.isArray(payload) ? payload : [payload];
          const inserted = items.map((item) => ({
            id: item.id || `mock-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...item,
          }));
          mockStore[table].push(...inserted);
          currentData = inserted;
          return builder;
        }),
        update: vi.fn((payload: any) => {
          pendingUpdate = payload;
          return builder;
        }),
        upsert: vi.fn((payload: any) => {
          const existingIdx = mockStore[table].findIndex(
            (r: any) =>
              r.workspace_id === payload.workspace_id && r.agent_id === payload.agent_id
          );
          if (existingIdx >= 0) {
            mockStore[table][existingIdx] = {
              ...mockStore[table][existingIdx],
              ...payload,
              updated_at: new Date().toISOString(),
            };
            currentData = [mockStore[table][existingIdx]];
          } else {
            const newItem = {
              id: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              ...payload,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            mockStore[table].push(newItem);
            currentData = [newItem];
          }
          return builder;
        }),
      };

      builder.then = (resolve: any) => {
        applyPendingUpdate();
        let res = [...currentData];
        if (limitCount) res = res.slice(0, limitCount);
        return resolve({ data: res, error: null });
      };

      return builder;
    }),
  };
  return client;
}

describe("Tier 4: Governed Agent Execution Certification", () => {
  const workspaceId = "ws-gov-cert-101";
  const agentId = "autonomous-sales-lead";
  const mockClient = createMockClient();

  beforeEach(() => {
    Object.keys(mockStore).forEach((k) => (mockStore[k] = []));
    resetCircuitBreaker(workspaceId);
  });

  it("1. Proves denied tools prevent external provider calls", async () => {
    // Setup permissions: allow read tools, explicitly deny stripe.refund
    await upsertAgentPermissions(workspaceId, agentId, {
      allowedTools: ["crm.read", "inbox.read"],
      deniedTools: ["stripe.refund", "system.destructive_write"],
    });

    const providerExecutorSpy = vi.fn(async () => ({ refunded: true }));

    const result = await executeGovernedToolAction(mockClient, {
      workspaceId,
      agentId,
      toolName: "stripe.refund",
      payload: { customerId: "cus_123", amountUsd: 150 },
      executor: providerExecutorSpy,
    });

    // Verify execution was denied and provider executor was NEVER called
    expect(result.success).toBe(false);
    expect(result.executed).toBe(false);
    expect(result.blockedBy).toBe("permission");
    expect(result.error).toContain("explicitly blocked");
    expect(providerExecutorSpy).not.toHaveBeenCalled();
  });

  it("2. Proves exhausted budgets prevent external provider calls", async () => {
    // Setup permissions allowing tools so budget exhaustion is the blocking condition
    await upsertAgentPermissions(workspaceId, agentId, {
      allowedTools: ["*"],
      deniedTools: [],
    });

    // Setup budget with daily spend already at limit with hard_stop policy
    await upsertAgentBudget(workspaceId, agentId, {
      dailyBudgetUsd: 10.0,
      monthlyBudgetUsd: 200.0,
      overBudgetPolicy: "hard_stop",
    });

    // Simulate existing spend of $10.00
    mockStore.ai_agent_budgets[0].current_daily_spend_usd = 10.0;

    const providerExecutorSpy = vi.fn(async () => ({ sent: true }));

    const result = await executeGovernedToolAction(mockClient, {
      workspaceId,
      agentId,
      toolName: "whatsapp.send_bulk",
      payload: { recipients: ["+15551111", "+15552222"] },
      estimatedCostUsd: 0.5,
      executor: providerExecutorSpy,
    });

    // Verify execution was denied and provider executor was NEVER called
    expect(result.success).toBe(false);
    expect(result.executed).toBe(false);
    expect(result.blockedBy).toBe("budget");
    expect(result.error).toContain("budget policy: hard_stop");
    expect(providerExecutorSpy).not.toHaveBeenCalled();
  });

  it("3. Proves approval gates bind to exact payload and are single-use", async () => {
    await upsertAgentPermissions(workspaceId, agentId, {
      allowedTools: ["crm.*", "stripe.*"],
      deniedTools: [],
    });

    const legitimatePayload = { customerId: "cus_legit_456", amountUsd: 300 };
    const providerExecutorSpy = vi.fn(async (p) => ({ executedWith: p }));

    // Step A: Calling sensitive tool without approval creates pending gate and denies execution
    const initialCall = await executeGovernedToolAction(mockClient, {
      workspaceId,
      agentId,
      toolName: "stripe.refund",
      payload: legitimatePayload,
      executor: providerExecutorSpy,
    });

    expect(initialCall.success).toBe(false);
    expect(initialCall.executed).toBe(false);
    expect(initialCall.blockedBy).toBe("approval");
    expect(initialCall.approvalGateId).toBeDefined();
    expect(providerExecutorSpy).not.toHaveBeenCalled();

    const gateId = initialCall.approvalGateId!;

    // Step B: Manager approves the gate
    await resolveApprovalGate(
      workspaceId,
      gateId,
      "mgr-user-01",
      "approved",
      "Refund verified with receipt"
    );

    // Step C: Attacker attempts to use approved gate with tampered payload
    const tamperedPayload = { customerId: "cus_legit_456", amountUsd: 30000 };
    const tamperedCall = await executeGovernedToolAction(mockClient, {
      workspaceId,
      agentId,
      toolName: "stripe.refund",
      payload: tamperedPayload,
      approvalGateId: gateId,
      executor: providerExecutorSpy,
    });

    expect(tamperedCall.success).toBe(false);
    expect(tamperedCall.executed).toBe(false);
    expect(tamperedCall.blockedBy).toBe("payload_mismatch");
    expect(providerExecutorSpy).not.toHaveBeenCalled();

    // Step D: Legitimate caller executes with the exact approved payload -> SUCCEEDS
    const validExecution = await executeGovernedToolAction(mockClient, {
      workspaceId,
      agentId,
      toolName: "stripe.refund",
      payload: legitimatePayload,
      approvalGateId: gateId,
      executor: providerExecutorSpy,
    });

    expect(validExecution.success).toBe(true);
    expect(validExecution.executed).toBe(true);
    expect(providerExecutorSpy).toHaveBeenCalledTimes(1);

    // Step E: Replay attack — attempting to re-use the consumed approval gate fails
    const replayCall = await executeGovernedToolAction(mockClient, {
      workspaceId,
      agentId,
      toolName: "stripe.refund",
      payload: legitimatePayload,
      approvalGateId: gateId,
      executor: providerExecutorSpy,
    });

    expect(replayCall.success).toBe(false);
    expect(replayCall.executed).toBe(false);
    expect(replayCall.blockedBy).toBe("approval");
    // Provider was NOT called a second time
    expect(providerExecutorSpy).toHaveBeenCalledTimes(1);
  });

  it("4. Proves rollback changes the version actually executed", async () => {
    // Deploy Version 1
    const v1 = await createAgentVersion(workspaceId, {
      agentId,
      systemPrompt: "V1: Conservative enterprise sales agent.",
      modelId: "gpt-4o",
      makeActive: true,
    });
    expect(v1.versionNumber).toBe(1);

    // Deploy Version 2
    const v2 = await createAgentVersion(workspaceId, {
      agentId,
      systemPrompt: "V2: Experimental aggressive sales agent.",
      modelId: "o3-mini",
      makeActive: true,
    });
    expect(v2.versionNumber).toBe(2);

    // Execute task — must run Version 2
    const runBeforeRollback = await executeGovernedAgentTask({
      workspaceId,
      agentId,
      taskType: "deal_qualification",
      prompt: "Inquiry about pricing",
    });
    expect(runBeforeRollback.versionUsed.versionNumber).toBe(2);
    expect(runBeforeRollback.versionUsed.modelId).toBe("o3-mini");

    // Perform rollback to Version 1
    const rolledBack = await rollbackAgentVersion(workspaceId, agentId, 1);
    expect(rolledBack.versionNumber).toBe(1);
    expect(rolledBack.status).toBe("active");

    // Execute task after rollback — must now run Version 1
    const runAfterRollback = await executeGovernedAgentTask({
      workspaceId,
      agentId,
      taskType: "deal_qualification",
      prompt: "Inquiry about pricing",
    });
    expect(runAfterRollback.versionUsed.versionNumber).toBe(1);
    expect(runAfterRollback.versionUsed.modelId).toBe("gpt-4o");
  });

  it("5. Proves truthful ROI attribution preserves explicit zeros and deduplicates revenue", async () => {
    // 1. Explicit zero values must be preserved without invented defaults
    const zeroRoi = await recordRoiAttribution(workspaceId, {
      agentId,
      dealValueUsd: 0,
      hoursSaved: 0,
      modelCostUsd: 0,
    });

    expect(zeroRoi.dealValueUsd).toBe(0);
    expect(zeroRoi.hoursSaved).toBe(0);
    expect(zeroRoi.laborSavingsUsd).toBe(0);
    expect(zeroRoi.modelCostUsd).toBe(0);
    expect(zeroRoi.netRoiUsd).toBe(0);

    // 2. Won deal attribution
    const firstDeal = await recordRoiAttribution(workspaceId, {
      agentId,
      contactId: "contact-enterprise-77",
      dealValueUsd: 5000,
      hoursSaved: 2.0,
      modelCostUsd: 0.12,
    });

    expect(firstDeal.dealValueUsd).toBe(5000);
    expect(firstDeal.laborSavingsUsd).toBe(90.0); // 2 hrs * $45/hr
    expect(firstDeal.netRoiUsd).toBe(5089.88);

    // 3. Duplicate deal attribution attempt for the same contact must deduplicate revenue
    const duplicateDeal = await recordRoiAttribution(workspaceId, {
      agentId,
      contactId: "contact-enterprise-77",
      dealValueUsd: 5000,
      hoursSaved: 1.0,
      modelCostUsd: 0.05,
    });

    // Deal revenue deduplicated to 0; labor savings preserved
    expect(duplicateDeal.dealValueUsd).toBe(0);
    expect(duplicateDeal.laborSavingsUsd).toBe(45.0);
    expect(duplicateDeal.netRoiUsd).toBe(44.95);
  });
});
