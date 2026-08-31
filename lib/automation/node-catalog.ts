import type {
  IntegrationCapabilityDefinition,
  IntegrationProviderDefinition,
} from "@/types/integration";

import type {
  J10FlowNode,
  J10FlowNodeKind,
  J10FlowPosition,
  J10FlowPortId,
} from "@/types/automation-graph";

import {
  listIntegrationProviders,
} from "@/lib/integrations/registry";

export type J10FlowCatalogCategory =
  | "trigger"
  | "ai"
  | "logic"
  | "business"
  | "integration";

export type J10FlowCatalogField = {
  key: string;
  label: string;
  kind: "text" | "textarea" | "number" | "select" | "connection" | "json";
  required: boolean;
  options?: readonly {
    value: string;
    label: string;
  }[];
};

export type J10FlowNodeCatalogEntry = {
  id: string;
  nodeKind: J10FlowNodeKind | "planned";
  nodeVersion: 1;
  title: string;
  description: string;
  category: J10FlowCatalogCategory;
  iconKey: string;
  available: boolean;
  unavailableReason?: string;
  providerId?: string;
  capabilityId?: string;
  inputPorts: readonly J10FlowPortId[];
  outputPorts: readonly J10FlowPortId[];
  fields: readonly J10FlowCatalogField[];
  createNode?: (id: string, position: J10FlowPosition) => J10FlowNode;
};

const DEFAULT_RUNTIME_CONFIG = {
  failurePolicy: {
    mode: "stop" as const,
    maxAttempts: 3,
    retryDelayMs: 0,
    afterRetries: "stop" as const,
  },
  executionGuardrails: {
    stepTimeoutMs: 30_000,
    workflowTimeoutMs: 120_000,
  },
};

const TRIGGER_ENTRIES: readonly J10FlowNodeCatalogEntry[] = [
  triggerEntry({
    id: "trigger.manual",
    title: "Manual Trigger",
    description: "Start a workflow from an authenticated manual run.",
    iconKey: "play",
    triggerType: "manual",
  }),
  triggerEntry({
    id: "trigger.schedule",
    title: "Schedule",
    description: "Start automatically from the existing J10 scheduler.",
    iconKey: "clock",
    triggerType: "schedule",
    fields: [
      {
        key: "triggerConfig.scheduleExpression",
        label: "Schedule expression",
        kind: "text",
        required: true,
      },
      {
        key: "triggerConfig.timezone",
        label: "Time zone",
        kind: "text",
        required: true,
      },
    ],
  }),
  triggerEntry({
    id: "trigger.crm.contact_created",
    title: "New CRM Contact",
    description: "Start when J10 creates a CRM contact.",
    iconKey: "contact",
    triggerType: "new_crm_contact",
  }),
  triggerEntry({
    id: "trigger.crm.status_changed",
    title: "CRM Status Changed",
    description: "Start when a CRM contact changes lifecycle status.",
    iconKey: "refresh",
    triggerType: "crm_status_changed",
  }),
  triggerEntry({
    id: "trigger.ai_task.created",
    title: "New AI Task",
    description: "Start when a new AI task is created.",
    iconKey: "bot",
    triggerType: "new_ai_task",
  }),
  triggerEntry({
    id: "trigger.ai_task.completed",
    title: "AI Task Completed",
    description: "Start when an AI employee finishes a task.",
    iconKey: "check",
    triggerType: "ai_task_completed",
  }),
];

