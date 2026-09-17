import { NextResponse } from "next/server";
import { getActiveWorkspaceContext } from "@/lib/workspaces/server";
import { createServerSupabaseClient, createAdminSupabaseClient } from "@/lib/auth";
import { PLANS, getPlanById, type PlanId } from "@/lib/billing/plans";
import { createWorkspaceSubscriptionCheckout } from "@/lib/billing/checkout";
import { getFounders3SlotStatus } from "@/lib/billing/invitations";

export { PLANS };

export async function GET(request?: Request) {
  try {
    const context = await getActiveWorkspaceContext();
    if (!context) {
      return NextResponse.json(
        { success: false, error: "Authentication and active workspace required." },
        { status: 401 }
      );
    }

    const supabase = createServerSupabaseClient();

    // Query subscription strictly scoped to workspace_id
    const { data: sub, error } = await supabase
      .from("workspace_subscriptions")
      .select("*")
      .eq("workspace_id", context.workspace.id)
      .maybeSingle();

    if (error) {
      console.error("Error fetching workspace subscription:", error);
    }

    // Live Stripe reconciliation if requested (e.g. on portal return)
    if (request && sub?.stripe_subscription_id) {
      try {
        const url = new URL(request.url);
        if (url.searchParams.get("refresh") === "true") {
          const secretKey = process.env.STRIPE_SECRET_KEY;
          if (secretKey && secretKey.startsWith("sk_")) {
            const stripeRes = await fetch(
              `https://api.stripe.com/v1/subscriptions/${sub.stripe_subscription_id}`,
              {
                method: "GET",
                headers: { Authorization: `Bearer ${secretKey}` },
              }
            );
            if (stripeRes.ok) {
              const stripeSub = await stripeRes.json();
              const currentPeriodEndSec = stripeSub.current_period_end;
              const cancelAtPeriodEnd = Boolean(
                stripeSub.cancel_at_period_end ||
                (stripeSub.cancel_at && currentPeriodEndSec && Number(stripeSub.cancel_at) >= Number(currentPeriodEndSec))
              );

              const reconciledStatus = cancelAtPeriodEnd
                ? "canceled_at_period_end"
                : stripeSub.status;

              const updatePayload: Record<string, any> = {
                cancel_at_period_end: cancelAtPeriodEnd,
                status: reconciledStatus,
                stripe_status: stripeSub.status,
                updated_at: new Date().toISOString(),
              };

              if (stripeSub.current_period_start) {
                updatePayload.current_period_start = new Date(stripeSub.current_period_start * 1000).toISOString();
              }
              if (stripeSub.current_period_end) {
                updatePayload.current_period_end = new Date(stripeSub.current_period_end * 1000).toISOString();
              }

              const admin = createAdminSupabaseClient();
              await admin
                .from("workspace_subscriptions")
                .update(updatePayload)
                .eq("workspace_id", context.workspace.id);

              Object.assign(sub, updatePayload);
            }
          }
        }
      } catch (reconcileErr) {
        console.warn("Live Stripe reconciliation skipped or failed:", reconcileErr);
      }
    }

    // Query active team member seat count
    const { count: seatsCount } = await supabase
      .from("workspace_memberships")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", context.workspace.id);

    // Query connected channels count
    const { count: channelsCount } = await supabase
      .from("integrations")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", context.workspace.id)
      .eq("status", "connected");

    // Live Founder's 3 slot status
    const slotStatus = await getFounders3SlotStatus(supabase, context.workspace.id);

    // Honest state: If no subscription row exists, report unconfigured rather than inventing an active plan
    if (!sub) {
      return NextResponse.json({
        success: true,
        isConfigured: false,
        subscription: {
          id: null,
          workspaceId: context.workspace.id,
          planId: "none",
          planName: "Unconfigured",
          status: "none",
          monthlyMessageLimit: 0,
          messagesUsed: 0,
          usagePercent: 0,
          seatsQuota: 1,
          seatsUsed: seatsCount || 1,
          channelsQuota: 1,
          channelsUsed: channelsCount || 0,
          aiConversationsQuota: 0,
          aiConversationsUsed: 0,
          cancelAtPeriodEnd: false,
          currentPeriodStart: null,
          currentPeriodEnd: null,
          gracePeriodEnd: null,
          daysRemaining: 0,
          trialStart: null,
          trialEnd: null,
          trialActive: false,
          trialDaysRemaining: 0,
          hasUsedTrial: false,
          dunningStatus: "none",
          dunningAttemptCount: 0,
          lastDunningAt: null,
          stripeCustomerId: null,
          stripeSubscriptionId: null,
          stripePriceId: null,
        },
        slotStatus,
        plans: PLANS,
      });
    }

    const currentPlanId = (sub.plan_id || "starter") as PlanId;
    const currentPlan = getPlanById(currentPlanId);
    const messageLimit = sub.ai_conversations_quota ?? sub.monthly_message_limit ?? currentPlan.messageLimit;
    const messagesUsed = sub.messages_used_this_period ?? 0;
    const usagePercent = messageLimit > 0 ? Math.min(100, Math.round((messagesUsed / messageLimit) * 100)) : 0;

    const seatsQuota = sub.seats_quota ?? currentPlan.seatsAllowed ?? 3;
    const channelsQuota = sub.channels_quota ?? currentPlan.connectedChannelsAllowed ?? 2;

    const periodEnd = sub.current_period_end ? new Date(sub.current_period_end) : null;
    const now = Date.now();
    const daysRemaining = periodEnd
      ? Math.max(0, Math.ceil((periodEnd.getTime() - now) / (1000 * 60 * 60 * 24)))
      : 0;

    let trialActive = false;
    let trialDaysRemaining = 0;
    if (sub.status === "trialing" && sub.trial_end) {
      const trialEndMs = new Date(sub.trial_end).getTime();
      if (trialEndMs > now) {
        trialActive = true;
        trialDaysRemaining = Math.max(0, Math.ceil((trialEndMs - now) / (1000 * 60 * 60 * 24)));
      }
    }

    return NextResponse.json({
      success: true,
      isConfigured: sub.status === "active" || sub.status === "trialing" || sub.status === "past_due" || sub.status === "canceled_at_period_end",
      subscription: {
        id: sub.id,
        workspaceId: sub.workspace_id,
        planId: currentPlanId,
        planName: currentPlan.name,
        status: sub.status,
        monthlyMessageLimit: messageLimit,
        messagesUsed,
        usagePercent,
        seatsQuota,
        seatsUsed: seatsCount || 1,
        channelsQuota,
        channelsUsed: channelsCount || 0,
        aiConversationsQuota: messageLimit,
        aiConversationsUsed: messagesUsed,
        cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
        currentPeriodStart: sub.current_period_start,
        currentPeriodEnd: sub.current_period_end,
        gracePeriodEnd: sub.grace_period_end,
        daysRemaining,
        trialStart: sub.trial_start,
        trialEnd: sub.trial_end,
        trialActive,
        trialDaysRemaining,
        hasUsedTrial: Boolean(sub.has_used_trial),
        dunningStatus: sub.dunning_status || "none",
        dunningAttemptCount: sub.dunning_attempt_count || 0,
        lastDunningAt: sub.last_dunning_at,
        stripeCustomerId: sub.stripe_customer_id || null,
        stripeSubscriptionId: sub.stripe_subscription_id || null,
        stripePriceId: sub.stripe_price_id || null,
        stripeStatus: sub.stripe_status || sub.status,
        entitlementState: sub.entitlement_state || ((sub.status === "active" || sub.status === "canceled_at_period_end") ? "active" : "none"),
        billingHoldReason: sub.billing_hold_reason || "none",
        founderCycleCount: sub.founder_cycle_count ?? (currentPlanId === "founders3" ? 1 : 0),
        founderCycleTarget: sub.founder_cycle_target ?? 12,
        founderStartDate: sub.founder_start_date || sub.current_period_start || null,
        expectedTransitionDate: sub.expected_transition_date || null,
        priceTransitionStatus: sub.price_transition_status || (currentPlanId === "founders3" ? "introductory" : "none"),
      },
      slotStatus,
      plans: PLANS,
    });
  } catch (error) {
    console.error("Billing GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load billing subscription." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const context = await getActiveWorkspaceContext();
    if (!context) {
      return NextResponse.json(
        { success: false, error: "Authentication and active workspace required." },
        { status: 401 }
      );
    }

    if (!["owner", "admin"].includes(context.membership.role)) {
      return NextResponse.json(
        { success: false, error: "Only workspace owners and admins can manage subscriptions." },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const targetPlanId = String(body.planId || "").toLowerCase();
    const invitationCode = typeof body.invitationCode === "string" ? body.invitationCode.trim() : undefined;

    const plan = PLANS.find((p) => p.id === targetPlanId);
    if (!plan) {
      return NextResponse.json(
        { success: false, error: "Invalid plan. Must be one of: founders3, starter, growth, enterprise." },
        { status: 400 }
      );
    }

    // Critical trust boundary:
    // Platform founders can directly provision internal grant subscriptions.
    // Standard workspace owners are provided with a verified Stripe Checkout session.
    const isPlatformFounder = context.platformRole === "platform_founder";

    if (!isPlatformFounder) {
      const supabase = createServerSupabaseClient();
      const checkoutResult = await createWorkspaceSubscriptionCheckout(supabase, {
        workspaceId: context.workspace.id,
        planId: plan.id,
        customerEmail: context.user.email,
        actorUserId: context.user.id,
        invitationCode,
      });

      return NextResponse.json({
        success: true,
        checkoutRequired: true,
        checkoutUrl: checkoutResult.checkoutUrl,
        sessionId: checkoutResult.sessionId,
        message: `Stripe Checkout session created for ${plan.name} plan.`,
        code: "STRIPE_CHECKOUT_CREATED",
      });
    }

    // Platform Founder internal provisioning path
    const admin = createAdminSupabaseClient();
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 86400000);

    const { data: updatedSub, error: updateError } = await admin
      .from("workspace_subscriptions")
      .upsert(
        {
          workspace_id: context.workspace.id,
          plan_id: plan.id,
          status: "active",
          provenance: "internal_grant",
          monthly_message_limit: plan.messageLimit,
          ai_conversations_quota: plan.messageLimit,
          seats_quota: plan.seatsAllowed,
          channels_quota: plan.connectedChannelsAllowed,
          messages_used_this_period: 0,
          current_period_start: now.toISOString(),
          current_period_end: periodEnd.toISOString(),
          grace_period_end: null,
          dunning_status: "none",
          dunning_attempt_count: 0,
          updated_at: now.toISOString(),
        },
        { onConflict: "workspace_id" }
      )
      .select()
      .single();

    if (updateError) {
      console.error("Admin subscription update error:", updateError);
      return NextResponse.json(
        { success: false, error: "Failed to update workspace subscription." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Workspace subscription updated to ${plan.name} tier by platform authority.`,
      planId: plan.id,
      subscription: updatedSub,
    });
  } catch (error) {
    console.error("Billing upgrade error:", error);
    const message = error instanceof Error ? error.message : "Failed to process plan change.";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
