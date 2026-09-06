import { NextResponse } from "next/server";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";
import {
  getAgentTraces,
  startAgentTrace,
  logTraceStep,
  completeAgentTrace,
} from "@/lib/governance/traces";
import type { TraceStatus, StepType } from "@/types/governance";

export async function GET(request: Request) {
  try {
    const auth = await requireApiWorkspaceContext("viewer");
    if (auth.error) return auth.error;

    const { context } = auth;
    const url = new URL(request.url);
    const agentId = url.searchParams.get("agentId") || undefined;
    const status = (url.searchParams.get("status") as TraceStatus) || undefined;
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;

    const traces = await getAgentTraces(context.workspace.id, {
      agentId,
      status,
      limit,
    });

    return NextResponse.json({ success: true, traces });
  } catch (error: any) {
    console.error("GET /api/governance/traces error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to load traces." },
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
    const action = body.action || "start";

    if (action === "start") {
      if (!body.agentId || !body.modelUsed) {
        return NextResponse.json(
          { success: false, error: "agentId and modelUsed are required." },
          { status: 400 }
        );
      }
      const trace = await startAgentTrace(context.workspace.id, {
        agentId: body.agentId,
        versionId: body.versionId,
        taskId: body.taskId,
        sessionId: body.sessionId,
        modelUsed: body.modelUsed,
        providerUsed: body.providerUsed,
        inputPayload: body.inputPayload || {},
      });
      return NextResponse.json({ success: true, trace });
    }

    if (action === "step") {
      if (!body.traceId || typeof body.stepNumber !== "number" || !body.stepType) {
        return NextResponse.json(
          { success: false, error: "traceId, stepNumber, and stepType are required." },
          { status: 400 }
        );
      }
      const step = await logTraceStep(body.traceId, {
        stepNumber: body.stepNumber,
        stepType: body.stepType as StepType,
        toolName: body.toolName,
        toolInput: body.toolInput,
        toolOutput: body.toolOutput,
        thought: body.thought,
        latencyMs: body.latencyMs,
        status: body.status,
      });
      return NextResponse.json({ success: true, step });
    }

    if (action === "complete") {
      if (!body.traceId || !body.status) {
        return NextResponse.json(
          { success: false, error: "traceId and status are required." },
          { status: 400 }
        );
      }
      const completed = await completeAgentTrace(body.traceId, {
        status: body.status as TraceStatus,
        outputPayload: body.outputPayload || {},
        promptTokens: body.promptTokens || 0,
        completionTokens: body.completionTokens || 0,
        latencyMs: body.latencyMs || 0,
        modelUsed: body.modelUsed,
        errorMessage: body.errorMessage,
      });
      return NextResponse.json({ success: true, trace: completed });
    }

    return NextResponse.json(
      { success: false, error: `Invalid trace action '${action}'.` },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("POST /api/governance/traces error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to process trace." },
      { status: 500 }
    );
  }
}
