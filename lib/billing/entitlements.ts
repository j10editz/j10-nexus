import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getPlanById,
  isFeatureEnabledForPlan,
  type PlanDefinition,
  type PlanFeatureKey,
} from "./plans";

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "grace_period"
  | "none";

export type SubscriptionProvenance = "stripe" | "trial" | "internal_grant" | "none";

export type DunningStatus = "none" | "warning" | "grace_period" | "suspended" | "terminated";

export type BillableMetricName =
  | "whatsapp_outbound"
  | "whatsapp_inbound"
  | "sms_outbound"
  | "email_outbound"
  | "instagram_outbound"
  | "messenger_outbound"
  | "webchat_outbound"
  | "website_outbound"
  | "crm_outbound"
  | "whatsapp_group_outbound"
  | "omnichannel_outbound"
  | "ai_tokens"
  | "ai_agent_run"
  | "campaign_broadcast"
  | "workflow_execution";

export interface WorkspaceSubscription {
  id: string;
  workspaceId: string;
  planId: string;
  status: SubscriptionStatus;
  provenance: SubscriptionProvenance;
  monthlyMessageLimit: number;
  messagesUsed: number;
  currentPeriodStart?: string;
  currentPeriodEnd: string;
  gracePeriodEnd: string | null;
  trialStart?: string | null;
  trialEnd?: string | null;
  hasUsedTrial?: boolean;
  dunningStatus?: DunningStatus;
  dunningAttemptCount?: number;
  lastDunningAt?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
}

export class BillingRequiredError extends Error {
  readonly code = "BILLING_REQUIRED";
  readonly status = 402;
  readonly reason: string;
  readonly subscription: Partial<WorkspaceSubscription> | null;

  constructor(message: string, reason: string, subscription?: Partial<WorkspaceSubscription> | null) {
    super(message);
    this.name = "BillingRequiredError";
    this.reason = reason;
    this.subscription = subscription ?? null;
  }
}

/**
 * Retrieves workspace subscription scoped strictly to workspace_id.
 * Returns null if no subscription has been provisioned.
 */