const CORE_ENTRIES: readonly J10FlowNodeCatalogEntry[] = [
  {
    id: "ai.employee_task",
    nodeKind: "ai_task",
    nodeVersion: 1,
    title: "AI Employee Task",
    description: "Assign work to one exact J10 AI employee.",
    category: "ai",
    iconKey: "bot",
    available: true,
    inputPorts: ["input"],
    outputPorts: ["next"],
    fields: [
      {
        key: "employeeId",
        label: "AI employee",
        kind: "select",
        required: true,
      },
      {
        key: "taskType",
        label: "Task type",
        kind: "text",
        required: true,
      },
      {
        key: "instructions",
        label: "Instructions",
        kind: "textarea",
        required: true,
      },
    ],
    createNode: (id, position) => ({
      id,
      kind: "ai_task",
      nodeVersion: 1,
      label: "AI Employee Task",
      position,
      enabled: true,
      employeeId: "",
      taskType: "general",
      instructions: "",
      requiresApproval: false,
      config: structuredClone(DEFAULT_RUNTIME_CONFIG),
    }),
  },
  actionEntry({
    id: "action.crm.analyze",
    title: "Analyze CRM",
    description: "Analyze current CRM context without changing business data.",
    iconKey: "search",
    actionType: "analyze_crm",
  }),
  actionEntry({
    id: "action.recommendation",
    title: "Generate Recommendation",
    description: "Generate a safe internal business recommendation.",
    iconKey: "sparkles",
    actionType: "generate_recommendation",
  }),
  actionEntry({
    id: "action.crm.note",
    title: "Add CRM Note",
    description: "Add a CRM note after explicit human approval.",
    iconKey: "notebook",
    actionType: "add_crm_note",
    requiresApproval: true,
  }),
  actionEntry({
    id: "action.crm.status",
    title: "Update CRM Status",
    description: "Change a CRM status after explicit human approval.",
    iconKey: "users",
    actionType: "update_crm_status",
    requiresApproval: true,
  }),
  actionEntry({
    id: "action.research",
    title: "Run Research",
    description: "Prepare internal research from workflow context.",
    iconKey: "book-open",
    actionType: "run_research",
  }),
  actionEntry({
    id: "action.activity",
    title: "Record Activity",
    description: "Write an auditable internal workflow activity.",
    iconKey: "activity",
    actionType: "record_activity",
  }),
  {
    id: "logic.condition",
    nodeKind: "condition",
    nodeVersion: 1,
    title: "Condition",
    description: "Route execution through explicit true and false branches.",
    category: "logic",
    iconKey: "git-branch",
    available: true,
    inputPorts: ["input"],
    outputPorts: ["true", "false"],
    fields: [
      {
        key: "rules.0.left",
        label: "Context path",
        kind: "text",
        required: true,
      },
      {
        key: "rules.0.operator",
        label: "Operator",
        kind: "select",
        required: true,
        options: [
          { value: "equals", label: "Equals" },
          { value: "not_equals", label: "Does not equal" },
          { value: "contains", label: "Contains" },
          { value: "greater_than", label: "Greater than" },
          { value: "less_than", label: "Less than" },
        ],
      },
      {
        key: "rules.0.right",
        label: "Expected value",
        kind: "text",
        required: true,
      },
    ],
    createNode: (id, position) => ({
      id,
      kind: "condition",
      nodeVersion: 1,
      label: "Condition",
      position,
      enabled: true,
      rules: [
        {
          left: "trigger.value",
          operator: "equals",
          right: "",
        },
      ],
      mode: "all",
      fallback: "stop",
    }),
  },
  {
    id: "logic.human_approval",
    nodeKind: "approval",
    nodeVersion: 1,
    title: "Human Approval",
    description: "Pause safely before a protected action.",
    category: "logic",
    iconKey: "shield-check",
    available: true,
    inputPorts: ["input"],
    outputPorts: ["next"],
    fields: [
      {
        key: "instructions",
        label: "Approval summary",
        kind: "textarea",
        required: false,
      },
    ],
    createNode: (id, position) => ({
      id,
      kind: "approval",
      nodeVersion: 1,
      label: "Human Approval",
      position,
      enabled: true,
      approvalType: "human",
      instructions: "Review and approve this workflow action.",
    }),
  },
  {
    id: "logic.delay",
    nodeKind: "planned",
    nodeVersion: 1,
    title: "Delay",
    description: "Pause execution for a bounded duration.",
    category: "logic",
    iconKey: "timer",
    available: false,
    unavailableReason:
      "The current runtime has no persisted delayed-resume contract. J10 will not fake a delay as an activity step.",
    inputPorts: ["input"],
    outputPorts: ["next"],
    fields: [],
  },
  {
    id: "logic.data_mapping",
    nodeKind: "planned",
    nodeVersion: 1,
    title: "Data Mapping",
    description: "Map validated workflow values into named variables.",
    category: "logic",
    iconKey: "braces",
    available: false,
    unavailableReason:
      "The existing runtime can read variables but does not yet persist a standalone mapping step.",
    inputPorts: ["input"],
    outputPorts: ["next"],
    fields: [],
  },
];

function triggerEntry(input: {
  id: string;
  title: string;
  description: string;
  iconKey: string;
  triggerType:
    | "manual"
    | "new_crm_contact"
    | "crm_status_changed"
    | "new_ai_task"
    | "ai_task_completed"
    | "schedule";
  fields?: readonly J10FlowCatalogField[];
}): J10FlowNodeCatalogEntry {
  return {
    id: input.id,
    nodeKind: "trigger",
    nodeVersion: 1,
    title: input.title,
    description: input.description,
    category: "trigger",
    iconKey: input.iconKey,
    available: true,
    inputPorts: [],
    outputPorts: ["next"],
    fields: input.fields ?? [],
    createNode: (id, position) => ({
      id,
      kind: "trigger",
      nodeVersion: 1,
      label: input.title,
      position,
      enabled: true,
      triggerType: input.triggerType,
      triggerConfig: {
        scheduleExpression:
          input.triggerType === "schedule" ? "0 9 * * 1-5" : null,
        timezone: "UTC",
        filters: [],
        filterMode: "all",
      },
    }),
  };
}

