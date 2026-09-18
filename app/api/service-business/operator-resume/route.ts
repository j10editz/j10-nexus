import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/auth";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";
import { operatorResumeJourneyAi } from "@/lib/service-business/conversion-service";

export async function POST(req: Request) {
  try {
    const auth = await requireApiWorkspaceContext("agent");
    if (auth.error) return auth.error;

    const { context: wsContext } = auth;
    const supabase = createServerSupabaseClient();

    const body = await req.json();
    const threadId = typeof body.threadId === "string" ? body.threadId.trim() : null;

    if (!threadId) {
      return NextResponse.json(
        { success: false, error: "threadId is required" },
        { status: 400 }
      );
    }

    const result = await operatorResumeJourneyAi(supabase, {
      workspaceId: wsContext.workspace.id,
      threadId,
      operatorUserId: wsContext.user.id,
    });

    return NextResponse.json({ ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to resume AI";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
