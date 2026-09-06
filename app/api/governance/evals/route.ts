import { NextResponse } from "next/server";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";
import {
  getAgentEvaluations,
  runBenchmarkEvaluation,
  DEFAULT_BENCHMARKS,
} from "@/lib/governance/evals";

export async function GET(request: Request) {
  try {
    const auth = await requireApiWorkspaceContext("viewer");
    if (auth.error) return auth.error;

    const { context } = auth;
    const url = new URL(request.url);
    const agentId = url.searchParams.get("agentId") || undefined;

    const evaluations = await getAgentEvaluations(context.workspace.id, agentId);
    return NextResponse.json({
      success: true,
      evaluations,
      availableBenchmarks: Object.keys(DEFAULT_BENCHMARKS),
    });
  } catch (error: any) {
    console.error("GET /api/governance/evals error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to load evaluations." },
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

    if (!body.agentId || !body.versionId) {
      return NextResponse.json(
        { success: false, error: "agentId and versionId are required to run an evaluation." },
        { status: 400 }
      );
    }

    const benchmarkName = body.benchmarkName || "lead-qualification-v1";
    const evaluation = await runBenchmarkEvaluation(
      context.workspace.id,
      body.agentId,
      body.versionId,
      benchmarkName,
      body.testCases
    );

    return NextResponse.json({ success: true, evaluation });
  } catch (error: any) {
    console.error("POST /api/governance/evals error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to execute evaluation." },
      { status: 500 }
    );
  }
}
