import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/auth";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";
import { updateBeautyLifecycleState, type BeautyLifecycleStatus } from "@/lib/beauty/conversion-service";

export async function GET(req: Request) {
  try {
    const auth = await requireApiWorkspaceContext("viewer");
    if (auth.error) return auth.error;

    const { context: wsContext } = auth;
    const { searchParams } = new URL(req.url);
    const threadId = searchParams.get("threadId");

    if (!threadId) {
      return NextResponse.json(
        { success: false, error: "threadId is required" },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();
    const { data: lifecycle } = await supabase
      .from("beauty_conversion_lifecycles")
      .select("*")
      .eq("workspace_id", wsContext.workspace.id)
      .eq("thread_id", threadId)
      .maybeSingle();

    return NextResponse.json({ success: true, lifecycle: lifecycle || null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load lifecycle";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireApiWorkspaceContext("agent");
    if (auth.error) return auth.error;

    const { context: wsContext } = auth;
    const supabase = createServerSupabaseClient();
    const body = await req.json();

    const threadId = typeof body.threadId === "string" ? body.threadId.trim() : null;
    const status = typeof body.status === "string" ? (body.status.trim() as BeautyLifecycleStatus) : undefined;

    if (!threadId) {
      return NextResponse.json(
        { success: false, error: "threadId is required" },
        { status: 400 }
      );
    }

    const updated = await updateBeautyLifecycleState(supabase, {
      workspaceId: wsContext.workspace.id,
      threadId,
      status,
      requestedService: body.requestedService,
      preferredDate: body.preferredDate,
      preferredTime: body.preferredTime,
      estimatedServiceValue: body.estimatedServiceValue,
      qualificationCompleteness: body.qualificationCompleteness,
      bookingConfirmationSource: body.bookingConfirmationSource,
      humanTakeoverReason: body.humanTakeoverReason,
      actorType: "operator",
      actorId: wsContext.user.id,
      reason: body.reason || "Manual operator update",
    });

    return NextResponse.json({ success: true, lifecycle: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update lifecycle";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
