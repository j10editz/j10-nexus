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
  executeAutomationAction,
  isAutomationActionType,
} from "@/lib/automation/action-engine";

import {
  evaluateAutomationCondition,
} from "@/lib/automation/condition-engine";

type RouteContext = {
  params: Promise<{
    runId: string;
  }>;
};

type AutomationStep = {
  id: string;
  step_order: number;
  name: string | null;
  step_type:
    | "ai_task"
    | "action"
    | "condition"
    | "approval"
    | "activity";
  action_type: string | null;
  employee_id: string | null;
  employee_name: string | null;
  task_type: string | null;
  instructions: string | null;
  requires_approval: boolean;
  approval_type: string | null;
  is_enabled: boolean;
};

type ExistingRunStep = {
  id: string;
  automation_step_id: string | null;
  step_order: number;
  step_type: string;
  action_type: string | null;
  status: string;
  requires_approval: boolean;
  approval_status: string;
};

type CreateTaskResponse = {
  success: boolean;
  error?: string;
  task?: {
    id: string;
    employee_id: string;
    employee_name: string;
    status: string;
  };
};

type RunTaskResponse = {
  success: boolean;
  error?: string;
  task?: {
    id: string;
    status: string;
    result_text?: string | null;
    error_message?: string | null;
    execution_mode?: string | null;
    api_called?: boolean;
    estimated_cost_usd?: number | string | null;
  };
  binding?: {
    employeeId?: string;
  };
};

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
            // Cookie writes may not be available in every route context.
          }
        },
      },
    }
  );
}

function safeCost(
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

function safeCounter(
  value:
    | number
    | null
    | undefined
) {
  const parsed =
    Number(value ?? 0);

  return Number.isFinite(parsed)
    ? Math.max(0, parsed)
    : 0;
}

async function parseJsonResponse<T>(
  response: Response
): Promise<T> {
  const text =
    await response.text();

  if (!text) {
    return {} as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      `J10 received an invalid API response (${response.status}).`
    );
  }
}

function isProtectedWrite(
  step: AutomationStep
) {
  return (
    step.step_type ===
      "action" &&
    (
      step.action_type ===
        "add_crm_note" ||
      step.action_type ===
        "update_crm_status"
    )
  );
}

