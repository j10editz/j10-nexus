import type {
  AutomationActionType,
  AutomationAfterRetriesMode,
  AutomationFailurePolicyMode,
  AutomationTriggerFilterGroupMode,
  AutomationTriggerFilterOperator,
  AutomationTriggerType,
} from "./automation";

export type J10FlowGraphVersion = "2026-08-day16";

export type J10FlowNodeId = string;

export type J10FlowNodeKind =
  | "trigger"
  | "ai_task"
  | "action"
  | "condition"
  | "approval"
  | "activity";

export type J10FlowPosition = {
  x: number;
  y: number;
};

export type J10FlowBaseNode = {
  id: J10FlowNodeId;
  kind: J10FlowNodeKind;
  label: string;
  position: J10FlowPosition;
  enabled: boolean;
};

export type J10FlowTriggerFilter = {
  field: string;
  operator: AutomationTriggerFilterOperator;
  value: string | number | boolean | null;
};

export type J10FlowTriggerNode = J10FlowBaseNode & {
  kind: "trigger";
  triggerType: AutomationTriggerType;
  triggerConfig: {
    scheduleExpression?: string | null;
    timezone?: string | null;
    provider?: string | null;
    eventType?: string | null;
    filters?: J10FlowTriggerFilter[];
    filterMode?: AutomationTriggerFilterGroupMode;
  };
};

export type J10FlowFailurePolicy = {
  mode: AutomationFailurePolicyMode;
  maxAttempts: number;
  retryDelayMs: number;
  afterRetries: AutomationAfterRetriesMode;
};

export type J10FlowRuntimeConfig = {
  failurePolicy?: J10FlowFailurePolicy;
  executionGuardrails?: {
    stepTimeoutMs: number;
    workflowTimeoutMs: number;
  };
};

export type J10FlowAiTaskNode = J10FlowBaseNode & {
  kind: "ai_task";
  employeeId: string;
  taskType: string;
  instructions: string;
  requiresApproval: boolean;
  config: J10FlowRuntimeConfig;
};

export type J10FlowActionNode = J10FlowBaseNode & {
  kind: "action";
  actionType: AutomationActionType;
  employeeId?: string | null;
  instructions?: string | null;
  requiresApproval: boolean;
  config: J10FlowRuntimeConfig & {
    integration?: {
      provider: string;
      capability: string;
      connectionId?: string | null;
      input: Record<string, unknown>;
    };
  };
};

export type J10FlowConditionRule = {
  left: string;
  operator: AutomationTriggerFilterOperator;
  right: string | number | boolean | null;
};

export type J10FlowConditionNode = J10FlowBaseNode & {
  kind: "condition";
  rules: J10FlowConditionRule[];
  mode: AutomationTriggerFilterGroupMode;
  fallback: "continue" | "stop";
};

export type J10FlowApprovalNode = J10FlowBaseNode & {
  kind: "approval";
  approvalType: "human";
  instructions?: string | null;
};

export type J10FlowActivityNode = J10FlowBaseNode & {
  kind: "activity";
  instructions: string;
  config: J10FlowRuntimeConfig;
};

export type J10FlowNode =
  | J10FlowTriggerNode
  | J10FlowAiTaskNode
  | J10FlowActionNode
  | J10FlowConditionNode
  | J10FlowApprovalNode
  | J10FlowActivityNode;

export type J10FlowEdgeKind =
  | "success"
  | "failure"
  | "true"
  | "false"
  | "next";

export type J10FlowEdge = {
  id: string;
  sourceNodeId: J10FlowNodeId;
  targetNodeId: J10FlowNodeId;
  kind: J10FlowEdgeKind;
};

export type J10FlowGraph = {
  version: J10FlowGraphVersion;
  automationId?: string;
  name: string;
  description?: string | null;
  nodes: J10FlowNode[];
  edges: J10FlowEdge[];
};

export type J10FlowValidationIssue = {
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
};

export type J10FlowValidationResult = {
  valid: boolean;
  errors: J10FlowValidationIssue[];
  warnings: J10FlowValidationIssue[];
};
