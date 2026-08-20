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

import type {
  SupabaseClient,
} from "@supabase/supabase-js";

import {
  executeAutomationAction,
  isAutomationActionType,
  isProtectedAutomationAction,
} from "@/lib/automation/action-engine";

import {
  evaluateAutomationCondition,
} from "@/lib/automation/condition-engine";

import {
  buildRetryMetadata,
  getAutomationStepFailurePolicy,
  resolveAutomationFailure,
  shouldSimulateDevelopmentFailure,
  waitForRetry,
} from "@/lib/automation/failure-policy";

import {
  assertWorkflowWithinDeadline,
  getAutomationExecutionGuardrails,
  getAutomationTimeoutMetadata,
  shouldSimulateDevelopmentTimeout,
  withAutomationTimeout,
} from "@/lib/automation/execution-guardrails";

import {
  executeApprovedCrmMutation,
} from "@/lib/automation/crm-mutation-adapter";

import {
  buildWorkflowCollaborationSnapshot,
  buildWorkflowTaskInput,
  cloneWorkflowContext,
  createWorkflowStepOutput,
  interpolateWorkflowTemplate,
  rebuildWorkflowContext,
  setWorkflowStepOutput,
} from "@/lib/automation/workflow-context";

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
  config: Record<string, unknown>;
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
  employee_id: string | null;
  employee_name: string | null;
  ai_task_id: string | null;
  status: string;
  requires_approval: boolean;
  approval_status: string;
  input_payload: Record<string, unknown> | null;
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
    result_data?: Record<string, unknown> | null;
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


