import type {
  AutomationActionType,
  AutomationTriggerType,
} from "@/types/automation";

import type {
  J10FlowGraph,
  J10FlowNode,
} from "@/types/automation-graph";

export type RuntimeAutomationForGraph = {
  id: string;
  name: string;
  description: string | null;
  trigger_type: AutomationTriggerType;
  trigger_config: Record<string, unknown> | null;
  schedule_expression: string | null;
  timezone: string | null;
};

export type RuntimeStepForGraph = {
  id: string;
  step_order: number;
  name: string | null;
  step_type: "ai_task" | "action" | "condition" | "approval" | "activity";
  action_type: string | null;
  employee_id: string | null;
  task_type: string | null;
  instructions: string | null;
  config: Record<string, unknown> | null;
  condition_config: Record<string, unknown> | null;
  requires_approval: boolean;
  on_success_step_id: string | null;
  on_failure_step_id: string | null;
  is_enabled: boolean;
};

export function buildJ10FlowGraphFromRuntime(
  automation: RuntimeAutomationForGraph,
  runtimeSteps: RuntimeStepForGraph[],
): J10FlowGraph {
  const steps = [...runtimeSteps].sort(
    (left, right) => left.step_order - right.step_order,
  );
  const triggerNodeId = `trigger-${automation.id}`;
  const triggerConfig = isRecord(automation.trigger_config)
    ? automation.trigger_config
    : {};

  const nodes: J10FlowNode[] = [
    {
      id: triggerNodeId,
      kind: "trigger",
      nodeVersion: 1,
      label: formatCodeLabel(automation.trigger_type),
      position: { x: 120, y: 120 },
      enabled: true,
      triggerType: automation.trigger_type,
      triggerConfig: {
        scheduleExpression:
          automation.schedule_expression ??
          readNullableString(triggerConfig.scheduleExpression),
        timezone:
          automation.timezone ??
          readNullableString(triggerConfig.timezone) ??
          "UTC",
        provider: readNullableString(triggerConfig.provider),
        eventType: readNullableString(triggerConfig.eventType),
        connectionId: readNullableString(triggerConfig.connectionId),
        filters: Array.isArray(triggerConfig.filters)
          ? (triggerConfig.filters as never[])
          : [],
        filterMode: triggerConfig.filterMode === "any" ? "any" : "all",
      },
    },
    ...steps.map((step, index) => runtimeStepToNode(step, index)),
  ];

  const stepNodeId = new Map(
    steps.map((step) => [step.id, `step-${step.id}`]),
  );
  const edges: J10FlowGraph["edges"] = [];

  if (steps[0]) {
    edges.push({
      id: `edge-${triggerNodeId}-${steps[0].id}`,
      sourceNodeId: triggerNodeId,
      targetNodeId: `step-${steps[0].id}`,
      kind: "next",
      sourcePortId: "next",
      targetPortId: "input",
    });
  }

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    const sourceNodeId = `step-${step.id}`;
    const explicitSuccess = step.on_success_step_id
      ? stepNodeId.get(step.on_success_step_id) ?? null
      : null;
    const explicitFailure = step.on_failure_step_id
      ? stepNodeId.get(step.on_failure_step_id) ?? null
      : null;
    const nextNodeId = steps[index + 1]
      ? `step-${steps[index + 1].id}`
      : null;

    if (step.step_type === "condition") {
      const trueTarget = explicitSuccess ?? nextNodeId;
      const falseTarget = explicitFailure;

      if (trueTarget) {
        edges.push({
          id: `edge-${step.id}-true-${trueTarget}`,
          sourceNodeId,
          targetNodeId: trueTarget,
          kind: "true",
          sourcePortId: "true",
          targetPortId: "input",
        });
      }

      if (falseTarget) {
        edges.push({
          id: `edge-${step.id}-false-${falseTarget}`,
          sourceNodeId,
          targetNodeId: falseTarget,
          kind: "false",
          sourcePortId: "false",
          targetPortId: "input",
        });
      }

      continue;
    }

    const successTarget = explicitSuccess ?? nextNodeId;

    if (successTarget) {
      edges.push({
        id: `edge-${step.id}-next-${successTarget}`,
        sourceNodeId,
        targetNodeId: successTarget,
        kind: "next",
        sourcePortId: "next",
        targetPortId: "input",
      });
    }

    if (explicitFailure) {
      edges.push({
        id: `edge-${step.id}-failure-${explicitFailure}`,
        sourceNodeId,
        targetNodeId: explicitFailure,
        kind: "failure",
        sourcePortId: "failure",
        targetPortId: "input",
      });
    }
  }

  return {
    version: "2026-08-day16",
    automationId: automation.id,
    name: automation.name,
    description: automation.description,
    nodes,
    edges,
    variables: {},
  };
}

