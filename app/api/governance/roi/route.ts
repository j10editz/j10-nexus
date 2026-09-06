import { NextResponse } from "next/server";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";
import {
  getWorkspaceRoiSummary,
  recordRoiAttribution,
} from "@/lib/governance/roi";

export async function GET() {
  try {
    const auth = await requireApiWorkspaceContext("viewer");
    if (auth.error) return auth.error;

    const { context } = auth;
    const summary = await getWorkspaceRoiSummary(context.workspace.id);

    return NextResponse.json({ success: true, summary });
  } catch (error: any) {
    console.error("GET /api/governance/roi error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to load ROI attribution summary." },
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

    if (!body.agentId) {
      return NextResponse.json(
        { success: false, error: "agentId is required." },
        { status: 400 }
      );
    }

    const attribution = await recordRoiAttribution(context.workspace.id, {
      agentId: body.agentId,
      traceId: body.traceId,
      taskId: body.taskId,
      contactId: body.contactId,
      dealValueUsd: body.dealValueUsd,
      hoursSaved: body.hoursSaved,
      modelCostUsd: body.modelCostUsd,
      attributionType: body.attributionType,
    });

    return NextResponse.json({ success: true, attribution });
  } catch (error: any) {
    console.error("POST /api/governance/roi error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to record ROI attribution." },
      { status: 500 }
    );
  }
}
