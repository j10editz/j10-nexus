/**
 * J10 NEXUS TIER 4 — GOVERNED AGENT EXECUTION & TOOL RUNNER
 * Connects versions, permissions, budgets, single-use payload-bound approvals,
 * traces, model routing, and genuine multi-provider fallback execution.
 */

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/auth";
import { getActiveAgentVersion } from "./versions";
import { checkToolPermission, SENSITIVE_APPROVAL_TOOLS } from "./permissions";
import { evaluateBudgetAllowance, recordAgentExecutionSpend } from "./budgets";
import { getReliabilityMetrics, recordInvocationOutcome } from "./reliability";
import { selectGovernedModel, type GovernedWorkload } from "./router";
import {
  startAgentTrace,
  completeAgentTrace,
  failAgentTrace,
  logTraceStep,
  calculateTokenCost,
} from "./traces";
import { runJ10AI } from "@/lib/ai/runtime";

export interface GovernedToolActionInput {
  workspaceId: string;
  agentId: string;
  toolName: string;
  payload: Record<string, unknown>;
  approvalGateId?: string;
  traceId?: string;
  actorUserId?: string;
  estimatedCostUsd?: number;
  executor: (payload: Record<string, unknown>) => Promise<any>;
}

export interface GovernedToolActionResult {
  success: boolean;
  executed: boolean;
  result?: any;
  error?: string;
  blockedBy?:
    | "tenant"
    | "permission"
    | "budget"
    | "approval"
    | "payload_mismatch"
    | "single_use"
    | "circuit_breaker";
  approvalGateId?: string;
}

/**
 * Computes a deterministic SHA-256 hash of an action payload
 * to enforce tamper-proof payload binding between approval and execution.
 */
