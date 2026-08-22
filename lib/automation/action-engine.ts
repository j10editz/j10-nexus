import {
  executeIntegrationAutomationAction,
} from "@/lib/integrations/automation-action-bridge";

export type AutomationActionType =
  | "analyze_crm"
  | "generate_recommendation"
  | "add_crm_note"
  | "update_crm_status"
  | "run_research"
  | "record_activity"
  | "integration_action";

export type AutomationActionStatus =
  | "completed"
  | "awaiting_approval"
  | "failed";

export type AutomationSafetyClassification =
  | "safe"
  | "human_controlled"
  | "blocked";

export type AutomationSafetyPolicy = {
  operation: string;
  classification:
    AutomationSafetyClassification;
  requiresHumanApproval: boolean;
  allowAutomaticExecution: boolean;
  reason: string;
};

export type AutomationActionContext = {
  actionType:
    AutomationActionType;

  workflowId: string;
  workflowName: string;

  stepId: string;
  stepOrder: number;
  stepName: string | null;

  instructions: string | null;

  triggerPayload:
    Record<string, unknown>;

  workflowContext?:
    | Record<string, unknown>
    | null;

  employeeId?: string | null;
  employeeName?: string | null;

  approvalRunStepId?:
    | string
    | null;
};

export type AutomationActionResult = {
  success: boolean;
  status:
    AutomationActionStatus;
  actionType:
    AutomationActionType;
  resultText: string;
  requiresHumanApproval:
    boolean;
  sideEffectBlocked:
    boolean;
  metadata:
    Record<string, unknown>;
};

const SAFE_OPERATIONS =
  new Set([
    "analyze_crm",
    "generate_recommendation",
    "run_research",
    "record_activity",
    "assign_ai_task",
    "run_ai_employee",
    "draft",
    "score",
    "organize",
    "classify",
  ]);

const HUMAN_CONTROLLED_OPERATIONS =
  new Set([
    "add_crm_note",
    "update_crm_status",
    "close_deal",
    "send_external_message",
    "send_email",
    "send_whatsapp",
    "payment",
    "refund",
    "delete_important_data",
    "delete_crm_contact",
    "account_change",
    "permission_change",
    "integration_action",
  ]);

export function getAutomationSafetyPolicy(
  operation: string,
): AutomationSafetyPolicy {
  const normalized =
    operation
      .trim()
      .toLowerCase();

  if (
    SAFE_OPERATIONS.has(
      normalized,
    )
  ) {
    return {
      operation:
        normalized,

      classification:
        "safe",

      requiresHumanApproval:
        false,

      allowAutomaticExecution:
        true,

      reason:
        "This operation is analytical, organizational, or internal and may execute automatically.",
    };
  }

  if (
    HUMAN_CONTROLLED_OPERATIONS
      .has(normalized)
  ) {
    return {
      operation:
        normalized,

      classification:
        "human_controlled",

      requiresHumanApproval:
        true,

      allowAutomaticExecution:
        false,

      reason:
        "This operation can change business data, communicate externally, affect money, permissions, deals, or important records.",
    };
  }

  return {
    operation:
      normalized ||
      "unknown",

    classification:
      "blocked",

    requiresHumanApproval:
      true,

    allowAutomaticExecution:
      false,

    reason:
      "J10 does not recognize this operation, so automatic execution is blocked by default.",
  };
}

export type ProtectedAutomationAction =
  | "add_crm_note"
  | "update_crm_status";

export function isProtectedAutomationAction(
  operation:
    | string
    | null
    | undefined,
): operation is
  ProtectedAutomationAction {
  if (!operation) {
    return false;
  }

  return (
    operation ===
      "add_crm_note" ||
    operation ===
      "update_crm_status"
  );
}

export function isAutomationActionType(
  value: string,
): value is
  AutomationActionType {
  return [
    "analyze_crm",
    "generate_recommendation",
    "add_crm_note",
    "update_crm_status",
    "run_research",
    "record_activity",
    "integration_action",
  ].includes(value);
}

export function requiresHumanApprovalForAction(
  actionType:
    AutomationActionType,
) {
  return getAutomationSafetyPolicy(
    actionType,
  ).requiresHumanApproval;
}

