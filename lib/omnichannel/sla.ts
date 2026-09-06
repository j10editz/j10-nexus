import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  InboxChannel,
  InboxPriority,
  OmnichannelSlaPolicy,
  SlaStatus,
} from "@/types/inbox";

export interface SlaEvaluationResult {
  status: SlaStatus;
  isFirstResponseBreached: boolean;
  isResolutionBreached: boolean;
  isWarning: boolean;
  minutesRemaining: number;
  firstResponseMinutesTaken?: number;
  resolutionMinutesTaken?: number;
  targetMinutes: number;
}

export interface WorkspaceSlaMetrics {
  totalThreadsTracked: number;
  complianceRatePercent: number;
  healthyCount: number;
  warningCount: number;
  breachedCount: number;
  avgFirstResponseMinutes: number;
  avgResolutionMinutes: number;
}

/**
 * Standard default SLA policies used if no custom policy matches
 */
export const DEFAULT_SLA_TARGETS: Record<
  InboxPriority,
  { firstResponseMinutes: number; resolutionMinutes: number }
> = {
  urgent: { firstResponseMinutes: 10, resolutionMinutes: 60 },
  high: { firstResponseMinutes: 30, resolutionMinutes: 240 },
  medium: { firstResponseMinutes: 120, resolutionMinutes: 1440 },
  low: { firstResponseMinutes: 480, resolutionMinutes: 2880 },
};

/**
 * Evaluates live SLA status for a thread based on timestamps
 */
export function evaluateThreadSla(params: {
  createdAt: string | Date;
  firstResponseDueAt?: string | Date | null;
  firstRespondedAt?: string | Date | null;
  resolutionDueAt?: string | Date | null;
  resolvedAt?: string | Date | null;
  warningThresholdPercent?: number;
  now?: Date;
}): SlaEvaluationResult {
  const now = params.now || new Date();
  const created = new Date(params.createdAt);
  const warningPercent = params.warningThresholdPercent ?? 80;

  // 1. First Response SLA
  const hasResponded = Boolean(params.firstRespondedAt);
  const firstResponseDue = params.firstResponseDueAt
    ? new Date(params.firstResponseDueAt)
    : null;

  let isFirstResponseBreached = false;
  let firstResponseMinutesTaken: number | undefined;

  if (hasResponded && params.firstRespondedAt) {
    firstResponseMinutesTaken = Math.round(
      (new Date(params.firstRespondedAt).getTime() - created.getTime()) / 60000,
    );
    if (firstResponseDue && new Date(params.firstRespondedAt) > firstResponseDue) {
      isFirstResponseBreached = true;
    }
  } else if (firstResponseDue && now > firstResponseDue) {
    isFirstResponseBreached = true;
  }

  // 2. Resolution SLA
  const hasResolved = Boolean(params.resolvedAt);
  const resolutionDue = params.resolutionDueAt
    ? new Date(params.resolutionDueAt)
    : null;

  let isResolutionBreached = false;
  let resolutionMinutesTaken: number | undefined;

  if (hasResolved && params.resolvedAt) {
    resolutionMinutesTaken = Math.round(
      (new Date(params.resolvedAt).getTime() - created.getTime()) / 60000,
    );
    if (resolutionDue && new Date(params.resolvedAt) > resolutionDue) {
      isResolutionBreached = true;
    }
  } else if (resolutionDue && now > resolutionDue) {
    isResolutionBreached = true;
  }

  // Active target deadline (first response takes precedence until satisfied)
  const activeDeadline = !hasResponded && firstResponseDue ? firstResponseDue : resolutionDue;
  const totalWindowMs = activeDeadline
    ? activeDeadline.getTime() - created.getTime()
    : 1000 * 60 * 60;
  const targetMinutes = Math.round(totalWindowMs / 60000);

  const msRemaining = activeDeadline ? activeDeadline.getTime() - now.getTime() : 0;
  const minutesRemaining = Math.round(msRemaining / 60000);

  const isBreached = isFirstResponseBreached || isResolutionBreached;
  const elapsedRatio = totalWindowMs > 0 ? (totalWindowMs - msRemaining) / totalWindowMs : 0;
  const isWarning = !isBreached && elapsedRatio >= warningPercent / 100;

  const status: SlaStatus = isBreached ? "breached" : isWarning ? "warning" : "healthy";

  return {
    status,
    isFirstResponseBreached,
    isResolutionBreached,
    isWarning,
    minutesRemaining: Math.max(0, minutesRemaining),
    firstResponseMinutesTaken,
    resolutionMinutesTaken,
    targetMinutes,
  };
}

/**
 * Resolves matched SLA policy for thread creation
 */
export function resolveMatchedSlaPolicy(
  policies: OmnichannelSlaPolicy[],
  priority: InboxPriority,
  channel: InboxChannel,
): { firstResponseMinutes: number; resolutionMinutes: number; policyId?: string } {
  // Try exact priority & channel match
  const exact = policies.find((p) => p.priority === priority && p.channel === channel);
  if (exact) {
    return {
      firstResponseMinutes: exact.firstResponseTargetMinutes,
      resolutionMinutes: exact.resolutionTargetMinutes,
      policyId: exact.id,
    };
  }

  // Try priority match with 'all' channels
  const priorityMatch = policies.find(
    (p) => p.priority === priority && (p.channel === "all" || !p.channel),
  );
  if (priorityMatch) {
    return {
      firstResponseMinutes: priorityMatch.firstResponseTargetMinutes,
      resolutionMinutes: priorityMatch.resolutionTargetMinutes,
      policyId: priorityMatch.id,
    };
  }

  // Default fallback
  const fallback = DEFAULT_SLA_TARGETS[priority] || DEFAULT_SLA_TARGETS.medium;
  return {
    firstResponseMinutes: fallback.firstResponseMinutes,
    resolutionMinutes: fallback.resolutionMinutes,
  };
}

