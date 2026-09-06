import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  InboxChannel,
  InboxPriority,
  OmnichannelRoutingRule,
} from "@/types/inbox";

export interface RoutingContext {
  channel: InboxChannel;
  priority: InboxPriority;
  content: string;
  contactTags?: string[];
  contactName?: string;
  activeMembers?: Array<{
    id: string;
    name?: string;
    activeCount: number;
    skills?: string[];
  }>;
  workforceAgents?: Array<{
    id: string;
    name: string;
    role: string;
    is_active?: boolean;
  }>;
}

export interface RoutingAssignmentResult {
  assignedUserId?: string;
  assignedAgentId?: string;
  assignedTeam: string;
  matchedRuleId?: string;
  strategyUsed: string;
  reason: string;
}

/**
 * Pure evaluation function for deterministic testing and runtime execution
 */
export function evaluateRoutingRules(
  rules: OmnichannelRoutingRule[],
  context: RoutingContext,
): RoutingAssignmentResult {
  // Filter active rules for this channel, sorted by priority order (ascending)
  const candidateRules = rules
    .filter((r) => r.isActive)
    .filter((r) => r.channel === "all" || r.channel === context.channel)
    .sort((a, b) => a.priorityOrder - b.priorityOrder);

  for (const rule of candidateRules) {
    if (matchesConditions(rule.conditions, context)) {
      const result = executeStrategy(rule, context);
      if (result) {
        return {
          ...result,
          matchedRuleId: rule.id,
        };
      }
    }
  }

  // Default fallback if no custom rule matched
  return getDefaultAssignment(context);
}

function matchesConditions(
  conditions: OmnichannelRoutingRule["conditions"],
  context: RoutingContext,
): boolean {
  if (!conditions || conditions.length === 0) return true;

  return conditions.every((cond) => {
    switch (cond.field) {
      case "channel":
        return cond.operator === "equals"
          ? context.channel === cond.value
          : context.channel.includes(cond.value as any);
      case "priority":
        return context.priority === cond.value;
      case "keyword":
        return (
          context.content &&
          context.content.toLowerCase().includes(cond.value.toLowerCase())
        );
      case "vip":
        return (context.contactTags || []).some(
          (tag) => tag.toLowerCase() === "vip",
        );
      case "language":
        return (context.contactTags || []).some(
          (tag) => tag.toLowerCase() === cond.value.toLowerCase(),
        );
      default:
        return true;
    }
  });
}

function executeStrategy(
  rule: OmnichannelRoutingRule,
  context: RoutingContext,
): Omit<RoutingAssignmentResult, "matchedRuleId"> | null {
  const members = context.activeMembers || [];
  const agents = context.workforceAgents || [];

  switch (rule.routingStrategy) {
    case "direct_assignment":
      return {
        assignedUserId: rule.targetUserId,
        assignedAgentId: rule.targetAgentId,
        assignedTeam: rule.targetTeam || "general",
        strategyUsed: "direct_assignment",
        reason: `Directly assigned via rule: ${rule.name}`,
      };

    case "ai_specialist": {
      const targetAgent = rule.targetAgentId
        ? agents.find((a) => a.id === rule.targetAgentId)
        : agents[0];
      return {
        assignedAgentId: targetAgent?.id || rule.targetAgentId,
        assignedTeam: rule.targetTeam || "ai_ops",
        strategyUsed: "ai_specialist",
        reason: `Routed to AI specialist agent: ${targetAgent?.name || "Autonomous Agent"}`,
      };
    }

    case "least_loaded": {
      if (members.length === 0) {
        return {
          assignedTeam: rule.targetTeam || "general",
          strategyUsed: "least_loaded",
          reason: "No available human agents; queued to team desk",
        };
      }
      // Sort ascending by active thread load
      const sorted = [...members].sort(
        (a, b) => a.activeCount - b.activeCount,
      );
      const chosen = sorted[0];
      return {
        assignedUserId: chosen.id,
        assignedTeam: rule.targetTeam || "general",
        strategyUsed: "least_loaded",
        reason: `Assigned to ${chosen.name || chosen.id} (least loaded: ${chosen.activeCount} active threads)`,
      };
    }

    case "round_robin": {
      if (members.length === 0) {
        return {
          assignedTeam: rule.targetTeam || "general",
          strategyUsed: "round_robin",
          reason: "No available human agents; queued to team desk",
        };
      }
      // Pick first member in rotation
      const chosen = members[0];
      return {
        assignedUserId: chosen.id,
        assignedTeam: rule.targetTeam || "general",
        strategyUsed: "round_robin",
        reason: `Round-robin assigned to ${chosen.name || chosen.id}`,
      };
    }

    case "skill_based": {
      // Find member matching rule target team or required skill
      const requiredSkill = (rule.targetTeam || "").toLowerCase();
      const matched = members.find((m) =>
        (m.skills || []).some((s) => s.toLowerCase() === requiredSkill),
      );
      if (matched) {
        return {
          assignedUserId: matched.id,
          assignedTeam: rule.targetTeam,
          strategyUsed: "skill_based",
          reason: `Skill match found for ${matched.name || matched.id} (Skill: ${rule.targetTeam})`,
        };
      }
      // Fallback to least loaded
      const fallback = [...members].sort(
        (a, b) => a.activeCount - b.activeCount,
      )[0];
      return {
        assignedUserId: fallback?.id,
        assignedTeam: rule.targetTeam || "general",
        strategyUsed: "skill_based_fallback",
        reason: `No exact skill match for ${rule.targetTeam}; defaulted to least loaded agent`,
      };
    }

    default:
      return null;
  }
}

