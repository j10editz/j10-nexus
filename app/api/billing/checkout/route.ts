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

    if (!["founders3", "starter", "growth", "enterprise"].includes(rawPlanId)) {
      return NextResponse.json(
        { success: false, error: "Invalid planId. Must be one of: founders3, starter, growth, enterprise." },
        { status: 400 }
      );
    }

    const planId = rawPlanId as PlanId;
    const interval = body.interval === "year" ? "year" : "month";
    const invitationCode = typeof body.invitationCode === "string" ? body.invitationCode.trim() : undefined;
    const supabase = createServerSupabaseClient();

    const priceId =
      planId === "founders3"
        ? process.env.STRIPE_FOUNDERS3_PRICE_ID || undefined
        : undefined;

    const checkoutResult = await createWorkspaceSubscriptionCheckout(supabase, {
      workspaceId: context.workspace.id,
      planId,
      interval,
      priceId,
      customerEmail: context.user.email,
      actorUserId: context.user.id,
      successUrl: body.successUrl,
      cancelUrl: body.cancelUrl,
      invitationCode,
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
    console.error("[Subscription Checkout Error]:", error);
    const rawMessage = typeof error?.message === "string" ? error.message : "";
    const isDbOrSchemaLeak =
      /relation|constraint|column|violates|not-null|pgrst|pg_|syntax error|table/i.test(rawMessage);

    const safeMessage =
      isDbOrSchemaLeak || !rawMessage
        ? "Unable to initialize checkout session. Please try again in a few moments."
        : rawMessage;

    return NextResponse.json(
      { success: false, error: safeMessage },
      { status: 500 }
    );
  }
}
