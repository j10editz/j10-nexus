import "server-only";

import type {
  IntegrationActionRequest,
} from "../../types/integration-action";

import type {
  IntegrationAutomationActionBridgeResult,
  IntegrationAutomationActionConfig,
} from "../../types/integration-automation";

import type {
  WorkflowContext,
} from "../automation/workflow-context";

import {
  interpolateWorkflowTemplate,
} from "../automation/workflow-context";

import {
  createAutomationBridgeServiceClient,
} from "../automation/bridge-auth";

import {
  writeIntegrationActivity,
} from "./api";

import {
  getIntegrationConnectionById,
} from "./database";

import {
  createIntegrationActionFingerprint,
  createIntegrationActionPlan,
  evaluateIntegrationActionPolicy,
  executeIntegrationActionPlan,
  IntegrationActionError,
  parseIntegrationActionInput,
  parseIntegrationActionMode,
  resolveIntegrationActionCapability,
} from "./external-action-adapter";

import {
  claimIntegrationActionExecution,
  finishIntegrationActionExecution,
  resumeApprovedIntegrationActionExecution,
  serializeIntegrationActionExecution,
} from "./integration-action-database";

import {
  getIntegrationProvider,
} from "./registry";

type AutomationRow = {
  id: string;
  user_id: string;
  name: string;
};

type AutomationStepRow = {
  id: string;
  automation_id: string;
  action_type: string | null;
  config:
    | Record<string, unknown>
    | null;
};

export class IntegrationAutomationBridgeError extends Error {
  readonly code: string;

  constructor(
    message: string,
    code =
      "INTEGRATION_AUTOMATION_BRIDGE_ERROR",
  ) {
    super(message);

    this.name =
      "IntegrationAutomationBridgeError";

    this.code =
      code;
  }
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value);
}

function requireString(
  value: unknown,
  label: string,
) {
  if (
    typeof value !==
      "string" ||
    !value.trim()
  ) {
    throw new IntegrationAutomationBridgeError(
      `${label} is required for the integration automation action.`,
      "INTEGRATION_AUTOMATION_CONFIG_INVALID",
    );
  }

  return value.trim();
}

function resolveTemplateValue(
  value: unknown,
  context: WorkflowContext,
  depth = 0,
): unknown {
  if (depth > 10) {
    throw new IntegrationAutomationBridgeError(
      "Integration action input exceeded the workflow template depth limit.",
      "INTEGRATION_AUTOMATION_INPUT_DEPTH_EXCEEDED",
    );
  }

  if (
    value === null ||
    value === undefined ||
    typeof value ===
      "number" ||
    typeof value ===
      "boolean"
  ) {
    return value ?? null;
  }

  if (
    typeof value ===
      "string"
  ) {
    return interpolateWorkflowTemplate(
      value,
      context,
    );
  }

  if (
    Array.isArray(
      value,
    )
  ) {
    return value.map(
      (item) =>
        resolveTemplateValue(
          item,
          context,
          depth + 1,
        ),
    );
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(
        ([key, item]) => [
          key,
          resolveTemplateValue(
            item,
            context,
            depth + 1,
          ),
        ],
      ),
    );
  }

  throw new IntegrationAutomationBridgeError(
    "Integration action input contains an unsupported workflow value.",
    "INTEGRATION_AUTOMATION_INPUT_INVALID",
  );
}

function normalizeWorkflowContext(
  value:
    | Record<string, unknown>
    | null
    | undefined,
): WorkflowContext {
  if (
    !value ||
    !isRecord(value.workflow) ||
    !isRecord(value.execution) ||
    !isRecord(value.trigger) ||
    !isRecord(value.steps) ||
    !isRecord(value.variables)
  ) {
    throw new IntegrationAutomationBridgeError(
      "Integration action requires a valid workflow context.",
      "INTEGRATION_AUTOMATION_CONTEXT_INVALID",
    );
  }

  return value as unknown as
    WorkflowContext;
}

function readActionConfig(
  step:
    AutomationStepRow,
  workflowContext:
    WorkflowContext,
): IntegrationAutomationActionConfig {
  const root =
    step.config ?? {};

  const nested =
    isRecord(
      root.integrationAction,
    )
      ? root.integrationAction
      : isRecord(
          root.integration_action,
        )
        ? root.integration_action
        : root;

  const connectionId =
    requireString(
      nested.connectionId ??
        nested.integrationId,
      "Connection ID",
    );

  const capabilityId =
    requireString(
      nested.capabilityId,
      "Capability ID",
    );

  const mode =
    parseIntegrationActionMode(
      nested.mode,
    );

  const resolvedInput =
    resolveTemplateValue(
      nested.input ?? {},
      workflowContext,
    );

  const input =
    parseIntegrationActionInput(
      resolvedInput,
    );

  return {
    connectionId,
    capabilityId,
    mode,
    input,
  };
}

