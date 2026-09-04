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
  userId: string;
  planId: string;
  status: SubscriptionStatus;
  monthlyMessageLimit: number;
  messagesUsed: number;
  currentPeriodEnd: string;
  gracePeriodEnd: string | null;
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

export async function getWorkspaceSubscription(
  supabase: SupabaseClient,
  userId: string
): Promise<WorkspaceSubscription | null> {
  try {
    const { data, error } = await supabase
      .from("workspace_subscriptions")
      .select("id,user_id,plan_id,status,monthly_message_limit,messages_used_this_period,current_period_end,grace_period_end")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;

    return {
      id: data.id,
      userId: data.user_id,
      planId: data.plan_id,
      status: data.status as SubscriptionStatus,
      monthlyMessageLimit: data.monthly_message_limit ?? 1000,
      messagesUsed: data.messages_used_this_period ?? 0,
      currentPeriodEnd: data.current_period_end,
      gracePeriodEnd: data.grace_period_end ?? null,
    };
  } catch {
    return null;
  }
}

export async function assertWorkspaceEntitlement(
  supabase: SupabaseClient,
  userId: string,
  options?: {
    feature?: string;
    requiredMessages?: number;
  }
): Promise<WorkspaceSubscription> {
  const sub = await getWorkspaceSubscription(supabase, userId);

  // If no subscription record exists yet, provide onboarding trial tier
  if (!sub) {
    return {
      id: "onboarding-trial",
      userId,
      planId: "starter-trial",
      status: "active",
      monthlyMessageLimit: 1000,
      messagesUsed: 0,
      currentPeriodEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
      gracePeriodEnd: null,
    };
  }

  const now = new Date();

  // 1. Canceled subscription
  if (sub.status === "canceled" || sub.status === "unpaid") {
    throw new BillingRequiredError(
      "Your J10 NEXUS subscription is inactive. Reactivate your plan in Billing Settings to resume automated actions.",
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
          "Payment is past due and the billing grace period has expired. Please update payment method to restore live sending.",
          "GRACE_PERIOD_EXPIRED",
          sub
        );
      }
    } else {
      throw new BillingRequiredError(
        "Payment is past due. Update your billing information to continue sending live messages.",
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

export async function recordWorkspaceMessageUsage(
  supabase: SupabaseClient,
  userId: string,
  count = 1
): Promise<void> {
  try {
    const sub = await getWorkspaceSubscription(supabase, userId);
    if (!sub || sub.id === "onboarding-trial") return;

    await supabase
      .from("workspace_subscriptions")
      .update({
        messages_used_this_period: sub.messagesUsed + count,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sub.id);
  } catch {
    // Non-blocking usage recording failure
  }
}
