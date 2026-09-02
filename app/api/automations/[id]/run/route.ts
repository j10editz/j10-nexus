import {
  resolveAutomationRequestActor,
} from "@/lib/automation/bridge-auth";
import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  resolveAutomationRunGraphSnapshot,
} from "@/lib/automation/run-snapshot";



import type {
  SupabaseClient,
} from "@supabase/supabase-js";

import {
  executeAutomationAction,
  isAutomationActionType,
} from "@/lib/automation/action-engine";

import {
  evaluateAutomationCondition,
} from "@/lib/automation/condition-engine";

import {
  getUnselectedBranchStepOrders,
} from "@/lib/automation/graph-runtime-routing";

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
  buildWorkflowCollaborationSnapshot,
  buildWorkflowTaskInput,
  cloneWorkflowContext,
  createWorkflowContext,
  createWorkflowStepOutput,
  interpolateWorkflowTemplate,
  setWorkflowStepOutput,
} from "@/lib/automation/workflow-context";

type TriggerSource =
  | "manual"
  | "new_crm_contact"
  | "crm_status_changed"
  | "new_ai_task"
  | "ai_task_completed"
  | "schedule"
  | "integration_event";

const SUPPORTED_TRIGGER_SOURCES: TriggerSource[] = [
  "manual",
  "new_crm_contact",
  "crm_status_changed",
  "new_ai_task",
  "ai_task_completed",
  "schedule",
  "integration_event",
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


const EVENT_DEDUPE_WINDOW_MS =
  10 * 60 * 1000;

function getEventDedupeKey(
  payload: Record<
    string,
    unknown
  >
) {
  const meta =
    payload.__j10_event;

  if (
    !meta ||
    typeof meta !==
      "object" ||
    Array.isArray(
      meta
    )
  ) {
    return "";
  }

  const value =
    (
      meta as Record<
        string,
        unknown
      >
    ).dedupeKey;

  return typeof value ===
    "string"
    ? value.trim()
    : "";
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
  config: Record<string, unknown>;
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

function getExecutionMode() {
  return process.env.J10_AI_MODE === "live"
    ? "live"
    : "development";
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
        `
        id,
        input_payload
        `
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

function getStepGraphNodeId(
  step: AutomationStep | null
) {
  const j10Flow =
    step?.config?.j10Flow;

  if (
    !j10Flow ||
    typeof j10Flow !== "object" ||
    Array.isArray(j10Flow)
  ) {
    return null;
  }

  const nodeId =
    (j10Flow as Record<string, unknown>).nodeId;

  return typeof nodeId === "string" &&
    nodeId.trim()
    ? nodeId.trim()
    : null;
}

async function assertStartVersionIntegrity(args: {
  supabase: SupabaseClient;
  userId: string;
  automationId: string;
  automationVersionId: string | null;
  steps: AutomationStep[];
}) {
  if (!args.automationVersionId) {
    return;
  }

  const {
    data,
    error,
  } = await args.supabase
    .from("automation_version_steps")
    .select(
      `
      graph_node_id,
      step_order,
      is_enabled
      `
    )
    .eq("automation_version_id", args.automationVersionId)
    .eq("automation_id", args.automationId)
    .eq("user_id", args.userId)
    .eq("is_enabled", true)
    .order("step_order", {
      ascending: true,
    });

  if (error) {
    console.error(
      "Start version integrity lookup error:",
      error
    );

    throw new Error(
      "J10 could not verify the published workflow version before execution."
    );
  }

  const versionSteps =
    (data ?? []) as Array<{
      graph_node_id: string | null;
      step_order: number;
      is_enabled: boolean;
    }>;

  if (versionSteps.length !== args.steps.length) {
    throw new Error(
      "J10 blocked execution because live workflow steps no longer match the published version."
    );
  }

  for (let index = 0; index < versionSteps.length; index += 1) {
    const versionStep = versionSteps[index];
    const liveStep = args.steps[index];

    if (!liveStep) {
      throw new Error(
        "J10 blocked execution because a published workflow step is missing from live runtime."
      );
    }

    const liveNodeId =
      getStepGraphNodeId(liveStep);

    if (
      versionStep.step_order !== liveStep.step_order ||
      versionStep.graph_node_id !== liveNodeId
    ) {
      throw new Error(
        "J10 blocked execution because live runtime step order or graph node identity drifted from the published version."
      );
    }
  }
}

function isPlainObject(
  value: unknown
): value is Record<string, unknown> {
  return Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value);
}

function getApprovalSafetyForStep(
  step: AutomationStep
) {
  const config =
    isPlainObject(step.config)
      ? step.config
      : {};

  const integrationAction =
    isPlainObject(config.integrationAction)
      ? config.integrationAction
      : isPlainObject(config.integration)
        ? config.integration
        : null;

  const capability =
    typeof integrationAction?.capabilityId === "string"
      ? integrationAction.capabilityId.trim()
      : typeof integrationAction?.capability === "string"
        ? integrationAction.capability.trim()
        : "";

  const provider =
    typeof integrationAction?.provider === "string"
      ? integrationAction.provider.trim()
      : capability.includes(".")
        ? capability.split(".")[0]
        : "";

  const mode =
    typeof integrationAction?.mode === "string"
      ? integrationAction.mode.trim()
      : step.action_type === "integration_action"
        ? "simulate"
        : "internal";

  const connectionId =
    typeof integrationAction?.connectionId === "string" &&
    integrationAction.connectionId.trim()
      ? integrationAction.connectionId.trim()
      : null;

  return {
    actionType:
      step.action_type,

    mode,

    provider:
      provider || null,

    capability:
      capability || null,

    connectionIdPresent:
      Boolean(connectionId),

    externalSideEffect:
      mode === "live",

    sandbox:
      mode === "sandbox",
  };
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

  let automationVersionId:
    | string
    | null = null;

  let currentRunStepId:
    | string
    | null = null;

  let automationId =
    "";

  let loadedSteps:
    AutomationStep[] = [];

  let currentStep:
    AutomationStep | null =
    null;

  let currentAttempt =
    1;

  let currentContextBefore:
    Record<string, unknown> | null =
    null;

  let currentTriggerPayload:
    Record<string, unknown> = {};

  try {
    const {
      id,
    } = await context.params;

    automationId = id;

    const actor =
      await resolveAutomationRequestActor(
        request,
        {
          expectedAutomationId:
            id,
        }
      );

    const supabase =
      actor.supabase;

    const user =
      actor.user;

    if (!user) {
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

    currentTriggerPayload =
      triggerPayload;

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
          published_version_id,
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

    const publishedVersionId =
      typeof automation.published_version_id === "string"
        ? automation.published_version_id
        : null;

    const {
      data: publishedVersion,
      error: publishedVersionError,
    } = publishedVersionId
      ? await supabase
          .from("automation_versions")
          .select(
            `
            id,
            version_number,
            status,
            graph_version,
            graph_snapshot
            `
          )
          .eq("id", publishedVersionId)
          .eq("automation_id", automation.id)
          .eq("user_id", user.id)
          .eq("status", "published")
          .maybeSingle()
      : {
          data: null,
          error: null,
        };

    if (publishedVersionError) {
      console.error(
        "Published automation version lookup error:",
        publishedVersionError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Could not verify the published workflow version.",
        },
        {
          status: 500,
        }
      );
    }

    if (
      publishedVersionId &&
      !publishedVersion
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "This workflow points to a published version that could not be loaded.",
        },
        {
          status: 409,
        }
      );
    }

    automationVersionId =
      publishedVersion?.id ?? null;

    /*
    ============================================================
    13I - EXECUTION-LEVEL IDEMPOTENCY

    The event dispatcher performs the first duplicate check.
    This second guard protects the execution route itself from
    concurrent retries or direct duplicate deliveries.
    Manual and scheduled runs are intentionally excluded.
    ============================================================
    */

    const eventDedupeKey =
      getEventDedupeKey(
        triggerPayload
      );

    if (
      triggerSource !==
        "manual" &&
      triggerSource !==
        "schedule" &&
      eventDedupeKey
    ) {
      const dedupeWindowStart =
        new Date(
          Date.now() -
            EVENT_DEDUPE_WINDOW_MS
        ).toISOString();

      const {
        data:
          duplicateRun,
        error:
          duplicateRunError,
      } =
        await supabase
          .from(
            "automation_runs"
          )
          .select(
            `
            id,
            status,
            current_step_order,
            started_at,
            completed_at
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
          .gte(
            "started_at",
            dedupeWindowStart
          )
          .contains(
            "trigger_payload",
            {
              __j10_event: {
                dedupeKey:
                  eventDedupeKey,
              },
            }
          )
          .order(
            "started_at",
            {
              ascending:
                false,
            }
          )
          .limit(1)
          .maybeSingle();

      if (
        duplicateRunError
      ) {
        console.error(
          "Automation idempotency lookup error:",
          duplicateRunError
        );

        return NextResponse.json(
          {
            success: false,
            error:
              "Could not verify event idempotency.",
          },
          {
            status: 500,
          }
        );
      }

      if (
        duplicateRun
      ) {
        return NextResponse.json({
          success: true,

          status:
            "duplicate",

          duplicate:
            true,

          deduplicated:
            true,

          awaitingApproval:
            duplicateRun.status ===
            "awaiting_approval",

          message:
            "Duplicate J10 event delivery ignored. Existing workflow execution preserved.",

          run: {
            id:
              duplicateRun.id,

            automationId:
              automation.id,

            status:
              duplicateRun.status,

            currentStepOrder:
              duplicateRun.current_step_order,

            startedAt:
              duplicateRun.started_at,

            completedAt:
              duplicateRun.completed_at,
          },
        });
      }
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

    await assertStartVersionIntegrity({
      supabase,
      userId: user.id,
      automationId: automation.id,
      automationVersionId,
      steps,
    });

    loadedSteps =
      steps;

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

          automation_version_id:
            automationVersionId,

          graph_snapshot:
            resolveAutomationRunGraphSnapshot(
              publishedVersion,
            ),

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
          automation_version_id,
          graph_snapshot,
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

    const workflowContext =
      createWorkflowContext({
        triggerPayload,
        automation: {
          id: automation.id,
          name: automation.name,
          triggerType: triggerSource,
        },
        run: {
          id: run.id,
          executionMode,
          startedAt: run.started_at ?? startedAt,
        },
      });

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

    let activeBranchTargetStepOrder:
      | number
      | null = null;

    const excludedGraphBranchStepOrders =
      new Set<number>();

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

              automation_version_id:
                run.automation_version_id ?? null,

              graph_node_id:
                getStepGraphNodeId(step),

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

                workflow_context:
                  branchContext,

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

        continue;
      }

      if (
        activeBranchTargetStepOrder ===
        step.step_order
      ) {
        activeBranchTargetStepOrder =
          null;
      }

      /*
      ==========================================================
      EXCLUSIVE WORKFLOW GRAPH BRANCH

      A selected branch may rejoin another path later. Skip only
      nodes reachable exclusively from the unselected branch and
      preserve nodes shared by both paths.
      ==========================================================
      */

      if (
        excludedGraphBranchStepOrders.has(
          step.step_order
        )
      ) {
        const {
          error:
            graphBranchSkipError,
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

              automation_version_id:
                run.automation_version_id ?? null,

              graph_node_id:
                getStepGraphNodeId(step),

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

                  branch_type:
                    "j10_flow_exclusive_branch",

                  reason:
                    "Skipped because another J10 Flow condition branch was selected.",
                },
              },
            });

        if (
          graphBranchSkipError
        ) {
          throw new Error(
            `Could not record J10 Flow branch skip for Step ${step.step_order}.`
          );
        }

        continue;
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

              automation_version_id:
                run.automation_version_id ?? null,

              graph_node_id:
                getStepGraphNodeId(step),

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
          startedAt,

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

            executionMode,

            guardrails:
              executionGuardrails,
          });

        if (simulatedTimeout) {
          throw simulatedTimeout;
        }
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

            executionMode,
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

              automation_version_id:
                run.automation_version_id ?? null,

              graph_node_id:
                getStepGraphNodeId(step),

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
                  triggerPayload,
                workflow_context:
                  contextBefore,
              },
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

        const collaborationBefore =
          buildWorkflowCollaborationSnapshot(
            contextBefore
          );

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

              automation_version_id:
                run.automation_version_id ?? null,

              graph_node_id:
                getStepGraphNodeId(step),

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

                workflow_context:
                  contextBefore,

                collaboration:
                  collaborationBefore,

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
              ),

            {
              runStartedAt:
                startedAt,

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
                startedAt,

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
                executionMode,

              apiCalled:
                stepApiCalled,

              estimatedCostUSD:
                stepCost,

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

              input_payload: {
                trigger:
                  triggerPayload,
                workflow_context:
                  contextBefore,

                collaboration:
                  collaborationBefore,

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

              automation_version_id:
                run.automation_version_id ?? null,

              graph_node_id:
                getStepGraphNodeId(step),

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

                  workflow_context:
                    contextBefore,

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
                      resolvedInstructions,

                    reason:
                      "Workflow step requires human approval before execution.",

                    approval_safety:
                      getApprovalSafetyForStep(step),
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
          await withAutomationTimeout(
            () =>
              executeAutomationAction({
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
              resolvedInstructions,

            triggerPayload,

            workflowContext:
              workflowContext as unknown as Record<string, unknown>,

            employeeId:
              step.employee_id,

            employeeName:
              step.employee_name,
              }),

            {
              runStartedAt:
                startedAt,

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

              automation_version_id:
                run.automation_version_id ?? null,

              graph_node_id:
                getStepGraphNodeId(step),

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

                  workflow_context:
                    contextBefore,

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

        const actionStepOutput =
          createWorkflowStepOutput({
            stepId: step.id,
            stepOrder: step.step_order,
            stepName: step.name,
            stepType: step.step_type,
            actionType:
              resolvedActionType,
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

              automation_version_id:
                run.automation_version_id ?? null,

              graph_node_id:
                getStepGraphNodeId(step),

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

                workflow_context:
                  contextBefore,

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

              automation_version_id:
                run.automation_version_id ?? null,

              graph_node_id:
                getStepGraphNodeId(step),

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

        /*
        ========================================================
        13E TARGETED FORWARD BRANCH
        ========================================================
        */

        if (
          evaluation.branchTargetStepOrder !==
          null
        ) {
          const unselectedTargetStepOrder =
            evaluation.matched
              ? evaluation.onFalseStep
              : evaluation.onTrueStep;

          for (
            const excludedStepOrder of
              getUnselectedBranchStepOrders(
                steps,
                evaluation.branchTargetStepOrder,
                unselectedTargetStepOrder
              )
          ) {
            excludedGraphBranchStepOrders.add(
              excludedStepOrder
            );
          }

          activeBranchTargetStepOrder =
            validateForwardBranchTarget(
              steps,
              step.step_order,
              evaluation.branchTargetStepOrder
            );

          continue;
        }

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
      const recoveryActor =
        await resolveAutomationRequestActor(
          request,
          {
            expectedAutomationId:
              automationId ||
              undefined,
          }
        );

      const supabase =
        recoveryActor.supabase;

      const user =
        recoveryActor.user;

      let failureResolution:
        ReturnType<
          typeof resolveAutomationFailure
        > | null =
        null;

      let currentAutomation:
        {
          total_executions:
            number | null;
          successful_executions:
            number | null;
          failed_executions:
            number | null;
          awaiting_approval_executions:
            number | null;
        } | null =
        null;

      if (
        user &&
        automationId
      ) {
        const {
          data:
            automationCounters,
        } =
          await supabase
            .from(
              "automations"
            )
            .select(
              `
              total_executions,
              successful_executions,
              failed_executions,
              awaiting_approval_executions
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

        currentAutomation =
          automationCounters;
      }

      /*
      ==========================================================
      13J - RECORD FAILED ATTEMPT
      ==========================================================
      */

      if (
        user &&
        runId &&
        currentStep
      ) {
        const failurePolicy =
          getAutomationStepFailurePolicy(
            currentStep.config
          );

        failureResolution =
          resolveAutomationFailure(
            failurePolicy,
            currentAttempt
          );

        const retryMetadata =
          buildRetryMetadata({
            attempt:
              currentAttempt,

            policy:
              failurePolicy,

            resolution:
              failureResolution,
          });

        const failurePayload:
          Record<
            string,
            unknown
          > = {
          trigger:
            currentTriggerPayload,

          workflow_context:
            currentContextBefore ??
            {},

          retry:
            retryMetadata,

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
                runId,

              automation_id:
                automationId,

              automation_step_id:
                currentStep.id,

              automation_version_id:
                automationVersionId,

              graph_node_id:
                getStepGraphNodeId(currentStep),

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
        ========================================================
        RETRY
        ========================================================
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
                runId
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

          await waitForRetry(
            failurePolicy
          );

          const retryResponse =
            await fetch(
              `${request.nextUrl.origin}/api/automation-runs/${encodeURIComponent(
                runId
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

          const retryResult =
            await parseJsonResponse<
              Record<
                string,
                unknown
              >
            >(
              retryResponse
            );

          return NextResponse.json(
            retryResult,
            {
              status:
                retryResponse.status,
            }
          );
        }

        /*
        ========================================================
        CONTINUE DESPITE FAILURE
        ========================================================
        */

        if (
          failureResolution ===
          "continue"
        ) {
          const nextStep =
            loadedSteps.find(
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
                  `Workflow completed with a tolerated failure at Step ${currentStep.step_order}.`,

                error_message:
                  null,

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

                  successful_executions:
                    Number(
                      currentAutomation.successful_executions ??
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

            return NextResponse.json({
              success: true,

              status:
                "completed",

              continuedAfterFailure:
                true,

              message:
                `Workflow completed after tolerating the failure at Step ${currentStep.step_order}.`,

              run: {
                id:
                  runId,

                automationId,

                failedStepOrder:
                  currentStep.step_order,

                failedAttempt:
                  currentAttempt,
              },
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
              runId
            )
            .eq(
              "user_id",
              user.id
            );

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

          const continueResponse =
            await fetch(
              `${request.nextUrl.origin}/api/automation-runs/${encodeURIComponent(
                runId
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

          const continueResult =
            await parseJsonResponse<
              Record<
                string,
                unknown
              >
            >(
              continueResponse
            );

          return NextResponse.json(
            continueResult,
            {
              status:
                continueResponse.status,
            }
          );
        }

        /*
        ========================================================
        HUMAN REVIEW
        ========================================================
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
                  runId,

                automation_id:
                  automationId,

                automation_step_id:
                  currentStep.id,

              automation_version_id:
                automationVersionId,

              graph_node_id:
                getStepGraphNodeId(currentStep),

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
                    currentTriggerPayload,

                  workflow_context:
                    currentContextBefore ??
                    {},

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
                `
                id
                `
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
              runId
            )
            .eq(
              "user_id",
              user.id
            );

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

                awaiting_approval_executions:
                  Number(
                    currentAutomation.awaiting_approval_executions ??
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
      ==========================================================
      DEFAULT STOP-ON-FAILURE
      ==========================================================
      */

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

      if (
        user &&
        automationId &&
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