function actionEntry(input: {
  id: string;
  title: string;
  description: string;
  iconKey: string;
  actionType:
    | "analyze_crm"
    | "generate_recommendation"
    | "add_crm_note"
    | "update_crm_status"
    | "run_research"
    | "record_activity";
  requiresApproval?: boolean;
}): J10FlowNodeCatalogEntry {
  return {
    id: input.id,
    nodeKind: "action",
    nodeVersion: 1,
    title: input.title,
    description: input.description,
    category: "business",
    iconKey: input.iconKey,
    available: true,
    inputPorts: ["input"],
    outputPorts: ["next"],
    fields: [
      {
        key: "instructions",
        label: "Instructions",
        kind: "textarea",
        required: false,
      },
    ],
    createNode: (id, position) => ({
      id,
      kind: "action",
      nodeVersion: 1,
      label: input.title,
      position,
      enabled: true,
      actionType: input.actionType,
      instructions: "",
      requiresApproval: input.requiresApproval ?? false,
      config: structuredClone(DEFAULT_RUNTIME_CONFIG),
    }),
  };
}

function integrationEntries(
  provider: IntegrationProviderDefinition,
): J10FlowNodeCatalogEntry[] {
  if (
    provider.availability === "planned"
  ) {
    return [];
  }

  return provider.capabilities.map((capability) =>
    capability.kind === "trigger"
      ? integrationTriggerEntry(provider, capability)
      : integrationActionEntry(provider, capability),
  );
}

function integrationTriggerEntry(
  provider: IntegrationProviderDefinition,
  capability: IntegrationCapabilityDefinition,
): J10FlowNodeCatalogEntry {
  return {
    id: `integration.trigger.${capability.id}`,
    nodeKind: "trigger",
    nodeVersion: 1,
    title: `${provider.name}: ${capability.name}`,
    description: capability.description,
    category: "integration",
    iconKey: provider.iconKey,
    available: true,
    providerId: provider.id,
    capabilityId: capability.id,
    inputPorts: [],
    outputPorts: ["next"],
    fields: [
      {
        key: "triggerConfig.connectionId",
        label: "Connection",
        kind: "connection",
        required: true,
      },
    ],
    createNode: (id, position) => ({
      id,
      kind: "trigger",
      nodeVersion: 1,
      label: `${provider.name}: ${capability.name}`,
      position,
      enabled: true,
      triggerType: "integration_event",
      triggerConfig: {
        provider: provider.id,
        eventType: capability.id,
        connectionId: null,
        filters: [],
        filterMode: "all",
      },
    }),
  };
}

function integrationActionEntry(
  provider: IntegrationProviderDefinition,
  capability: IntegrationCapabilityDefinition,
): J10FlowNodeCatalogEntry {
  return {
    id: `integration.action.${capability.id}`,
    nodeKind: "action",
    nodeVersion: 1,
    title: `${provider.name}: ${capability.name}`,
    description: capability.description,
    category: "integration",
    iconKey: provider.iconKey,
    available: true,
    providerId: provider.id,
    capabilityId: capability.id,
    inputPorts: ["input"],
    outputPorts: ["success"],
    fields: [
      {
        key: "config.integration.connectionId",
        label: "Connection",
        kind: "connection",
        required: true,
      },
      {
        key: "config.integration.mode",
        label: "Execution mode",
        kind: "select",
        required: true,
        options: [
          { value: "simulate", label: "Simulate — no provider call" },
          { value: "sandbox", label: "Sandbox" },
          { value: "live", label: "Live — approval required" },
        ],
      },
      {
        key: "config.integration.input",
        label: "Action input",
        kind: "json",
        required: true,
      },
    ],
    createNode: (id, position) => {
      const integration = {
        provider: provider.id,
        capability: capability.id,
        connectionId: null,
        mode: "simulate" as const,
        input: {},
      };

      return {
        id,
        kind: "action",
        nodeVersion: 1,
        label: `${provider.name}: ${capability.name}`,
        position,
        enabled: true,
        actionType: "integration_action",
        instructions: capability.description,
        requiresApproval: capability.requiresApprovalByDefault,
        config: {
          ...structuredClone(DEFAULT_RUNTIME_CONFIG),
          integration,
          integrationAction: {
            connectionId: null,
            capabilityId: capability.id,
            mode: "simulate",
            input: {},
          },
        },
      };
    },
  };
}

export const J10_FLOW_NODE_CATALOG: readonly J10FlowNodeCatalogEntry[] = [
  ...TRIGGER_ENTRIES,
  ...CORE_ENTRIES,
  ...listIntegrationProviders().flatMap(integrationEntries),
];

export function listJ10FlowNodeCatalog(
  category?: J10FlowCatalogCategory,
) {
  return category
    ? J10_FLOW_NODE_CATALOG.filter((entry) => entry.category === category)
    : [...J10_FLOW_NODE_CATALOG];
}

export function getJ10FlowNodeCatalogEntry(id: string) {
  return J10_FLOW_NODE_CATALOG.find((entry) => entry.id === id) ?? null;
}
