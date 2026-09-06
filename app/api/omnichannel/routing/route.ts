import { NextResponse } from "next/server";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";
import { createServerSupabaseClient } from "@/lib/auth";
import {
  getWorkspaceRoutingRules,
  upsertRoutingRule,
} from "@/lib/omnichannel/routing";

export async function GET() {
  try {
    const auth = await requireApiWorkspaceContext("viewer");
    if (auth.error) return auth.error;
    const { context } = auth;
    const supabase = createServerSupabaseClient();

    const rules = await getWorkspaceRoutingRules(supabase, context.workspace.id);
    return NextResponse.json({ success: true, rules });
  } catch (error) {
    console.error("GET /api/omnichannel/routing error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch routing rules.",
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

    if (!body.name || !body.channel || !body.routingStrategy) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields: name, channel, and routingStrategy.",
        },
        { status: 400 },
      );
    }

    const rule = await upsertRoutingRule(supabase, context.workspace.id, {
      id: body.id,
      name: body.name,
      description: body.description,
      channel: body.channel,
      conditions: body.conditions || [],
      routingStrategy: body.routingStrategy,
      targetUserId: body.targetUserId,
      targetAgentId: body.targetAgentId,
      targetTeam: body.targetTeam,
      priorityOrder: body.priorityOrder,
      isActive: body.isActive,
    });

    return NextResponse.json({ success: true, rule }, { status: 201 });
  } catch (error) {
    console.error("POST /api/omnichannel/routing error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to save routing rule.",
      },
      { status: 500 },
    );
  }
}
