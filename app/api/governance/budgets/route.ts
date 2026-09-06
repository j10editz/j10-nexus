import { NextResponse } from "next/server";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";
import {
  getAgentBudget,
  upsertAgentBudget,
  evaluateBudgetAllowance,
} from "@/lib/governance/budgets";

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

    const checkAllowance = url.searchParams.get("checkAllowance") === "true";
    if (checkAllowance) {
      const estimatedCost = parseFloat(url.searchParams.get("estimatedCost") || "0.05");
      const utilization = await evaluateBudgetAllowance(
        context.workspace.id,
        agentId,
        estimatedCost
      );
      return NextResponse.json({ success: true, utilization });
    }

    const budget = await getAgentBudget(context.workspace.id, agentId);
    return NextResponse.json({ success: true, budget });
  } catch (error: any) {
    console.error("GET /api/governance/budgets error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to load budget." },
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

    if (!body.agentId) {
      return NextResponse.json(
        { success: false, error: "agentId is required." },
        { status: 400 }
      );
    }

    const budget = await upsertAgentBudget(context.workspace.id, body.agentId, {
      dailyBudgetUsd: body.dailyBudgetUsd,
      monthlyBudgetUsd: body.monthlyBudgetUsd,
      maxCostPerExecutionUsd: body.maxCostPerExecutionUsd,
      overBudgetPolicy: body.overBudgetPolicy,
    });

    return NextResponse.json({ success: true, budget });
  } catch (error: any) {
    console.error("PUT /api/governance/budgets error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update budget." },
      { status: 500 }
    );
  }
}
