import { NextRequest, NextResponse } from "next/server";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";
import { createServerSupabaseClient } from "@/lib/auth";
import { reconstructFounderSubscriptionSchedule } from "@/lib/billing/subscription-schedule";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { context, error } = await requireApiWorkspaceContext("admin");
    if (error) {
      return error;
    }

    const supabase = createServerSupabaseClient();
    const wsId = context.workspace.id;

    // 1. Fetch current subscription
    const { data: sub, error: subErr } = await supabase
      .from("workspace_subscriptions")
      .select("*")
      .eq("workspace_id", wsId)
      .maybeSingle();

    if (subErr || !sub) {
      return NextResponse.json(
        { success: false, error: "No active subscription found for this workspace." },
        { status: 404 }
      );
    }

    if (!sub.cancel_at_period_end && sub.status === "active") {
      return NextResponse.json(
        { success: true, message: "Subscription is already active.", status: "active" }
      );
    }

    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (secretKey && secretKey.startsWith("sk_") && sub.stripe_subscription_id) {
      try {
        const res = await fetch(`https://api.stripe.com/v1/subscriptions/${sub.stripe_subscription_id}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${secretKey}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ cancel_at_period_end: "false" }).toString(),
        });

        if (!res.ok) {
          const errData = await res.json();
          console.warn("Stripe cancel_at_period_end reactivation warning:", errData);
        } else {
          const updatedSub = await res.json();
          if (sub.plan_id === "founders3" && !updatedSub.schedule) {
            await reconstructFounderSubscriptionSchedule({
              supabase,
              workspaceId: wsId,
              stripeSubscriptionId: sub.stripe_subscription_id,
              secretKey,
            });
          }
        }
      } catch (stripeErr) {
        console.warn("Stripe API call error during reactivation:", stripeErr);
      }
    }

    // Update subscription in database
    const { error: updateErr } = await supabase
      .from("workspace_subscriptions")
      .update({
        status: "active",
        cancel_at_period_end: false,
        updated_at: new Date().toISOString(),
      })
      .eq("workspace_id", wsId);

    if (updateErr) {
      return NextResponse.json(
        { success: false, error: "Failed to update reactivation status in database." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Subscription successfully reactivated. Your monthly plan will continue without interruption.",
      status: "active",
      cancelAtPeriodEnd: false,
    });
  } catch (err: any) {
    console.error("Subscription reactivation error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to reactivate subscription." },
      { status: 500 }
    );
  }
}