export function computePayloadSignature(payload: Record<string, unknown>): string {
  const sortedKeys = Object.keys(payload || {}).sort();
  const canonical: Record<string, unknown> = {};
  for (const k of sortedKeys) {
    canonical[k] = payload[k];
  }
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

/**
 * Governs external action and tool dispatch:
 * 1. Verifies tenant boundary.
 * 2. Verifies capability and tool permission.
 * 3. Verifies spend budget and operational ceilings.
 * 4. Verifies human approval for sensitive actions with payload-binding and single-use consumption.
 * 5. Executes the tool if and only if all gates pass.
 */
export async function executeGovernedToolAction(
  supabase: SupabaseClient,
  input: GovernedToolActionInput
): Promise<GovernedToolActionResult> {
  // 1. Tenant boundary validation
  if (!input.workspaceId || input.workspaceId.trim() === "") {
    return {
      success: false,
      executed: false,
      blockedBy: "tenant",
      error: "Missing workspace tenant context.",
    };
  }

  // 2. Capability & Permission check
  const permCheck = await checkToolPermission(
    input.workspaceId,
    input.agentId,
    input.toolName
  );
  if (!permCheck.allowed) {
    return {
      success: false,
      executed: false,
      blockedBy: "permission",
      error: permCheck.reason,
    };
  }

  // 3. Budget allowance check
  const estimatedCost = input.estimatedCostUsd ?? 0.01;
  const budgetCheck = await evaluateBudgetAllowance(
    input.workspaceId,
    input.agentId,
    estimatedCost
  );
  if (!budgetCheck.canExecute) {
    return {
      success: false,
      executed: false,
      blockedBy: "budget",
      error: `Execution denied by budget policy: ${budgetCheck.actionRequired}. Daily utilization: ${budgetCheck.dailyUtilizationPercent}%.`,
    };
  }

  // 4. Sensitive tool human approval check
  const isSensitive =
    SENSITIVE_APPROVAL_TOOLS.has(input.toolName) || Boolean(permCheck.requiresApproval);

  if (isSensitive) {
    if (!input.approvalGateId) {
      // Create pending approval gate
      const { createApprovalGate } = await import("./approvals");
      const gate = await createApprovalGate(input.workspaceId, {
        agentId: input.agentId,
        actionType: input.toolName,
        actionPayload: input.payload,
        reason: `Tool '${input.toolName}' is classified as high-risk and requires human authorization.`,
        traceId: input.traceId,
      });

      return {
        success: false,
        executed: false,
        blockedBy: "approval",
        approvalGateId: gate.id,
        error: `Tool '${input.toolName}' requires authorization. Approval gate ${gate.id} created.`,
      };
    }

    // Lookup gate record within the exact workspace
    const { data: gate, error: gateErr } = await supabase
      .from("ai_agent_approval_gates")
      .select("*")
      .eq("id", input.approvalGateId)
      .eq("workspace_id", input.workspaceId)
      .single();

    if (gateErr || !gate) {
      return {
        success: false,
        executed: false,
        blockedBy: "approval",
        error: `Approval gate ${input.approvalGateId} not found in workspace.`,
      };
    }

    if (gate.status !== "approved") {
      return {
        success: false,
        executed: false,
        blockedBy: "approval",
        error: `Approval gate is in '${gate.status}' status. Requires 'approved'.`,
      };
    }

    // Verify exact payload binding
    const approvedSignature = computePayloadSignature(
      (gate.action_payload as Record<string, unknown>) || {}
    );
    const requestedSignature = computePayloadSignature(input.payload);

    if (approvedSignature !== requestedSignature) {
      return {
        success: false,
        executed: false,
        blockedBy: "payload_mismatch",
        error:
          "Security violation: Action payload does not match approved payload signature.",
      };
    }

    // Enforce single-use: atomically consume the approval gate
    const { data: consumedGate, error: consumeErr } = await supabase
      .from("ai_agent_approval_gates")
      .update({
        status: "consumed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", gate.id)
      .eq("status", "approved")
      .select("id")
      .maybeSingle();

    if (consumeErr || !consumedGate) {
      return {
        success: false,
        executed: false,
        blockedBy: "single_use",
        error: "Approval gate has already been consumed. Approvals are strictly single-use.",
      };
    }
  }

  // 5. Authorized tool execution
  try {
    const result = await input.executor(input.payload);

    // Record spend against budget
    await recordAgentExecutionSpend(input.workspaceId, input.agentId, estimatedCost);

    // Trace logging if trace is active
    if (input.traceId) {
      await logTraceStep(input.traceId, {
        stepNumber: 1,
        stepType: "tool_call",
        toolName: input.toolName,
        toolInput: input.payload,
        toolOutput: typeof result === "object" ? result : { result },
        status: "completed",
      });
    }

    return {
      success: true,
      executed: true,
      result,
    };
  } catch (err) {
    if (input.traceId) {
      await logTraceStep(input.traceId, {
        stepNumber: 1,
        stepType: "tool_call",
        toolName: input.toolName,
        toolInput: input.payload,
        status: "failed",
      });
    }
    throw err;
  }
}

export interface GovernedTaskInput {
  workspaceId: string;
  agentId: string;
  taskType: string;
  prompt: string;
  workload?: GovernedWorkload;
  forceModel?: string;
  allowFallback?: boolean;
}

export interface GovernedTaskResult {
  success: boolean;
  output: string;
  versionUsed: {
    id: string;
    versionNumber: number;
    modelId: string;
  };
  modelUsed: string;
  providerUsed: string;
  usedFallback: boolean;
  traceId: string;
  costUsd: number;
  tokens: {
    prompt: number;
    completion: number;
    total: number;
  };
}

/**
 * Governs complete agent execution end-to-end:
 * Resolves active version, checks circuit breaker, selects model route,
 * creates trace, executes with genuine fallback, records cost and latency.
 */
export async function executeGovernedAgentTask(
  input: GovernedTaskInput
): Promise<GovernedTaskResult> {
  const startTime = Date.now();

  // 1. Resolve active promoted agent version
  const activeVersion = await getActiveAgentVersion(input.workspaceId, input.agentId);
  if (!activeVersion) {
    throw new Error(`No active version provisioned for agent '${input.agentId}'.`);
  }

  // 2. Circuit Breaker evaluation
  const reliability = getReliabilityMetrics(input.workspaceId);
  if (reliability.circuitBreakerState === "open") {
    throw new Error(
      `Agent execution halted: Circuit breaker is OPEN. ${reliability.trippedReason || "High failure rate detected."}`
    );
  }

  // 3. Atomically reserve estimated budget before execution
  const estimatedPreExecutionCost = 0.05;
  const budget = await evaluateBudgetAllowance(input.workspaceId, input.agentId, estimatedPreExecutionCost);
  if (!budget.canExecute) {
    throw new Error(
      `Agent execution blocked by budget policy: ${budget.actionRequired}. Daily limit reached.`
    );
  }
  // Atomically lock the pre-reservation spend into budget ledger
  await recordAgentExecutionSpend(input.workspaceId, input.agentId, estimatedPreExecutionCost);

  // 4. Model route decision
  const route = selectGovernedModel({
    taskType: input.taskType,
    workload: input.workload,
    budgetAllowance: budget,
    forceModel: input.forceModel || activeVersion.modelId,
  });

  // 5. Start Trace
  const trace = await startAgentTrace(input.workspaceId, {
    agentId: input.agentId,
    versionId: activeVersion.id,
    modelUsed: route.primaryModel,
    providerUsed: route.primaryProvider,
    inputPayload: {
      prompt: input.prompt,
      systemPrompt: activeVersion.systemPrompt,
      versionNumber: activeVersion.versionNumber,
    },
  });

  let output = "";
  let modelUsed = route.primaryModel;
  let providerUsed: string = route.primaryProvider;
  let usedFallback = false;
  let reportedUsage: { inputTokens: number; outputTokens: number; totalTokens: number } | null = null;

  // 6. Execution with real provider fallback and explicit model/provider passing
  try {
    const aiResult = await runJ10AI({
      task: (input.taskType || "crm_analysis") as any,
      input: input.prompt,
      instructions: activeVersion.instructions || activeVersion.systemPrompt,
      temperature: activeVersion.temperature,
      forceProvider: route.primaryProvider as any,
      forceModel: route.primaryModel,
    });
    output = aiResult.text || (aiResult as any).output || "";
    providerUsed = aiResult.provider;
    if (aiResult.usage && (aiResult.usage.inputTokens > 0 || aiResult.usage.outputTokens > 0)) {
      reportedUsage = aiResult.usage;
    }
  } catch (primaryError) {
    if (input.allowFallback === false) {
      const latencyMs = Date.now() - startTime;
      await failAgentTrace(
        trace.id,
        primaryError instanceof Error ? primaryError.message : String(primaryError),
        latencyMs
      );
      recordInvocationOutcome(input.workspaceId, {
        success: false,
        latencyMs,
        error: String(primaryError),
      });
      throw primaryError;
    }

    // Genuine fallback execution passing fallback provider and model
    try {
      usedFallback = true;
      modelUsed = route.fallbackModel;
      providerUsed = route.fallbackProvider;

      const fallbackResult = await runJ10AI({
        task: (input.taskType || "crm_analysis") as any,
        input: input.prompt,
        instructions: activeVersion.instructions || activeVersion.systemPrompt,
        temperature: activeVersion.temperature,
        forceProvider: route.fallbackProvider as any,
        forceModel: route.fallbackModel,
      });
      output = fallbackResult.text || (fallbackResult as any).output || "";
      providerUsed = fallbackResult.provider;
      if (fallbackResult.usage && (fallbackResult.usage.inputTokens > 0 || fallbackResult.usage.outputTokens > 0)) {
        reportedUsage = fallbackResult.usage;
      }
    } catch (fallbackError) {
      const latencyMs = Date.now() - startTime;
      await failAgentTrace(
        trace.id,
        fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
        latencyMs
      );
      recordInvocationOutcome(input.workspaceId, {
        success: false,
        latencyMs,
        usedFallback: true,
        error: String(fallbackError),
      });
      throw fallbackError;
    }
  }

  const latencyMs = Date.now() - startTime;
  recordInvocationOutcome(input.workspaceId, {
    success: true,
    latencyMs,
    usedFallback,
  });

  // Determine actual vs character-based estimated tokens
  const hasProviderTokens = Boolean(reportedUsage && (reportedUsage.inputTokens > 0 || reportedUsage.outputTokens > 0));
  const promptTokens = hasProviderTokens ? reportedUsage!.inputTokens : Math.ceil(input.prompt.length / 4);
  const completionTokens = hasProviderTokens ? reportedUsage!.outputTokens : Math.ceil(output.length / 4);
  const totalTokens = promptTokens + completionTokens;
  const usageSource: "provider_reported" | "character_estimate" = hasProviderTokens
    ? "provider_reported"
    : "character_estimate";

  const costUsd = calculateTokenCost(modelUsed, promptTokens, completionTokens);

  // Complete trace
  await completeAgentTrace(trace.id, {
    status: "completed",
    outputPayload: { output, usageSource },
    latencyMs,
    promptTokens,
    completionTokens,
    modelUsed,
  });

  // Reconcile spend against pre-reserved budget
  const spendAdjustment = costUsd - estimatedPreExecutionCost;
  if (spendAdjustment !== 0) {
    await recordAgentExecutionSpend(input.workspaceId, input.agentId, spendAdjustment);
  }

  return {
    success: true,
    output,
    versionUsed: {
      id: activeVersion.id,
      versionNumber: activeVersion.versionNumber,
      modelId: activeVersion.modelId,
    },
    modelUsed,
    providerUsed,
    usedFallback,
    traceId: trace.id,
    costUsd,
    tokens: {
      prompt: promptTokens,
      completion: completionTokens,
      total: totalTokens,
    },
  };
}
