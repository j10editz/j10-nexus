import { NextRequest, NextResponse } from "next/server";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";
import { createServerSupabaseClient } from "@/lib/auth";
import { activateWorkspaceTrial } from "@/lib/billing/entitlements";

export async function POST(request: NextRequest) {
  try {
    const { context, error } = await requireApiWorkspaceContext("admin");
    if (error) {
      return error;
    }

    const body = await request.json().catch(() => ({}));
    const planId = body.planId || "growth";
    const durationDays = Number(body.durationDays) || 14;

    const supabase = createServerSupabaseClient();
    const result = await activateWorkspaceTrial(supabase, context.workspace.id, planId, durationDays);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || "Failed to activate trial." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `14-day free trial of ${planId.toUpperCase()} tier activated successfully!`,
      subscription: result.subscription,
    });
  } catch (error: any) {
    console.error("Trial activation error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to process trial request." },
      { status: 500 }
    );
  }
}