function getApplicationOrigin() {
  const configured =
    (
      process.env
        .J10_APP_ORIGIN ??
      process.env
        .NEXT_PUBLIC_APP_URL
    )?.trim();

  if (configured) {
    try {
      return new URL(
        configured,
      ).origin;
    } catch {
      throw new IntegrationAutomationBridgeError(
        "J10_APP_ORIGIN contains an invalid URL.",
        "INTEGRATION_AUTOMATION_ORIGIN_INVALID",
      );
    }
  }

  const vercelUrl =
    process.env
      .VERCEL_URL
      ?.trim();

  if (vercelUrl) {
    return new URL(
      `https://${vercelUrl}`,
    ).origin;
  }

  const port =
    process.env.PORT
      ?.trim() ||
    "3000";

  return `http://localhost:${port}`;
}

function createIdempotencyKey(
  executionId: string,
  stepId: string,
) {
  const value =
    `automation:${executionId}:${stepId}`;

  if (
    value.length < 8 ||
    value.length > 128
  ) {
    throw new IntegrationAutomationBridgeError(
      "J10 could not create a safe automation action idempotency key.",
      "INTEGRATION_AUTOMATION_IDEMPOTENCY_INVALID",
    );
  }

  return value;
}

async function verifyApprovalEvidence(args: {
  runStepId:
    | string
    | null
    | undefined;
  workflowRunId: string;
  workflowId: string;
  workflowStepId: string;
  userId: string;
}) {
  if (!args.runStepId) {
    return false;
  }

  const supabase =
    createAutomationBridgeServiceClient();

  const {
    data,
    error,
  } = await supabase
    .from(
      "automation_run_steps",
    )
    .select("id")
    .eq(
      "id",
      args.runStepId,
    )
    .eq(
      "run_id",
      args.workflowRunId,
    )
    .eq(
      "automation_id",
      args.workflowId,
    )
    .eq(
      "automation_step_id",
      args.workflowStepId,
    )
    .eq(
      "user_id",
      args.userId,
    )
    .eq(
      "status",
      "queued",
    )
    .eq(
      "approval_status",
      "approved",
    )
    .maybeSingle();

  if (error) {
    throw new IntegrationAutomationBridgeError(
      "J10 could not verify the integration action approval evidence.",
      "INTEGRATION_AUTOMATION_APPROVAL_VERIFICATION_FAILED",
    );
  }

  return Boolean(data);
}

function resultFromDuplicate(
  execution: ReturnType<
    typeof serializeIntegrationActionExecution
  >,
): IntegrationAutomationActionBridgeResult {
  if (
    execution.status ===
      "succeeded"
  ) {
    return {
      success: true,

      status:
        "completed",

      resultText:
        "J10 reused the completed integration action execution.",

      requiresHumanApproval:
        false,

      sideEffectBlocked:
        false,

      metadata: {
        duplicate:
          true,

        execution,
      },
    };
  }

  if (
    execution.status ===
      "blocked" &&
    execution.errorCode ===
      "INTEGRATION_ACTION_APPROVAL_REQUIRED"
  ) {
    return {
      success: true,

      status:
        "awaiting_approval",

      resultText:
        execution.errorMessage ||
        "Integration action is waiting for human approval.",

      requiresHumanApproval:
        true,

      sideEffectBlocked:
        true,

      metadata: {
        duplicate:
          true,

        execution,
      },
    };
  }

  return {
    success: false,

    status:
      "failed",

    resultText:
      execution.errorMessage ||
      (
        execution.status ===
          "executing"
          ? "The integration action is already executing."
          : "The existing integration action execution did not complete successfully."
      ),

    requiresHumanApproval:
      execution.requiresApproval,

    sideEffectBlocked:
      true,

    metadata: {
      duplicate:
        true,

      execution,
    },
  };
}

