/**
 * J10 NEXUS TIER 4 — AGENT VERSIONS & PROMPT SNAPSHOTS
 * Manages immutable agent versions, system prompts, hyperparameters,
 * active promotions, and 1-click rollback snapshots.
 */

import { createServerSupabaseClient } from "@/lib/auth";
import type { AgentVersion, AgentVersionStatus } from "@/types/governance";

export async function getAgentVersions(
  workspaceId: string,
  agentId: string
): Promise<AgentVersion[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("ai_agent_versions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("agent_id", agentId)
    .order("version_number", { ascending: false });

  if (error) {
    console.error("Error fetching agent versions:", error);
    return [];
  }

  return (data || []).map(mapVersionRow);
}

export async function getActiveAgentVersion(
  workspaceId: string,
  agentId: string
): Promise<AgentVersion | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("ai_agent_versions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("agent_id", agentId)
    .eq("status", "active")
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    // If no active version yet in DB, return default v1 snapshot
    return getDefaultAgentVersion(workspaceId, agentId);
  }

  return mapVersionRow(data);
}

export async function createAgentVersion(
  workspaceId: string,
  input: {
    agentId: string;
    systemPrompt: string;
    instructions?: string;
    modelId?: string;
    temperature?: number;
    maxTokens?: number;
    reasoningEffort?: "none" | "low" | "medium" | "high" | "xhigh" | "max";
    toolsEnabled?: string[];
    changelog?: string;
    makeActive?: boolean;
    createdBy?: string;
  }
): Promise<AgentVersion> {
  const supabase = createServerSupabaseClient();

  // 1. Get current max version number
  const existing = await getAgentVersions(workspaceId, input.agentId);
  const nextVersionNumber = existing.length > 0 ? existing[0].versionNumber + 1 : 1;

  const shouldBeActive = input.makeActive ?? true;

  // 2. If making active, archive older active versions
  if (shouldBeActive && existing.length > 0) {
    await supabase
      .from("ai_agent_versions")
      .update({ status: "archived", updated_at: new Date().toISOString() })
      .eq("workspace_id", workspaceId)
      .eq("agent_id", input.agentId)
      .eq("status", "active");
  }

  const { data, error } = await supabase
    .from("ai_agent_versions")
    .insert({
      workspace_id: workspaceId,
      agent_id: input.agentId,
      version_number: nextVersionNumber,
      system_prompt: input.systemPrompt,
      instructions: input.instructions || "",
      model_id: input.modelId || "gpt-5.6-sol",
      temperature: input.temperature ?? 0.7,
      max_tokens: input.maxTokens || 4096,
      reasoning_effort: input.reasoningEffort || "medium",
      tools_enabled: input.toolsEnabled || [],
      changelog: input.changelog || `Version ${nextVersionNumber}`,
      status: shouldBeActive ? "active" : "draft",
      created_by: input.createdBy || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to create agent version: ${error?.message || "Unknown error"}`);
  }

  return mapVersionRow(data);
}

export async function promoteAgentVersion(
  workspaceId: string,
  versionId: string
): Promise<AgentVersion> {
  const supabase = createServerSupabaseClient();

  // Find target version
  const { data: target, error: findError } = await supabase
    .from("ai_agent_versions")
    .select("*")
    .eq("id", versionId)
    .eq("workspace_id", workspaceId)
    .single();

  if (findError || !target) {
    throw new Error("Target version not found");
  }

  // Archive currently active versions for this agent
  await supabase
    .from("ai_agent_versions")
    .update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("agent_id", target.agent_id)
    .eq("status", "active");

  // Promote target
  const { data: updated, error: updateError } = await supabase
    .from("ai_agent_versions")
    .update({ status: "active", updated_at: new Date().toISOString() })
    .eq("id", versionId)
    .select()
    .single();

  if (updateError || !updated) {
    throw new Error(`Failed to promote version: ${updateError?.message}`);
  }

  return mapVersionRow(updated);
}

export async function rollbackAgentVersion(
  workspaceId: string,
  agentId: string,
  targetVersionNumber: number
): Promise<AgentVersion> {
  const supabase = createServerSupabaseClient();

  // Find the requested rollback target
  const { data: target, error: findError } = await supabase
    .from("ai_agent_versions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("agent_id", agentId)
    .eq("version_number", targetVersionNumber)
    .single();

  if (findError || !target) {
    throw new Error(`Rollback target version v${targetVersionNumber} not found.`);
  }

  // Archive any current active versions
  await supabase
    .from("ai_agent_versions")
    .update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("agent_id", agentId)
    .eq("status", "active");

  // Mark target as active with rollback status
  const { data: activated, error: activateError } = await supabase
    .from("ai_agent_versions")
    .update({
      status: "active",
      changelog: `Rolled back to v${targetVersionNumber}`,
      updated_at: new Date().toISOString(),
    })
    .eq("id", target.id)
    .select()
    .single();

  if (activateError || !activated) {
    throw new Error(`Failed to rollback agent version: ${activateError?.message}`);
  }

  return mapVersionRow(activated);
}

export function getDefaultAgentVersion(workspaceId: string, agentId: string): AgentVersion {
  return {
    id: `default-v1-${agentId}`,
    workspaceId,
    agentId,
    versionNumber: 1,
    systemPrompt: `You are ${agentId}, a specialized autonomous AI employee at J10 NEXUS. Execute your role with rigorous professional accuracy, zero emojis, and proactive accountability.`,
    instructions: "Follow all workspace policies and corporate guidelines.",
    modelId: "gpt-5.6-sol",
    temperature: 0.7,
    maxTokens: 4096,
    reasoningEffort: "medium",
    toolsEnabled: ["crm.read", "inbox.read", "knowledge.read"],
    changelog: "Baseline default deployment",
    status: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function mapVersionRow(row: any): AgentVersion {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    agentId: row.agent_id,
    versionNumber: row.version_number,
    systemPrompt: row.system_prompt,
    instructions: row.instructions || "",
    modelId: row.model_id,
    temperature: Number(row.temperature),
    maxTokens: row.max_tokens,
    reasoningEffort: row.reasoning_effort,
    toolsEnabled: Array.isArray(row.tools_enabled) ? row.tools_enabled : [],
    changelog: row.changelog || "",
    status: row.status as AgentVersionStatus,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
