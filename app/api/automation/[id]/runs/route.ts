import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/auth";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(
  _request: Request,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: "Workflow ID is required.",
        },
        {
          status: 400,
        }
      );
    }

    const auth = await requireApiWorkspaceContext("viewer");
    if (auth.error) {
      return auth.error;
    }
    const { context: wsContext } = auth;
    const supabase = createServerSupabaseClient();

    /*
    ============================================================
    VERIFY WORKFLOW / AUTOMATION
    ============================================================
    */

    const { data: workflow, error: workflowError } = await supabase
      .from("automations")
      .select(
        `
        id,
        name,
        status,
        last_run_at,
        total_executions,
        successful_executions,
        failed_executions
        `
      )
      .eq("id", id)
      .eq("workspace_id", wsContext.workspace.id)
      .maybeSingle();

    if (workflowError || !workflow) {
      return NextResponse.json(
        {
          success: false,
          error: "Workflow not found.",
        },
        {
          status: 404,
        }
      );
    }

    /*
    ============================================================
    LOAD EXECUTIONS
    ============================================================
    */

    const { data: runRows, error: runsError } = await supabase
      .from("automation_runs")
      .select(
        `
        id,
        automation_id,
        user_id,
        status,
        trigger_type,
        started_at,
        completed_at,
        error_message,
        execution_mode,
        total_cost_usd,
        created_at
        `
      )
      .eq("automation_id", id)
      .eq("workspace_id", wsContext.workspace.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (runsError) {
      console.error("Workflow runs load error:", runsError);

      return NextResponse.json(
        {
          success: false,
          error: "Could not load workflow executions.",
        },
        {
          status: 500,
        }
      );
    }

    const runList = runRows ?? [];

    const summary = {
      total: runList.length,
      completed: runList.filter((run) => run.status === "completed" || run.status === "Completed").length,
      blocked: runList.filter((run) => run.status === "awaiting_approval" || run.status === "Blocked").length,
      failed: runList.filter((run) => run.status === "failed" || run.status === "Failed").length,
      running: runList.filter((run) => run.status === "running" || run.status === "Running").length,
    };

    return NextResponse.json({
      success: true,
      workflow,
      runs: runList,
      latestExecution: runList[0] ?? null,
      summary,
    });
  } catch (error) {
    console.error("Workflow runs API error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "J10 NEXUS could not load workflow execution history.",
      },
      {
        status: 500,
      }
    );
  }
}