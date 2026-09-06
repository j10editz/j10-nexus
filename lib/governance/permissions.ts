/**
 * J10 NEXUS TIER 4 — AGENT PERMISSIONS & TOOL POLICIES
 * Granular capability-based access control, tool allowlists/denylists,
 * data boundaries, and pre-execution authorization validation.
 */

import { createServerSupabaseClient } from "@/lib/auth";
import type { AgentPermissions, ToolPolicyCheck } from "@/types/governance";

// Sensitive tool operations that trigger a human approval gate
export const SENSITIVE_APPROVAL_TOOLS = new Set([
  "stripe.refund",
  "stripe.charge",
  "crm.deal_close_won",
  "crm.delete_contact",
  "marketing.mass_broadcast",
  "system.database_write",
  "system.admin_config",
]);

export async function getAgentPermissions(
  workspaceId: string,
  agentId: string
): Promise<AgentPermissions> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("ai_agent_permissions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("agent_id", agentId)
    .maybeSingle();

  if (error || !data) {
    return getDefaultPermissions(workspaceId, agentId);
  }

  return mapPermissionsRow(data);
}

export async function upsertAgentPermissions(
  workspaceId: string,
  agentId: string,
  input: {
    allowedTools: string[];
    deniedTools?: string[];
    dataBoundaries?: Record<string, unknown>;
    canExecuteCode?: boolean;
    canCallExternalApis?: boolean;
  }
): Promise<AgentPermissions> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("ai_agent_permissions")
    .upsert(
      {
        workspace_id: workspaceId,
        agent_id: agentId,
        allowed_tools: input.allowedTools,
        denied_tools: input.deniedTools || [],
        data_boundaries: input.dataBoundaries || {},
        can_execute_code: input.canExecuteCode ?? false,
        can_call_external_apis: input.canCallExternalApis ?? false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,agent_id" }
    )
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to upsert agent permissions: ${error?.message || "Unknown error"}`);
  }

  return mapPermissionsRow(data);
}

export async function checkToolPermission(
  workspaceId: string,
  agentId: string,
  toolName: string
): Promise<ToolPolicyCheck> {
  const permissions = await getAgentPermissions(workspaceId, agentId);

  const normalizedTool = toolName.trim().toLowerCase();

  // 1. Explicitly denied takes absolute precedence
  const isExplicitlyDenied = permissions.deniedTools.some(
    (denied) => denied.toLowerCase() === normalizedTool || denied === "*"
  );

  if (isExplicitlyDenied) {
    return {
      allowed: false,
      toolName,
      reason: `Tool '${toolName}' is explicitly blocked by policy for agent '${agentId}'.`,
    };
  }

  // 2. Check allowlist (supports wildcards like 'crm.*' or '*')
  const isAllowed = permissions.allowedTools.some((allowed) => {
    const normAllowed = allowed.toLowerCase();
    if (normAllowed === "*" || normAllowed === normalizedTool) return true;
    if (normAllowed.endsWith(".*")) {
      const prefix = normAllowed.slice(0, -2);
      return normalizedTool.startsWith(`${prefix}.`);
    }
    return false;
  });

  if (!isAllowed) {
    return {
      allowed: false,
      toolName,
      reason: `Tool '${toolName}' is not in the allowed capabilities for agent '${agentId}'.`,
    };
  }

  // 3. Check if this tool is sensitive and requires human sign-off
  const requiresApproval = SENSITIVE_APPROVAL_TOOLS.has(normalizedTool);

  return {
    allowed: true,
    toolName,
    requiresApproval,
  };
}

export function getDefaultPermissions(workspaceId: string, agentId: string): AgentPermissions {
  // Baseline tailored defaults by agent role
  let allowedTools = ["crm.read", "inbox.read", "knowledge.read"];
  const deniedTools = ["system.*", "database.drop", "stripe.refund"];

  if (agentId.includes("sales")) {
    allowedTools = ["crm.read", "crm.write", "crm.proposals", "inbox.read", "inbox.send", "knowledge.read"];
  } else if (agentId.includes("support")) {
    allowedTools = ["inbox.read", "inbox.send", "knowledge.read", "crm.read"];
  } else if (agentId.includes("marketing")) {
    allowedTools = ["marketing.read", "marketing.campaigns", "knowledge.read", "inbox.read"];
  } else if (agentId.includes("finance")) {
    allowedTools = ["finance.read", "finance.invoices", "payment.ledger", "knowledge.read"];
  }

  return {
    id: `default-perm-${agentId}`,
    workspaceId,
    agentId,
    allowedTools,
    deniedTools,
    dataBoundaries: { tenantIsolated: true },
    canExecuteCode: false,
    canCallExternalApis: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function mapPermissionsRow(row: any): AgentPermissions {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    agentId: row.agent_id,
    allowedTools: Array.isArray(row.allowed_tools) ? row.allowed_tools : [],
    deniedTools: Array.isArray(row.denied_tools) ? row.denied_tools : [],
    dataBoundaries: (row.data_boundaries as Record<string, unknown>) || {},
    canExecuteCode: Boolean(row.can_execute_code),
    canCallExternalApis: Boolean(row.can_call_external_apis),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
