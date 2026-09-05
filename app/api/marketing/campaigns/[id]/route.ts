import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/auth";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";
import type { CampaignStatus } from "@/types/marketing";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const auth = await requireApiWorkspaceContext("viewer");
    if (auth.error) {
      return auth.error;
    }
    const { context: wsContext } = auth;
    const supabase = createServerSupabaseClient();

    const { id } = await context.params;

    const { data: campaign, error } = await supabase
      .from("marketing_campaigns")
      .select("*")
      .eq("id", id)
      .eq("workspace_id", wsContext.workspace.id)
      .single();

    if (error || !campaign) {
      return NextResponse.json(
        { success: false, error: "Campaign not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, campaign });
  } catch (error) {
    console.error("Campaign GET error:", error);
    return NextResponse.json(
      { success: false, error: "Could not load campaign." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const auth = await requireApiWorkspaceContext("manager");
    if (auth.error) {
      return auth.error;
    }
    const { context: wsContext } = auth;
    const supabase = createServerSupabaseClient();

    const { id } = await context.params;
    const body = await request.json();
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (typeof body.name === "string" && body.name.trim()) {
      updates.name = body.name.trim();
    }

    if (typeof body.message_template === "string" && body.message_template.trim()) {
      updates.message_template = body.message_template.trim();
    }

    const validStatuses: CampaignStatus[] = [
      "draft",
      "scheduled",
      "sending",
      "completed",
      "paused",
    ];

    if (body.status && validStatuses.includes(body.status)) {
      updates.status = body.status;
      if (body.status === "completed") {
        updates.completed_at = new Date().toISOString();
      }
    }

    // Support simulated broadcast execution
    if (body.simulate_send === true) {
      const { data: existing } = await supabase
        .from("marketing_campaigns")
        .select("target_count")
        .eq("id", id)
        .eq("workspace_id", wsContext.workspace.id)
        .single();

      const targets = existing?.target_count || 10;
      updates.status = "completed";
      updates.sent_count = targets;
      updates.delivered_count = Math.max(0, targets - 1);
      updates.read_count = Math.round(targets * 0.75);
      updates.replied_count = Math.round(targets * 0.28);
      updates.completed_at = new Date().toISOString();
    }

    const { data: campaign, error } = await supabase
      .from("marketing_campaigns")
      .update(updates)
      .eq("id", id)
      .eq("workspace_id", wsContext.workspace.id)
      .select("*")
      .single();

    if (error || !campaign) {
      console.error("Campaign update error:", error);
      return NextResponse.json(
        { success: false, error: error?.message || "Could not update campaign." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      campaign,
      message: "Campaign updated successfully.",
    });
  } catch (error) {
    console.error("Campaign PATCH error:", error);
    return NextResponse.json(
      { success: false, error: "Could not update campaign." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const auth = await requireApiWorkspaceContext("admin");
    if (auth.error) {
      return auth.error;
    }
    const { context: wsContext } = auth;
    const supabase = createServerSupabaseClient();

    const { id } = await context.params;

    const { error } = await supabase
      .from("marketing_campaigns")
      .delete()
      .eq("id", id)
      .eq("workspace_id", wsContext.workspace.id);

    if (error) {
      console.error("Campaign deletion error:", error);
      return NextResponse.json(
        { success: false, error: error.message || "Could not delete campaign." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Campaign deleted successfully.",
    });
  } catch (error) {
    console.error("Campaign DELETE error:", error);
    return NextResponse.json(
      { success: false, error: "Could not delete campaign." },
      { status: 500 }
    );
  }
}