export async function executeIntegrationAutomationAction(args: {
  workflowId: string;
  workflowName: string;
  stepId: string;
  stepOrder: number;
  workflowContext:
    | Record<string, unknown>
    | null
    | undefined;
  approvalRunStepId?:
    | string
    | null;
}): Promise<IntegrationAutomationActionBridgeResult> {
  const supabase =
    createAutomationBridgeServiceClient();

  const workflowContext =
    normalizeWorkflowContext(
      args.workflowContext,
    );

  const executionId =
    requireString(
      workflowContext.execution.id,
      "Workflow execution ID",
    );

  const {
    data:
      automationData,
    error:
      automationError,
  } =
    await supabase
      .from(
        "automations",
      )
      .select(
        `
        id,
        user_id,
        name
        `,
      )
      .eq(
        "id",
        args.workflowId,
      )
      .maybeSingle();

  if (
    automationError ||
    !automationData
  ) {
    throw new IntegrationAutomationBridgeError(
      "J10 could not verify the integration action workflow.",
      "INTEGRATION_AUTOMATION_WORKFLOW_NOT_FOUND",
    );
  }

  const automation =
    automationData as
      AutomationRow;

  const {
    data:
      stepData,
    error:
      stepError,
  } =
    await supabase
      .from(
        "automation_steps",
      )
      .select(
        `
        id,
        automation_id,
        action_type,
        config
        `,
      )
      .eq(
        "id",
        args.stepId,
      )
      .eq(
        "automation_id",
        automation.id,
      )
      .maybeSingle();

  if (
    stepError ||
    !stepData
  ) {
    throw new IntegrationAutomationBridgeError(
      "J10 could not load the integration action configuration.",
      "INTEGRATION_AUTOMATION_STEP_NOT_FOUND",
    );
  }

  const step =
    stepData as
      AutomationStepRow;

  if (
    step.action_type !==
      "integration_action"
  ) {
    throw new IntegrationAutomationBridgeError(
      "The workflow step is not configured as an integration action.",
      "INTEGRATION_AUTOMATION_ACTION_TYPE_INVALID",
    );
  }

  const approvalGranted =
    await verifyApprovalEvidence({
      runStepId:
        args.approvalRunStepId,
      workflowRunId:
        executionId,
      workflowId:
        automation.id,
      workflowStepId:
        step.id,
      userId:
        automation.user_id,
    });

  const config =
    readActionConfig(
      step,
      workflowContext,
    );

  const connection =
    await getIntegrationConnectionById(
      supabase,
      automation.user_id,
      config.connectionId,
    );

  if (!connection) {
    throw new IntegrationAutomationBridgeError(
      "The configured integration connection was not found.",
      "INTEGRATION_AUTOMATION_CONNECTION_NOT_FOUND",
    );
  }

  const capability =
    resolveIntegrationActionCapability(
      connection,
      config.capabilityId,
    );

  const idempotencyKey =
    createIdempotencyKey(
      executionId,
      step.id,
    );

  const actionRequest:
    IntegrationActionRequest = {
      capabilityId:
        capability.id,

      mode:
        config.mode,

      idempotencyKey,

      input:
        config.input,
    };

  const policy =
    evaluateIntegrationActionPolicy(
      connection,
      capability,
      config.mode,
    );

  const plan =
    createIntegrationActionPlan(
      connection,
      capability,
      actionRequest,
      getApplicationOrigin(),
    );

  const fingerprint =
    createIntegrationActionFingerprint(
      connection,
      actionRequest,
    );

  const claim =
    await claimIntegrationActionExecution(
      supabase,
      {
        userId:
          automation.user_id,

        integrationId:
          connection.id,

        providerId:
          connection.providerId,

        capabilityId:
          capability.id,

        mode:
          config.mode,

        idempotencyKey,

        requestFingerprint:
          fingerprint,

        requiresApproval:
          policy.requiresHumanApproval,
      },
    );

  let activeExecution =
    claim.execution;

  if (!claim.claimed) {
    const approvalPending =
      claim.execution.status ===
        "blocked" &&
      claim.execution.errorCode ===
        "INTEGRATION_ACTION_APPROVAL_REQUIRED";

    if (
      !approvalPending ||
      !approvalGranted
    ) {
      return resultFromDuplicate(
        serializeIntegrationActionExecution(
          claim.execution,
        ),
      );
    }

    activeExecution =
      await resumeApprovedIntegrationActionExecution(
        supabase,
        automation.user_id,
        activeExecution.id,
      );
  }

  if (!policy.allowed) {
    const blockedExecution =
      await finishIntegrationActionExecution(
        supabase,
        automation.user_id,
        activeExecution.id,
        {
          status:
            "blocked",

          resultMetadata: {
            source:
              "day14j_automation_bridge",

            workflowId:
              automation.id,

            workflowExecutionId:
              executionId,

            workflowStepId:
              step.id,

            workflowStepOrder:
              args.stepOrder,

            policyCode:
              policy.code,

            policyReason:
              policy.reason,

            risk:
              policy.risk,

            externalRequestSent:
              false,
          },

          errorCode:
            policy.code,

          errorMessage:
            policy.reason,
        },
      );

    const serialized =
      serializeIntegrationActionExecution(
        blockedExecution,
      );


    return {
      success: false,

      status:
        "failed",

      resultText:
        policy.reason,

      requiresHumanApproval:
        policy.requiresHumanApproval,

      sideEffectBlocked:
        true,

      metadata: {
        policy,
        plan,
        execution:
          serialized,
      },
    };
  }

  if (
    policy.requiresHumanApproval &&
    !approvalGranted
  ) {
    const approvalReason =
      "This integration action requires a human decision before J10 may execute it.";

    const blockedExecution =
      await finishIntegrationActionExecution(
        supabase,
        automation.user_id,
        activeExecution.id,
        {
          status:
            "blocked",

          resultMetadata: {
            source:
              "day14k_approval_gate",

            workflowId:
              automation.id,

            workflowExecutionId:
              executionId,

            workflowStepId:
              step.id,

            workflowStepOrder:
              args.stepOrder,

            approvalRunStepId:
              null,

            policyCode:
              policy.code,

            policyReason:
              policy.reason,

            risk:
              policy.risk,

            externalRequestSent:
              false,
          },

          errorCode:
            "INTEGRATION_ACTION_APPROVAL_REQUIRED",

          errorMessage:
            approvalReason,
        },
      );

    return {
      success: true,

      status:
        "awaiting_approval",

      resultText:
        approvalReason,

      requiresHumanApproval:
        true,

      sideEffectBlocked:
        true,

      metadata: {
        policy,
        plan,

        execution:
          serializeIntegrationActionExecution(
            blockedExecution,
          ),
      },
    };
  }

  try {
    const adapterResult =
      await executeIntegrationActionPlan(
        plan,
        actionRequest,
        activeExecution.id,
      );

    const execution =
      await finishIntegrationActionExecution(
        supabase,
        automation.user_id,
        activeExecution.id,
        {
          status:
            adapterResult.success
              ? "succeeded"
              : "failed",

          responseStatus:
            adapterResult.responseStatus,

          resultMetadata: {
            ...adapterResult.metadata,

            source:
              "day14j_automation_bridge",

            workflowId:
              automation.id,

            workflowExecutionId:
              executionId,

            workflowStepId:
              step.id,

            workflowStepOrder:
              args.stepOrder,

            policyCode:
              policy.code,

            risk:
              policy.risk,

            approval: {
              granted:
                approvalGranted,

              runStepId:
                approvalGranted
                  ? args.approvalRunStepId ??
                    null
                  : null,
            },
          },
        },
      );

    const provider =
      getIntegrationProvider(
        connection.providerId,
      );

    await writeIntegrationActivity(
      supabase,
      {
        userId:
          automation.user_id,

        action:
          "integration_automation_action_executed",

        entityId:
          connection.id,

        title:
          `${provider.name} workflow action completed`,

        description:
          `${capability.name} completed from workflow "${args.workflowName}" in ${config.mode} mode.`,

        metadata: {
          source:
            "day14j_automation_bridge",

          automation_id:
            automation.id,

          automation_run_id:
            executionId,

          automation_step_id:
            step.id,

          integration_action_execution_id:
            execution.id,

          provider_id:
            connection.providerId,

          capability_id:
            capability.id,

          mode:
            config.mode,
        },
      },
    );

    return {
      success:
        adapterResult.success,

      status:
        adapterResult.success
          ? "completed"
          : "failed",

      resultText:
        adapterResult.success
          ? `${capability.name} completed through the J10 integration automation bridge.`
          : `${capability.name} did not complete successfully.`,

      /*
      Simulation and sandbox mode never create a real external
      side effect. Live execution remains blocked above for 14K.
      */
      requiresHumanApproval:
        false,

      sideEffectBlocked:
        false,

      metadata: {
        policy,
        plan,

        execution:
          serializeIntegrationActionExecution(
            execution,
          ),
      },
    };
  } catch (error) {
    const code =
      error instanceof
        IntegrationActionError
        ? error.code
        : "INTEGRATION_AUTOMATION_ACTION_FAILED";

    const message =
      error instanceof Error
        ? error.message
        : "Integration automation action failed.";

    await finishIntegrationActionExecution(
      supabase,
      automation.user_id,
      activeExecution.id,
      {
        status:
          "failed",

        resultMetadata: {
          source:
            "day14j_automation_bridge",

          workflowId:
            automation.id,

          workflowExecutionId:
            executionId,

          workflowStepId:
            step.id,

          workflowStepOrder:
            args.stepOrder,

          policyCode:
            policy.code,

          risk:
            policy.risk,

          externalRequestSent:
            config.mode ===
              "live",
        },

        errorCode:
          code,

        errorMessage:
          message,
      },
    );

    throw error;
  }
}