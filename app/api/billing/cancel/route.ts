import { NextRequest, NextResponse } from "next/server";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";
import { createServerSupabaseClient } from "@/lib/auth";

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

    if (sub.status === "canceled") {
      return NextResponse.json(
        { success: false, error: "Subscription is already canceled." },
        { status: 400 }
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
          body: new URLSearchParams({ cancel_at_period_end: "true" }).toString(),
        });

        if (!res.ok) {
          const errData = await res.json();
          console.warn("Stripe cancel_at_period_end warning:", errData);
        }
      } catch (stripeErr) {
        console.warn("Stripe API call error during cancellation:", stripeErr);
      }
    }

    // Update subscription in database (preserve canonical active stripe_status, set cancel_at_period_end = true)
    const { error: updateErr } = await supabase
      .from("workspace_subscriptions")
      .update({
        status: "active",
        stripe_status: "active",
        cancel_at_period_end: true,
        updated_at: new Date().toISOString(),
      })
      .eq("workspace_id", wsId);

    if (updateErr) {
      return NextResponse.json(
        { success: false, error: "Failed to update cancellation status in database." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Subscription scheduled to cancel at end of billing period on ${new Date(sub.current_period_end).toLocaleDateString()}. Access continues until then.`,
      status: "active",
      stripeStatus: "active",
      cancelAtPeriodEnd: true,
      currentPeriodEnd: sub.current_period_end,
    });
  } catch (err: any) {
    console.error("Subscription cancellation error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to schedule subscription cancellation." },
      { status: 500 }
    );
  }
}
