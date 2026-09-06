import { NextResponse } from "next/server";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";
import { createServerSupabaseClient } from "@/lib/auth";
import {
  acquireThreadLease,
  releaseThreadLease,
  updateThreadPresence,
} from "@/lib/omnichannel/collision";

export async function POST(req: Request) {
  try {
    const auth = await requireApiWorkspaceContext("agent");
    if (auth.error) return auth.error;
    const { context } = auth;
    const supabase = createServerSupabaseClient();
    const body = await req.json().catch(() => ({}));

    const { action, threadId, typingStatus, ttlSeconds, forceOverride } = body;

    if (!threadId) {
      return NextResponse.json(
        { success: false, error: "threadId is required." },
        { status: 400 },
      );
    }

    const userId = context.membership.user_id;
    const userName = context.membership.role === "owner" ? "Workspace Owner" : "Operator";

    switch (action) {
      case "heartbeat": {
        const presence = await updateThreadPresence(
          supabase,
          context.workspace.id,
          threadId,
          userId,
          userName,
          typingStatus === "typing" ? "typing" : "viewing",
        );
        return NextResponse.json({ success: true, presence });
      }

      case "acquire_lock": {
        const lockResult = await acquireThreadLease(
          supabase,
          context.workspace.id,
          threadId,
          userId,
          userName,
          ttlSeconds || 60,
          Boolean(forceOverride),
        );
        if (!lockResult.success) {
          return NextResponse.json(lockResult, { status: 409 });
        }
        return NextResponse.json(lockResult);
      }

      case "release_lock": {
        const released = await releaseThreadLease(
          supabase,
          context.workspace.id,
          threadId,
          userId,
          Boolean(forceOverride),
        );
        return NextResponse.json({ success: released });
      }

      default:
        return NextResponse.json(
          {
            success: false,
            error: "Invalid action. Supported: heartbeat, acquire_lock, release_lock",
          },
          { status: 400 },
        );
    }
  } catch (error) {
    console.error("POST /api/omnichannel/collision error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Collision management error.",
      },
      { status: 500 },
    );
  }
}
