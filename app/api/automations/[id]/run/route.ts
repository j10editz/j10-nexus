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

type TriggerSource =
  | "manual"
  | "new_crm_contact"
  | "crm_status_changed"
  | "new_ai_task"
  | "ai_task_completed"
  | "schedule";

const SUPPORTED_TRIGGER_SOURCES: TriggerSource[] = [
  "manual",
  "new_crm_contact",
  "crm_status_changed",
  "new_ai_task",
  "ai_task_completed",
  "schedule",
];

function normalizeTriggerSource(
  value: unknown
): TriggerSource {
  return typeof value === "string" &&
    SUPPORTED_TRIGGER_SOURCES.includes(
      value as TriggerSource
    )
    ? (value as TriggerSource)
    : "manual";
}

function getEventDepth(
  payload: Record<string, unknown>
) {
  const meta =
    payload.__j10_event;

  if (
    !meta ||
    typeof meta !== "object" ||
    Array.isArray(meta)
  ) {
    return 0;
  }

  const depth =
    Number(
      (
        meta as Record<
          string,
          unknown
        >
      ).depth ?? 0
    );

  return Number.isFinite(depth)
    ? Math.max(
        0,
        Math.floor(depth)
      )
    : 0;
}

type RouteContext = {
  params: Promise<{
    id: string;
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

type CreateTaskResponse = {
  success: boolean;
  error?: string;

  task?: {
    id: string;
    employee_id: string;
    employee_name: string;
    status: string;
  };

  employee?: {
    id: string;
    name: string;
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

function getExecutionMode() {
  return process.env.J10_AI_MODE === "live"
    ? "live"
    : "development";
}

async function getSupabase() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env
      .NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
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
            /*
            Cookie mutation may not be available
            in every route-handler context.
            */
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
  const parsed = Number(value ?? 0);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

async function parseJsonResponse<T>(
  response: Response
): Promise<T> {
  const text = await response.text();

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


function formatActionName(
  value: string
) {
  return value
    .replace(/_/g, " ")
    .replace(
      /\b\w/g,
      (character) =>
        character.toUpperCase()
    );
}

/*
============================================================
POST
WORKFLOW TRIGGER

Supports:
- manual workflows from the J10 dashboard
- CRM event workflows
- AI task event workflows
- scheduled workflows from the J10 scheduler route
============================================================
*/

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  const startedAt =
    new Date().toISOString();

  const executionMode =
    getExecutionMode();

  let runId:
    | string
    | null = null;

  let currentRunStepId:
    | string
    | null = null;

  let automationId =
    "";

  try {
    const {
      id,
    } = await context.params;

    automationId = id;

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
    TRIGGER PAYLOAD
    ============================================================
    */

    let triggerPayload:
      Record<
        string,
        unknown
      > = {};

    let triggerSource:
      TriggerSource =
      "manual";

    try {
      const body =
        await request.json();

      if (
        body &&
        typeof body ===
          "object" &&
        !Array.isArray(
          body
        )
      ) {
        const parsedBody =
          body as {
            triggerPayload?: Record<
              string,
              unknown
            >;

            triggerSource?: unknown;
          };

        triggerPayload =
          parsedBody.triggerPayload &&
          typeof parsedBody.triggerPayload ===
            "object" &&
          !Array.isArray(
            parsedBody.triggerPayload
          )
            ? parsedBody.triggerPayload
            : {};

        triggerSource =
          normalizeTriggerSource(
            parsedBody.triggerSource
          );
      }
    } catch {
      triggerPayload =
        {};

      triggerSource =
        "manual";
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
          user_id,
          name,
          description,
          status,
          trigger_type,
          trigger_config,
          total_executions,
          successful_executions,
          failed_executions,
          awaiting_approval_executions
          `
        )
        .eq(
          "id",
          id
        )
        .eq(
          "user_id",
          user.id
        )
        .maybeSingle();

    if (automationError) {
      console.error(
        "Automation trigger lookup error:",
        automationError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Could not load workflow.",
        },
        {
          status: 500,
        }
      );
    }

    if (!automation) {
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
    SAFETY
    ============================================================
    */

    if (
      automation.status !==
      "active"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Only active workflows can run.",
        },
        {
          status: 409,
        }
      );
    }

    if (
      !SUPPORTED_TRIGGER_SOURCES.includes(
        automation.trigger_type as TriggerSource
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "This workflow trigger type is not supported by the J10 execution engine.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      automation.trigger_type !==
      triggerSource
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            `Workflow expects trigger "${automation.trigger_type}" but received "${triggerSource}".`,
        },
        {
          status: 400,
        }
      );
    }

    /*
    ============================================================
    LOAD STEPS
    ============================================================
    */

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
        .order(
          "step_order",
          {
            ascending:
              true,
          }
        );

    if (stepsError) {
      console.error(
        "Automation trigger steps error:",
        stepsError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Could not load workflow steps.",
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
    CREATE RUN
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
        .insert({
          automation_id:
            automation.id,

          user_id:
            user.id,

          trigger_type:
            triggerSource,

          trigger_payload:
            triggerPayload,

          status:
            "running",

          current_step_order:
            steps[0]
              ?.step_order ??
            null,

          execution_mode:
            executionMode,

          api_called:
            false,

          total_cost_usd:
            0,

          started_at:
            startedAt,
        })
        .select(
          `
          id,
          automation_id,
          user_id,
          trigger_type,
          status,
          current_step_order,
          execution_mode,
          api_called,
          total_cost_usd,
          started_at
          `
        )
        .single();

    if (
      runError ||
      !run
    ) {
      console.error(
        "Automation run create error:",
        runError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Could not create workflow execution.",
        },
        {
          status: 500,
        }
      );
    }

    runId =
      run.id;

    /*
    ============================================================
    EMPTY WORKFLOW
    ============================================================
    */

    if (
      steps.length ===
      0
    ) {
      const completedAt =
        new Date().toISOString();

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
            "Workflow completed with no enabled steps.",

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

      await supabase
        .from(
          "automations"
        )
        .update({
          last_run_at:
            completedAt,

          total_executions:
            Number(
              automation.total_executions ??
                0
            ) + 1,

          successful_executions:
            Number(
              automation.successful_executions ??
                0
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

        awaitingApproval:
          false,

        message:
          "Workflow completed. No enabled steps were configured.",

        run: {
          id:
            run.id,

          automationId:
            automation.id,
        },
      });
    }

    /*
    ============================================================
    RUNTIME ACCUMULATORS
    ============================================================
    */

    let workflowApiCalled =
      false;

    let workflowCost =
      0;

    let completedSteps =
      0;

    let skipNextStepOrder:
      | number
      | null = null;

    /*
    ============================================================
    EXECUTE STEPS
    ============================================================
    */

    for (
      const step of steps
    ) {
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
                  triggerPayload,

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
      UPDATE CURRENT STEP
      ==========================================================
      */

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
      APPROVAL STEP
      ==========================================================
      */

      if (
        step.step_type ===
        "approval"
      ) {
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
                triggerPayload,
            })
            .select(
              `
              id,
              run_id,
              automation_step_id,
              step_order,
              step_type,
              status,
              requires_approval,
              approval_status
              `
            )
            .single();

        if (
          approvalStepError ||
          !approvalRunStep
        ) {
          throw new Error(
            "Could not create the human approval execution step."
          );
        }

        currentRunStepId =
          approvalRunStep.id;

        const awaitingAt =
          new Date().toISOString();

        const {
          error:
            awaitingRunError,
        } =
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

        if (
          awaitingRunError
        ) {
          throw new Error(
            "Could not pause workflow for human approval."
          );
        }

        const {
          error:
            automationUpdateError,
        } =
          await supabase
            .from(
              "automations"
            )
            .update({
              last_run_at:
                awaitingAt,

              total_executions:
                Number(
                  automation.total_executions ??
                    0
                ) + 1,

              awaiting_approval_executions:
                Number(
                  automation.awaiting_approval_executions ??
                    0
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

        if (
          automationUpdateError
        ) {
          console.error(
            "Automation awaiting approval counter error:",
            automationUpdateError
          );
        }

        return NextResponse.json({
          success: true,

          status:
            "awaiting_approval",

          awaitingApproval:
            true,

          message:
            `Workflow reached Step ${step.step_order} and is waiting for human approval.`,

          run: {
            id:
              run.id,

            automationId:
              automation.id,

            currentStepOrder:
              step.step_order,

            completedSteps,

            apiCalled:
              workflowApiCalled,

            totalCostUSD:
              workflowCost,
          },

          approval: {
            runStepId:
              approvalRunStep.id,

            automationStepId:
              step.id,

            stepOrder:
              step.step_order,

            stepName:
              step.name,

            status:
              "pending",
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

        /*
        ========================================================
        CREATE RUN STEP
        ========================================================
        */

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
                step.step_type,

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
                  triggerPayload,

                workflow: {
                  id:
                    automation.id,

                  name:
                    automation.name,
                },

                step: {
                  id:
                    step.id,

                  order:
                    step.step_order,

                  name:
                    step.name,
                },
              },
            })
            .select(
              `
              id,
              status,
              step_order
              `
            )
            .single();

        if (
          runStepError ||
          !runStep
        ) {
          console.error(
            "Automation run step create error:",
            runStepError
          );

          throw new Error(
            `Could not start workflow Step ${step.step_order}.`
          );
        }

        currentRunStepId =
          runStep.id;

        /*
        ========================================================
        CREATE AI TASK USING EXISTING J10 WORKFORCE API
        ========================================================
        */

        const cookieHeader =
          request.headers.get(
            "cookie"
          ) ?? "";

        const origin =
          request.nextUrl.origin;

        const taskInput =
          Object.keys(
            triggerPayload
          ).length >
          0
            ? JSON.stringify(
                triggerPayload,
                null,
                2
              )
            : automation.description ??
              `Workflow: ${automation.name}`;

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
                    `Execute Step ${step.step_order} for workflow "${automation.name}".`,

                  inputText:
                    taskInput,

                  automationContext: {
                    sourceWorkflowId:
                      automation.id,

                    eventDepth:
                      getEventDepth(
                        triggerPayload
                      ),
                  },
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

        /*
        ========================================================
        EXACT EMPLOYEE VERIFICATION
        ========================================================
        */

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

        /*
        ========================================================
        RUN EXISTING AI TASK ENGINE
        ========================================================
        */

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

        const stepApiCalled =
          Boolean(
            task?.api_called
          );

        const stepCost =
          safeCost(
            task?.estimated_cost_usd
          );

        workflowApiCalled =
          workflowApiCalled ||
          stepApiCalled;

        workflowCost +=
          stepCost;

        /*
        ========================================================
        COMPLETE RUN STEP
        ========================================================
        */

        const {
          error:
            completeStepError,
        } =
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

        if (
          completeStepError
        ) {
          console.error(
            "Automation run step completion error:",
            completeStepError
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
      BUSINESS ACTION / ACTIVITY ENGINE
      ==========================================================
      */

      if (
        step.step_type ===
          "action" ||
        step.step_type ===
          "activity"
      ) {
        const resolvedActionType =
          step.step_type ===
          "activity"
            ? "record_activity"
            : step.action_type;

        if (
          !resolvedActionType ||
          !isAutomationActionType(
            resolvedActionType
          )
        ) {
          throw new Error(
            `Step ${step.step_order} has an unsupported business action.`
          );
        }

        /*
        ========================================================
        EXPLICIT STEP APPROVAL GATE
        If the builder says approval is required, stop BEFORE
        the business action executes.
        ========================================================
        */

        if (
          step.requires_approval
        ) {
          const {
            data:
              approvalActionRunStep,
            error:
              approvalActionStepError,
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
                  resolvedActionType,

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
                    triggerPayload,

                  workflow: {
                    id:
                      automation.id,

                    name:
                      automation.name,
                  },

                  step: {
                    id:
                      step.id,

                    order:
                      step.step_order,

                    name:
                      step.name,
                  },

                  pending_action: {
                    action_type:
                      resolvedActionType,

                    instructions:
                      step.instructions,

                    reason:
                      "Workflow step requires human approval before execution.",
                  },
                },
              })
              .select(
                `
                id,
                run_id,
                automation_step_id,
                step_order,
                step_type,
                action_type,
                status,
                requires_approval,
                approval_status
                `
              )
              .single();

          if (
            approvalActionStepError ||
            !approvalActionRunStep
          ) {
            console.error(
              "Business action approval step create error:",
              approvalActionStepError
            );

            throw new Error(
              `Could not create the approval gate for Step ${step.step_order}.`
            );
          }

          currentRunStepId =
            approvalActionRunStep.id;

          const awaitingAt =
            new Date().toISOString();

          const {
            error:
              awaitingRunError,
          } =
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
                  `Workflow paused before Step ${step.step_order}: ${step.name ?? formatActionName(resolvedActionType)}.`,

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

          if (
            awaitingRunError
          ) {
            throw new Error(
              "Could not pause the workflow before the protected business action."
            );
          }

          const {
            error:
              automationUpdateError,
          } =
            await supabase
              .from(
                "automations"
              )
              .update({
                last_run_at:
                  awaitingAt,

                total_executions:
                  Number(
                    automation.total_executions ??
                      0
                  ) + 1,

                awaiting_approval_executions:
                  Number(
                    automation.awaiting_approval_executions ??
                      0
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

          if (
            automationUpdateError
          ) {
            console.error(
              "Protected business action approval counter error:",
              automationUpdateError
            );
          }

          return NextResponse.json({
            success: true,

            status:
              "awaiting_approval",

            awaitingApproval:
              true,

            message:
              `Workflow is waiting for human approval before Step ${step.step_order}.`,

            run: {
              id:
                run.id,

              automationId:
                automation.id,

              currentStepOrder:
                step.step_order,

              completedSteps,

              apiCalled:
                workflowApiCalled,

              totalCostUSD:
                workflowCost,
            },

            approval: {
              runStepId:
                approvalActionRunStep.id,

              automationStepId:
                step.id,

              stepOrder:
                step.step_order,

              stepName:
                step.name,

              actionType:
                resolvedActionType,

              status:
                "pending",
            },
          });
        }

        /*
        ========================================================
        EXECUTE J10 BUSINESS ACTION
        ========================================================
        */

        const actionResult =
          await executeAutomationAction({
            actionType:
              resolvedActionType,

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

            triggerPayload,

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

        /*
        ========================================================
        ACTION ENGINE REQUESTED HUMAN APPROVAL
        Example: CRM note or CRM status mutation.
        No side effect has been performed.
        ========================================================
        */

        if (
          actionResult.status ===
            "awaiting_approval" ||
          actionResult.requiresHumanApproval
        ) {
          const {
            data:
              actionApprovalRunStep,
            error:
              actionApprovalStepError,
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
                  resolvedActionType,

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
                    triggerPayload,

                  workflow: {
                    id:
                      automation.id,

                    name:
                      automation.name,
                  },

                  step: {
                    id:
                      step.id,

                    order:
                      step.step_order,

                    name:
                      step.name,
                  },

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
                id,
                run_id,
                automation_step_id,
                step_order,
                step_type,
                action_type,
                status,
                requires_approval,
                approval_status
                `
              )
              .single();

          if (
            actionApprovalStepError ||
            !actionApprovalRunStep
          ) {
            console.error(
              "Action Engine approval run-step error:",
              actionApprovalStepError
            );

            throw new Error(
              `Could not create the Action Engine approval gate at Step ${step.step_order}.`
            );
          }

          currentRunStepId =
            actionApprovalRunStep.id;

          const awaitingAt =
            new Date().toISOString();

          const {
            error:
              awaitingRunError,
          } =
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

          if (
            awaitingRunError
          ) {
            throw new Error(
              "Could not pause the workflow for Action Engine approval."
            );
          }

          const {
            error:
              automationUpdateError,
          } =
            await supabase
              .from(
                "automations"
              )
              .update({
                last_run_at:
                  awaitingAt,

                total_executions:
                  Number(
                    automation.total_executions ??
                      0
                  ) + 1,

                awaiting_approval_executions:
                  Number(
                    automation.awaiting_approval_executions ??
                      0
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

          if (
            automationUpdateError
          ) {
            console.error(
              "Action Engine awaiting approval counter error:",
              automationUpdateError
            );
          }

          return NextResponse.json({
            success: true,

            status:
              "awaiting_approval",

            awaitingApproval:
              true,

            message:
              `Business Action at Step ${step.step_order} requires human approval.`,

            run: {
              id:
                run.id,

              automationId:
                automation.id,

              currentStepOrder:
                step.step_order,

              completedSteps,

              apiCalled:
                workflowApiCalled,

              totalCostUSD:
                workflowCost,
            },

            approval: {
              runStepId:
                actionApprovalRunStep.id,

              automationStepId:
                step.id,

              stepOrder:
                step.step_order,

              stepName:
                step.name,

              actionType:
                resolvedActionType,

              status:
                "pending",
            },

            action: {
              resultText:
                actionResult.resultText,

              sideEffectBlocked:
                actionResult.sideEffectBlocked,

              metadata:
                actionResult.metadata,
            },
          });
        }

        /*
        ========================================================
        BUSINESS ACTION COMPLETED
        ========================================================
        */

        const {
          data:
            completedActionRunStep,
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
                resolvedActionType,

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
                  triggerPayload,

                workflow: {
                  id:
                    automation.id,

                  name:
                    automation.name,
                },

                step: {
                  id:
                    step.id,

                  order:
                    step.step_order,

                  name:
                    step.name,
                },

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
              id,
              step_order,
              step_type,
              action_type,
              status
              `
            )
            .single();

        if (
          completedActionStepError ||
          !completedActionRunStep
        ) {
          console.error(
            "Action Engine completed run-step error:",
            completedActionStepError
          );

          throw new Error(
            `Could not save the completed Action Engine result for Step ${step.step_order}.`
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

            context: {
              trigger:
                triggerPayload,

              workflow: {
                id:
                  automation.id,

                name:
                  automation.name,

                triggerType:
                  triggerSource,
              },

              execution: {
                mode:
                  executionMode,
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
                  triggerPayload,

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

        /*
        ========================================================
        SKIP NEXT BRANCH
        ========================================================
        */

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

        /*
        ========================================================
        STOP BRANCH

        A false condition is not treated as an execution error.
        The workflow ends successfully with a condition result.
        ========================================================
        */

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
                  `Workflow stopped by condition at Step ${step.step_order}. Condition matched: ${evaluation.matched}.`,

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
              "J10 condition completed but the workflow run could not be finalized."
            );
          }

          await supabase
            .from(
              "automations"
            )
            .update({
              last_run_at:
                conditionCompletedAt,

              total_executions:
                Number(
                  automation.total_executions ??
                    0
                ) + 1,

              successful_executions:
                Number(
                  automation.successful_executions ??
                    0
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

            awaitingApproval:
              false,

            conditionStopped:
              true,

            message:
              `Workflow stopped safely at condition Step ${step.step_order}.`,

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

              automationId:
                automation.id,

              completedSteps,

              apiCalled:
                workflowApiCalled,

              totalCostUSD:
                workflowCost,

              executionMode,
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
    WORKFLOW COMPLETED
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
            `Workflow completed successfully. ${completedSteps} step(s) executed.`,

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
        "Workflow completed but J10 could not finalize the execution record."
      );
    }

    await supabase
      .from(
        "automations"
      )
      .update({
        last_run_at:
          completedAt,

        total_executions:
          Number(
            automation.total_executions ??
              0
          ) + 1,

        successful_executions:
          Number(
            automation.successful_executions ??
              0
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

      awaitingApproval:
        false,

      message:
        "Workflow completed successfully.",

      run: {
        id:
          run.id,

        automationId:
          automation.id,

        completedSteps,

        apiCalled:
          workflowApiCalled,

        totalCostUSD:
          workflowCost,

        executionMode,
      },
    });
  } catch (error) {
    console.error(
      "J10 automation workflow trigger error:",
      error
    );

    const errorMessage =
      error instanceof Error
        ? error.message
        : "J10 workflow execution failed.";

    const failedAt =
      new Date().toISOString();

    /*
    ============================================================
    FAIL CURRENT RUN STEP
    ============================================================
    */

    try {
      const supabase =
        await getSupabase();

      const {
        data: {
          user,
        },
      } =
        await supabase.auth.getUser();

      if (
        user &&
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

      /*
      ==========================================================
      FAIL RUN
      ==========================================================
      */

      if (
        user &&
        runId
      ) {
        await supabase
          .from(
            "automation_runs"
          )
          .update({
            status:
              "failed",

            error_message:
              errorMessage,

            completed_at:
              failedAt,
          })
          .eq(
            "id",
            runId
          )
          .eq(
            "user_id",
            user.id
          );
      }

      /*
      ==========================================================
      AUTOMATION FAILURE COUNTER
      ==========================================================
      */

      if (
        user &&
        automationId
      ) {
        const {
          data:
            currentAutomation,
        } =
          await supabase
            .from(
              "automations"
            )
            .select(
              `
              total_executions,
              failed_executions
              `
            )
            .eq(
              "id",
              automationId
            )
            .eq(
              "user_id",
              user.id
            )
            .maybeSingle();

        if (
          currentAutomation
        ) {
          await supabase
            .from(
              "automations"
            )
            .update({
              last_run_at:
                failedAt,

              total_executions:
                Number(
                  currentAutomation.total_executions ??
                    0
                ) + 1,

              failed_executions:
                Number(
                  currentAutomation.failed_executions ??
                    0
                ) + 1,

              updated_at:
                failedAt,
            })
            .eq(
              "id",
              automationId
            )
            .eq(
              "user_id",
              user.id
            );
        }
      }
    } catch (
      recoveryError
    ) {
      console.error(
        "J10 automation failure-recording error:",
        recoveryError
      );
    }

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