function validateForwardBranchTarget(
  steps: AutomationStep[],
  currentStepOrder: number,
  targetStepOrder:
    | number
    | null
) {
  if (
    targetStepOrder ===
    null
  ) {
    return null;
  }

  if (
    targetStepOrder <=
    currentStepOrder
  ) {
    throw new Error(
      `J10 blocked a backward branch from Step ${currentStepOrder} to Step ${targetStepOrder}.`
    );
  }

  const targetExists =
    steps.some(
      (candidate) =>
        candidate.step_order ===
        targetStepOrder
    );

  if (!targetExists) {
    throw new Error(
      `J10 branch target Step ${targetStepOrder} does not exist or is disabled.`
    );
  }

  return targetStepOrder;
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


function getErrorMessage(
  error: unknown,
  fallback: string
) {
  return error instanceof Error &&
    error.message.trim()
    ? error.message
    : fallback;
}

async function getStepAttemptNumber(args: {
  supabase: SupabaseClient;
  userId: string;
  runId: string;
  automationStepId: string;
}) {
  const {
    data,
    error,
  } =
    await args.supabase
      .from(
        "automation_run_steps"
      )
      .select(
        "id"
      )
      .eq(
        "run_id",
        args.runId
      )
      .eq(
        "automation_step_id",
        args.automationStepId
      )
      .eq(
        "user_id",
        args.userId
      )
      .eq(
        "status",
        "failed"
      );

  if (error) {
    throw new Error(
      "J10 could not determine the retry attempt number."
    );
  }

  return (
    data?.length ??
    0
  ) + 1;
}

function createFailedStepOutput(args: {
  step: AutomationStep;
  errorMessage: string;
  attempt: number;
  policy: string;
}) {
  return createWorkflowStepOutput({
    stepId:
      args.step.id,

    stepOrder:
      args.step.step_order,

    stepName:
      args.step.name,

    stepType:
      args.step.step_type,

    actionType:
      args.step.action_type,

    employeeId:
      args.step.employee_id,

    employeeName:
      args.step.employee_name,

    status:
      "failed",

    resultText:
      args.errorMessage,

    resultData: {
      failed:
        true,

      error:
        args.errorMessage,

      attempt:
        args.attempt,

      failurePolicy:
        args.policy,
    },
  });
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
        config,
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
        employee_id,
        employee_name,
        ai_task_id,
        status,
        requires_approval,
        approval_status,
        input_payload
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

  const workflowContext =
    rebuildWorkflowContext({
      triggerPayload:
        run.trigger_payload ??
        {},
      automation: {
        id: automation.id,
        name: automation.name,
        triggerType: run.trigger_type,
      },
      run: {
        id: run.id,
        executionMode:
          run.execution_mode,
        startedAt:
          run.started_at,
      },
      runSteps:
        existingRunSteps,
    });

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
      !existing.automation_step_id
    ) {
      continue;
    }

    const current =
      latestByAutomationStep.get(
        existing.automation_step_id
      );

    const priority = (
      candidate: ExistingRunStep
    ) => {
      if (
        candidate.status ===
          "queued" &&
        candidate.approval_status ===
          "approved"
      ) {
        return 100;
      }

      if (
        candidate.status ===
          "awaiting_approval" &&
        candidate.approval_status ===
          "pending"
      ) {
        return 90;
      }

      if (
        candidate.status ===
          "completed"
      ) {
        return 80;
      }

      if (
        candidate.status ===
          "running"
      ) {
        return 70;
      }

      if (
        candidate.status ===
          "failed"
      ) {
        return 60;
      }

      if (
        candidate.status ===
          "skipped"
      ) {
        return 50;
      }

      return 0;
    };

    if (
      !current ||
      priority(existing) >
        priority(current)
    ) {
      latestByAutomationStep.set(
        existing.automation_step_id,
        existing
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

  /*
  ============================================================
  13M FIX — ACTIVE EXECUTION SEGMENT

  Human approval time is intentionally excluded from workflow
  runtime guardrails. The original run.started_at remains the
  audit timestamp, while continuationStartedAt measures only the
  active server-side execution segment after approval/resume.
  ============================================================
  */

  const continuationStartedAt =
    new Date().toISOString();

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

  let activeBranchTargetStepOrder:
    | number
    | null = null;

  let currentStep:
    AutomationStep | null =
    null;

  let currentAttempt =
    1;

  let currentContextBefore:
    Record<string, unknown> | null =
    null;

  try {
    for (
      const step of steps
    ) {
      /*
      ==========================================================
      13E TARGETED BRANCH SKIP
      ==========================================================
      */

      if (
        activeBranchTargetStepOrder !==
          null &&
        step.step_order <
          activeBranchTargetStepOrder
      ) {
        const branchContext =
          cloneWorkflowContext(
            workflowContext
          );

        const existingSkipped =
          latestByAutomationStep.get(
            step.id
          );

        if (
          existingSkipped?.status !==
          "skipped"
        ) {
          const {
            error:
              targetedSkipError,
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

                  workflow_context:
                    branchContext,

                  continuation:
                    true,

                  branch: {
                    skipped:
                      true,

                    branch_type:
                      "targeted_jump",

                    target_step_order:
                      activeBranchTargetStepOrder,

                    reason:
                      `Skipped by J10 targeted branch to Step ${activeBranchTargetStepOrder}.`,
                  },
                },
              });

          if (
            targetedSkipError
          ) {
            throw new Error(
              `Could not record targeted branch skip for Step ${step.step_order}.`
            );
          }
        }

        continue;
      }

      if (
        activeBranchTargetStepOrder ===
        step.step_order
      ) {
        activeBranchTargetStepOrder =
          null;
      }

      const existing =
        latestByAutomationStep.get(
          step.id
        );

      currentStep =
        step;

      currentAttempt =
        await getStepAttemptNumber({
          supabase,

          userId:
            user.id,

          runId:
            run.id,

          automationStepId:
            step.id,
        });

      const contextBefore =
        cloneWorkflowContext(
          workflowContext
        );

      currentContextBefore =
        contextBefore as unknown as Record<
          string,
          unknown
        >;

      const resolvedInstructions =
        interpolateWorkflowTemplate(
          step.instructions,
          workflowContext
        );

      const executionGuardrails =
        getAutomationExecutionGuardrails(
          step.config
        );

      const stepStartedAtMs =
        Date.now();

      assertWorkflowWithinDeadline({
        runStartedAt:
          continuationStartedAt,

        guardrails:
          executionGuardrails,

        label:
          `${automation.name} / Step ${step.step_order}`,
      });

      if (
        step.step_type !==
        "approval"
      ) {
        const simulatedTimeout =
          shouldSimulateDevelopmentTimeout({
            config:
              step.config,

            attempt:
              currentAttempt,

            executionMode:
              run.execution_mode,

            guardrails:
              executionGuardrails,
          });

        if (simulatedTimeout) {
          throw simulatedTimeout;
        }
      }

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

                workflow_context:
                  contextBefore,

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

      if (
        step.step_type !==
        "approval"
      ) {
        const simulatedFailure =
          shouldSimulateDevelopmentFailure({
            config:
              step.config,

            attempt:
              currentAttempt,

            executionMode:
              run.execution_mode,
          });

        if (
          simulatedFailure
        ) {
          throw new Error(
            simulatedFailure
          );
        }
      }

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

              input_payload: {
                trigger:
                  run.trigger_payload ??
                  {},
                workflow_context:
                  contextBefore,
              },
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

        const collaborationBefore =
          buildWorkflowCollaborationSnapshot(
            contextBefore
          );

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

                workflow_context:
                  contextBefore,

                collaboration:
                  collaborationBefore,

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
          buildWorkflowTaskInput(
            contextBefore
          );

        const createTaskResponse =
          await withAutomationTimeout(
            () =>
              fetch(
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
                    resolvedInstructions?.trim() ||
                    `Continue Step ${step.step_order} for workflow "${automation.name}".`,

                  inputText:
                    taskInput,
                }),
            }
              ),

            {
              runStartedAt:
                continuationStartedAt,

              stepStartedAtMs,

              guardrails:
                executionGuardrails,

              label:
                `AI task creation at Step ${step.step_order}`,
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
          await withAutomationTimeout(
            () =>
              fetch(
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
              ),

            {
              runStartedAt:
                continuationStartedAt,

              stepStartedAtMs,

              guardrails:
                executionGuardrails,

              label:
                `AI employee execution at Step ${step.step_order}`,
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

        const stepOutput =
          createWorkflowStepOutput({
            stepId: step.id,
            stepOrder: step.step_order,
            stepName: step.name,
            stepType: step.step_type,
            actionType:
              step.action_type ??
              "run_ai_employee",
            employeeId: step.employee_id,
            employeeName: step.employee_name,
            aiTaskId,
            resultText:
              task?.result_text ??
              null,
            resultData: {
              ...(
                task?.result_data &&
                typeof task.result_data ===
                  "object" &&
                !Array.isArray(
                  task.result_data
                )
                  ? task.result_data
                  : {}
              ),

              taskStatus:
                task?.status ??
                "completed",

              executionMode:
                task?.execution_mode ??
                run.execution_mode,

              apiCalled:
                Boolean(
                  task?.api_called
                ),

              estimatedCostUSD:
                safeCost(
                  task?.estimated_cost_usd
                ),

              exactEmployeeBinding:
                true,

              sourceEmployeeId:
                step.employee_id,

              sourceEmployeeName:
                step.employee_name,

              collaboration: {
                receivedUpstreamContext:
                  true,

                upstreamAIStepCount:
                  collaborationBefore.aiStepCount,

                upstreamCollaboratorCount:
                  collaborationBefore.collaboratorCount,

                upstreamCollaborators:
                  collaborationBefore.collaborators,
              },
            },
          });

        setWorkflowStepOutput(
          workflowContext,
          stepOutput
        );

        await supabase
          .from(
            "automation_run_steps"
          )
          .update({
            status:
              "completed",
            input_payload: {
              trigger:
                run.trigger_payload ??
                {},
              workflow_context:
                contextBefore,

              collaboration:
                collaborationBefore,

              continuation:
                true,

              retry:
                buildRetryMetadata({
                  attempt:
                    currentAttempt,

                  policy:
                    getAutomationStepFailurePolicy(
                      step.config
                    ),
                }),

              output:
                stepOutput,
            },
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

        const approvalAlreadyGranted =
          existing?.approval_status ===
            "approved" &&
          existing.status ===
            "queued";

        /*
        ========================================================
        HUMAN-APPROVED PROTECTED CRM MUTATION
        ========================================================

        This is the only path that may perform add_crm_note or
        update_crm_status. The action must already have an
        approved queued run-step created by the approval route.
        ========================================================
        */

        if (
          isProtectedAutomationAction(
            actionType
          ) &&
          approvalAlreadyGranted &&
          existing
        ) {
          currentRunStepId =
            existing.id;

          const mutationResult =
            await executeApprovedCrmMutation({
              supabase,

              userId:
                user.id,

              userEmail:
                user.email,

              workflowId:
                automation.id,

              workflowName:
                automation.name,

              runId:
                run.id,

              stepId:
                step.id,

              stepOrder:
                step.step_order,

              stepName:
                step.name,

              actionType,

              instructions:
                resolvedInstructions,

              triggerPayload:
                run.trigger_payload ??
                {},

              origin:
                request.nextUrl.origin,

              cookieHeader:
                request.headers.get(
                  "cookie"
                ) ?? "",
            });

          const mutationStepOutput =
            createWorkflowStepOutput({
              stepId: step.id,
              stepOrder: step.step_order,
              stepName: step.name,
              stepType: step.step_type,
              actionType,
              employeeId: step.employee_id,
              employeeName: step.employee_name,
              resultText:
                mutationResult.resultText,
              resultData: {
                contactId:
                  mutationResult.contactId,
                contactName:
                  mutationResult.contactName,
                previousStatus:
                  mutationResult.previousStatus,
                newStatus:
                  mutationResult.newStatus,
                noteAdded:
                  mutationResult.noteAdded,
                automationEvent:
                  mutationResult.automationEvent,
              },
            });

          setWorkflowStepOutput(
            workflowContext,
            mutationStepOutput
          );

          const {
            error:
              completeApprovedMutationError,
          } =
            await supabase
              .from(
                "automation_run_steps"
              )
              .update({
                status:
                  "completed",

                input_payload: {
                  ...(
                    existing.input_payload ??
                    {}
                  ),

                  continuation:
                    true,

                  workflow_context:
                    contextBefore,

                  retry:
                    buildRetryMetadata({
                      attempt:
                        currentAttempt,

                      policy:
                        getAutomationStepFailurePolicy(
                          step.config
                        ),
                    }),

                  output:
                    mutationStepOutput,

                  approved_mutation: {
                    success:
                      mutationResult.success,

                    action_type:
                      mutationResult.actionType,

                    contact_id:
                      mutationResult.contactId,

                    contact_name:
                      mutationResult.contactName,

                    previous_status:
                      mutationResult.previousStatus,

                    new_status:
                      mutationResult.newStatus,

                    note_added:
                      mutationResult.noteAdded,

                    result_text:
                      mutationResult.resultText,

                    automation_event:
                      mutationResult.automationEvent,
                  },
                },
              })
              .eq(
                "id",
                existing.id
              )
              .eq(
                "user_id",
                user.id
              );

          if (
            completeApprovedMutationError
          ) {
            throw new Error(
              `CRM mutation succeeded, but J10 could not finalize Step ${step.step_order}.`
            );
          }

          completedSteps +=
            1;

          currentRunStepId =
            null;

          continue;
        }

        /*
        ========================================================
        EXPLICIT APPROVAL GATE

        A safe action may also be manually configured to require
        approval. If it was already approved, execution continues
        instead of creating a second approval request.
        ========================================================
        */

        if (
          step.requires_approval &&
          !approvalAlreadyGranted
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

                  workflow_context:
                    contextBefore,

                  continuation:
                    true,

                  pending_action: {
                    action_type:
                      actionType,

                    instructions:
                      resolvedInstructions,
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

        /*
        ========================================================
        EXECUTE SAFE J10 BUSINESS ACTION
        ========================================================
        */

        const actionResult =
          await withAutomationTimeout(
            () =>
              executeAutomationAction({
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
              resolvedInstructions,

            triggerPayload:
              run.trigger_payload ??
              {},

            workflowContext:
              workflowContext as unknown as Record<string, unknown>,

            employeeId:
              step.employee_id,

            employeeName:
              step.employee_name,
              }),

            {
              runStartedAt:
                continuationStartedAt,

              stepStartedAtMs,

              guardrails:
                executionGuardrails,

              label:
                `Action Engine execution at Step ${step.step_order}`,
            }
          );

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

        /*
        ========================================================
        ACTION ENGINE SAFETY APPROVAL

        Protected actions reach this block when no prior human
        approval exists. No side effect has been performed.
        ========================================================
        */

        if (
          actionResult.status ===
            "awaiting_approval" ||
          actionResult.requiresHumanApproval
        ) {
          if (
            approvalAlreadyGranted
          ) {
            throw new Error(
              `J10 Safety Engine refused to re-request approval for Step ${step.step_order}.`
            );
          }

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

                  workflow_context:
                    contextBefore,

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

        /*
        ========================================================
        COMPLETE BUSINESS ACTION

        If this safe action was explicitly human-approved, reuse
        its queued run-step so history shows one clean step.
        ========================================================
        */

        const actionStepOutput =
          createWorkflowStepOutput({
            stepId: step.id,
            stepOrder: step.step_order,
            stepName: step.name,
            stepType: step.step_type,
            actionType,
            employeeId: step.employee_id,
            employeeName: step.employee_name,
            resultText:
              actionResult.resultText,
            resultData:
              actionResult.metadata,
          });

        setWorkflowStepOutput(
          workflowContext,
          actionStepOutput
        );

        if (
          approvalAlreadyGranted &&
          existing
        ) {
          const {
            error:
              approvedSafeActionError,
          } =
            await supabase
              .from(
                "automation_run_steps"
              )
              .update({
                status:
                  "completed",

                input_payload: {
                  ...(
                    existing.input_payload ??
                    {}
                  ),

                  continuation:
                    true,

                  workflow_context:
                    contextBefore,

                  retry:
                    buildRetryMetadata({
                      attempt:
                        currentAttempt,

                      policy:
                        getAutomationStepFailurePolicy(
                          step.config
                        ),
                    }),

                  output:
                    actionStepOutput,

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
              .eq(
                "id",
                existing.id
              )
              .eq(
                "user_id",
                user.id
              );

          if (
            approvedSafeActionError
          ) {
            throw new Error(
              `Could not finalize approved Step ${step.step_order}.`
            );
          }

          completedSteps +=
            1;

          currentRunStepId =
            null;

          continue;
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

                workflow_context:
                  contextBefore,

                continuation:
                  true,

                retry:
                  buildRetryMetadata({
                    attempt:
                      currentAttempt,

                    policy:
                      getAutomationStepFailurePolicy(
                        step.config
                      ),
                  }),

                output:
                  actionStepOutput,

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

        completedSteps +=
          1;

        currentRunStepId =
          null;

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

            context:
              workflowContext,
          });

        const conditionStepOutput =
          createWorkflowStepOutput({
            stepId: step.id,
            stepOrder: step.step_order,
            stepName: step.name,
            stepType: "condition",
            actionType:
              "evaluate_condition",
            resultText:
              evaluation.branchTargetStepOrder !==
              null
                ? `Condition matched: ${evaluation.matched}. Branch target: Step ${evaluation.branchTargetStepOrder}.`
                : `Condition matched: ${evaluation.matched}. Branch action: ${evaluation.branchAction}.`,
            resultData: {
              expression:
                evaluation.expression,
              field:
                evaluation.field,
              operator:
                evaluation.operator,
              expectedValue:
                evaluation.expectedValue,
              actualValue:
                evaluation.actualValue,
              matched:
                evaluation.matched,
              branchAction:
                evaluation.branchAction,
              onTrue:
                evaluation.onTrue,
              onFalse:
                evaluation.onFalse,
              onTrueStep:
                evaluation.onTrueStep,
              onFalseStep:
                evaluation.onFalseStep,
              branchTargetStepOrder:
                evaluation.branchTargetStepOrder,
            },
          });

        setWorkflowStepOutput(
          workflowContext,
          conditionStepOutput
        );

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

                workflow_context:
                  contextBefore,

                continuation:
                  true,

                retry:
                  buildRetryMetadata({
                    attempt:
                      currentAttempt,

                    policy:
                      getAutomationStepFailurePolicy(
                        step.config
                      ),
                  }),

                output:
                  conditionStepOutput,

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

                  on_true_step:
                    evaluation.onTrueStep,

                  on_false_step:
                    evaluation.onFalseStep,

                  branch_target_step_order:
                    evaluation.branchTargetStepOrder,
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
          evaluation.branchTargetStepOrder !==
          null
        ) {
          activeBranchTargetStepOrder =
            validateForwardBranchTarget(
              steps,
              step.step_order,
              evaluation.branchTargetStepOrder
            );

          continue;
        }

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
      getErrorMessage(
        error,
        "J10 workflow continuation failed."
      );

    const failedAt =
      new Date().toISOString();

    console.error(
      "J10 workflow continuation error:",
      error
    );

    if (
      currentStep
    ) {
      const failurePolicy =
        getAutomationStepFailurePolicy(
          currentStep.config
        );

      let failureResolution =
        resolveAutomationFailure(
          failurePolicy,
          currentAttempt
        );

      /*
      ==========================================================
      SAFETY OVERRIDE

      Connected CRM mutations are never automatically retried
      after a failure because duplicate external side effects
      are higher risk than requiring another human decision.
      ==========================================================
      */

      if (
        failureResolution ===
          "retry" &&
        currentStep.action_type &&
        isProtectedAutomationAction(
          currentStep.action_type
        )
      ) {
        failureResolution =
          "human_review";
      }

      const failurePayload:
        Record<
          string,
          unknown
        > = {
        trigger:
          run.trigger_payload ??
          {},

        workflow_context:
          currentContextBefore ??
          {},

        continuation:
          true,

        retry:
          buildRetryMetadata({
            attempt:
              currentAttempt,

            policy:
              failurePolicy,

            resolution:
              failureResolution,
          }),

        failure: {
          message:
            errorMessage,

          failed_at:
            failedAt,

          resolution:
            failureResolution,
        },

        timeout:
          getAutomationTimeoutMetadata(
            error
          ),
      };

      if (
        failureResolution ===
        "continue"
      ) {
        failurePayload.output =
          createFailedStepOutput({
            step:
              currentStep,

            errorMessage,

            attempt:
              currentAttempt,

            policy:
              failurePolicy.mode,
          });
      }

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

            input_payload:
              failurePayload,
          })
          .eq(
            "id",
            currentRunStepId
          )
          .eq(
            "user_id",
            user.id
          );
      } else {
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
              currentStep.id,

            user_id:
              user.id,

            step_order:
              currentStep.step_order,

            step_type:
              currentStep.step_type,

            action_type:
              currentStep.action_type,

            employee_id:
              currentStep.employee_id,

            employee_name:
              currentStep.employee_name,

            ai_task_id:
              null,

            status:
              "failed",

            requires_approval:
              false,

            approval_status:
              "not_required",

            input_payload:
              failurePayload,
          });
      }

      currentRunStepId =
        null;

      /*
      ==========================================================
      RETRY CURRENT STEP
      ==========================================================
      */

      if (
        failureResolution ===
        "retry"
      ) {
        const {
          error:
            queueRetryError,
        } =
          await supabase
            .from(
              "automation_runs"
            )
            .update({
              status:
                "queued",

              current_step_order:
                currentStep.step_order,

              result_summary:
                `Step ${currentStep.step_order} failed on attempt ${currentAttempt}. Retry is queued.`,

              error_message:
                errorMessage,

              completed_at:
                null,
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
          queueRetryError
        ) {
          throw new Error(
            "J10 could not queue the failed workflow step for retry."
          );
        }

        await waitForRetry(
          failurePolicy
        );

        const retryResponse =
          await fetch(
            `${request.nextUrl.origin}/api/automation-runs/${encodeURIComponent(
              run.id
            )}/continue`,
            {
              method:
                "POST",

              headers: {
                "Content-Type":
                  "application/json",

                cookie:
                  request.headers.get(
                    "cookie"
                  ) ?? "",
              },

              cache:
                "no-store",
            }
          );

        const retryText =
          await retryResponse.text();

        let retryResult:
          Record<
            string,
            unknown
          > = {};

        if (
          retryText
        ) {
          try {
            retryResult =
              JSON.parse(
                retryText
              ) as Record<
                string,
                unknown
              >;
          } catch {
            retryResult = {
              success: false,
              error:
                "J10 retry returned an invalid response.",
            };
          }
        }

        return NextResponse.json(
          retryResult,
          {
            status:
              retryResponse.status,
          }
        );
      }

      /*
      ==========================================================
      CONTINUE DESPITE FAILURE
      ==========================================================
      */

      if (
        failureResolution ===
        "continue"
      ) {
        const nextStep =
          steps.find(
            (
              candidate
            ) =>
              candidate.step_order >
              currentStep!.step_order
          );

        if (
          !nextStep
        ) {
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
                `Workflow continuation completed with a tolerated failure at Step ${currentStep.step_order}.`,

              error_message:
                null,

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

              successful_executions:
                safeCounter(
                  automation.successful_executions
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

          return NextResponse.json({
            success: true,

            status:
              "completed",

            continuedAfterFailure:
              true,

            message:
              `Workflow completed after tolerating the failure at Step ${currentStep.step_order}.`,
          });
        }

        await supabase
          .from(
            "automation_runs"
          )
          .update({
            status:
              "queued",

            current_step_order:
              nextStep.step_order,

            result_summary:
              `Step ${currentStep.step_order} failed but the workflow policy allows continuation.`,

            error_message:
              null,

            completed_at:
              null,
          })
          .eq(
            "id",
            run.id
          )
          .eq(
            "user_id",
            user.id
          );

        const continueResponse =
          await fetch(
            `${request.nextUrl.origin}/api/automation-runs/${encodeURIComponent(
              run.id
            )}/continue`,
            {
              method:
                "POST",

              headers: {
                "Content-Type":
                  "application/json",

                cookie:
                  request.headers.get(
                    "cookie"
                  ) ?? "",
              },

              cache:
                "no-store",
            }
          );

        const continueText =
          await continueResponse.text();

        let continueResult:
          Record<
            string,
            unknown
          > = {};

        if (
          continueText
        ) {
          try {
            continueResult =
              JSON.parse(
                continueText
              ) as Record<
                string,
                unknown
              >;
          } catch {
            continueResult = {
              success: false,
              error:
                "J10 continuation returned an invalid response.",
            };
          }
        }

        return NextResponse.json(
          continueResult,
          {
            status:
              continueResponse.status,
          }
        );
      }

      /*
      ==========================================================
      HUMAN REVIEW
      ==========================================================
      */

      if (
        failureResolution ===
        "human_review"
      ) {
        const {
          data:
            reviewStep,
          error:
            reviewStepError,
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
                currentStep.id,

              user_id:
                user.id,

              step_order:
                currentStep.step_order,

              step_type:
                currentStep.step_type,

              action_type:
                "failure_review",

              employee_id:
                currentStep.employee_id,

              employee_name:
                currentStep.employee_name,

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

                workflow_context:
                  currentContextBefore ??
                  {},

                continuation:
                  true,

                failure_review: {
                  failed_step_order:
                    currentStep.step_order,

                  failed_step_name:
                    currentStep.name,

                  failed_step_type:
                    currentStep.step_type,

                  original_action_type:
                    currentStep.action_type,

                  error:
                    errorMessage,

                  attempt:
                    currentAttempt,

                  failure_policy:
                    failurePolicy,
                },
              },
            })
            .select(
              "id"
            )
            .single();

        if (
          reviewStepError ||
          !reviewStep
        ) {
          throw new Error(
            "J10 could not create the failure review approval gate."
          );
        }

        await supabase
          .from(
            "automation_runs"
          )
          .update({
            status:
              "awaiting_approval",

            current_step_order:
              currentStep.step_order,

            result_summary:
              `Step ${currentStep.step_order} failed and requires human review.`,

            error_message:
              errorMessage,

            completed_at:
              null,
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

        return NextResponse.json({
          success: true,

          status:
            "awaiting_approval",

          awaitingApproval:
            true,

          failureReview:
            true,

          message:
            `Step ${currentStep.step_order} failed and is waiting for human review.`,

          approval: {
            runStepId:
              reviewStep.id,

            automationStepId:
              currentStep.id,

            stepOrder:
              currentStep.step_order,

            stepName:
              currentStep.name,

            actionType:
              "failure_review",

            status:
              "pending",
          },
        });
      }
    }

    /*
    ============================================================
    DEFAULT STOP-ON-FAILURE
    ============================================================
    */

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