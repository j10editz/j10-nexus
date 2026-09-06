import type { SupabaseClient } from "@supabase/supabase-js";

export interface DunningFailureEvent {
  stripeSubscriptionId?: string;
  stripeCustomerId?: string;
  invoiceId?: string;
  amount?: number;
  currency?: string;
  attemptCount?: number;
  failureReason?: string;
}

export interface DunningRecoveryEvent {
  stripeSubscriptionId?: string;
  stripeCustomerId?: string;
  invoiceId?: string;
  amount?: number;
  currency?: string;
}

/**
 * Handles failed invoice payments, increments dunning attempts, activates a 7-day grace period,
 * and notifies the workspace owner via inbox system message.
 */
export async function recordDunningPaymentFailure(
  supabase: SupabaseClient,
  event: DunningFailureEvent
): Promise<{ success: boolean; workspaceId?: string; action: string; error?: string }> {
  // 1. Locate workspace subscription
  let query = supabase.from("workspace_subscriptions").select("id, workspace_id, dunning_attempt_count, grace_period_end, status");

  if (event.stripeSubscriptionId) {
    query = query.eq("stripe_subscription_id", event.stripeSubscriptionId);
  } else if (event.stripeCustomerId) {
    query = query.eq("stripe_customer_id", event.stripeCustomerId);
  } else {
    return { success: false, action: "missing_identifier", error: "Neither subscription nor customer ID provided" };
  }

  const { data: sub, error: findErr } = await query.maybeSingle();
  if (findErr || !sub) {
    return { success: false, action: "subscription_not_found", error: findErr?.message || "Subscription not found" };
  }

  const workspaceId = sub.workspace_id;
  const currentAttempts = (sub.dunning_attempt_count ?? 0) + 1;
  const now = new Date();

  // If grace period already set and in future, keep it; otherwise set to 7 days from now
  let gracePeriodEnd = sub.grace_period_end;
  if (!gracePeriodEnd || new Date(gracePeriodEnd) <= now) {
    gracePeriodEnd = new Date(now.getTime() + 7 * 86400000).toISOString();
  }

  // Determine dunning status based on attempts & grace period
  let dunningStatus: "grace_period" | "suspended" = "grace_period";
  if (new Date(gracePeriodEnd) <= now) {
    dunningStatus = "suspended";
  }

  const { error: updateErr } = await supabase
    .from("workspace_subscriptions")
    .update({
      status: "past_due",
      dunning_status: dunningStatus,
      dunning_attempt_count: currentAttempts,
      last_dunning_at: now.toISOString(),
      grace_period_end: gracePeriodEnd,
      updated_at: now.toISOString(),
    })
    .eq("id", sub.id);

  if (updateErr) {
    return { success: false, action: "database_update_failed", error: updateErr.message };
  }

  // 2. Dispatch in-app dunning alert into workspace system inbox thread
  try {
    const formattedAmount = event.amount != null ? `$${event.amount.toFixed(2)} ${event.currency || "USD"}` : "subscription payment";
    const graceFormatted = new Date(gracePeriodEnd).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    const alertMessage = `Payment failed for J10 NEXUS ${formattedAmount} (Attempt #${currentAttempts}). Your workspace has entered a 7-day grace period ending on ${graceFormatted}. Please update your payment method via Billing Settings to maintain uninterrupted autonomous operations.`;

    // Check for an existing system notification thread
    const { data: thread } = await supabase
      .from("inbox_threads")
      .select("id")
      .eq("workspace_id", workspaceId)
      .limit(1)
      .maybeSingle();

    if (thread?.id) {
      await supabase.from("inbox_messages").insert({
        workspace_id: workspaceId,
        thread_id: thread.id,
        direction: "outbound",
        provider: "stripe",
        content: alertMessage,
        delivery_status: "delivered",
        message_type: "system",
        metadata: {
          dunningAlert: true,
          attemptCount: currentAttempts,
          gracePeriodEnd,
          invoiceId: event.invoiceId,
        },
      });
    }
  } catch (err) {
    console.warn("Failed to dispatch dunning alert message to inbox:", err);
  }

  return {
    success: true,
    workspaceId,
    action: "dunning_recorded",
  };
}

/**
 * Handles successful invoice payments, restores active status, resets dunning attempts,
 * and clears grace periods.
 */
