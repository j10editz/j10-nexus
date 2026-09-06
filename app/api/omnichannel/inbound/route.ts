import { NextResponse } from "next/server";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";
import { createServerSupabaseClient } from "@/lib/auth";
import { ingestOmnichannelMessage } from "@/lib/omnichannel/inbound";
import type { InboxChannel } from "@/types/inbox";

export async function POST(req: Request) {
  try {
    const auth = await requireApiWorkspaceContext("agent");
    if (auth.error) return auth.error;
    const { context } = auth;
    const supabase = createServerSupabaseClient();
    const body = await req.json().catch(() => ({}));

    const channel: InboxChannel = body.channel || "email";
    const payload = body.payload || body;

    const result = await ingestOmnichannelMessage(
      supabase,
      context.workspace.id,
      payload,
      channel,
    );

    return NextResponse.json({ success: true, ...result }, { status: 201 });
  } catch (error) {
    console.error("POST /api/omnichannel/inbound error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Inbound ingestion failed.",
      },
      { status: 500 },
    );
  }
}
