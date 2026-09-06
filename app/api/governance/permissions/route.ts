import { NextResponse } from "next/server";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";
import {
  getAgentPermissions,
  upsertAgentPermissions,
  checkToolPermission,
} from "@/lib/governance/permissions";

export async function GET(request: Request) {
  try {
    const auth = await requireApiWorkspaceContext("viewer");
    if (auth.error) return auth.error;

    const { context } = auth;
    const url = new URL(request.url);
    const agentId = url.searchParams.get("agentId");

    if (!agentId) {
      return NextResponse.json(
        { success: false, error: "agentId parameter is required." },
        { status: 400 }
      );
    }

    const checkTool = url.searchParams.get("checkTool");
    if (checkTool) {
      const check = await checkToolPermission(context.workspace.id, agentId, checkTool);
      return NextResponse.json({ success: true, check });
    }

    const permissions = await getAgentPermissions(context.workspace.id, agentId);
    return NextResponse.json({ success: true, permissions });
  } catch (error: any) {
    console.error("GET /api/governance/permissions error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to load permissions." },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requireApiWorkspaceContext("admin");
    if (auth.error) return auth.error;

    const { context } = auth;
    const body = await request.json();

    if (!body.agentId || !Array.isArray(body.allowedTools)) {
      return NextResponse.json(
        { success: false, error: "agentId and allowedTools array are required." },
        { status: 400 }
      );
    }

    const updated = await upsertAgentPermissions(context.workspace.id, body.agentId, {
      allowedTools: body.allowedTools,
      deniedTools: body.deniedTools,
      dataBoundaries: body.dataBoundaries,
      canExecuteCode: body.canExecuteCode,
      canCallExternalApis: body.canCallExternalApis,
    });

    return NextResponse.json({ success: true, permissions: updated });
  } catch (error: any) {
    console.error("PUT /api/governance/permissions error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update permissions." },
      { status: 500 }
    );
  }
}
