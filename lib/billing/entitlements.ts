import type { SupabaseClient } from "@supabase/supabase-js";

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "grace_period"
  | "none";

export type SubscriptionProvenance = "stripe" | "trial" | "internal_grant" | "none";

export interface WorkspaceSubscription {
  id: string;
  workspaceId: string;
  planId: string;
  status: SubscriptionStatus;
  provenance: SubscriptionProvenance;
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
      .select("id,workspace_id,plan_id,status,provenance,monthly_message_limit,messages_used_this_period,current_period_end,grace_period_end,stripe_customer_id,stripe_subscription_id")
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
 * Missing subscriptions and unverified provenance fail closed.
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

  // 5. Quota limit evaluation: monthly_message_limit <= 0 strictly means zero allowance
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
    throw new BillingRequiredError(
      row?.error || `Failed to record usage for workspace ${workspaceId}`,
      row?.limit_reached ? "USAGE_LIMIT_REACHED" : "USAGE_RECORDING_FAILED"
    );
  }

  const limit = row.monthly_message_limit ?? row.message_limit ?? 0;
  const newUsage = row.messages_used_this_period ?? row.new_usage ?? 0;
  const isExceeded = Boolean(row.is_exceeded || (limit <= 0) || (newUsage > limit));

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
    isExceeded: false,
  };
}
