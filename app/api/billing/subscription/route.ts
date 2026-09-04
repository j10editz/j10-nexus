import { NextResponse } from "next/server";
import {
  createIntegrationApiClient,
  getAuthenticatedIntegrationUser,
} from "@/lib/integrations/api";
import { PLANS } from "@/lib/billing/plans";

export { PLANS };

export async function GET() {
  try {
    const supabase = await createIntegrationApiClient();
    const user = await getAuthenticatedIntegrationUser(supabase);

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized." },
        { status: 401 }
      );
    }

    let { data: sub } = await supabase
      .from("workspace_subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!sub) {
      const initialSub = {
        user_id: user.id,
        plan_id: "starter",
        status: "active",
        monthly_message_limit: 1000,
        messages_used_this_period: 0,
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(Date.now() + 30 * 86400000).toISOString(),
      };

      const { data: created, error } = await supabase
        .from("workspace_subscriptions")
        .insert([initialSub])
        .select()
        .single();

      if (!error && created) {
        sub = created;
      } else {
        sub = initialSub;
      }
    }

    const currentPlanId = sub.plan_id || "starter";
    const currentPlan = PLANS.find((p) => p.id === currentPlanId) || PLANS[0];
    const messageLimit = sub.monthly_message_limit || currentPlan.messageLimit;
    const messagesUsed = sub.messages_used_this_period || 0;
    const usagePercent = Math.min(100, Math.round((messagesUsed / messageLimit) * 100));

    const periodEnd = new Date(sub.current_period_end || Date.now() + 30 * 86400000);
    const daysRemaining = Math.max(0, Math.ceil((periodEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

    return NextResponse.json({
      success: true,
      subscription: {
        id: sub.id,
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
    const supabase = await createIntegrationApiClient();
    const user = await getAuthenticatedIntegrationUser(supabase);

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized." },
        { status: 401 }
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

    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 86400000);

    const { error } = await supabase
      .from("workspace_subscriptions")
      .upsert(
        {
          user_id: user.id,
          plan_id: plan.id,
          status: "active",
          monthly_message_limit: plan.messageLimit,
          messages_used_this_period: 0,
          current_period_start: now.toISOString(),
          current_period_end: periodEnd.toISOString(),
          grace_period_end: null,
          updated_at: now.toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (error) {
      const { data: sub } = await supabase
        .from("workspace_subscriptions")
        .select("id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (sub?.id) {
        await supabase
          .from("workspace_subscriptions")
          .update({
            plan_id: plan.id,
            status: "active",
            monthly_message_limit: plan.messageLimit,
            current_period_end: periodEnd.toISOString(),
            updated_at: now.toISOString(),
          })
          .eq("id", sub.id);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Workspace upgraded to ${plan.name} tier (${plan.messageLimit.toLocaleString()} msgs/mo).`,
      planId: plan.id,
    });
  } catch (error) {
    console.error("Billing upgrade error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to process plan change." },
      { status: 500 }
    );
  }
}