/**
 * DB helper: List SLA policies for workspace
 */
export async function getWorkspaceSlaPolicies(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<OmnichannelSlaPolicy[]> {
  const { data, error } = await supabase
    .from("omnichannel_sla_policies")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data || []).map((r: any) => ({
    id: r.id,
    workspaceId: r.workspace_id,
    name: r.name,
    description: r.description,
    priority: r.priority,
    channel: r.channel,
    firstResponseTargetMinutes: r.first_response_target_minutes,
    resolutionTargetMinutes: r.resolution_target_minutes,
    warningThresholdPercent: r.warning_threshold_percent,
    escalationAction: r.escalation_action,
    isDefault: r.is_default,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

/**
 * DB helper: Attach matched SLA targets to thread on ingestion
 */
export async function attachSlaToThread(
  supabase: SupabaseClient,
  workspaceId: string,
  threadId: string,
  priority: InboxPriority,
  channel: InboxChannel,
): Promise<{ firstResponseDueAt: string; resolutionDueAt: string }> {
  const policies = await getWorkspaceSlaPolicies(supabase, workspaceId);
  const matched = resolveMatchedSlaPolicy(policies, priority, channel);

  const now = new Date();
  const firstResponseDueAt = new Date(
    now.getTime() + matched.firstResponseMinutes * 60000,
  ).toISOString();
  const resolutionDueAt = new Date(
    now.getTime() + matched.resolutionMinutes * 60000,
  ).toISOString();

  await supabase
    .from("inbox_threads")
    .update({
      sla_status: "healthy",
      sla_policy_id: matched.policyId || null,
      sla_first_response_due_at: firstResponseDueAt,
      sla_resolution_due_at: resolutionDueAt,
      updated_at: now.toISOString(),
    })
    .eq("id", threadId)
    .eq("workspace_id", workspaceId);

  return { firstResponseDueAt, resolutionDueAt };
}

/**
 * DB helper: Record that first response was delivered
 */
export async function recordFirstResponseDelivered(
  supabase: SupabaseClient,
  workspaceId: string,
  threadId: string,
): Promise<void> {
  const { data: thread } = await supabase
    .from("inbox_threads")
    .select("sla_first_response_due_at, sla_first_responded_at")
    .eq("id", threadId)
    .eq("workspace_id", workspaceId)
    .single();

  if (!thread || thread.sla_first_responded_at) return;

  const now = new Date();
  const isBreached =
    thread.sla_first_response_due_at &&
    now > new Date(thread.sla_first_response_due_at);

  await supabase
    .from("inbox_threads")
    .update({
      sla_first_responded_at: now.toISOString(),
      sla_status: isBreached ? "breached" : "healthy",
      updated_at: now.toISOString(),
    })
    .eq("id", threadId)
    .eq("workspace_id", workspaceId);
}

/**
 * DB helper: Fetch workspace aggregated SLA metrics
 */
export async function getWorkspaceSlaPerformance(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<WorkspaceSlaMetrics> {
  const { data: threads, error } = await supabase
    .from("inbox_threads")
    .select("created_at, sla_status, sla_first_response_due_at, sla_first_responded_at, sla_resolution_due_at, sla_resolved_at")
    .eq("workspace_id", workspaceId);

  if (error || !threads || threads.length === 0) {
    return {
      totalThreadsTracked: 0,
      complianceRatePercent: 100,
      healthyCount: 0,
      warningCount: 0,
      breachedCount: 0,
      avgFirstResponseMinutes: 0,
      avgResolutionMinutes: 0,
    };
  }

  let healthy = 0;
  let warning = 0;
  let breached = 0;
  let totalFrTime = 0;
  let frCount = 0;
  let totalResTime = 0;
  let resCount = 0;

  for (const t of threads) {
    const evalResult = evaluateThreadSla({
      createdAt: t.created_at,
      firstResponseDueAt: t.sla_first_response_due_at,
      firstRespondedAt: t.sla_first_responded_at,
      resolutionDueAt: t.sla_resolution_due_at,
      resolvedAt: t.sla_resolved_at,
    });

    if (evalResult.status === "healthy") healthy++;
    else if (evalResult.status === "warning") warning++;
    else if (evalResult.status === "breached") breached++;

    if (evalResult.firstResponseMinutesTaken !== undefined) {
      totalFrTime += evalResult.firstResponseMinutesTaken;
      frCount++;
    }
    if (evalResult.resolutionMinutesTaken !== undefined) {
      totalResTime += evalResult.resolutionMinutesTaken;
      resCount++;
    }
  }

  const total = threads.length;
  const compliant = healthy + warning;
  const complianceRate = total > 0 ? Math.round((compliant / total) * 100) : 100;

  return {
    totalThreadsTracked: total,
    complianceRatePercent: complianceRate,
    healthyCount: healthy,
    warningCount: warning,
    breachedCount: breached,
    avgFirstResponseMinutes: frCount > 0 ? Math.round(totalFrTime / frCount) : 0,
    avgResolutionMinutes: resCount > 0 ? Math.round(totalResTime / resCount) : 0,
  };
}
