export type AutomationActionType =
  | "analyze_crm"
  | "generate_recommendation"
  | "add_crm_note"
  | "update_crm_status"
  | "run_research"
  | "record_activity";

export type AutomationActionStatus =
  | "completed"
  | "awaiting_approval"
  | "failed";

export type AutomationActionContext = {
  actionType: AutomationActionType;

  workflowId: string;
  workflowName: string;

  stepId: string;
  stepOrder: number;
  stepName: string | null;

  instructions: string | null;

  triggerPayload: Record<string, unknown>;

  employeeId?: string | null;
  employeeName?: string | null;
};

export type AutomationActionResult = {
  success: boolean;

  status: AutomationActionStatus;

  actionType: AutomationActionType;

  resultText: string;

  requiresHumanApproval: boolean;

  sideEffectBlocked: boolean;

  metadata: Record<string, unknown>;
};

const humanControlledActions: AutomationActionType[] = [
  "add_crm_note",
  "update_crm_status",
];

export function isAutomationActionType(
  value: string
): value is AutomationActionType {
  return [
    "analyze_crm",
    "generate_recommendation",
    "add_crm_note",
    "update_crm_status",
    "run_research",
    "record_activity",
  ].includes(value);
}

export function requiresHumanApprovalForAction(
  actionType: AutomationActionType
) {
  return humanControlledActions.includes(actionType);
}

export async function executeAutomationAction(
  context: AutomationActionContext
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
    employeeId,
    employeeName,
  } = context;

  const baseMetadata = {
    workflowId,
    workflowName,
    stepId,
    stepOrder,
    stepName,
    employeeId: employeeId ?? null,
    employeeName: employeeName ?? null,
    triggerPayload,
  };

  /*
  ============================================================
  CRM ANALYSIS
  Safe read/analyze operation.
  ============================================================
  */

  if (actionType === "analyze_crm") {
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

      requiresHumanApproval: false,

      sideEffectBlocked: false,

      metadata: {
        ...baseMetadata,
        operation: "analysis",
      },
    };
  }

  /*
  ============================================================
  RECOMMENDATION
  Safe recommendation-only operation.
  ============================================================
  */

  if (actionType === "generate_recommendation") {
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

      requiresHumanApproval: false,

      sideEffectBlocked: false,

      metadata: {
        ...baseMetadata,
        operation: "recommendation",
      },
    };
  }

  /*
  ============================================================
  CRM NOTE
  Side-effect operation.
  Human approval required before database mutation.
  ============================================================
  */

  if (actionType === "add_crm_note") {
    return {
      success: true,

      status: "awaiting_approval",

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
        "J10 blocked the database mutation until human approval.",
      ].join("\n"),

      requiresHumanApproval: true,

      sideEffectBlocked: true,

      metadata: {
        ...baseMetadata,
        operation: "crm_write",
        requestedAction: "add_crm_note",
      },
    };
  }

  /*
  ============================================================
  CRM STATUS
  Side-effect operation.
  Human approval required before database mutation.
  ============================================================
  */

  if (actionType === "update_crm_status") {
    return {
      success: true,

      status: "awaiting_approval",

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
        "J10 blocked the database mutation until human approval.",
      ].join("\n"),

      requiresHumanApproval: true,

      sideEffectBlocked: true,

      metadata: {
        ...baseMetadata,
        operation: "crm_write",
        requestedAction: "update_crm_status",
      },
    };
  }

  /*
  ============================================================
  RESEARCH ACTION
  This prepares research work.
  Dedicated AI Employee task execution remains handled by the
  existing AI workforce engine.
  ============================================================
  */

  if (actionType === "run_research") {
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

      requiresHumanApproval: false,

      sideEffectBlocked: false,

      metadata: {
        ...baseMetadata,
        operation: "research",
      },
    };
  }

  /*
  ============================================================
  ACTIVITY
  Internal operational event.
  ============================================================
  */

  if (actionType === "record_activity") {
    return {
      success: true,

      status: "completed",

      actionType,

      resultText:
        instructions ||
        `Workflow "${workflowName}" recorded an activity at Step ${stepOrder}.`,

      requiresHumanApproval: false,

      sideEffectBlocked: false,

      metadata: {
        ...baseMetadata,
        operation: "activity",
      },
    };
  }

  /*
  ============================================================
  SAFETY FALLBACK
  ============================================================
  */

  return {
    success: false,

    status: "failed",

    actionType,

    resultText:
      "J10 could not execute this automation action.",

    requiresHumanApproval: false,

    sideEffectBlocked: true,

    metadata: {
      ...baseMetadata,
      operation: "unknown",
    },
  };
}