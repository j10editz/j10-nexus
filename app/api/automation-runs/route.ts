import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  cookies,
} from "next/headers";

import {
  createServerClient,
} from "@supabase/ssr";

import {
  rebuildWorkflowContext,
} from "@/lib/automation/workflow-context";

/*
============================================================
TYPES
============================================================
*/

type AutomationRun = {
  id: string;
  automation_id: string;
  user_id: string;
  trigger_type: string;
  trigger_payload: Record<string, unknown>;
  status: string;
  current_step_order: number | null;
  result_summary: string | null;
  error_message: string | null;
  execution_mode: string;
  api_called: boolean;
  total_cost_usd: number | string | null;
  started_at: string | null;
  completed_at: string | null;
};

type AutomationRunStep = {
  id: string;
  run_id: string;
  automation_id: string;
  automation_step_id: string | null;
  user_id: string;
  step_order: number;
  step_type: string;
  action_type: string | null;
  employee_id: string | null;
  employee_name: string | null;
  ai_task_id: string | null;
  status: string;
  requires_approval: boolean;
  approval_status: string;
  approved_by: string | null;
  approval_note: string | null;
  approved_at: string | null;
  input_payload: Record<string, unknown>;
};

type AutomationRow = {
  id: string;
  name: string;
};

type AITaskRow = {
  id: string;
  employee_id: string;
  employee_name: string;
  title: string;
  task_type: string;
  status: string;
  result_text: string | null;
  error_message: string | null;
  execution_mode: string;
  api_called: boolean;
  target_model: string | null;
  display_model: string | null;
  estimated_cost_usd:
    | number
    | string
    | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
};

type HistoryStep = {
  id: string;
  stepOrder: number;
  stepType: string;
  actionType: string | null;

  employee: {
    id: string | null;
    name: string | null;
  };

  status: string;

  approval: {
    required: boolean;
    status: string;
    approvedBy: string | null;
    note: string | null;
    approvedAt: string | null;
  };

  inputPayload:
    Record<string, unknown>;

  retry: {
    attempt: number;
    maxAttempts: number;
    isRetry: boolean;
    policy: string;
    resolution: string | null;
    previousAttempts: number;
  } | null;

  aiTask: {
    id: string;
    title: string;
    taskType: string;
    status: string;

    employeeId: string;
    employeeName: string;

    resultText: string | null;
    errorMessage: string | null;

    executionMode: string;
    apiCalled: boolean;

    targetModel: string | null;
    displayModel: string | null;

    estimatedCostUSD: number;

    startedAt: string | null;
    completedAt: string | null;
    createdAt: string;
  } | null;
};

/*
============================================================
SUPABASE
============================================================
*/

async function getSupabase() {
  const cookieStore =
    await cookies();

  return createServerClient(
    process.env
      .NEXT_PUBLIC_SUPABASE_URL!,
    process.env
      .NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },

        setAll(
          cookiesToSet
        ) {
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
            /*
            Cookie writes may not be available
            in every route-handler context.
            */
          }
        },
      },
    }
  );
}

/*
============================================================
HELPERS
============================================================
*/

