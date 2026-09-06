import { NextRequest, NextResponse } from "next/server";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";
import { createServerSupabaseClient } from "@/lib/auth";
import { createBillingPortalSession } from "@/lib/billing/portal";

export async function POST(request: NextRequest) {
  try {
    const { context, error } = await requireApiWorkspaceContext("admin");
    if (error) {
      return error;
    }

    const body = await request.json().catch(() => ({}));
    const supabase = createServerSupabaseClient();

    const portalResult = await createBillingPortalSession(supabase, {
      workspaceId: context.workspace.id,
      returnUrl: body.returnUrl,
    });

    return NextResponse.json({
      success: true,
      url: portalResult.url,
      mode: portalResult.mode,
    });
  } catch (error: any) {
    console.error("Billing portal error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to create billing portal session." },
      { status: 500 }
    );
  }
}
