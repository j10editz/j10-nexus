import { NextResponse } from "next/server";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";
import {
  getReliabilityMetrics,
  resetCircuitBreaker,
  recordInvocationOutcome,
} from "@/lib/governance/reliability";

export async function GET() {
  try {
    const auth = await requireApiWorkspaceContext("viewer");
    if (auth.error) return auth.error;

    const { context } = auth;
    const metrics = getReliabilityMetrics(context.workspace.id);

    return NextResponse.json({ success: true, metrics });
  } catch (error: any) {
    console.error("GET /api/governance/reliability error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to load reliability metrics." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireApiWorkspaceContext("admin");
    if (auth.error) return auth.error;

    const { context } = auth;
    const body = await request.json().catch(() => ({}));
    const action = body.action || "reset";

    if (action === "reset") {
      const reset = resetCircuitBreaker(context.workspace.id);
      return NextResponse.json({ success: true, metrics: reset });
    }

    if (action === "record") {
      const recorded = recordInvocationOutcome(context.workspace.id, {
        success: Boolean(body.success),
        latencyMs: Number(body.latencyMs || 250),
        usedFallback: Boolean(body.usedFallback),
        error: body.error,
      });
      return NextResponse.json({ success: true, metrics: recorded });
    }

    return NextResponse.json(
      { success: false, error: `Invalid reliability action '${action}'.` },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("POST /api/governance/reliability error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to execute reliability action." },
      { status: 500 }
    );
  }
}
