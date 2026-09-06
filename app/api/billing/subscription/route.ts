import { NextResponse } from "next/server";
import { getActiveWorkspaceContext } from "@/lib/workspaces/server";
import { createServerSupabaseClient, createAdminSupabaseClient } from "@/lib/auth";
import { PLANS, getPlanById, type PlanId } from "@/lib/billing/plans";
import { createWorkspaceSubscriptionCheckout } from "@/lib/billing/checkout";

export { PLANS };

export async function GET() {
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
        },
        plans: PLANS,
      });
    }

    const currentPlanId = (sub.plan_id || "starter") as PlanId;
    const currentPlan = getPlanById(currentPlanId);
    const messageLimit = sub.monthly_message_limit ?? currentPlan.messageLimit;
    const messagesUsed = sub.messages_used_this_period ?? 0;
    const usagePercent = messageLimit > 0 ? Math.min(100, Math.round((messagesUsed / messageLimit) * 100)) : 0;

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
      isConfigured: sub.status === "active" || sub.status === "trialing",
      subscription: {
        id: sub.id,
        workspaceId: sub.workspace_id,
        planId: currentPlanId,
        planName: currentPlan.name,
        status: sub.status,
        monthlyMessageLimit: messageLimit,
        messagesUsed,
        usagePercent,
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
      },
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

    const plan = PLANS.find((p) => p.id === targetPlanId);
    if (!plan) {
      return NextResponse.json(
        { success: false, error: "Invalid plan. Must be one of: starter, growth, enterprise." },
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
    return NextResponse.json(
      { success: false, error: "Failed to process plan change." },
      { status: 500 }
    );
  }
}
