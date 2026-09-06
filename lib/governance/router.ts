/**
 * J10 NEXUS TIER 4 — GOVERNED MODEL ROUTER & FALLBACKS
 * Dynamic capability/cost optimization, budget-aware model tier downranking,
 * and zero-downtime multi-provider fallback chains.
 */

import type { BudgetUtilization } from "@/types/governance";
import { getActiveAIProvider } from "@/lib/ai/runtime";

export type GovernedWorkload = "fast" | "standard" | "complex" | "critical";

export interface ModelRouteDecision {
  primaryModel: string;
  primaryProvider: "openai" | "gemini" | "development";
  fallbackModel: string;
  fallbackProvider: "openai" | "gemini" | "development";
  workload: GovernedWorkload;
  reasoningEffort: "none" | "low" | "medium" | "high" | "max";
  downrankedForBudget: boolean;
  estimatedCostUsd: number;
  routingReason: string;
}

export function selectGovernedModel(input: {
  taskType: string;
  workload?: GovernedWorkload;
  budgetAllowance?: BudgetUtilization;
  promptLength?: number;
  forceModel?: string;
}): ModelRouteDecision {
  let workload: GovernedWorkload = input.workload || "standard";
  let downrankedForBudget = false;

  // Infer workload from taskType if not explicitly given
  if (!input.workload) {
    const norm = input.taskType.toLowerCase();
    if (norm.includes("triage") || norm.includes("classify") || norm.includes("extract")) {
      workload = "fast";
    } else if (norm.includes("strategy") || norm.includes("deal_closing") || norm.includes("legal") || norm.includes("architecture")) {
      workload = "complex";
    } else if (norm.includes("critical") || norm.includes("executive")) {
      workload = "critical";
    } else {
      workload = "standard";
    }
  }

  // Budget-aware downranking: if budget is >80% consumed, preserve operational continuity
  if (input.budgetAllowance && input.budgetAllowance.dailyUtilizationPercent > 80) {
    if (workload === "critical") {
      workload = "complex";
      downrankedForBudget = true;
    } else if (workload === "complex") {
      workload = "standard";
      downrankedForBudget = true;
    } else if (workload === "standard") {
      workload = "fast";
      downrankedForBudget = true;
    }
  }

  // Active provider detection
  const activeProvider = getActiveAIProvider();

  // Model selection matrix
  let primaryModel = "gpt-5.6-terra";
  let fallbackModel = "gemini-2.5-flash";
  let estimatedCostUsd = 0.05;
  let reasoningEffort: "none" | "low" | "medium" | "high" | "max" = "medium";
  let routingReason = `Routed to ${workload} tier.`;

  if (input.forceModel) {
    primaryModel = input.forceModel;
    fallbackModel = "gemini-2.5-flash";
    routingReason = `Forced model override: ${input.forceModel}.`;
  } else {
    switch (workload) {
      case "fast":
        primaryModel = "gpt-5.6-luna";
        fallbackModel = "gemini-2.5-flash";
        estimatedCostUsd = 0.005;
        reasoningEffort = "none";
        routingReason = downrankedForBudget
          ? "Downranked to Fast Luna tier due to >80% daily budget utilization."
          : "Fast Tier: High-throughput, sub-second execution.";
        break;
      case "standard":
        primaryModel = "gpt-5.6-terra";
        fallbackModel = "gemini-2.5-flash";
        estimatedCostUsd = 0.04;
        reasoningEffort = "low";
        routingReason = downrankedForBudget
          ? "Downranked to Standard Terra tier due to budget limits."
          : "Standard Tier: Balanced cost and conversational precision.";
        break;
      case "complex":
        primaryModel = "gpt-5.6-sol";
        fallbackModel = "gemini-2.5-pro";
        estimatedCostUsd = 0.15;
        reasoningEffort = "high";
        routingReason = "Complex Tier: Frontier reasoning and deep tool planning.";
        break;
      case "critical":
        primaryModel = "gpt-5.6-sol";
        fallbackModel = "gemini-2.5-pro";
        estimatedCostUsd = 0.35;
        reasoningEffort = "max";
        routingReason = "Critical Tier: Maximum reasoning effort with zero tolerance for error.";
        break;
    }
  }

  // Provider assignment
  let primaryProvider: "openai" | "gemini" | "development" = "openai";
  let fallbackProvider: "openai" | "gemini" | "development" = "gemini";

  if (activeProvider === "development") {
    primaryProvider = "development";
    fallbackProvider = "development";
  } else if (activeProvider === "gemini") {
    primaryProvider = "gemini";
    fallbackProvider = "openai";
    // Swap model priority for Gemini native
    const temp = primaryModel;
    primaryModel = fallbackModel;
    fallbackModel = temp;
  }

  return {
    primaryModel,
    primaryProvider,
    fallbackModel,
    fallbackProvider,
    workload,
    reasoningEffort,
    downrankedForBudget,
    estimatedCostUsd,
    routingReason,
  };
}