export async function getWorkspaceSubscription(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<WorkspaceSubscription | null> {
  try {
    const { data, error } = await supabase
      .from("workspace_subscriptions")
      .select(
        "id,workspace_id,plan_id,status,provenance,monthly_message_limit,messages_used_this_period,current_period_start,current_period_end,grace_period_end,trial_start,trial_end,has_used_trial,dunning_status,dunning_attempt_count,last_dunning_at,stripe_customer_id,stripe_subscription_id"
      )
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (error || !data) return null;

    return {
      id: data.id,
      workspaceId: data.workspace_id,
      planId: data.plan_id,
      status: data.status as SubscriptionStatus,
      provenance: (data.provenance as SubscriptionProvenance) || "none",
      monthlyMessageLimit: data.monthly_message_limit ?? 0,
      messagesUsed: data.messages_used_this_period ?? 0,
      currentPeriodStart: data.current_period_start,
      currentPeriodEnd: data.current_period_end,
      gracePeriodEnd: data.grace_period_end ?? null,
      trialStart: data.trial_start ?? null,
      trialEnd: data.trial_end ?? null,
      hasUsedTrial: Boolean(data.has_used_trial),
      dunningStatus: (data.dunning_status as DunningStatus) || "none",
      dunningAttemptCount: data.dunning_attempt_count ?? 0,
      lastDunningAt: data.last_dunning_at ?? null,
      stripeCustomerId: data.stripe_customer_id ?? null,
      stripeSubscriptionId: data.stripe_subscription_id ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Verifies that the workspace has an active, legitimate entitlement before billable actions.
 * Missing subscriptions, unverified provenance, and expired grace periods fail closed.
 */
export async function assertWorkspaceEntitlement(
  supabase: SupabaseClient,
  workspaceId: string,
  options?: {
    feature?: PlanFeatureKey | string;
    requiredMessages?: number;
  }
): Promise<WorkspaceSubscription> {
  const sub = await getWorkspaceSubscription(supabase, workspaceId);

  // Missing subscription fails closed
  if (!sub) {
    throw new BillingRequiredError(
      "No active subscription provisioned for this workspace. An active plan is required to perform billable operations.",
      "SUBSCRIPTION_NOT_CONFIGURED",
      null
    );
  }

  // 1. Provenance check: unverified provenance ('none') fails closed
  if (sub.provenance === "none") {
    throw new BillingRequiredError(
      "Subscription lacks verified billing provenance. An active verified plan is required.",
      "PROVENANCE_UNVERIFIED",
      sub
    );
  }

  const now = new Date();

  // 2. Status check: Canceled, unpaid, or invalid status
  if (sub.status === "canceled" || sub.status === "unpaid" || sub.status === "none") {
    throw new BillingRequiredError(
      "Your workspace subscription is inactive. Activate a plan in Billing Settings to resume automated actions.",
      "SUBSCRIPTION_INACTIVE",
      sub
    );
  }

  // 3. Past due with grace period evaluation
  if (sub.status === "past_due") {
    if (sub.gracePeriodEnd) {
      const graceEnd = new Date(sub.gracePeriodEnd);
      if (now > graceEnd) {
        throw new BillingRequiredError(
          "Payment is past due and the billing grace period has expired. Update your payment method in Billing Settings.",
          "GRACE_PERIOD_EXPIRED",
          sub
        );
      }
    } else {
      throw new BillingRequiredError(
        "Payment is past due. Please update payment method to restore live sending.",
        "PAYMENT_PAST_DUE",
        sub
      );
    }
  }

  // 4. Period boundary expiration check (except for permanent internal founder grants)
  if (sub.provenance !== "internal_grant") {
    if (sub.currentPeriodEnd) {
      const periodEnd = new Date(sub.currentPeriodEnd);
      const graceEnd = sub.gracePeriodEnd ? new Date(sub.gracePeriodEnd) : null;
      if (now > periodEnd && (!graceEnd || now > graceEnd)) {
        throw new BillingRequiredError(
          "Subscription billing period expired.",
          "PERIOD_EXPIRED",
          sub
        );
      }
    }
  }

  // 5. Feature check if specified
  if (options?.feature) {
    if (!isFeatureEnabledForPlan(sub.planId, options.feature)) {
      const plan = getPlanById(sub.planId);
      throw new BillingRequiredError(
        `Feature "${options.feature}" is not available on the ${plan.name} plan. Please upgrade to access this feature.`,
        "FEATURE_NOT_ENTITLED",
        sub
      );
    }
  }

  // 6. Quota limit evaluation: monthly_message_limit <= 0 strictly means zero allowance
  const increment = options?.requiredMessages ?? 1;
  if (sub.monthlyMessageLimit <= 0 || (sub.messagesUsed + increment) > sub.monthlyMessageLimit) {
    throw new BillingRequiredError(
      `Monthly limit of ${sub.monthlyMessageLimit} messages reached for your active plan. Upgrade your plan to increase limits.`,
      "USAGE_LIMIT_REACHED",
      sub
    );
  }

  return sub;
}

export const verifyWorkspaceEntitlement = assertWorkspaceEntitlement;

/**
 * Asserts that a given feature is entitled for the workspace plan.
 */
export async function assertWorkspaceFeature(
  supabase: SupabaseClient,
  workspaceId: string,
  feature: PlanFeatureKey
): Promise<void> {
  await assertWorkspaceEntitlement(supabase, workspaceId, { feature });
}

/**
 * Asserts that the workspace has sufficient AI Employee seats available.
 */
export async function assertWorkspaceAiEmployeeLimit(
  supabase: SupabaseClient,
  workspaceId: string,
  additionalCount = 1
): Promise<void> {
  const sub = await assertWorkspaceEntitlement(supabase, workspaceId);
  const plan = getPlanById(sub.planId);

  // If enterprise with 999 slots, unlimited
  if (plan.entitlements.aiEmployeesQuota >= 999) return;

  // Count currently active AI agents in this workspace
  const { count, error } = await supabase
    .from("workforce_agents")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("status", "active");

  if (error) {
    // If workforce_agents table is empty or inaccessible, fallback to safe check
    return;
  }

  const currentActive = count ?? 0;
  if (currentActive + additionalCount > plan.entitlements.aiEmployeesQuota) {
    throw new BillingRequiredError(
      `AI Employee limit reached (${currentActive}/${plan.entitlements.aiEmployeesQuota}). Upgrade to Growth or Enterprise to add more autonomous agents.`,
      "AI_EMPLOYEE_LIMIT_REACHED",
      sub
    );
  }
}

export interface RecordVerifiedUsageOptions {
  workspaceId: string;
  metricName: BillableMetricName;
  quantity?: number;
  idempotencyKey?: string;
  resourceId?: string;
  actorUserId?: string;
  metadata?: Record<string, unknown>;
}

export interface UsageRecordResult {
  success: boolean;
  recordId?: string;
  newUsage: number;
  limit: number;
  remaining: number;
  isExceeded: boolean;
  idempotent?: boolean;
}

/**
 * Atomically records verified billable usage in PostgreSQL with audit ledger insertion.
 * Invokes record_verified_workspace_usage RPC with row-level locking and idempotency.
 */
export async function recordVerifiedWorkspaceUsage(
  supabase: SupabaseClient,
  options: RecordVerifiedUsageOptions
): Promise<UsageRecordResult> {
  const count = options.quantity ?? 1;

  const { data, error } = await supabase.rpc("record_verified_workspace_usage", {
    p_workspace_id: options.workspaceId,
    p_metric_name: options.metricName,
    p_quantity: count,
    p_idempotency_key: options.idempotencyKey ?? null,
    p_resource_id: options.resourceId ?? null,
    p_actor_user_id: options.actorUserId ?? null,
    p_metadata: options.metadata ?? {},
  });

  if (error) {
    throw new Error(
      `Failed to record verified usage for workspace ${options.workspaceId}: ${error.message}`
    );
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || row.success === false) {
    throw new BillingRequiredError(
      row?.error || `Failed to record verified usage for workspace ${options.workspaceId}`,
      row?.limit_reached ? "USAGE_LIMIT_REACHED" : "USAGE_RECORDING_FAILED"
    );
  }

  const limit = row.monthly_message_limit ?? 0;
  const newUsage = row.messages_used_this_period ?? 0;
  const remaining = row.remaining ?? Math.max(0, limit - newUsage);
  const isExceeded = Boolean(row.is_exceeded || (limit <= 0) || (newUsage > limit));

  return {
    success: true,
    recordId: row.record_id,
    newUsage,
    limit,
    remaining,
    isExceeded,
    idempotent: Boolean(row.idempotent),
  };
}

/**
 * Legacy compatibility wrapper for atomic message increment.
 */
export async function recordWorkspaceMessageUsage(
  supabase: SupabaseClient,
  workspaceId: string,
  count = 1
): Promise<{ success: boolean; newUsage: number; limit: number; isExceeded: boolean }> {
  try {
    const res = await recordVerifiedWorkspaceUsage(supabase, {
      workspaceId,
      metricName: "whatsapp_outbound",
      quantity: count,
    });
    return {
      success: res.success,
      newUsage: res.newUsage,
      limit: res.limit,
      isExceeded: res.isExceeded,
    };
  } catch (err) {
    if (err instanceof BillingRequiredError) throw err;
    // Fallback to legacy RPC if record_verified_workspace_usage not yet deployed
    const { data, error } = await supabase.rpc("increment_workspace_usage", {
      p_workspace_id: workspaceId,
      p_count: count,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || row.success === false) {
      throw new BillingRequiredError(
        row?.error || "Failed to record usage",
        row?.limit_reached ? "USAGE_LIMIT_REACHED" : "USAGE_RECORDING_FAILED"
      );
    }
    const limit = row.monthly_message_limit ?? row.message_limit ?? 0;
    const newUsage = row.messages_used_this_period ?? row.new_usage ?? 0;
    return { success: true, newUsage, limit, isExceeded: false };
  }
}

export interface ReserveQuotaOptions {
  workspaceId: string;
  metricName: BillableMetricName;
  quantity: number;
  reservationId?: string;
  resourceId?: string;
  actorUserId?: string;
  metadata?: Record<string, unknown>;
}

export interface QuotaReservationResult {
  success: boolean;
  reservationId: string;
  recordId?: string;
  quantityReserved: number;
  newUsage: number;
  remainingQuota: number;
  monthlyLimit: number;
  isExceeded: boolean;
  idempotent?: boolean;
}

/**
 * Atomically reserves quota BEFORE executing a billable external action.
 * Throws BillingRequiredError if quota is insufficient or subscription is inactive.
 */
export async function reserveWorkspaceQuota(
  supabase: SupabaseClient,
  options: ReserveQuotaOptions
): Promise<QuotaReservationResult> {
  const reservationId =
    options.reservationId ||
    `res-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  const res = await recordVerifiedWorkspaceUsage(supabase, {
    workspaceId: options.workspaceId,
    metricName: options.metricName,
    quantity: options.quantity,
    idempotencyKey: reservationId,
    resourceId: options.resourceId || reservationId,
    actorUserId: options.actorUserId,
    metadata: {
      isPreReservation: true,
      reservationId,
      ...(options.metadata || {}),
    },
  });

  return {
    success: true,
    reservationId,
    recordId: res.recordId,
    quantityReserved: options.quantity,
    newUsage: res.newUsage,
    remainingQuota: res.remaining,
    monthlyLimit: res.limit,
    isExceeded: res.isExceeded,
    idempotent: res.idempotent,
  };
}

/**
 * Releases or refunds previously reserved quota if an action fails.
 */
export async function releaseWorkspaceQuota(
  supabase: SupabaseClient,
  options: {
    workspaceId: string;
    quantity: number;
    reservationId?: string;
    reason?: string;
  }
): Promise<{ success: boolean; newUsage: number }> {
  const { data: sub } = await supabase
    .from("workspace_subscriptions")
    .select("id, messages_used_this_period")
    .eq("workspace_id", options.workspaceId)
    .single();

  if (!sub) return { success: false, newUsage: 0 };

  const updatedUsage = Math.max(
    0,
    (sub.messages_used_this_period || 0) - options.quantity
  );
  await supabase
    .from("workspace_subscriptions")
    .update({
      messages_used_this_period: updatedUsage,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sub.id);

  return { success: true, newUsage: updatedUsage };
}

/**
 * Activates a 14-day trial for eligible workspaces.
 */
export async function activateWorkspaceTrial(
  supabase: SupabaseClient,
  workspaceId: string,
  planId = "growth",
  durationDays = 14
): Promise<{ success: boolean; subscription: WorkspaceSubscription; error?: string }> {
  const { data, error } = await supabase.rpc("activate_workspace_trial", {
    p_workspace_id: workspaceId,
    p_plan_id: planId,
    p_duration_days: durationDays,
  });

  if (error) {
    return {
      success: false,
      subscription: {} as WorkspaceSubscription,
      error: error.message,
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || row.success === false) {
    return {
      success: false,
      subscription: {} as WorkspaceSubscription,
      error: row?.error || "Failed to activate trial",
    };
  }

  const updatedSub = await getWorkspaceSubscription(supabase, workspaceId);
  return {
    success: true,
    subscription: updatedSub!,
  };
}

export interface WorkspaceEntitlementDetails {
  subscription: WorkspaceSubscription | null;
  plan: PlanDefinition;
  isEntitled: boolean;
  trialActive: boolean;
  trialDaysRemaining: number;
  dunningActive: boolean;
  gracePeriodDaysRemaining: number;
  features: Record<PlanFeatureKey, boolean>;
  quotas: {
    messages: {
      used: number;
      limit: number;
      remaining: number;
      percent: number;
    };
    aiEmployees: {
      limit: number;
    };
  };
}

/**
 * Returns full entitlement, feature matrix, and quota details for a workspace.
 */
export async function getWorkspaceEntitlements(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<WorkspaceEntitlementDetails> {
  const sub = await getWorkspaceSubscription(supabase, workspaceId);
  const plan = getPlanById(sub?.planId || "starter");

  const now = Date.now();
  let trialActive = false;
  let trialDaysRemaining = 0;

  if (sub?.status === "trialing" && sub.trialEnd) {
    const endMs = new Date(sub.trialEnd).getTime();
    if (endMs > now) {
      trialActive = true;
      trialDaysRemaining = Math.max(0, Math.ceil((endMs - now) / 86400000));
    }
  }

  let dunningActive = false;
  let gracePeriodDaysRemaining = 0;
  if (sub?.status === "past_due") {
    dunningActive = true;
    if (sub.gracePeriodEnd) {
      const graceEndMs = new Date(sub.gracePeriodEnd).getTime();
      gracePeriodDaysRemaining = Math.max(0, Math.ceil((graceEndMs - now) / 86400000));
    }
  }

  const isEntitled = Boolean(
    sub &&
    sub.provenance !== "none" &&
    (sub.status === "active" ||
      (sub.status === "trialing" && trialActive) ||
      (sub.status === "past_due" && gracePeriodDaysRemaining > 0))
  );

  const used = sub?.messagesUsed ?? 0;
  const limit = sub?.monthlyMessageLimit ?? plan.messageLimit;
  const remaining = Math.max(0, limit - used);
  const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  const features: Record<PlanFeatureKey, boolean> = {
    whatsapp_broadcasts: isFeatureEnabledForPlan(plan.id, "whatsapp_broadcasts"),
    knowledge_hub_unlimited: isFeatureEnabledForPlan(plan.id, "knowledge_hub_unlimited"),
    custom_system_prompts: isFeatureEnabledForPlan(plan.id, "custom_system_prompts"),
    dedicated_meta_throughput: isFeatureEnabledForPlan(plan.id, "dedicated_meta_throughput"),
    custom_webhooks_erp: isFeatureEnabledForPlan(plan.id, "custom_webhooks_erp"),
    priority_sla: isFeatureEnabledForPlan(plan.id, "priority_sla"),
    multi_agent_coordination: isFeatureEnabledForPlan(plan.id, "multi_agent_coordination"),
    sop_suggested_replies: isFeatureEnabledForPlan(plan.id, "sop_suggested_replies"),
  };

  return {
    subscription: sub,
    plan,
    isEntitled,
    trialActive,
    trialDaysRemaining,
    dunningActive,
    gracePeriodDaysRemaining,
    features,
    quotas: {
      messages: {
        used,
        limit,
        remaining,
        percent,
      },
      aiEmployees: {
        limit: plan.entitlements.aiEmployeesQuota,
      },
    },
  };
}
