import { NextResponse } from "next/server";
import { getActiveWorkspaceContext } from "@/lib/workspaces/server";
import { createServerSupabaseClient } from "@/lib/auth";
import type { InboxDealStage } from "@/types/inbox";

const VALID_STAGES: InboxDealStage[] = ["lead", "qualified", "proposal", "won", "churned"];

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await getActiveWorkspaceContext();
    if (!context) {
      return NextResponse.json(
        { success: false, error: "Unauthorized." },
        { status: 401 }
      );
    }

    const { id: threadId } = await params;
    const body = await req.json();
    const { dealStage } = body;

    if (!dealStage || !VALID_STAGES.includes(dealStage)) {
      return NextResponse.json(
        { success: false, error: "Invalid deal stage specified." },
        { status: 400 }
      );
    }

    const wsId = context.workspace.id;
    const supabase = createServerSupabaseClient();

    // 1. Fetch thread to get contact_id
    const { data: thread, error: threadError } = await supabase
      .from("inbox_threads")
      .select("id, workspace_id, contact_id, metadata")
      .eq("id", threadId)
      .eq("workspace_id", wsId)
      .maybeSingle();

    if (threadError || !thread) {
      return NextResponse.json(
        { success: false, error: "Thread not found in active workspace." },
        { status: 404 }
      );
    }

    // 2. Update thread metadata
    const updatedMetadata = {
      ...(thread.metadata || {}),
      dealStage,
    };

    await supabase
      .from("inbox_threads")
      .update({
        metadata: updatedMetadata,
        updated_at: new Date().toISOString(),
      })
      .eq("id", threadId)
      .eq("workspace_id", wsId);

    // 3. Update contact if linked
    if (thread.contact_id) {
      await supabase
        .from("contacts")
        .update({
          deal_stage: dealStage,
          updated_at: new Date().toISOString(),
        })
        .eq("id", thread.contact_id)
        .eq("workspace_id", wsId);
    }

    return NextResponse.json({
      success: true,
      threadId,
      dealStage,
    });
  } catch (error) {
    console.error("PATCH /api/inbox/threads/[id]/stage error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error." },
      { status: 500 }
    );
  }
}
