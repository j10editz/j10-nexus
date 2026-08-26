import type {
  AutomationActionType,
  AutomationTriggerType,
} from "@/types/automation";

import type {
  J10FlowEdge,
  J10FlowGraph,
  J10FlowNode,
  J10FlowValidationIssue,
  J10FlowValidationResult,
} from "@/types/automation-graph";

export const J10_FLOW_GRAPH_VERSION = "2026-08-day16" as const;

export const J10_FLOW_TRIGGER_TYPES = [
  "manual",
  "new_crm_contact",
  "crm_status_changed",
  "new_ai_task",
  "ai_task_completed",
  "schedule",
  "integration_event",
] as const satisfies readonly AutomationTriggerType[];

export const J10_FLOW_ACTION_TYPES = [
  "run_ai_employee",
  "analyze_crm",
  "generate_recommendation",
  "add_crm_note",
  "update_crm_status",
  "run_research",
  "record_activity",
  "evaluate_condition",
  "human_approval",
  "integration_action",
] as const satisfies readonly AutomationActionType[];

export function validateJ10FlowGraph(
  graph: J10FlowGraph
): J10FlowValidationResult {
  const errors: J10FlowValidationIssue[] = [];
  const warnings: J10FlowValidationIssue[] = [];

  if (graph.version !== J10_FLOW_GRAPH_VERSION) {
    errors.push({
      code: "unsupported_graph_version",
      message: "Unsupported J10 Flow graph version.",
    });
  }

  if (!graph.name.trim()) {
    errors.push({
      code: "missing_graph_name",
      message: "Workflow name is required.",
    });
  }

  const triggerNodes = graph.nodes.filter(
    (node) => node.kind === "trigger"
  );

  if (triggerNodes.length !== 1) {
    errors.push({
      code: "invalid_trigger_count",
      message: "A workflow graph must contain exactly one trigger node.",
    });
  }

  const nodeIds = new Set<string>();

  for (const node of graph.nodes) {
    validateNode(node, nodeIds, errors, warnings);
  }

  const enabledNodeIds = new Set(
    graph.nodes
      .filter((node) => node.enabled)
      .map((node) => node.id)
  );

  for (const edge of graph.edges) {
    validateEdge(edge, enabledNodeIds, errors);
  }

  validateReachability(graph, enabledNodeIds, errors, warnings);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function validateNode(
  node: J10FlowNode,
  nodeIds: Set<string>,
  errors: J10FlowValidationIssue[],
  warnings: J10FlowValidationIssue[]
) {
  if (!node.id.trim()) {
    errors.push({
      code: "missing_node_id",
      message: "Every graph node needs a stable node id.",
    });

    return;
  }

  if (nodeIds.has(node.id)) {
    errors.push({
      code: "duplicate_node_id",
      message: "Graph node ids must be unique.",
      nodeId: node.id,
    });
  }

  nodeIds.add(node.id);

  if (!node.label.trim()) {
    warnings.push({
      code: "missing_node_label",
      message: "Node label is empty.",
      nodeId: node.id,
    });
  }

  if (node.kind === "trigger") {
    if (!J10_FLOW_TRIGGER_TYPES.includes(node.triggerType)) {
      errors.push({
        code: "unsupported_trigger_type",
        message: "Trigger type is not supported by the Day 12-15 runtime.",
        nodeId: node.id,
      });
    }

    if (
      node.triggerType === "schedule" &&
      !node.triggerConfig.scheduleExpression
    ) {
      errors.push({
        code: "missing_schedule_expression",
        message: "Scheduled workflows require a schedule expression.",
        nodeId: node.id,
      });
    }

    if (
      node.triggerType === "integration_event" &&
      (!node.triggerConfig.provider || !node.triggerConfig.eventType)
    ) {
      errors.push({
        code: "missing_integration_trigger_config",
        message: "Integration event triggers require provider and event type.",
        nodeId: node.id,
      });
    }
  }

  if (node.kind === "ai_task" && !node.employeeId) {
    errors.push({
      code: "missing_ai_employee",
      message: "AI task nodes require an exact AI employee.",
      nodeId: node.id,
    });
  }

  if (node.kind === "action") {
    if (!J10_FLOW_ACTION_TYPES.includes(node.actionType)) {
      errors.push({
        code: "unsupported_action_type",
        message: "Action type is not supported by the Day 12-15 runtime.",
        nodeId: node.id,
      });
    }

    if (node.actionType === "integration_action") {
      const integration = node.config.integration;

      if (
        !integration ||
        !integration.provider ||
        !integration.capability
      ) {
        errors.push({
          code: "missing_integration_action_config",
          message:
            "Integration action nodes require provider and capability.",
          nodeId: node.id,
        });
      }
    }
  }

  if (node.kind === "condition" && node.rules.length === 0) {
    errors.push({
      code: "missing_condition_rules",
      message: "Condition nodes require at least one typed rule.",
      nodeId: node.id,
    });
  }

  if (node.kind === "activity" && !node.instructions.trim()) {
    errors.push({
      code: "missing_activity_instructions",
      message: "Activity nodes require instructions.",
      nodeId: node.id,
    });
  }
}

function validateEdge(
  edge: J10FlowEdge,
  enabledNodeIds: Set<string>,
  errors: J10FlowValidationIssue[]
) {
  if (!enabledNodeIds.has(edge.sourceNodeId)) {
    errors.push({
      code: "edge_source_missing",
      message: "Edge source node does not exist or is disabled.",
      edgeId: edge.id,
    });
  }

  if (!enabledNodeIds.has(edge.targetNodeId)) {
    errors.push({
      code: "edge_target_missing",
      message: "Edge target node does not exist or is disabled.",
      edgeId: edge.id,
    });
  }

  if (edge.sourceNodeId === edge.targetNodeId) {
    errors.push({
      code: "self_referencing_edge",
      message: "A graph edge cannot point to the same node.",
      edgeId: edge.id,
    });
  }
}

function validateReachability(
  graph: J10FlowGraph,
  enabledNodeIds: Set<string>,
  errors: J10FlowValidationIssue[],
  warnings: J10FlowValidationIssue[]
) {
  const trigger = graph.nodes.find(
    (node) => node.kind === "trigger" && node.enabled
  );

  if (!trigger) {
    return;
  }

  const outgoing = new Map<string, string[]>();

  for (const edge of graph.edges) {
    if (
      !enabledNodeIds.has(edge.sourceNodeId) ||
      !enabledNodeIds.has(edge.targetNodeId)
    ) {
      continue;
    }

    const targets = outgoing.get(edge.sourceNodeId) ?? [];
    targets.push(edge.targetNodeId);
    outgoing.set(edge.sourceNodeId, targets);
  }

  const visited = new Set<string>();
  const queue = [trigger.id];

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current || visited.has(current)) {
      continue;
    }

    visited.add(current);

    for (const target of outgoing.get(current) ?? []) {
      queue.push(target);
    }
  }

  for (const nodeId of enabledNodeIds) {
    if (!visited.has(nodeId)) {
      warnings.push({
        code: "unreachable_node",
        message: "Enabled node is not reachable from the trigger.",
        nodeId,
      });
    }
  }

  if ((outgoing.get(trigger.id) ?? []).length === 0) {
    errors.push({
      code: "trigger_has_no_path",
      message: "The trigger must connect to at least one enabled node.",
      nodeId: trigger.id,
    });
  }
}
