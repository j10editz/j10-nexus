import { NextResponse } from "next/server";
import { getActiveWorkspaceContext } from "@/lib/workspaces/server";
import { createServerSupabaseClient, createAdminSupabaseClient } from "@/lib/auth";
import { PLANS } from "@/lib/billing/plans";

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
          stripeCustomerId: null,
          stripeSubscriptionId: null,
        },
        plans: PLANS,
      });
    }

    const currentPlanId = sub.plan_id || "starter";
    const currentPlan = PLANS.find((p) => p.id === currentPlanId) || PLANS[0];
    const messageLimit = sub.monthly_message_limit ?? currentPlan.messageLimit;
    const messagesUsed = sub.messages_used_this_period ?? 0;
    const usagePercent = messageLimit > 0 ? Math.min(100, Math.round((messagesUsed / messageLimit) * 100)) : 0;

    const periodEnd = sub.current_period_end ? new Date(sub.current_period_end) : null;
    const daysRemaining = periodEnd
      ? Math.max(0, Math.ceil((periodEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
      : 0;

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

    const body = await request.json();
    const targetPlanId = String(body.planId || "").toLowerCase();

    const plan = PLANS.find((p) => p.id === targetPlanId);
    if (!plan) {
      return NextResponse.json(
        { success: false, error: "Invalid plan. Must be one of: starter, growth, enterprise." },
        { status: 400 }
      );
    }

    // Critical trust boundary:
    // Only platform founders or verified Stripe webhooks can mutate subscription status to active.
    // Client POST requests without verified Stripe proof must be rejected.
    const isPlatformFounder = context.platformRole === "platform_founder";

    if (!isPlatformFounder) {
      return NextResponse.json(
        {
          success: false,
          error: "Direct plan mutation is prohibited. Upgrades must be completed via Stripe Checkout with verified payment proof.",
          code: "STRIPE_CHECKOUT_REQUIRED",
        },
        { status: 402 }
      );
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
          monthly_message_limit: plan.messageLimit,
          messages_used_this_period: 0,
          current_period_start: now.toISOString(),
          current_period_end: periodEnd.toISOString(),
          grace_period_end: null,
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
