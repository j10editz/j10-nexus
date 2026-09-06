/**
 * J10 NEXUS TIER 4 — HUMAN APPROVAL GATES
 * Human-in-the-loop (HITL) safety workflows, risk-based gating,
 * payload inspection, and asynchronous review state transitions.
 */

import { createServerSupabaseClient } from "@/lib/auth";
import type { ApprovalGate, ApprovalRiskLevel, ApprovalStatus } from "@/types/governance";

export async function createApprovalGate(
  workspaceId: string,
  input: {
    agentId: string;
    actionType: string;
    actionPayload: Record<string, unknown>;
    estimatedRisk?: ApprovalRiskLevel;
    reason: string;
    traceId?: string;
  }
): Promise<ApprovalGate> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("ai_agent_approval_gates")
    .insert({
      workspace_id: workspaceId,
      agent_id: input.agentId,
      trace_id: input.traceId || null,
      action_type: input.actionType,
      action_payload: input.actionPayload,
      estimated_risk: input.estimatedRisk || "medium",
      reason: input.reason,
      status: "pending",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to create approval gate: ${error?.message || "Unknown error"}`);
  }

  return mapApprovalRow(data);
}

export async function getPendingApprovals(
  workspaceId: string,
  agentId?: string
): Promise<ApprovalGate[]> {
  const supabase = createServerSupabaseClient();

  let query = supabase
    .from("ai_agent_approval_gates")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (agentId) {
    query = query.eq("agent_id", agentId);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Error fetching pending approvals:", error);
    return [];
  }

  // Filter out any expired gates
  const now = new Date();
  const validGates: ApprovalGate[] = [];

  for (const row of data || []) {
    const expiresAt = new Date(row.expires_at);
    if (expiresAt < now) {
      // Auto-expire
      await supabase
        .from("ai_agent_approval_gates")
        .update({ status: "expired", updated_at: now.toISOString() })
        .eq("id", row.id);
    } else {
      validGates.push(mapApprovalRow(row));
    }
  }

  return validGates;
}

export async function resolveApprovalGate(
  workspaceId: string,
  gateId: string,
  reviewerId: string,
  decision: "approved" | "rejected",
  reviewNotes?: string
): Promise<ApprovalGate> {
  const supabase = createServerSupabaseClient();

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("ai_agent_approval_gates")
    .update({
      status: decision,
      reviewed_by: reviewerId,
      reviewed_at: now,
      review_notes: reviewNotes || null,
      updated_at: now,
    })
    .eq("id", gateId)
    .eq("workspace_id", workspaceId)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to resolve approval gate: ${error?.message || "Unknown error"}`);
  }

  // If this gate was attached to a trace, update trace status accordingly
  if (data.trace_id) {
    const newTraceStatus = decision === "approved" ? "running" : "rejected";
    await supabase
      .from("ai_agent_traces")
      .update({ status: newTraceStatus })
      .eq("id", data.trace_id);
  }

  return mapApprovalRow(data);
}

function mapApprovalRow(row: any): ApprovalGate {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    traceId: row.trace_id,
    agentId: row.agent_id,
    actionType: row.action_type,
    actionPayload: (row.action_payload as Record<string, unknown>) || {},
    estimatedRisk: row.estimated_risk as ApprovalRiskLevel,
    reason: row.reason,
    status: row.status as ApprovalStatus,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    reviewNotes: row.review_notes,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
