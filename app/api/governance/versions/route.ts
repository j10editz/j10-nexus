import { NextResponse } from "next/server";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";
import {
  getAgentVersions,
  createAgentVersion,
  promoteAgentVersion,
  rollbackAgentVersion,
} from "@/lib/governance/versions";

export async function GET(request: Request) {
  try {
    const auth = await requireApiWorkspaceContext("viewer");
    if (auth.error) return auth.error;

    const { context } = auth;
    const url = new URL(request.url);
    const agentId = url.searchParams.get("agentId");

    if (!agentId) {
      return NextResponse.json(
        { success: false, error: "agentId query parameter is required." },
        { status: 400 }
      );
    }

    const versions = await getAgentVersions(context.workspace.id, agentId);
    return NextResponse.json({ success: true, versions });
  } catch (error: any) {
    console.error("GET /api/governance/versions error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to load agent versions." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireApiWorkspaceContext("manager");
    if (auth.error) return auth.error;

    const { context } = auth;
    const body = await request.json();
    const action = body.action || "create";

    if (action === "promote") {
      if (!body.versionId) {
        return NextResponse.json(
          { success: false, error: "versionId is required to promote." },
          { status: 400 }
        );
      }
      const promoted = await promoteAgentVersion(context.workspace.id, body.versionId);
      return NextResponse.json({ success: true, version: promoted });
    }

    if (action === "rollback") {
      if (!body.agentId || typeof body.targetVersionNumber !== "number") {
        return NextResponse.json(
          { success: false, error: "agentId and numeric targetVersionNumber required to rollback." },
          { status: 400 }
        );
      }
      const rolledBack = await rollbackAgentVersion(
        context.workspace.id,
        body.agentId,
        body.targetVersionNumber
      );
      return NextResponse.json({ success: true, version: rolledBack });
    }

    // Default: create new snapshot
    if (!body.agentId || !body.systemPrompt) {
      return NextResponse.json(
        { success: false, error: "agentId and systemPrompt are required." },
        { status: 400 }
      );
    }

    const version = await createAgentVersion(context.workspace.id, {
      agentId: body.agentId,
      systemPrompt: body.systemPrompt,
      instructions: body.instructions,
      modelId: body.modelId,
      temperature: body.temperature,
      maxTokens: body.maxTokens,
      reasoningEffort: body.reasoningEffort,
      toolsEnabled: body.toolsEnabled,
      changelog: body.changelog,
      makeActive: body.makeActive,
      createdBy: context.membership.user_id,
    });

    return NextResponse.json({ success: true, version });
  } catch (error: any) {
    console.error("POST /api/governance/versions error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to process version action." },
      { status: 500 }
    );
  }
}
