import { NextResponse } from "next/server";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";
import {
  getPendingApprovals,
  createApprovalGate,
  resolveApprovalGate,
} from "@/lib/governance/approvals";

export async function GET(request: Request) {
  try {
    const auth = await requireApiWorkspaceContext("viewer");
    if (auth.error) return auth.error;

    const { context } = auth;
    const url = new URL(request.url);
    const agentId = url.searchParams.get("agentId") || undefined;

    const approvals = await getPendingApprovals(context.workspace.id, agentId);
    return NextResponse.json({ success: true, approvals });
  } catch (error: any) {
    console.error("GET /api/governance/approvals error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to load approval gates." },
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

    if (action === "create") {
      if (!body.agentId || !body.actionType || !body.reason) {
        return NextResponse.json(
          { success: false, error: "agentId, actionType, and reason are required." },
          { status: 400 }
        );
      }
      const gate = await createApprovalGate(context.workspace.id, {
        agentId: body.agentId,
        actionType: body.actionType,
        actionPayload: body.actionPayload || {},
        estimatedRisk: body.estimatedRisk,
        reason: body.reason,
        traceId: body.traceId,
      });
      return NextResponse.json({ success: true, gate });
    }

    if (action === "resolve") {
      if (!body.gateId || !["approved", "rejected"].includes(body.decision)) {
        return NextResponse.json(
          { success: false, error: "gateId and decision ('approved' | 'rejected') are required." },
          { status: 400 }
        );
      }

      const resolved = await resolveApprovalGate(
        context.workspace.id,
        body.gateId,
        context.membership.user_id,
        body.decision,
        body.reviewNotes
      );
      return NextResponse.json({ success: true, gate: resolved });
    }

    return NextResponse.json(
      { success: false, error: `Invalid action '${action}'.` },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("POST /api/governance/approvals error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to process approval action." },
      { status: 500 }
    );
  }
}
