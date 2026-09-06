/**
 * J10 NEXUS TIER 4 — EXECUTION TRACES & STEP LOGS
 * End-to-end observability, step-by-step reasoning logging,
 * token accounting, compute cost calculations, and latency profiling.
 */

import { createServerSupabaseClient } from "@/lib/auth";
import type { AgentTrace, AgentTraceStep, TraceStatus, StepType } from "@/types/governance";

export const MODEL_PRICING_PER_1M_TOKENS: Record<string, { prompt: number; completion: number }> = {
  // Luna / Fast Tier ($0.15 in, $0.60 out per 1M)
  "gpt-5.6-luna": { prompt: 0.15, completion: 0.60 },
  "gpt-4o-mini": { prompt: 0.15, completion: 0.60 },
  "gemini-2.5-flash": { prompt: 0.10, completion: 0.40 },

  // Terra / Standard Tier ($2.50 in, $10.00 out per 1M)
  "gpt-5.6-terra": { prompt: 2.50, completion: 10.00 },
  "gpt-4o": { prompt: 2.50, completion: 10.00 },
  "gemini-2.5-pro": { prompt: 1.25, completion: 5.00 },

  // Sol / Frontier Tier ($5.00 in, $20.00 out per 1M)
  "gpt-5.6-sol": { prompt: 5.00, completion: 20.00 },

  // Deterministic Sandbox ($0.00)
  "development": { prompt: 0.0, completion: 0.0 },
};

export function calculateTokenCost(
  modelId: string,
  promptTokens: number,
  completionTokens: number
): number {
  const normalizedModel = modelId.toLowerCase();
  const pricing = MODEL_PRICING_PER_1M_TOKENS[normalizedModel] || MODEL_PRICING_PER_1M_TOKENS["gpt-5.6-sol"];

  const promptCost = (promptTokens / 1_000_000) * pricing.prompt;
  const completionCost = (completionTokens / 1_000_000) * pricing.completion;

  return Number((promptCost + completionCost).toFixed(6));
}

export async function startAgentTrace(
  workspaceId: string,
  input: {
    agentId: string;
    versionId?: string;
    taskId?: string;
    sessionId?: string;
    modelUsed: string;
    providerUsed?: "openai" | "gemini" | "development";
    inputPayload: Record<string, unknown>;
  }
): Promise<AgentTrace> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("ai_agent_traces")
    .insert({
      workspace_id: workspaceId,
      agent_id: input.agentId,
      version_id: input.versionId || null,
      task_id: input.taskId || null,
      session_id: input.sessionId || null,
      status: "running",
      model_used: input.modelUsed,
      provider_used: input.providerUsed || "openai",
      latency_ms: 0,
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      cost_usd: 0,
      input_payload: input.inputPayload,
      output_payload: {},
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to start agent trace: ${error?.message || "Unknown error"}`);
  }

  return mapTraceRow(data);
}

export async function logTraceStep(
  traceId: string,
  step: {
    stepNumber: number;
    stepType: StepType;
    toolName?: string;
    toolInput?: Record<string, unknown>;
    toolOutput?: Record<string, unknown>;
    thought?: string;
    latencyMs?: number;
    status?: "pending" | "running" | "completed" | "failed" | "waiting_approval";
  }
): Promise<AgentTraceStep> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("ai_agent_trace_steps")
    .insert({
      trace_id: traceId,
      step_number: step.stepNumber,
      step_type: step.stepType,
      tool_name: step.toolName || null,
      tool_input: step.toolInput || null,
      tool_output: step.toolOutput || null,
      thought: step.thought || null,
      latency_ms: step.latencyMs || 0,
      status: step.status || "completed",
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to log trace step: ${error?.message || "Unknown error"}`);
  }

  return mapStepRow(data);
}

export async function completeAgentTrace(
  traceId: string,
  result: {
    status: TraceStatus;
    outputPayload: Record<string, unknown>;
    promptTokens: number;
    completionTokens: number;
    latencyMs: number;
    modelUsed?: string;
    errorMessage?: string;
  }
): Promise<AgentTrace> {
  const supabase = createServerSupabaseClient();

  // 1. Fetch current trace to know model
  const { data: current } = await supabase
    .from("ai_agent_traces")
    .select("model_used")
    .eq("id", traceId)
    .single();

  const model = result.modelUsed || current?.model_used || "gpt-5.6-sol";
  const totalTokens = result.promptTokens + result.completionTokens;
  const costUsd = calculateTokenCost(model, result.promptTokens, result.completionTokens);

  const { data, error } = await supabase
    .from("ai_agent_traces")
    .update({
      status: result.status,
      output_payload: result.outputPayload,
      prompt_tokens: result.promptTokens,
      completion_tokens: result.completionTokens,
      total_tokens: totalTokens,
      cost_usd: costUsd,
      latency_ms: result.latencyMs,
      error_message: result.errorMessage || null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", traceId)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to complete agent trace: ${error?.message || "Unknown error"}`);
  }

  return mapTraceRow(data);
}

export async function failAgentTrace(
  traceId: string,
  errorMessage: string,
  latencyMs = 0
): Promise<AgentTrace> {
  return completeAgentTrace(traceId, {
    status: "failed",
    outputPayload: { error: errorMessage },
    promptTokens: 0,
    completionTokens: 0,
    latencyMs,
    errorMessage,
  });
}

export async function getAgentTraces(
  workspaceId: string,
  filters?: {
    agentId?: string;
    status?: TraceStatus;
    limit?: number;
  }
): Promise<AgentTrace[]> {
  const supabase = createServerSupabaseClient();

  let query = supabase
    .from("ai_agent_traces")
    .select("*, steps:ai_agent_trace_steps(*)")
    .eq("workspace_id", workspaceId)
    .order("started_at", { ascending: false });

  if (filters?.agentId) {
    query = query.eq("agent_id", filters.agentId);
  }

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }

  if (filters?.limit) {
    query = query.limit(filters.limit);
  } else {
    query = query.limit(50);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Error fetching agent traces:", error);
    return [];
  }

  return (data || []).map((row: any) => ({
    ...mapTraceRow(row),
    steps: Array.isArray(row.steps) ? row.steps.map(mapStepRow).sort((a: AgentTraceStep, b: AgentTraceStep) => a.stepNumber - b.stepNumber) : [],
  }));
}

function mapTraceRow(row: any): AgentTrace {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    agentId: row.agent_id,
    versionId: row.version_id,
    taskId: row.task_id,
    sessionId: row.session_id,
    status: row.status as TraceStatus,
    modelUsed: row.model_used,
    providerUsed: row.provider_used,
    latencyMs: row.latency_ms || 0,
    promptTokens: row.prompt_tokens || 0,
    completionTokens: row.completion_tokens || 0,
    totalTokens: row.total_tokens || 0,
    costUsd: Number(row.cost_usd || 0),
    inputPayload: (row.input_payload as Record<string, unknown>) || {},
    outputPayload: (row.output_payload as Record<string, unknown>) || {},
    errorMessage: row.error_message,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

function mapStepRow(row: any): AgentTraceStep {
  return {
    id: row.id,
    traceId: row.trace_id,
    stepNumber: row.step_number,
    stepType: row.step_type as StepType,
    toolName: row.tool_name,
    toolInput: (row.tool_input as Record<string, unknown>) || null,
    toolOutput: (row.tool_output as Record<string, unknown>) || null,
    thought: row.thought,
    latencyMs: row.latency_ms || 0,
    status: row.status,
    createdAt: row.created_at,
  };
}
