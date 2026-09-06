import { NextRequest, NextResponse } from "next/server";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";
import { createServerSupabaseClient } from "@/lib/auth";
import { createWorkspaceSubscriptionCheckout } from "@/lib/billing/checkout";
import { getPlanById, type PlanId } from "@/lib/billing/plans";

export async function POST(request: NextRequest) {
  try {
    const { context, error } = await requireApiWorkspaceContext("admin");
    if (error) {
      return error;
    }

    const body = await request.json().catch(() => ({}));
    const rawPlanId = String(body.planId || "").toLowerCase();

    if (!["starter", "growth", "enterprise"].includes(rawPlanId)) {
      return NextResponse.json(
        { success: false, error: "Invalid planId. Must be one of: starter, growth, enterprise." },
        { status: 400 }
      );
    }

    const planId = rawPlanId as PlanId;
    const interval = body.interval === "year" ? "year" : "month";
    const supabase = createServerSupabaseClient();

    const checkoutResult = await createWorkspaceSubscriptionCheckout(supabase, {
      workspaceId: context.workspace.id,
      planId,
      interval,
      customerEmail: context.user.email,
      actorUserId: context.user.id,
      successUrl: body.successUrl,
      cancelUrl: body.cancelUrl,
    });

    return NextResponse.json({
      success: true,
      checkoutUrl: checkoutResult.checkoutUrl,
      sessionId: checkoutResult.sessionId,
      plan: getPlanById(planId),
      interval,
      mode: checkoutResult.mode,
      providerMode: checkoutResult.providerMode,
    });
  } catch (error: any) {
    console.error("Subscription checkout error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to create subscription checkout session." },
      { status: 500 }
    );
  }
}
