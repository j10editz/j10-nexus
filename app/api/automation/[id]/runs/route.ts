import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type WorkflowRunStep = {
  id: string;
  run_id: string;
  workflow_id: string;
  user_id: string;
  step_order: number;
  action_type: string;
  action_label: string;
  status:
    | "Pending"
    | "Running"
    | "Completed"
    | "Blocked"
    | "Skipped"
    | "Failed";
  output: Record<string, unknown>;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
};

type WorkflowRun = {
  id: string;
  workflow_id: string;
  user_id: string;
  status:
    | "Running"
    | "Completed"
    | "Blocked"
    | "Failed";
  trigger_type: string | null;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  steps: WorkflowRunStep[];
};

async function getSupabase() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },

        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(
              ({
                name,
                value,
                options,
              }) => {
                cookieStore.set(
                  name,
                  value,
                  options
                );
              }
            );
          } catch {
            // Cookie writes may not be available
            // in every server context.
          }
        },
      },
    }
  );
}

export async function GET(
  _request: Request,
  context: RouteContext
) {
  try {
    const { id } =
      await context.params;

    const supabase =
      await getSupabase();

    /*
    ============================================================
    AUTH
    ============================================================
    */

    const {
      data: { user },
      error: userError,
    } =
      await supabase.auth.getUser();

    if (
      userError ||
      !user
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized.",
        },
        {
          status: 401,
        }
      );
    }

    /*
    ============================================================
    VERIFY WORKFLOW
    ============================================================
    */

    const {
      data: workflow,
      error: workflowError,
    } = await supabase
      .from("workflows")
      .select(
        `
        id,
        name,
        status,
        runs_count,
        last_run_at
        `
      )
      .eq("id", id)
      .eq(
        "user_id",
        user.id
      )
      .single();

    if (
      workflowError ||
      !workflow
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Workflow not found.",
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

    const {
      data: runRows,
      error: runsError,
    } = await supabase
      .from("workflow_runs")
      .select(
        `
        id,
        workflow_id,
        user_id,
        status,
        trigger_type,
        started_at,
        completed_at,
        error_message,
        metadata,
        created_at
        `
      )
      .eq(
        "workflow_id",
        id
      )
      .eq(
        "user_id",
        user.id
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      )
      .limit(50);

    if (runsError) {
      console.error(
        "Workflow runs load error:",
        runsError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Could not load workflow executions.",
        },
        {
          status: 500,
        }
      );
    }

    const runList =
      runRows ?? [];

    /*
    ============================================================
    NO EXECUTIONS YET
    ============================================================
    */

    if (
      runList.length === 0
    ) {
      return NextResponse.json({
        success: true,

        workflow,

        runs: [],

        latestExecution:
          null,

        summary: {
          total: 0,
          completed: 0,
          blocked: 0,
          failed: 0,
          running: 0,
        },
      });
    }

    /*
    ============================================================
    LOAD ALL STEPS FOR THESE RUNS
    ============================================================
    */

    const runIds =
      runList.map(
        (run) => run.id
      );

    const {
      data: stepRows,
      error: stepsError,
    } = await supabase
      .from(
        "workflow_run_steps"
      )
      .select(
        `
        id,
        run_id,
        workflow_id,
        user_id,
        step_order,
        action_type,
        action_label,
        status,
        output,
        error_message,
        started_at,
        completed_at,
        created_at
        `
      )
      .in(
        "run_id",
        runIds
      )
      .eq(
        "user_id",
        user.id
      )
      .order(
        "step_order",
        {
          ascending: true,
        }
      );

    if (stepsError) {
      console.error(
        "Workflow run steps load error:",
        stepsError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Could not load workflow execution steps.",
        },
        {
          status: 500,
        }
      );
    }

    const stepList =
      (stepRows ??
        []) as WorkflowRunStep[];

    /*
    ============================================================
    ATTACH STEPS TO EACH EXECUTION
    ============================================================
    */

    const runs: WorkflowRun[] =
      runList.map(
        (run) => {
          const steps =
            stepList
              .filter(
                (step) =>
                  step.run_id ===
                  run.id
              )
              .sort(
                (a, b) =>
                  a.step_order -
                  b.step_order
              );

          return {
            ...run,
            steps,
          } as WorkflowRun;
        }
      );

    /*
    ============================================================
    EXECUTION SUMMARY
    ============================================================
    */

    const summary = {
      total:
        runs.length,

      completed:
        runs.filter(
          (run) =>
            run.status ===
            "Completed"
        ).length,

      blocked:
        runs.filter(
          (run) =>
            run.status ===
            "Blocked"
        ).length,

      failed:
        runs.filter(
          (run) =>
            run.status ===
            "Failed"
        ).length,

      running:
        runs.filter(
          (run) =>
            run.status ===
            "Running"
        ).length,
    };

    /*
    ============================================================
    RESPONSE
    ============================================================
    */

    return NextResponse.json({
      success: true,

      workflow,

      runs,

      latestExecution:
        runs[0] ?? null,

      summary,
    });
  } catch (error) {
    console.error(
      "Workflow runs API error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "J10 NEXUS could not load workflow execution history.",
      },
      {
        status: 500,
      }
    );
  }
}