function runtimeStepToNode(
  step: RuntimeStepForGraph,
  index: number,
): J10FlowNode {
  const base = {
    id: `step-${step.id}`,
    nodeVersion: 1 as const,
    label: step.name || formatCodeLabel(step.step_type),
    position: {
      x: 120 + (index % 3) * 320,
      y: 360 + Math.floor(index / 3) * 220,
    },
    enabled: step.is_enabled,
  };
  const config = isRecord(step.config) ? step.config : {};

  if (step.step_type === "ai_task") {
    return {
      ...base,
      kind: "ai_task",
      employeeId: step.employee_id ?? "",
      taskType: step.task_type ?? "general",
      instructions: step.instructions ?? "",
      requiresApproval: step.requires_approval,
      config,
    };
  }

  if (step.step_type === "condition") {
    const condition = isRecord(step.condition_config)
      ? step.condition_config
      : {};
    const rules = Array.isArray(condition.rules)
      ? condition.rules
      : [];

    return {
      ...base,
      kind: "condition",
      rules: rules as never[],
      mode: condition.mode === "any" ? "any" : "all",
      fallback: condition.fallback === "continue" ? "continue" : "stop",
    };
  }

  if (step.step_type === "approval") {
    return {
      ...base,
      kind: "approval",
      approvalType: "human",
      instructions: step.instructions,
    };
  }

  if (step.step_type === "activity") {
    return {
      ...base,
      kind: "activity",
      instructions: step.instructions ?? "Record workflow activity.",
      config,
    };
  }

  return {
    ...base,
    kind: "action",
    actionType:
      (step.action_type ?? "record_activity") as AutomationActionType,
    employeeId: step.employee_id,
    instructions: step.instructions,
    requiresApproval: step.requires_approval,
    config: normalizeIntegrationConfig(config),
  };
}

function normalizeIntegrationConfig(
  config: Record<string, unknown>,
) {
  const graphIntegration = isRecord(config.integration)
    ? config.integration
    : null;
  const runtime = isRecord(config.integrationAction)
    ? config.integrationAction
    : isRecord(config.integration_action)
      ? config.integration_action
      : null;

  if (!graphIntegration && !runtime) {
    return config;
  }

  const capability =
    readNullableString(graphIntegration?.capability) ??
    readNullableString(runtime?.capabilityId) ??
    readNullableString(runtime?.capability) ??
    readNullableString(config.capabilityId) ??
    "";
  const provider =
    readNullableString(graphIntegration?.provider) ??
    readNullableString(runtime?.providerId) ??
    readNullableString(config.providerId) ??
    inferProviderFromCapability(capability);
  const connectionId = readNullableString(
    graphIntegration?.connectionId ??
      runtime?.connectionId ??
      runtime?.integrationId ??
      config.connectionId ??
      config.integrationId,
  );
  const configuredMode = graphIntegration?.mode ?? runtime?.mode;
  const mode =
    configuredMode === "sandbox" || configuredMode === "live"
      ? configuredMode
      : "simulate";
  const input = isRecord(graphIntegration?.input)
    ? graphIntegration.input
    : isRecord(runtime?.input)
      ? runtime.input
      : isRecord(config.input)
        ? config.input
        : {};

  return {
    ...config,
    integration: {
      provider,
      capability,
      connectionId,
      mode,
      input,
    },
    integrationAction: {
      connectionId,
      capabilityId: capability,
      mode,
      input,
    },
  };
}

function inferProviderFromCapability(capability: string) {
  const separatorIndex = capability.indexOf(".");

  return separatorIndex > 0
    ? capability.slice(0, separatorIndex)
    : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readNullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function formatCodeLabel(value: string) {
  return value
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
