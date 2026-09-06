/**
 * J10 NEXUS TIER 4 — GOVERNED AI AGENT PLATFORM TYPES
 * Strict TypeScript types for versions, execution traces, evals,
 * permissions, budgets, approval gates, reliability monitoring, and ROI attribution.
 */

export type AgentVersionStatus = "draft" | "active" | "archived" | "rollback";

export interface AgentVersion {
  id: string;
  workspaceId: string;
  agentId: string;
  versionNumber: number;
  systemPrompt: string;
  instructions: string;
  modelId: string;
  temperature: number;
  maxTokens: number;
  reasoningEffort: "none" | "low" | "medium" | "high" | "xhigh" | "max";
  toolsEnabled: string[];
  changelog: string;
  status: AgentVersionStatus;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TraceStatus = "running" | "completed" | "failed" | "waiting_approval" | "rejected";
export type StepType = "reasoning" | "tool_call" | "approval_gate" | "eval_check" | "output";

export interface AgentTraceStep {
  id: string;
  traceId: string;
  stepNumber: number;
  stepType: StepType;
  toolName?: string | null;
  toolInput?: Record<string, unknown> | null;
  toolOutput?: Record<string, unknown> | null;
  thought?: string | null;
  latencyMs: number;
  status: "pending" | "running" | "completed" | "failed" | "waiting_approval";
  createdAt: string;
}

export interface AgentTrace {
  id: string;
  workspaceId: string;
  agentId: string;
  versionId?: string | null;
  taskId?: string | null;
  sessionId?: string | null;
  status: TraceStatus;
  modelUsed: string;
  providerUsed: "openai" | "gemini" | "development";
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  inputPayload: Record<string, unknown>;
  outputPayload: Record<string, unknown>;
  errorMessage?: string | null;
  startedAt: string;
  completedAt?: string | null;
  createdAt: string;
  steps?: AgentTraceStep[];
}

export interface AgentPermissions {
  id: string;
  workspaceId: string;
  agentId: string;
  allowedTools: string[];
  deniedTools: string[];
  dataBoundaries: Record<string, unknown>;
  canExecuteCode: boolean;
  canCallExternalApis: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ToolPolicyCheck {
  allowed: boolean;
  toolName: string;
  reason?: string;
  requiresApproval?: boolean;
}

export type OverBudgetPolicy = "hard_stop" | "require_approval" | "notify_only";

export interface AgentBudget {
  id: string;
  workspaceId: string;
  agentId: string;
  dailyBudgetUsd: number;
  monthlyBudgetUsd: number;
  maxCostPerExecutionUsd: number;
  currentDailySpendUsd: number;
  currentMonthlySpendUsd: number;
  overBudgetPolicy: OverBudgetPolicy;
  lastResetDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetUtilization {
  agentId: string;
  dailySpendUsd: number;
  dailyLimitUsd: number;
  dailyUtilizationPercent: number;
  monthlySpendUsd: number;
  monthlyLimitUsd: number;
  monthlyUtilizationPercent: number;
  remainingDailyUsd: number;
  remainingMonthlyUsd: number;
  isOverBudget: boolean;
  canExecute: boolean;
  actionRequired: "allow" | "hard_stop" | "require_approval";
}

export type ApprovalRiskLevel = "low" | "medium" | "high" | "critical";
export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";

export interface ApprovalGate {
  id: string;
  workspaceId: string;
  traceId?: string | null;
  agentId: string;
  actionType: string;
  actionPayload: Record<string, unknown>;
  estimatedRisk: ApprovalRiskLevel;
  reason: string;
  status: ApprovalStatus;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  reviewNotes?: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface EvalTestCase {
  id: string;
  scenario: string;
  input: string;
  expectedKeywords: string[];
  prohibitedKeywords?: string[];
  minConfidence?: number;
  maxLatencyMs?: number;
}

export interface AgentEvaluation {
  id: string;
  workspaceId: string;
  agentId: string;
  versionId: string;
  benchmarkName: string;
  testCasesCount: number;
  passedCount: number;
  passRate: number;
  accuracyScore: number;
  groundednessScore: number;
  safetyScore: number;
  p95LatencyMs: number;
  details: Record<string, unknown>;
  evaluatedAt: string;
}

export type CircuitBreakerState = "closed" | "open" | "half_open";

export interface ReliabilityMetrics {
  workspaceId: string;
  circuitBreakerState: CircuitBreakerState;
  totalInvocations: number;
  failedInvocations: number;
  errorRatePercent: number;
  fallbackCount: number;
  fallbackRatePercent: number;
  p50LatencyMs: number;
  p90LatencyMs: number;
  p99LatencyMs: number;
  trippedReason?: string;
}

export type AttributionType =
  | "won_deal"
  | "labor_saved"
  | "proposal_accepted"
  | "support_ticket_deflected";

export interface AgentRoiAttribution {
  id: string;
  workspaceId: string;
  agentId: string;
  traceId?: string | null;
  taskId?: string | null;
  contactId?: string | null;
  dealValueUsd: number;
  hoursSaved: number;
  laborSavingsUsd: number;
  modelCostUsd: number;
  netRoiUsd: number;
  roiMultiplier: number;
  attributionType: AttributionType;
  createdAt: string;
}

export interface RoiAttributionSummary {
  workspaceId: string;
  totalAttributedRevenue: number;
  totalLaborSavings: number;
  totalGrossValue: number;
  totalComputeCost: number;
  netRoiUsd: number;
  roiMultiplier: number;
  totalHoursSaved: number;
  attributionsCount: number;
  topAgents: {
    agentId: string;
    agentName: string;
    grossValueUsd: number;
    computeCostUsd: number;
    netRoiUsd: number;
    roiMultiplier: number;
  }[];
}
