/**
 * J10 NEXUS TIER 4 — BUDGETS & AUTONOMOUS SPENDING CAPS
 * Enforces financial guardrails, daily/monthly spend limits,
 * execution cost ceilings, and automatic over-budget policy execution.
 */

import { createServerSupabaseClient } from "@/lib/auth";
import type { AgentBudget, BudgetUtilization, OverBudgetPolicy } from "@/types/governance";

export async function getAgentBudget(
  workspaceId: string,
  agentId: string,
  client?: any
): Promise<AgentBudget> {
  const supabase = client || createServerSupabaseClient();
  const { data, error } = await supabase
    .from("ai_agent_budgets")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("agent_id", agentId)
    .maybeSingle();

  if (error || !data) {
    return getDefaultBudget(workspaceId, agentId);
  }

  // Check if date reset is needed
  const budget = mapBudgetRow(data);
  return checkAndResetSpend(budget);
}

export async function upsertAgentBudget(
  workspaceId: string,
  agentId: string,
  input: {
    dailyBudgetUsd?: number;
    monthlyBudgetUsd?: number;
    maxCostPerExecutionUsd?: number;
    overBudgetPolicy?: OverBudgetPolicy;
  }
): Promise<AgentBudget> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("ai_agent_budgets")
    .upsert(
      {
        workspace_id: workspaceId,
        agent_id: agentId,
        daily_budget_usd: input.dailyBudgetUsd ?? 25.0,
        monthly_budget_usd: input.monthlyBudgetUsd ?? 500.0,
        max_cost_per_execution_usd: input.maxCostPerExecutionUsd ?? 1.5,
        over_budget_policy: input.overBudgetPolicy ?? "require_approval",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,agent_id" }
    )
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to upsert agent budget: ${error?.message || "Unknown error"}`);
  }

  return mapBudgetRow(data);
}

export async function evaluateBudgetAllowance(
  workspaceId: string,
  agentId: string,
  estimatedCostUsd: number = 0.05
): Promise<BudgetUtilization> {
  const budget = await getAgentBudget(workspaceId, agentId);

  const dailySpend = budget.currentDailySpendUsd;
  const dailyLimit = budget.dailyBudgetUsd;
  const monthlySpend = budget.currentMonthlySpendUsd;
  const monthlyLimit = budget.monthlyBudgetUsd;

  const remainingDaily = Math.max(0, dailyLimit - dailySpend);
  const remainingMonthly = Math.max(0, monthlyLimit - monthlySpend);

  const dailyUtil = dailyLimit > 0 ? Number(((dailySpend / dailyLimit) * 100).toFixed(1)) : 0;
  const monthlyUtil = monthlyLimit > 0 ? Number(((monthlySpend / monthlyLimit) * 100).toFixed(1)) : 0;

  const exceedsDaily = dailySpend + estimatedCostUsd > dailyLimit;
  const exceedsMonthly = monthlySpend + estimatedCostUsd > monthlyLimit;
  const exceedsExecutionCeiling = estimatedCostUsd > budget.maxCostPerExecutionUsd;

  const isOverBudget = exceedsDaily || exceedsMonthly || exceedsExecutionCeiling;

  let actionRequired: "allow" | "hard_stop" | "require_approval" = "allow";
  let canExecute = true;

  if (isOverBudget) {
    if (budget.overBudgetPolicy === "hard_stop") {
      actionRequired = "hard_stop";
      canExecute = false;
    } else if (budget.overBudgetPolicy === "require_approval") {
      actionRequired = "require_approval";
      canExecute = false;
    } else {
      actionRequired = "allow"; // notify_only
      canExecute = true;
    }
  }

  return {
    agentId,
    dailySpendUsd: Number(dailySpend.toFixed(4)),
    dailyLimitUsd: dailyLimit,
    dailyUtilizationPercent: dailyUtil,
    monthlySpendUsd: Number(monthlySpend.toFixed(4)),
    monthlyLimitUsd: monthlyLimit,
    monthlyUtilizationPercent: monthlyUtil,
    remainingDailyUsd: Number(remainingDaily.toFixed(4)),
    remainingMonthlyUsd: Number(remainingMonthly.toFixed(4)),
    isOverBudget,
    canExecute,
    actionRequired,
  };
}

export async function recordSpend(
  workspaceId: string,
  agentId: string,
  costUsd: number,
  reservationIdOrClient?: string | any,
  client?: any
): Promise<{ success: boolean; canExecute: boolean; newDailySpendUsd?: number }> {
  if (costUsd === 0) {
    return { success: true, canExecute: true };
  }

  let reservationId: string | undefined;
  let supabase = client;
  if (typeof reservationIdOrClient === "string") {
    reservationId = reservationIdOrClient;
  } else if (reservationIdOrClient && typeof reservationIdOrClient === "object" && "rpc" in reservationIdOrClient) {
    supabase = reservationIdOrClient;
  }
  supabase = supabase || createServerSupabaseClient();

  const { data: rpcData, error: rpcErr } = await supabase.rpc("record_agent_execution_spend_atomic", {
    p_workspace_id: workspaceId,
    p_agent_id: agentId,
    p_cost_usd: costUsd,
    p_reservation_id: reservationId ?? null,
  });

  if (rpcErr) {
    throw new Error(`Failed to record agent execution spend: ${rpcErr.message}`);
  }

  const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
  if (!row || row.success === false || row.can_execute === false) {
    return {
      success: false,
      canExecute: false,
      newDailySpendUsd: Number(row?.daily_spend_usd ?? row?.current_daily_spend ?? 0),
    };
  }

  return {
    success: true,
    canExecute: true,
    newDailySpendUsd: Number(row.daily_spend_usd ?? 0),
  };
}

export const recordAgentExecutionSpend = recordSpend;

async function checkAndResetSpend(budget: AgentBudget): Promise<AgentBudget> {
  const today = new Date().toISOString().split("T")[0];
  const lastReset = budget.lastResetDate;

  if (today === lastReset) {
    return budget;
  }

  const supabase = createServerSupabaseClient();
  const isNewMonth = today.slice(0, 7) !== lastReset.slice(0, 7);

  const updatedDaily = 0.0;
  const updatedMonthly = isNewMonth ? 0.0 : budget.currentMonthlySpendUsd;

  const { data } = await supabase
    .from("ai_agent_budgets")
    .update({
      current_daily_spend_usd: updatedDaily,
      current_monthly_spend_usd: updatedMonthly,
      last_reset_date: today,
      updated_at: new Date().toISOString(),
    })
    .eq("id", budget.id)
    .select()
    .single();

  if (data) {
    return mapBudgetRow(data);
  }

  return {
    ...budget,
    currentDailySpendUsd: updatedDaily,
    currentMonthlySpendUsd: updatedMonthly,
    lastResetDate: today,
  };
}

export function getDefaultBudget(workspaceId: string, agentId: string): AgentBudget {
  return {
    id: `default-budget-${agentId}`,
    workspaceId,
    agentId,
    dailyBudgetUsd: 25.0,
    monthlyBudgetUsd: 500.0,
    maxCostPerExecutionUsd: 1.5,
    currentDailySpendUsd: 0.0,
    currentMonthlySpendUsd: 0.0,
    overBudgetPolicy: "require_approval",
    lastResetDate: new Date().toISOString().split("T")[0],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function mapBudgetRow(row: any): AgentBudget {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    agentId: row.agent_id,
    dailyBudgetUsd: Number(row.daily_budget_usd || 0),
    monthlyBudgetUsd: Number(row.monthly_budget_usd || 0),
    maxCostPerExecutionUsd: Number(row.max_cost_per_execution_usd || 0),
    currentDailySpendUsd: Number(row.current_daily_spend_usd || 0),
    currentMonthlySpendUsd: Number(row.current_monthly_spend_usd || 0),
    overBudgetPolicy: row.over_budget_policy as OverBudgetPolicy,
    lastResetDate: row.last_reset_date
      ? String(row.last_reset_date).split("T")[0]
      : new Date().toISOString().split("T")[0],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
