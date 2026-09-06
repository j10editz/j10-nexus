import { NextResponse } from "next/server";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";
import { createServerSupabaseClient } from "@/lib/auth";
import { dispatchOmnichannelMessage } from "@/lib/omnichannel/dispatch";

export async function POST(req: Request) {
  try {
    const auth = await requireApiWorkspaceContext("agent");
    if (auth.error) return auth.error;
    const { context } = auth;
    const supabase = createServerSupabaseClient();
    const body = await req.json().catch(() => ({}));

    const { threadId, channel, recipient, content, metadata, forceLockOverride } = body;

    if (!threadId || !channel || !content) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields: threadId, channel, and content.",
        },
        { status: 400 },
      );
    }

    const userId = context.membership.user_id;
    const senderName =
      context.membership.role === "owner" ? "Workspace Owner" : "Support Specialist";

    const result = await dispatchOmnichannelMessage(supabase, {
      workspaceId: context.workspace.id,
      threadId,
      channel,
      recipient: recipient || "recipient",
      body: content,
      senderName,
      senderUserId: userId,
      metadata,
      forceLockOverride: Boolean(forceLockOverride),
    });

    if (!result.success) {
      const status = result.error?.includes("Collision") ? 409 : 400;
      return NextResponse.json(result, { status });
    }

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("POST /api/omnichannel/dispatch error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Outbound dispatch failed.",
      },
      { status: 500 },
    );
  }
}