export async function executeAutomationAction(
  context:
    AutomationActionContext,
): Promise<AutomationActionResult> {
  const {
    actionType,
    workflowId,
    workflowName,
    stepId,
    stepOrder,
    stepName,
    instructions,
    triggerPayload,
    workflowContext,
    employeeId,
    employeeName,
    approvalRunStepId,
  } = context;

  const safety =
    getAutomationSafetyPolicy(
      actionType,
    );

  const baseMetadata = {
    workflowId,
    workflowName,
    stepId,
    stepOrder,
    stepName,

    employeeId:
      employeeId ?? null,

    employeeName:
      employeeName ?? null,

    triggerPayload,

    safety: {
      classification:
        safety.classification,

      requiresHumanApproval:
        safety
          .requiresHumanApproval,

      allowAutomaticExecution:
        safety
          .allowAutomaticExecution,

      reason:
        safety.reason,
    },
  };

  if (
    actionType ===
      "integration_action"
  ) {
    const bridgeResult =
      await executeIntegrationAutomationAction({
        workflowId,
        workflowName,
        stepId,
        stepOrder,
        workflowContext,
        approvalRunStepId,
      });

    return {
      success:
        bridgeResult.success,

      status:
        bridgeResult.status,

      actionType,

      resultText:
        bridgeResult.resultText,

      requiresHumanApproval:
        bridgeResult
          .requiresHumanApproval,

      sideEffectBlocked:
        bridgeResult
          .sideEffectBlocked,

      metadata: {
        ...baseMetadata,

        operation:
          "integration_automation",

        bridge:
          bridgeResult.metadata,
      },
    };
  }

  if (
    actionType ===
      "analyze_crm"
  ) {
    return {
      success: true,
      status: "completed",
      actionType,

      resultText: [
        "J10 CRM ANALYSIS",
        "",
        `Workflow: ${workflowName}`,
        `Step: ${stepName ?? `Step ${stepOrder}`}`,
        "",
        instructions
          ? `Instructions: ${instructions}`
          : "Analyze the available CRM context and identify useful business signals.",
        "",
        "Status: Analysis completed without performing external or destructive actions.",
      ].join("\n"),

      requiresHumanApproval:
        false,

      sideEffectBlocked:
        false,

      metadata: {
        ...baseMetadata,
        operation:
          "analysis",
      },
    };
  }

  if (
    actionType ===
      "generate_recommendation"
  ) {
    return {
      success: true,
      status: "completed",
      actionType,

      resultText: [
        "J10 BUSINESS RECOMMENDATION",
        "",
        `Workflow: ${workflowName}`,
        `Step: ${stepName ?? `Step ${stepOrder}`}`,
        "",
        instructions
          ? `Business objective: ${instructions}`
          : "Generate a recommended next business action from the available workflow context.",
        "",
        "Recommendation generated.",
        "No external action was performed automatically.",
      ].join("\n"),

      requiresHumanApproval:
        false,

      sideEffectBlocked:
        false,

      metadata: {
        ...baseMetadata,
        operation:
          "recommendation",
      },
    };
  }

  if (
    actionType ===
      "add_crm_note"
  ) {
    return {
      success: true,

      status:
        "awaiting_approval",

      actionType,

      resultText: [
        "J10 CRM NOTE ACTION",
        "",
        "A CRM note change was requested.",
        "",
        instructions
          ? `Requested note: ${instructions}`
          : "No CRM note content was supplied.",
        "",
        "J10 Safety Policy requires human approval before the CRM mutation can execute.",
      ].join("\n"),

      requiresHumanApproval:
        true,

      sideEffectBlocked:
        true,

      metadata: {
        ...baseMetadata,

        operation:
          "crm_write",

        requestedAction:
          "add_crm_note",
      },
    };
  }

  if (
    actionType ===
      "update_crm_status"
  ) {
    return {
      success: true,

      status:
        "awaiting_approval",

      actionType,

      resultText: [
        "J10 CRM STATUS ACTION",
        "",
        "A CRM status change was requested.",
        "",
        instructions
          ? `Requested change: ${instructions}`
          : "No CRM status instructions were supplied.",
        "",
        "J10 Safety Policy requires human approval before the CRM mutation can execute.",
      ].join("\n"),

      requiresHumanApproval:
        true,

      sideEffectBlocked:
        true,

      metadata: {
        ...baseMetadata,

        operation:
          "crm_write",

        requestedAction:
          "update_crm_status",
      },
    };
  }

  if (
    actionType ===
      "run_research"
  ) {
    return {
      success: true,
      status: "completed",
      actionType,

      resultText: [
        "J10 RESEARCH ACTION",
        "",
        `Workflow: ${workflowName}`,
        "",
        instructions
          ? `Research objective: ${instructions}`
          : "Research objective prepared from the workflow context.",
        "",
        employeeName
          ? `Assigned intelligence context: ${employeeName}`
          : "No AI employee was directly assigned to this business action.",
        "",
        "Research action prepared successfully.",
      ].join("\n"),

      requiresHumanApproval:
        false,

      sideEffectBlocked:
        false,

      metadata: {
        ...baseMetadata,
        operation:
          "research",
      },
    };
  }

  if (
    actionType ===
      "record_activity"
  ) {
    return {
      success: true,
      status: "completed",
      actionType,

      resultText:
        instructions ||
        `Workflow "${workflowName}" recorded an activity at Step ${stepOrder}.`,

      requiresHumanApproval:
        false,

      sideEffectBlocked:
        false,

      metadata: {
        ...baseMetadata,
        operation:
          "activity",
      },
    };
  }

  return {
    success: false,
    status: "failed",
    actionType,

    resultText:
      "J10 Safety Policy blocked an unsupported automation action.",

    requiresHumanApproval:
      true,

    sideEffectBlocked:
      true,

    metadata: {
      ...baseMetadata,
      operation:
        "unknown",
    },
  };
}