function getDefaultAssignment(context: RoutingContext): RoutingAssignmentResult {
  if (context.workforceAgents && context.workforceAgents.length > 0) {
    const defaultAgent = context.workforceAgents[0];
    return {
      assignedAgentId: defaultAgent.id,
      assignedTeam: "ai_ops",
      strategyUsed: "default_ai_fallback",
      reason: `Default route: assigned to primary AI agent (${defaultAgent.name})`,
    };
  }

  return {
    assignedTeam: "general",
    strategyUsed: "default_unassigned",
    reason: "No routing rules matched; placed in workspace general queue",
  };
}

/**
 * DB helper: List routing rules for workspace
 */
export async function getWorkspaceRoutingRules(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<OmnichannelRoutingRule[]> {
  const { data, error } = await supabase
    .from("omnichannel_routing_rules")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("priority_order", { ascending: true });

  if (error) throw error;

  return (data || []).map((row: any) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    description: row.description,
    channel: row.channel,
    conditions: row.conditions || [],
    routingStrategy: row.routing_strategy,
    targetUserId: row.target_user_id,
    targetAgentId: row.target_agent_id,
    targetTeam: row.target_team,
    priorityOrder: row.priority_order,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/**
 * DB helper: Create or update routing rule
 */
export async function upsertRoutingRule(
  supabase: SupabaseClient,
  workspaceId: string,
  input: Partial<OmnichannelRoutingRule> & { name: string; channel: any; routingStrategy: any },
): Promise<OmnichannelRoutingRule> {
  const payload: any = {
    workspace_id: workspaceId,
    name: input.name,
    description: input.description || null,
    channel: input.channel,
    conditions: input.conditions || [],
    routing_strategy: input.routingStrategy,
    target_user_id: input.targetUserId || null,
    target_agent_id: input.targetAgentId || null,
    target_team: input.targetTeam || "general",
    priority_order: input.priorityOrder ?? 10,
    is_active: input.isActive ?? true,
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    payload.id = input.id;
  }

  const { data, error } = await supabase
    .from("omnichannel_routing_rules")
    .upsert(payload)
    .select()
    .single();

  if (error) throw error;

  return {
    id: data.id,
    workspaceId: data.workspace_id,
    name: data.name,
    description: data.description,
    channel: data.channel,
    conditions: data.conditions || [],
    routingStrategy: data.routing_strategy,
    targetUserId: data.target_user_id,
    targetAgentId: data.target_agent_id,
    targetTeam: data.target_team,
    priorityOrder: data.priority_order,
    isActive: data.is_active,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

/**
 * DB helper: Execute routing evaluation on a specific thread and update it
 */
export async function routeAndAssignThread(
  supabase: SupabaseClient,
  workspaceId: string,
  threadId: string,
  context: RoutingContext,
): Promise<RoutingAssignmentResult> {
  const rules = await getWorkspaceRoutingRules(supabase, workspaceId);
  const assignment = evaluateRoutingRules(rules, context);

  const updatePayload: any = {
    assigned_team: assignment.assignedTeam,
    assigned_at: new Date().toISOString(),
    routing_rule_id: assignment.matchedRuleId || null,
    updated_at: new Date().toISOString(),
  };

  if (assignment.assignedUserId) {
    updatePayload.assigned_user_id = assignment.assignedUserId;
  }
  if (assignment.assignedAgentId) {
    updatePayload.assigned_agent_id = assignment.assignedAgentId;
  }

  await supabase
    .from("inbox_threads")
    .update(updatePayload)
    .eq("id", threadId)
    .eq("workspace_id", workspaceId);

  return assignment;
}