/*
============================================================
POST
CONTINUE A QUEUED WORKFLOW RUN
============================================================
*/

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  const {
    runId,
  } = await context.params;

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

  /*
  ============================================================
  LOAD RUN
  ============================================================
  */

  const {
    data:
      run,
    error:
      runError,
  } =
    await supabase
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
        "id",
        runId
      )
      .eq(
        "user_id",
        user.id
      )
      .maybeSingle();

  if (
    runError ||
    !run
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          runError
            ? "Could not load workflow execution."
            : "Workflow execution not found.",
      },
      {
        status:
          runError
            ? 500
            : 404,
      }
    );
  }

  if (
    run.status !==
    "queued"
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          `Workflow execution must be queued before continuation. Current status: ${run.status}.`,
      },
      {
        status: 409,
      }
    );
  }

  /*
  ============================================================
  LOAD AUTOMATION
  ============================================================
  */

  const {
    data:
      automation,
    error:
      automationError,
  } =
    await supabase
      .from(
        "automations"
      )
      .select(
        `
        id,
        name,
        status,
        successful_executions,
        failed_executions,
        awaiting_approval_executions
        `
      )
      .eq(
        "id",
        run.automation_id
      )
      .eq(
        "user_id",
        user.id
      )
      .maybeSingle();

  if (
    automationError ||
    !automation
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Could not load workflow continuation context.",
      },
      {
        status: 500,
      }
    );
  }

  if (
    automation.status !==
    "active"
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Only active workflows can continue.",
      },
      {
        status: 409,
      }
    );
  }

  /*
  ============================================================
  LOAD STEPS
  ============================================================
  */

  const startOrder =
    run.current_step_order;

  if (
    startOrder ===
      null ||
    startOrder ===
      undefined
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Queued workflow has no continuation step.",
      },
      {
        status: 409,
      }
    );
  }

  const {
    data:
      rawSteps,
    error:
      stepsError,
  } =
    await supabase
      .from(
        "automation_steps"
      )
      .select(
        `
        id,
        step_order,
        name,
        step_type,
        action_type,
        employee_id,
        employee_name,
        task_type,
        instructions,
        requires_approval,
        approval_type,
        is_enabled
        `
      )
      .eq(
        "automation_id",
        automation.id
      )
      .eq(
        "user_id",
        user.id
      )
      .eq(
        "is_enabled",
        true
      )
      .gte(
        "step_order",
        startOrder
      )
      .order(
        "step_order",
        {
          ascending:
            true,
        }
      );

  if (stepsError) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Could not load continuation steps.",
      },
      {
        status: 500,
      }
    );
  }

  const steps =
    (rawSteps ??
      []) as AutomationStep[];

  /*
  ============================================================
  LOAD EXISTING RUN STEPS
  ============================================================
  */

  const {
    data:
      rawExistingRunSteps,
    error:
      existingRunStepsError,
  } =
    await supabase
      .from(
        "automation_run_steps"
      )
      .select(
        `
        id,
        automation_step_id,
        step_order,
        step_type,
        action_type,
        status,
        requires_approval,
        approval_status
        `
      )
      .eq(
        "run_id",
        run.id
      )
      .eq(
        "user_id",
        user.id
      )
      .order(
        "step_order",
        {
          ascending:
            true,
        }
      );

  if (
    existingRunStepsError
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Could not load workflow execution history.",
      },
      {
        status: 500,
      }
    );
  }

  const existingRunSteps =
    (rawExistingRunSteps ??
      []) as ExistingRunStep[];

  const latestByAutomationStep =
    new Map<
      string,
      ExistingRunStep
    >();

  for (
    const existing of
      existingRunSteps
  ) {
    if (
      existing.automation_step_id
    ) {
      latestByAutomationStep.set(
        existing.automation_step_id,
        existing
      );
    }
  }

  /*
  ============================================================
  PROTECTED WRITE SAFETY
  12G continues normal approved workflows.
  Approved CRM write requests remain queued until a dedicated
  CRM mutation adapter is implemented. We do NOT fake the write.
  ============================================================
  */

  const firstStep =
    steps[0];

  if (
    firstStep &&
    isProtectedWrite(
      firstStep
    )
  ) {
    const existing =
      latestByAutomationStep.get(
        firstStep.id
      );

    if (
      existing &&
      existing.approval_status ===
        "approved" &&
      existing.status ===
        "queued"
    ) {
      return NextResponse.json(
        {
          success: true,

          status:
            "queued",

          continuationBlocked:
            true,

          protectedAction:
            true,

          message:
            "Human approval is recorded. The protected CRM write remains safely queued until the CRM mutation adapter is connected.",

          run: {
            id:
              run.id,

            currentStepOrder:
              firstStep.step_order,
          },

          action: {
            stepId:
              firstStep.id,

            stepOrder:
              firstStep.step_order,

            actionType:
              firstStep.action_type,
          },
        }
      );
    }
  }

  /*
  ============================================================
  LOCK RUN
  ============================================================
  */

  const {
    data:
      lockedRun,
    error:
      lockError,
  } =
    await supabase
      .from(
        "automation_runs"
      )
      .update({
        status:
          "running",

        error_message:
          null,
      })
      .eq(
        "id",
        run.id
      )
      .eq(
        "user_id",
        user.id
      )
      .eq(
        "status",
        "queued"
      )
      .select(
        `
        id,
        status
        `
      )
      .maybeSingle();

  if (
    lockError ||
    !lockedRun
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Workflow continuation could not acquire the execution lock.",
      },
      {
        status: 409,
      }
    );
  }

  let currentRunStepId:
    | string
    | null = null;

  let workflowApiCalled =
    Boolean(
      run.api_called
    );

  let workflowCost =
    safeCost(
      run.total_cost_usd
    );

  let completedSteps =
    0;

  let skipNextStepOrder:
    | number
    | null = null;

  try {
    for (
      const step of steps
    ) {
      const existing =
        latestByAutomationStep.get(
          step.id
        );

      /*
      ==========================================================
      CONDITION BRANCH SKIP
      ==========================================================
      */

      if (
        skipNextStepOrder ===
        step.step_order
      ) {
        const {
          error:
            skippedStepError,
        } =
          await supabase
            .from(
              "automation_run_steps"
            )
            .insert({
              run_id:
                run.id,

              automation_id:
                automation.id,

              automation_step_id:
                step.id,

              user_id:
                user.id,

              step_order:
                step.step_order,

              step_type:
                step.step_type,

              action_type:
                step.action_type,

              employee_id:
                step.employee_id,

              employee_name:
                step.employee_name,

              ai_task_id:
                null,

              status:
                "skipped",

              requires_approval:
                false,

              approval_status:
                "not_required",

              input_payload: {
                trigger:
                  run.trigger_payload ??
                  {},

                continuation:
                  true,

                branch: {
                  skipped:
                    true,

                  reason:
                    "Skipped by the previous J10 condition step.",
                },
              },
            });

        if (
          skippedStepError
        ) {
          throw new Error(
            `Could not record skipped Step ${step.step_order}.`
          );
        }

        skipNextStepOrder =
          null;

        continue;
      }

      /*
      ==========================================================
      ALREADY COMPLETED / APPROVED
      ==========================================================
      */

      if (
        existing?.status ===
          "completed"
      ) {
        continue;
      }

      if (
        step.step_type ===
          "approval" &&
        existing?.approval_status ===
          "approved"
      ) {
        continue;
      }

      await supabase
        .from(
          "automation_runs"
        )
        .update({
          current_step_order:
            step.step_order,
        })
        .eq(
          "id",
          run.id
        )
        .eq(
          "user_id",
          user.id
        );

      /*
      ==========================================================
      APPROVAL
      ==========================================================
      */

      if (
        step.step_type ===
        "approval"
      ) {
        if (
          existing?.approval_status ===
            "pending" &&
          existing.status ===
            "awaiting_approval"
        ) {
          await supabase
            .from(
              "automation_runs"
            )
            .update({
              status:
                "awaiting_approval",

              current_step_order:
                step.step_order,

              result_summary:
                `Workflow is waiting at Step ${step.step_order}: ${step.name ?? "Human Approval"}.`,
            })
            .eq(
              "id",
              run.id
            )
            .eq(
              "user_id",
              user.id
            );

          return NextResponse.json({
            success: true,

            status:
              "awaiting_approval",

            awaitingApproval:
              true,

            message:
              `Workflow is already waiting for human approval at Step ${step.step_order}.`,
          });
        }

        const {
          data:
            approvalRunStep,
          error:
            approvalStepError,
        } =
          await supabase
            .from(
              "automation_run_steps"
            )
            .insert({
              run_id:
                run.id,

              automation_id:
                automation.id,

              automation_step_id:
                step.id,

              user_id:
                user.id,

              step_order:
                step.step_order,

              step_type:
                "approval",

              action_type:
                "human_approval",

              employee_id:
                null,

              employee_name:
                null,

              ai_task_id:
                null,

              status:
                "awaiting_approval",

              requires_approval:
                true,

              approval_status:
                "pending",

              input_payload:
                run.trigger_payload ??
                {},
            })
            .select(
              `
              id,
              step_order
              `
            )
            .single();

        if (
          approvalStepError ||
          !approvalRunStep
        ) {
          throw new Error(
            `Could not create approval Step ${step.step_order}.`
          );
        }

        currentRunStepId =
          approvalRunStep.id;

        const awaitingAt =
          new Date().toISOString();

        await supabase
          .from(
            "automation_runs"
          )
          .update({
            status:
              "awaiting_approval",

            current_step_order:
              step.step_order,

            result_summary:
              `Workflow paused at Step ${step.step_order}: ${step.name ?? "Human Approval"}.`,

            api_called:
              workflowApiCalled,

            total_cost_usd:
              workflowCost,
          })
          .eq(
            "id",
            run.id
          )
          .eq(
            "user_id",
            user.id
          );

        await supabase
          .from(
            "automations"
          )
          .update({
            awaiting_approval_executions:
              safeCounter(
                automation.awaiting_approval_executions
              ) + 1,

            updated_at:
              awaitingAt,
          })
          .eq(
            "id",
            automation.id
          )
          .eq(
            "user_id",
            user.id
          );

        return NextResponse.json({
          success: true,

          status:
            "awaiting_approval",

          awaitingApproval:
            true,

          message:
            `Workflow reached Step ${step.step_order} and is waiting for human approval.`,

          approval: {
            runStepId:
              approvalRunStep.id,

            stepOrder:
              step.step_order,

            stepName:
              step.name,
          },
        });
      }

      /*
      ==========================================================
      AI EMPLOYEE TASK
      ==========================================================
      */

      if (
        step.step_type ===
        "ai_task"
      ) {
        if (
          !step.employee_id
        ) {
          throw new Error(
            `Step ${step.step_order} has no AI employee binding.`
          );
        }

        const {
          data:
            runStep,
          error:
            runStepError,
        } =
          await supabase
            .from(
              "automation_run_steps"
            )
            .insert({
              run_id:
                run.id,

              automation_id:
                automation.id,

              automation_step_id:
                step.id,

              user_id:
                user.id,

              step_order:
                step.step_order,

              step_type:
                "ai_task",

              action_type:
                step.action_type ??
                "run_ai_employee",

              employee_id:
                step.employee_id,

              employee_name:
                step.employee_name,

              ai_task_id:
                null,

              status:
                "running",

              requires_approval:
                false,

              approval_status:
                "not_required",

              input_payload: {
                trigger:
                  run.trigger_payload ??
                  {},

                continuation:
                  true,
              },
            })
            .select(
              `
              id
              `
            )
            .single();

        if (
          runStepError ||
          !runStep
        ) {
          throw new Error(
            `Could not start AI Step ${step.step_order}.`
          );
        }

        currentRunStepId =
          runStep.id;

        const origin =
          request.nextUrl.origin;

        const cookieHeader =
          request.headers.get(
            "cookie"
          ) ?? "";

        const taskInput =
          Object.keys(
            run.trigger_payload ??
              {}
          ).length > 0
            ? JSON.stringify(
                run.trigger_payload,
                null,
                2
              )
            : `Continuation of workflow: ${automation.name}`;

        const createTaskResponse =
          await fetch(
            `${origin}/api/ai-tasks`,
            {
              method:
                "POST",

              headers: {
                "Content-Type":
                  "application/json",

                cookie:
                  cookieHeader,
              },

              cache:
                "no-store",

              body:
                JSON.stringify({
                  employeeId:
                    step.employee_id,

                  title:
                    step.name ??
                    `${automation.name} - Step ${step.step_order}`,

                  taskType:
                    step.task_type ??
                    "general",

                  instructions:
                    step.instructions?.trim() ||
                    `Continue Step ${step.step_order} for workflow "${automation.name}".`,

                  inputText:
                    taskInput,
                }),
            }
          );

        const createTaskResult =
          await parseJsonResponse<CreateTaskResponse>(
            createTaskResponse
          );

        if (
          !createTaskResponse.ok ||
          !createTaskResult.success ||
          !createTaskResult.task
        ) {
          throw new Error(
            createTaskResult.error ||
            `Could not create AI task for Step ${step.step_order}.`
          );
        }

        if (
          createTaskResult.task.employee_id !==
          step.employee_id
        ) {
          throw new Error(
            `J10 blocked an AI employee binding mismatch at Step ${step.step_order}.`
          );
        }

        const aiTaskId =
          createTaskResult.task.id;

        await supabase
          .from(
            "automation_run_steps"
          )
          .update({
            ai_task_id:
              aiTaskId,
          })
          .eq(
            "id",
            runStep.id
          )
          .eq(
            "user_id",
            user.id
          );

        const runTaskResponse =
          await fetch(
            `${origin}/api/ai-tasks/${encodeURIComponent(
              aiTaskId
            )}/run`,
            {
              method:
                "POST",

              headers: {
                "Content-Type":
                  "application/json",

                cookie:
                  cookieHeader,
              },

              cache:
                "no-store",
            }
          );

        const runTaskResult =
          await parseJsonResponse<RunTaskResponse>(
            runTaskResponse
          );

        if (
          !runTaskResponse.ok ||
          !runTaskResult.success
        ) {
          throw new Error(
            runTaskResult.error ||
            `AI task execution failed at Step ${step.step_order}.`
          );
        }

        if (
          runTaskResult.binding
            ?.employeeId &&
          runTaskResult.binding.employeeId !==
            step.employee_id
        ) {
          throw new Error(
            `J10 blocked an AI employee execution mismatch at Step ${step.step_order}.`
          );
        }

        const task =
          runTaskResult.task;

        workflowApiCalled =
          workflowApiCalled ||
          Boolean(
            task?.api_called
          );

        workflowCost +=
          safeCost(
            task?.estimated_cost_usd
          );

        await supabase
          .from(
            "automation_run_steps"
          )
          .update({
            status:
              "completed",
          })
          .eq(
            "id",
            runStep.id
          )
          .eq(
            "user_id",
            user.id
          );

        completedSteps += 1;
        currentRunStepId = null;
        continue;
      }

      /*
      ==========================================================
      BUSINESS ACTION / ACTIVITY
      ==========================================================
      */

      if (
        step.step_type ===
          "action" ||
        step.step_type ===
          "activity"
      ) {
        const actionType =
          step.step_type ===
          "activity"
            ? "record_activity"
            : step.action_type;

        if (
          !actionType ||
          !isAutomationActionType(
            actionType
          )
        ) {
          throw new Error(
            `Step ${step.step_order} has an unsupported business action.`
          );
        }

        if (
          step.requires_approval
        ) {
          const {
            data:
              approvalRunStep,
            error:
              approvalRunStepError,
          } =
            await supabase
              .from(
                "automation_run_steps"
              )
              .insert({
                run_id:
                  run.id,

                automation_id:
                  automation.id,

                automation_step_id:
                  step.id,

                user_id:
                  user.id,

                step_order:
                  step.step_order,

                step_type:
                  step.step_type,

                action_type:
                  actionType,

                employee_id:
                  step.employee_id,

                employee_name:
                  step.employee_name,

                ai_task_id:
                  null,

                status:
                  "awaiting_approval",

                requires_approval:
                  true,

                approval_status:
                  "pending",

                input_payload: {
                  trigger:
                    run.trigger_payload ??
                    {},

                  continuation:
                    true,

                  pending_action: {
                    action_type:
                      actionType,

                    instructions:
                      step.instructions,
                  },
                },
              })
              .select(
                `
                id
                `
              )
              .single();

          if (
            approvalRunStepError ||
            !approvalRunStep
          ) {
            throw new Error(
              `Could not create approval gate for Step ${step.step_order}.`
            );
          }

          currentRunStepId =
            approvalRunStep.id;

          await supabase
            .from(
              "automation_runs"
            )
            .update({
              status:
                "awaiting_approval",

              current_step_order:
                step.step_order,

              result_summary:
                `Workflow is waiting for approval before Step ${step.step_order}.`,
            })
            .eq(
              "id",
              run.id
            )
            .eq(
              "user_id",
              user.id
            );

          await supabase
            .from(
              "automations"
            )
            .update({
              awaiting_approval_executions:
                safeCounter(
                  automation.awaiting_approval_executions
                ) + 1,

              updated_at:
                new Date().toISOString(),
            })
            .eq(
              "id",
              automation.id
            )
            .eq(
              "user_id",
              user.id
            );

          return NextResponse.json({
            success: true,

            status:
              "awaiting_approval",

            awaitingApproval:
              true,

            message:
              `Workflow is waiting for human approval before Step ${step.step_order}.`,
          });
        }

        const actionResult =
          await executeAutomationAction({
            actionType,

            workflowId:
              automation.id,

            workflowName:
              automation.name,

            stepId:
              step.id,

            stepOrder:
              step.step_order,

            stepName:
              step.name,

            instructions:
              step.instructions,

            triggerPayload:
              run.trigger_payload ??
              {},

            employeeId:
              step.employee_id,

            employeeName:
              step.employee_name,
          });

        if (
          !actionResult.success ||
          actionResult.status ===
            "failed"
        ) {
          throw new Error(
            actionResult.resultText ||
            `Business action failed at Step ${step.step_order}.`
          );
        }

        if (
          actionResult.status ===
            "awaiting_approval" ||
          actionResult.requiresHumanApproval
        ) {
          const {
            data:
              approvalRunStep,
            error:
              approvalRunStepError,
          } =
            await supabase
              .from(
                "automation_run_steps"
              )
              .insert({
                run_id:
                  run.id,

                automation_id:
                  automation.id,

                automation_step_id:
                  step.id,

                user_id:
                  user.id,

                step_order:
                  step.step_order,

                step_type:
                  step.step_type,

                action_type:
                  actionType,

                employee_id:
                  step.employee_id,

                employee_name:
                  step.employee_name,

                ai_task_id:
                  null,

                status:
                  "awaiting_approval",

                requires_approval:
                  true,

                approval_status:
                  "pending",

                input_payload: {
                  trigger:
                    run.trigger_payload ??
                    {},

                  action_result: {
                    status:
                      actionResult.status,

                    result_text:
                      actionResult.resultText,

                    side_effect_blocked:
                      actionResult.sideEffectBlocked,

                    metadata:
                      actionResult.metadata,
                  },
                },
              })
              .select(
                `
                id
                `
              )
              .single();

          if (
            approvalRunStepError ||
            !approvalRunStep
          ) {
            throw new Error(
              `Could not create Action Engine approval at Step ${step.step_order}.`
            );
          }

          currentRunStepId =
            approvalRunStep.id;

          await supabase
            .from(
              "automation_runs"
            )
            .update({
              status:
                "awaiting_approval",

              current_step_order:
                step.step_order,

              result_summary:
                actionResult.resultText,
            })
            .eq(
              "id",
              run.id
            )
            .eq(
              "user_id",
              user.id
            );

          await supabase
            .from(
              "automations"
            )
            .update({
              awaiting_approval_executions:
                safeCounter(
                  automation.awaiting_approval_executions
                ) + 1,

              updated_at:
                new Date().toISOString(),
            })
            .eq(
              "id",
              automation.id
            )
            .eq(
              "user_id",
              user.id
            );

          return NextResponse.json({
            success: true,

            status:
              "awaiting_approval",

            awaitingApproval:
              true,

            message:
              `Business Action at Step ${step.step_order} requires human approval.`,
          });
        }

        const {
          error:
            completedActionStepError,
        } =
          await supabase
            .from(
              "automation_run_steps"
            )
            .insert({
              run_id:
                run.id,

              automation_id:
                automation.id,

              automation_step_id:
                step.id,

              user_id:
                user.id,

              step_order:
                step.step_order,

              step_type:
                step.step_type,

              action_type:
                actionType,

              employee_id:
                step.employee_id,

              employee_name:
                step.employee_name,

              ai_task_id:
                null,

              status:
                "completed",

              requires_approval:
                false,

              approval_status:
                "not_required",

              input_payload: {
                trigger:
                  run.trigger_payload ??
                  {},

                continuation:
                  true,

                action_result: {
                  status:
                    actionResult.status,

                  result_text:
                    actionResult.resultText,

                  side_effect_blocked:
                    actionResult.sideEffectBlocked,

                  metadata:
                    actionResult.metadata,
                },
              },
            });

        if (
          completedActionStepError
        ) {
          throw new Error(
            `Could not save completed action Step ${step.step_order}.`
          );
        }

        completedSteps += 1;
        currentRunStepId = null;
        continue;
      }

      /*
      ==========================================================
      CONDITION ENGINE
      ==========================================================
      */

      if (
        step.step_type ===
        "condition"
      ) {
        const evaluation =
          evaluateAutomationCondition({
            instructions:
              step.instructions,

            context: {
              trigger:
                run.trigger_payload ??
                {},

              workflow: {
                id:
                  automation.id,

                name:
                  automation.name,

                triggerType:
                  run.trigger_type,
              },

              execution: {
                mode:
                  run.execution_mode,
              },
            },
          });

        const {
          error:
            conditionStepError,
        } =
          await supabase
            .from(
              "automation_run_steps"
            )
            .insert({
              run_id:
                run.id,

              automation_id:
                automation.id,

              automation_step_id:
                step.id,

              user_id:
                user.id,

              step_order:
                step.step_order,

              step_type:
                "condition",

              action_type:
                "evaluate_condition",

              employee_id:
                null,

              employee_name:
                null,

              ai_task_id:
                null,

              status:
                "completed",

              requires_approval:
                false,

              approval_status:
                "not_required",

              input_payload: {
                trigger:
                  run.trigger_payload ??
                  {},

                continuation:
                  true,

                condition: {
                  expression:
                    evaluation.expression,

                  field:
                    evaluation.field,

                  operator:
                    evaluation.operator,

                  expected_value:
                    evaluation.expectedValue,

                  actual_value:
                    evaluation.actualValue,

                  matched:
                    evaluation.matched,

                  branch_action:
                    evaluation.branchAction,

                  on_true:
                    evaluation.onTrue,

                  on_false:
                    evaluation.onFalse,
                },
              },
            });

        if (
          conditionStepError
        ) {
          throw new Error(
            `Could not save condition Step ${step.step_order}.`
          );
        }

        completedSteps +=
          1;

        if (
          evaluation.branchAction ===
          "skip_next"
        ) {
          const nextStep =
            steps.find(
              (
                candidate
              ) =>
                candidate.step_order >
                step.step_order
            );

          skipNextStepOrder =
            nextStep?.step_order ??
            null;

          continue;
        }

        if (
          evaluation.branchAction ===
          "stop"
        ) {
          const conditionCompletedAt =
            new Date().toISOString();

          const {
            error:
              stopRunError,
          } =
            await supabase
              .from(
                "automation_runs"
              )
              .update({
                status:
                  "completed",

                current_step_order:
                  null,

                result_summary:
                  `Workflow continuation stopped by condition at Step ${step.step_order}. Condition matched: ${evaluation.matched}.`,

                error_message:
                  null,

                api_called:
                  workflowApiCalled,

                total_cost_usd:
                  workflowCost,

                completed_at:
                  conditionCompletedAt,
              })
              .eq(
                "id",
                run.id
              )
              .eq(
                "user_id",
                user.id
              );

          if (
            stopRunError
          ) {
            throw new Error(
              "J10 condition completed but the workflow continuation could not be finalized."
            );
          }

          await supabase
            .from(
              "automations"
            )
            .update({
              last_run_at:
                conditionCompletedAt,

              successful_executions:
                safeCounter(
                  automation.successful_executions
                ) + 1,

              updated_at:
                conditionCompletedAt,
            })
            .eq(
              "id",
              automation.id
            )
            .eq(
              "user_id",
              user.id
            );

          return NextResponse.json({
            success: true,

            status:
              "completed",

            conditionStopped:
              true,

            message:
              `Workflow continuation stopped safely at condition Step ${step.step_order}.`,

            condition: {
              stepOrder:
                step.step_order,

              matched:
                evaluation.matched,

              branchAction:
                evaluation.branchAction,
            },

            run: {
              id:
                run.id,

              status:
                "completed",

              completedSteps,

              apiCalled:
                workflowApiCalled,

              totalCostUSD:
                workflowCost,
            },
          });
        }

        continue;
      }

      throw new Error(
        `Step ${step.step_order} uses an unsupported workflow step type.`
      );
    }

    /*
    ============================================================
    COMPLETE RUN
    ============================================================
    */

    const completedAt =
      new Date().toISOString();

    const {
      error:
        finishRunError,
    } =
      await supabase
        .from(
          "automation_runs"
        )
        .update({
          status:
            "completed",

          current_step_order:
            null,

          result_summary:
            `Workflow continuation completed successfully. ${completedSteps} additional step(s) executed.`,

          error_message:
            null,

          api_called:
            workflowApiCalled,

          total_cost_usd:
            workflowCost,

          completed_at:
            completedAt,
        })
        .eq(
          "id",
          run.id
        )
        .eq(
          "user_id",
          user.id
        );

    if (
      finishRunError
    ) {
      throw new Error(
        "Workflow continuation finished but could not finalize the run."
      );
    }

    await supabase
      .from(
        "automations"
      )
      .update({
        last_run_at:
          completedAt,

        successful_executions:
          safeCounter(
            automation.successful_executions
          ) + 1,

        updated_at:
          completedAt,
      })
      .eq(
        "id",
        automation.id
      )
      .eq(
        "user_id",
        user.id
      );

    return NextResponse.json({
      success: true,

      status:
        "completed",

      message:
        "Workflow continuation completed successfully.",

      run: {
        id:
          run.id,

        status:
          "completed",

        completedSteps,

        apiCalled:
          workflowApiCalled,

        totalCostUSD:
          workflowCost,
      },
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "J10 workflow continuation failed.";

    const failedAt =
      new Date().toISOString();

    console.error(
      "J10 workflow continuation error:",
      error
    );

    if (
      currentRunStepId
    ) {
      await supabase
        .from(
          "automation_run_steps"
        )
        .update({
          status:
            "failed",
        })
        .eq(
          "id",
          currentRunStepId
        )
        .eq(
          "user_id",
          user.id
        );
    }

    await supabase
      .from(
        "automation_runs"
      )
      .update({
        status:
          "failed",

        error_message:
          errorMessage,

        result_summary:
          errorMessage,

        completed_at:
          failedAt,
      })
      .eq(
        "id",
        run.id
      )
      .eq(
        "user_id",
        user.id
      );

    await supabase
      .from(
        "automations"
      )
      .update({
        last_run_at:
          failedAt,

        failed_executions:
          safeCounter(
            automation.failed_executions
          ) + 1,

        updated_at:
          failedAt,
      })
      .eq(
        "id",
        automation.id
      )
      .eq(
        "user_id",
        user.id
      );

    return NextResponse.json(
      {
        success: false,
        error:
          errorMessage,
      },
      {
        status: 500,
      }
    );
  }
}