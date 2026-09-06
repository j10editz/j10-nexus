import { NextResponse } from "next/server";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";
import { createServerSupabaseClient } from "@/lib/auth";
import {
  getWorkspaceSlaPerformance,
  getWorkspaceSlaPolicies,
} from "@/lib/omnichannel/sla";

export async function GET() {
  try {
    const auth = await requireApiWorkspaceContext("viewer");
    if (auth.error) return auth.error;
    const { context } = auth;
    const supabase = createServerSupabaseClient();

    const [policies, performance] = await Promise.all([
      getWorkspaceSlaPolicies(supabase, context.workspace.id),
      getWorkspaceSlaPerformance(supabase, context.workspace.id),
    ]);

    return NextResponse.json({
      success: true,
      policies,
      performance,
    });
  } catch (error) {
    console.error("GET /api/omnichannel/sla error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch SLA data.",
      },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireApiWorkspaceContext("admin");
    if (auth.error) return auth.error;
    const { context } = auth;
    const supabase = createServerSupabaseClient();
    const body = await req.json().catch(() => ({}));

    if (!body.name || !body.priority || !body.firstResponseTargetMinutes) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields: name, priority, and firstResponseTargetMinutes.",
        },
        { status: 400 },
      );
    }

    const payload: any = {
      workspace_id: context.workspace.id,
      name: body.name,
      description: body.description || null,
      priority: body.priority,
      channel: body.channel || "all",
      first_response_target_minutes: Number(body.firstResponseTargetMinutes),
      resolution_target_minutes: Number(body.resolutionTargetMinutes || 240),
      warning_threshold_percent: Number(body.warningThresholdPercent || 80),
      escalation_action: body.escalationAction || {},
      is_default: Boolean(body.isDefault),
      updated_at: new Date().toISOString(),
    };

    if (body.id) {
      payload.id = body.id;
    }

    const { data: policy, error } = await supabase
      .from("omnichannel_sla_policies")
      .upsert(payload)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, policy }, { status: 201 });
  } catch (error) {
    console.error("POST /api/omnichannel/sla error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to save SLA policy.",
      },
      { status: 500 },
    );
  }
}