function safeNumber(
  value:
    | number
    | string
    | null
    | undefined
) {
  const parsed =
    Number(value ?? 0);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

function getLimit(
  request: NextRequest
) {
  const rawLimit =
    Number(
      request.nextUrl.searchParams.get(
        "limit"
      ) ?? 25
    );

  if (
    !Number.isFinite(
      rawLimit
    )
  ) {
    return 25;
  }

  return Math.min(
    Math.max(
      Math.floor(
        rawLimit
      ),
      1
    ),
    100
  );
}


function isRecord(
  value: unknown
): value is Record<
  string,
  unknown
> {
  return (
    Boolean(value) &&
    typeof value ===
      "object" &&
    !Array.isArray(value)
  );
}

function readRetryHistory(
  inputPayload:
    Record<string, unknown>
) {
  const retry =
    inputPayload.retry;

  if (
    !isRecord(retry)
  ) {
    return null;
  }

  return {
    attempt:
      Math.max(
        0,
        Math.floor(
          safeNumber(
            retry.attempt as
              | number
              | string
              | null
              | undefined
          )
        )
      ),

    maxAttempts:
      Math.max(
        0,
        Math.floor(
          safeNumber(
            retry.maxAttempts as
              | number
              | string
              | null
              | undefined
          )
        )
      ),

    isRetry:
      Boolean(
        retry.isRetry
      ),

    policy:
      typeof retry.policy ===
        "string"
        ? retry.policy
        : "stop",

    resolution:
      typeof retry.resolution ===
        "string"
        ? retry.resolution
        : null,

    previousAttempts:
      Math.max(
        0,
        Math.floor(
          safeNumber(
            retry.previousAttempts as
              | number
              | string
              | null
              | undefined
          )
        )
      ),
  };
}

/*
============================================================
GET
EXECUTION HISTORY
============================================================
*/

export async function GET(
  request: NextRequest
) {
  try {
    const supabase =
      await getSupabase();

    const {
      data: {
        user,
      },

      error:
        userError,
    } =
      await supabase.auth.getUser();

    if (
      userError ||
      !user
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Unauthorized.",
        },
        {
          status: 401,
        }
      );
    }

    const automationId =
      request.nextUrl.searchParams.get(
        "automationId"
      );

    const status =
      request.nextUrl.searchParams.get(
        "status"
      );

    const limit =
      getLimit(request);

    /*
    ============================================================
    RUNS
    ============================================================
    */

    let runQuery =
      supabase
        .from(
          "automation_runs"
        )
        .select(
          `
          id,
          automation_id,
          user_id,
          trigger_type,
          trigger_payload,
          status,
          current_step_order,
          result_summary,
          error_message,
          execution_mode,
          api_called,
          total_cost_usd,
          started_at,
          completed_at
          `
        )
        .eq(
          "user_id",
          user.id
        )
        .order(
          "started_at",
          {
            ascending:
              false,
            nullsFirst:
              false,
          }
        )
        .limit(limit);

    if (
      automationId
    ) {
      runQuery =
        runQuery.eq(
          "automation_id",
          automationId
        );
    }

    if (
      status
    ) {
      runQuery =
        runQuery.eq(
          "status",
          status
        );
    }

    const {
      data:
        rawRuns,

      error:
        runsError,
    } =
      await runQuery;

    if (runsError) {
      console.error(
        "Execution history runs error:",
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

    const runs =
      (rawRuns ??
        []) as AutomationRun[];

    /*
    ============================================================
    EMPTY
    ============================================================
    */

    if (
      runs.length ===
      0
    ) {
      return NextResponse.json({
        success: true,

        summary: {
          total: 0,
          running: 0,
          completed: 0,
          failed: 0,
          queued: 0,
          awaitingApproval: 0,
          apiCalls: 0,
          totalCostUSD: 0,
        },

        runs: [],
      });
    }

    const runIds =
      runs.map(
        (run) =>
          run.id
      );

    const automationIds =
      Array.from(
        new Set(
          runs.map(
            (run) =>
              run.automation_id
          )
        )
      );

    /*
    ============================================================
    AUTOMATION NAMES
    ============================================================
    */

    const {
      data:
        rawAutomations,

      error:
        automationsError,
    } =
      await supabase
        .from(
          "automations"
        )
        .select(
          `
          id,
          name
          `
        )
        .eq(
          "user_id",
          user.id
        )
        .in(
          "id",
          automationIds
        );

    if (
      automationsError
    ) {
      console.error(
        "Execution history automation-name error:",
        automationsError
      );
    }

    const automations =
      (rawAutomations ??
        []) as AutomationRow[];

    const automationMap =
      new Map(
        automations.map(
          (
            automation
          ) => [
            automation.id,
            automation,
          ]
        )
      );

    /*
    ============================================================
    RUN STEPS
    ============================================================
    */

    const {
      data:
        rawRunSteps,

      error:
        runStepsError,
    } =
      await supabase
        .from(
          "automation_run_steps"
        )
        .select(
          `
          id,
          run_id,
          automation_id,
          automation_step_id,
          user_id,
          step_order,
          step_type,
          action_type,
          employee_id,
          employee_name,
          ai_task_id,
          status,
          requires_approval,
          approval_status,
          approved_by,
          approval_note,
          approved_at,
          input_payload
          `
        )
        .eq(
          "user_id",
          user.id
        )
        .in(
          "run_id",
          runIds
        )
        .order(
          "step_order",
          {
            ascending:
              true,
          }
        );

    if (
      runStepsError
    ) {
      console.error(
        "Execution history run-step error:",
        runStepsError
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

    const runSteps =
      (rawRunSteps ??
        []) as AutomationRunStep[];

    const rawStepsByRun =
      new Map<
        string,
        AutomationRunStep[]
      >();

    for (const step of runSteps) {
      const existing =
        rawStepsByRun.get(
          step.run_id
        ) ?? [];

      existing.push(step);
      rawStepsByRun.set(
        step.run_id,
        existing
      );
    }

    /*
    ============================================================
    AI TASKS
    ============================================================
    */

    const aiTaskIds =
      Array.from(
        new Set(
          runSteps
            .map(
              (
                step
              ) =>
                step.ai_task_id
            )
            .filter(
              (
                value
              ): value is string =>
                Boolean(
                  value
                )
            )
        )
      );

    let aiTasks:
      AITaskRow[] = [];

    if (
      aiTaskIds.length >
      0
    ) {
      const {
        data:
          rawTasks,

        error:
          tasksError,
      } =
        await supabase
          .from(
            "ai_tasks"
          )
          .select(
            `
            id,
            employee_id,
            employee_name,
            title,
            task_type,
            status,
            result_text,
            error_message,
            execution_mode,
            api_called,
            target_model,
            display_model,
            estimated_cost_usd,
            started_at,
            completed_at,
            created_at
            `
          )
          .eq(
            "user_id",
            user.id
          )
          .in(
            "id",
            aiTaskIds
          );

      if (
        tasksError
      ) {
        console.error(
          "Execution history AI task error:",
          tasksError
        );
      } else {
        aiTasks =
          (rawTasks ??
            []) as AITaskRow[];
      }
    }

    const aiTaskMap =
      new Map(
        aiTasks.map(
          (
            task
          ) => [
            task.id,
            task,
          ]
        )
      );

    /*
    ============================================================
    GROUP STEPS BY RUN
    ============================================================
    */

    const stepsByRun =
      new Map<
        string,
        HistoryStep[]
      >();

    for (
      const step of
        runSteps
    ) {
      const aiTask =
        step.ai_task_id
          ? aiTaskMap.get(
              step.ai_task_id
            ) ?? null
          : null;

      const historyStep:
        HistoryStep = {
        id:
          step.id,

        stepOrder:
          step.step_order,

        stepType:
          step.step_type,

        actionType:
          step.action_type,

        employee: {
          id:
            step.employee_id,

          name:
            step.employee_name,
        },

        status:
          step.status,

        approval: {
          required:
            step.requires_approval,

          status:
            step.approval_status,

          approvedBy:
            step.approved_by,

          note:
            step.approval_note,

          approvedAt:
            step.approved_at,
        },

        inputPayload:
          step.input_payload ??
          {},

        retry:
          readRetryHistory(
            step.input_payload ??
            {}
          ),

        aiTask:
          aiTask
            ? {
                id:
                  aiTask.id,

                title:
                  aiTask.title,

                taskType:
                  aiTask.task_type,

                status:
                  aiTask.status,

                employeeId:
                  aiTask.employee_id,

                employeeName:
                  aiTask.employee_name,

                resultText:
                  aiTask.result_text,

                errorMessage:
                  aiTask.error_message,

                executionMode:
                  aiTask.execution_mode,

                apiCalled:
                  aiTask.api_called,

                targetModel:
                  aiTask.target_model,

                displayModel:
                  aiTask.display_model,

                estimatedCostUSD:
                  safeNumber(
                    aiTask.estimated_cost_usd
                  ),

                startedAt:
                  aiTask.started_at,

                completedAt:
                  aiTask.completed_at,

                createdAt:
                  aiTask.created_at,
              }
            : null,
      };

      const existing =
        stepsByRun.get(
          step.run_id
        ) ?? [];

      existing.push(
        historyStep
      );

      stepsByRun.set(
        step.run_id,
        existing
      );
    }

    /*
    ============================================================
    RESPONSE
    ============================================================
    */

    const history =
      runs.map(
        (
          run
        ) => {
          const automation =
            automationMap.get(
              run.automation_id
            );

          return {
            id:
              run.id,

            automationId:
              run.automation_id,

            automationName:
              automation?.name ??
              "Unknown Workflow",

            triggerType:
              run.trigger_type,

            triggerPayload:
              run.trigger_payload ??
              {},

            status:
              run.status,

            currentStepOrder:
              run.current_step_order,

            resultSummary:
              run.result_summary,

            errorMessage:
              run.error_message,

            executionMode:
              run.execution_mode,

            apiCalled:
              run.api_called,

            totalCostUSD:
              safeNumber(
                run.total_cost_usd
              ),

            startedAt:
              run.started_at,

            completedAt:
              run.completed_at,

            workflowContext:
              rebuildWorkflowContext({
                triggerPayload:
                  run.trigger_payload ??
                  {},
                automation: {
                  id:
                    run.automation_id,
                  name:
                    automation?.name ??
                    "Unknown Workflow",
                  triggerType:
                    run.trigger_type,
                },
                run: {
                  id:
                    run.id,
                  executionMode:
                    run.execution_mode,
                  startedAt:
                    run.started_at,
                },
                runSteps:
                  rawStepsByRun.get(
                    run.id
                  ) ?? [],
              }),

            steps:
              stepsByRun.get(
                run.id
              ) ?? [],
          };
        }
      );

    const summary = {
      total:
        runs.length,

      running:
        runs.filter(
          (
            run
          ) =>
            run.status ===
            "running"
        ).length,

      completed:
        runs.filter(
          (
            run
          ) =>
            run.status ===
            "completed"
        ).length,

      failed:
        runs.filter(
          (
            run
          ) =>
            run.status ===
            "failed"
        ).length,

      queued:
        runs.filter(
          (
            run
          ) =>
            run.status ===
            "queued"
        ).length,

      awaitingApproval:
        runs.filter(
          (
            run
          ) =>
            run.status ===
            "awaiting_approval"
        ).length,

      apiCalls:
        runs.filter(
          (
            run
          ) =>
            run.api_called
        ).length,

      totalCostUSD:
        runs.reduce(
          (
            total,
            run
          ) =>
            total +
            safeNumber(
              run.total_cost_usd
            ),
          0
        ),
    };

    return NextResponse.json({
      success: true,
      summary,
      runs:
        history,
    });
  } catch (error) {
    console.error(
      "J10 execution history error:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : "Could not load J10 execution history.",
      },
      {
        status: 500,
      }
    );
  }
}
