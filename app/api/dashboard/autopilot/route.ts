import { NextResponse } from "next/server";
import { getActiveWorkspaceContext } from "@/lib/workspaces/server";
import { createServerSupabaseClient, createAdminSupabaseClient } from "@/lib/auth";
import { computeExecutiveDigest, type AutopilotAction } from "@/lib/autopilot/service";

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
    const workspaceId = context.workspace.id;

    // 1. Fetch confirmed 24h ledger revenue
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: ledgerRows } = await supabase
      .from("payment_ledger")
      .select("amount_cents, status, created_at")
      .eq("workspace_id", workspaceId)
      .eq("status", "confirmed")
      .gte("created_at", since24h);

    const revenue24hCents = (ledgerRows || []).reduce((sum, row) => sum + (Number(row.amount_cents) || 0), 0);
    const revenue24h = revenue24hCents / 100;

    // 2. Fetch real CRM active pipeline
    const { data: contacts } = await supabase
      .from("contacts")
      .select("estimated_value, status, updated_at")
      .eq("workspace_id", workspaceId);

    const activeContacts = (contacts || []).filter(
      (c) => c.status !== "Lost" && c.status !== "Won"
    );
    const activePipelineValue = activeContacts.reduce(
      (sum, c) => sum + (Number(c.estimated_value) || 0),
      0
    );

    // 3. Fetch completed AI tasks / runs in last 24h
    const { count: completedTasksCount } = await supabase
      .from("automation_runs")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", "completed")
      .gte("created_at", since24h);

    const aiTasks24h = completedTasksCount || 0;

    // Honest data provenance
    const hasData = (ledgerRows && ledgerRows.length > 0) || activeContacts.length > 0 || aiTasks24h > 0;
    const provenance = hasData ? "live" : "empty";

    const digest = computeExecutiveDigest({
      overrideRevenue24h: revenue24h,
      overridePipeline: activePipelineValue,
      isSimulated: !hasData,
    });

    return NextResponse.json({
      success: true,
      provenance,
      workspaceId,
      digest: {
        ...digest,
        revenue24h,
        activePipelineValue,
        aiTasksCompleted24h: aiTasks24h,
        isSimulated: !hasData,
      },
    });
  } catch (error: any) {
    console.error("Autopilot GET error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to compute executive digest" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const context = await getActiveWorkspaceContext();
    if (!context) {
      return NextResponse.json(
        { success: false, error: "Authentication and active workspace required." },
        { status: 401 }
      );
    }

    if (!["owner", "admin", "manager", "agent"].includes(context.membership.role)) {
      return NextResponse.json(
        { success: false, error: "Insufficient workspace permissions to trigger autopilot actions." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { actionId } = body;

    if (!actionId || typeof actionId !== "string") {
      return NextResponse.json(
        { success: false, error: "Valid actionId is required." },
        { status: 400 }
      );
    }

    // Persist proposed action in workspace activity log
    const admin = createAdminSupabaseClient();
    await admin.from("activity_logs").insert({
      workspace_id: context.workspace.id,
      user_id: context.user.id,
      action: "autopilot_action_proposed",
      entity_type: "autopilot",
      entity_id: actionId,
      title: `Autopilot action ${actionId} staged for approval`,
      description: `User ${context.user.email} initiated action ${actionId}. External side-effects require verification.`,
      metadata: { actionId, mode: "proposed" },
    });

    // Honest status: never report "executed" for unexecuted simulation
    return NextResponse.json({
      success: true,
      actionId,
      status: "proposed",
      timestamp: new Date().toISOString(),
      message: `Autopilot action ${actionId} validated and staged. Stored in workspace audit trail.`,
    });
  } catch (error: any) {
    console.error("Autopilot POST error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to trigger autopilot action" },
      { status: 400 }
    );
  }
}