export async function recordDunningPaymentRecovery(
  supabase: SupabaseClient,
  event: DunningRecoveryEvent
): Promise<{ success: boolean; workspaceId?: string; action: string; error?: string }> {
  let query = supabase.from("workspace_subscriptions").select("id, workspace_id, status, dunning_status");

  if (event.stripeSubscriptionId) {
    query = query.eq("stripe_subscription_id", event.stripeSubscriptionId);
  } else if (event.stripeCustomerId) {
    query = query.eq("stripe_customer_id", event.stripeCustomerId);
  } else {
    return { success: false, action: "missing_identifier", error: "Neither subscription nor customer ID provided" };
  }

  const { data: sub, error: findErr } = await query.maybeSingle();
  if (findErr || !sub) {
    return { success: false, action: "subscription_not_found", error: findErr?.message || "Subscription not found" };
  }

  const workspaceId = sub.workspace_id;
  const now = new Date().toISOString();

  const { error: updateErr } = await supabase
    .from("workspace_subscriptions")
    .update({
      status: "active",
      dunning_status: "none",
      dunning_attempt_count: 0,
      grace_period_end: null,
      updated_at: now,
    })
    .eq("id", sub.id);

  if (updateErr) {
    return { success: false, action: "database_update_failed", error: updateErr.message };
  }

  // Dispatch confirmation message to inbox
  try {
    const formattedAmount = event.amount != null ? `$${event.amount.toFixed(2)} ${event.currency || "USD"}` : "subscription payment";
    const recoveryMessage = `Payment of ${formattedAmount} received successfully. Your J10 NEXUS subscription is active and all automated messaging quotas have been verified.`;

    const { data: thread } = await supabase
      .from("inbox_threads")
      .select("id")
      .eq("workspace_id", workspaceId)
      .limit(1)
      .maybeSingle();

    if (thread?.id) {
      await supabase.from("inbox_messages").insert({
        workspace_id: workspaceId,
        thread_id: thread.id,
        direction: "outbound",
        provider: "stripe",
        content: recoveryMessage,
        delivery_status: "delivered",
        message_type: "system",
        metadata: {
          dunningRecovery: true,
          invoiceId: event.invoiceId,
        },
      });
    }
  } catch (err) {
    console.warn("Failed to dispatch dunning recovery message to inbox:", err);
  }

  return {
    success: true,
    workspaceId,
    action: "dunning_recovered",
  };
}

/**
 * Handles trial expiration warnings (e.g. 3 days before trial ends).
 */
export async function recordTrialExpirationWarning(
  supabase: SupabaseClient,
  {
    stripeSubscriptionId,
    stripeCustomerId,
    trialEnd,
  }: {
    stripeSubscriptionId?: string;
    stripeCustomerId?: string;
    trialEnd?: string;
  }
): Promise<{ success: boolean; action: string }> {
  let query = supabase.from("workspace_subscriptions").select("id, workspace_id");
  if (stripeSubscriptionId) {
    query = query.eq("stripe_subscription_id", stripeSubscriptionId);
  } else if (stripeCustomerId) {
    query = query.eq("stripe_customer_id", stripeCustomerId);
  } else {
    return { success: false, action: "missing_identifier" };
  }

  const { data: sub } = await query.maybeSingle();
  if (!sub) return { success: false, action: "not_found" };

  try {
    const trialEndFormatted = trialEnd
      ? new Date(trialEnd).toLocaleDateString(undefined, { month: "short", day: "numeric" })
      : "soon";
    const warningMessage = `⏳ Your J10 NEXUS free trial period will conclude on ${trialEndFormatted}. Set up an active billing plan to prevent interruption of your WhatsApp AI sales workforce.`;

    const { data: thread } = await supabase
      .from("inbox_threads")
      .select("id")
      .eq("workspace_id", sub.workspace_id)
      .limit(1)
      .maybeSingle();

    if (thread?.id) {
      await supabase.from("inbox_messages").insert({
        workspace_id: sub.workspace_id,
        thread_id: thread.id,
        direction: "outbound",
        provider: "stripe",
        content: warningMessage,
        delivery_status: "delivered",
        message_type: "system",
        metadata: {
          trialWarning: true,
          trialEnd,
        },
      });
    }
  } catch (err) {
    console.warn("Failed to dispatch trial warning message to inbox:", err);
  }

  return { success: true, action: "trial_warning_dispatched" };
}
