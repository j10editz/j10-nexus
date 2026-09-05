import type { SupabaseClient } from "@supabase/supabase-js";

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "grace_period"
  | "none";

export interface WorkspaceSubscription {
  id: string;
  workspaceId: string;
  planId: string;
  status: SubscriptionStatus;
  monthlyMessageLimit: number;
  messagesUsed: number;
  currentPeriodEnd: string;
  gracePeriodEnd: string | null;
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
      .select("id,workspace_id,plan_id,status,monthly_message_limit,messages_used_this_period,current_period_end,grace_period_end,stripe_customer_id,stripe_subscription_id")
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (error || !data) return null;

    return {
      id: data.id,
      workspaceId: data.workspace_id,
      planId: data.plan_id,
      status: data.status as SubscriptionStatus,
      monthlyMessageLimit: data.monthly_message_limit ?? 1000,
      messagesUsed: data.messages_used_this_period ?? 0,
      currentPeriodEnd: data.current_period_end,
      gracePeriodEnd: data.grace_period_end ?? null,
      stripeCustomerId: data.stripe_customer_id ?? null,
      stripeSubscriptionId: data.stripe_subscription_id ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Verifies that the workspace has an active, legitimate entitlement before billable actions.
 * Missing subscriptions fail closed with an honest error instead of inventing synthetic trials.
 */
export async function assertWorkspaceEntitlement(
  supabase: SupabaseClient,
  workspaceId: string,
  options?: {
    feature?: string;
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

  const now = new Date();

  // 1. Canceled or unpaid subscription
  if (sub.status === "canceled" || sub.status === "unpaid" || sub.status === "none") {
    throw new BillingRequiredError(
      "Your workspace subscription is inactive. Activate a plan in Billing Settings to resume automated actions.",
      "SUBSCRIPTION_INACTIVE",
      sub
    );
  }

  // 2. Past due with grace period evaluation
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

  // 3. Quota limit evaluation
  const increment = options?.requiredMessages ?? 1;
  if (sub.monthlyMessageLimit > 0 && sub.messagesUsed + increment > sub.monthlyMessageLimit) {
    throw new BillingRequiredError(
      `Monthly limit of ${sub.monthlyMessageLimit} messages reached for your active plan. Upgrade your plan to increase limits.`,
      "USAGE_LIMIT_REACHED",
      sub
    );
  }

  return sub;
}

/**
 * Records billable usage atomically in PostgreSQL using increment_workspace_usage RPC.
 * Fails closed if the database operation fails or the quota is exceeded.
 */
export async function recordWorkspaceMessageUsage(
  supabase: SupabaseClient,
  workspaceId: string,
  count = 1
): Promise<{ success: boolean; newUsage: number; limit: number; isExceeded: boolean }> {
  const { data, error } = await supabase.rpc("increment_workspace_usage", {
    p_workspace_id: workspaceId,
    p_count: count,
  });

  if (error) {
    throw new Error(`Failed to atomically record usage for workspace ${workspaceId}: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || row.success === false) {
    throw new Error(row?.error || `Failed to record usage for workspace ${workspaceId}`);
  }

  const limit = row.monthly_message_limit ?? row.message_limit ?? 1000;
  const newUsage = row.messages_used_this_period ?? row.new_usage ?? 0;
  const isExceeded = Boolean(row.is_exceeded || (limit > 0 && newUsage > limit));

  if (isExceeded) {
    throw new BillingRequiredError(
      `Monthly limit of ${limit} messages reached. Upgrade plan to increase capacity.`,
      "USAGE_LIMIT_REACHED"
    );
  }

  return {
    success: true,
    newUsage,
    limit,
    isExceeded,
  };
}

