import type {
  AutomationActionType,
  AutomationTriggerFilterOperator,
  AutomationTriggerType,
} from "@/types/automation";

import type {
  J10FlowEdge,
  J10FlowEdgeKind,
  J10FlowGraph,
  J10FlowNode,
  J10FlowNodeKind,
  J10FlowValidationIssue,
  J10FlowValidationResult,
} from "@/types/automation-graph";

export const J10_FLOW_GRAPH_VERSION = "2026-08-day16" as const;

export const J10_FLOW_MAX_GRAPH_BYTES = 512 * 1024;
export const J10_FLOW_MAX_NODES = 200;
export const J10_FLOW_MAX_EDGES = 500;

export const J10_FLOW_NODE_KINDS = [
  "trigger",
  "ai_task",
  "action",
  "condition",
  "approval",
  "activity",
] as const satisfies readonly J10FlowNodeKind[];

export const J10_FLOW_EDGE_KINDS = [
  "next",
  "success",
  "failure",
  "true",
  "false",
] as const satisfies readonly J10FlowEdgeKind[];

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

const FILTER_OPERATORS = [
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
  "greater_than",
  "greater_than_or_equal",
  "less_than",
  "less_than_or_equal",
] as const satisfies readonly AutomationTriggerFilterOperator[];

const SENSITIVE_GRAPH_KEYS = new Set([
  "accesstoken",
  "refreshtoken",
  "authorization",
  "clientsecret",
  "password",
  "apikey",
  "credentials",
  "credentialpayload",
]);

type MutableValidation = {
  errors: J10FlowValidationIssue[];
  warnings: J10FlowValidationIssue[];
};

export function isJ10FlowGraph(
  value: unknown,
): value is J10FlowGraph {
  return (
    isRecord(value) &&
    value.version === J10_FLOW_GRAPH_VERSION &&
    typeof value.name === "string" &&
    Array.isArray(value.nodes) &&
    Array.isArray(value.edges)
  );
}

export function validateJ10FlowGraph(
  value: unknown,
): J10FlowValidationResult {
  const state: MutableValidation = {
    errors: [],
    warnings: [],
  };

  if (!isRecord(value)) {
    addError(state, "invalid_graph", "Workflow graph must be a JSON object.");
    return finish(state);
  }

  validateGraphSize(value, state);

  if (value.version !== J10_FLOW_GRAPH_VERSION) {
    addError(
      state,
      "unsupported_graph_version",
      "Unsupported J10 Flow graph version.",
    );
  }

  if (typeof value.name !== "string" || !value.name.trim()) {
    addError(state, "missing_graph_name", "Workflow name is required.");
  } else if (value.name.trim().length > 160) {
    addError(
      state,
      "graph_name_too_long",
      "Workflow name cannot exceed 160 characters.",
    );
  }

  if (
    value.description !== undefined &&
    value.description !== null &&
    (typeof value.description !== "string" || value.description.length > 4_000)
  ) {
    addError(
      state,
      "invalid_graph_description",
      "Workflow description must be text with at most 4,000 characters.",
    );
  }

  if (!Array.isArray(value.nodes)) {
    addError(state, "invalid_nodes", "Workflow nodes must be an array.");
  }

  if (!Array.isArray(value.edges)) {
    addError(state, "invalid_edges", "Workflow edges must be an array.");
  }

  if (!Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
    return finish(state);
  }

  if (value.nodes.length > J10_FLOW_MAX_NODES) {
    addError(
      state,
      "too_many_nodes",
      `A workflow cannot contain more than ${J10_FLOW_MAX_NODES} nodes.`,
    );
  }

  if (value.edges.length > J10_FLOW_MAX_EDGES) {
    addError(
      state,
      "too_many_edges",
      `A workflow cannot contain more than ${J10_FLOW_MAX_EDGES} edges.`,
    );
  }

  const nodeIds = new Set<string>();
  const enabledNodeIds = new Set<string>();
  const nodes: J10FlowNode[] = [];

  for (const nodeValue of value.nodes) {
    const node = validateNode(nodeValue, nodeIds, state);

    if (!node) {
      continue;
    }

    nodes.push(node);

    if (node.enabled) {
      enabledNodeIds.add(node.id);
    }
  }

  const triggerNodes = nodes.filter((node) => node.kind === "trigger");
  const enabledTriggers = triggerNodes.filter((node) => node.enabled);

  if (triggerNodes.length !== 1 || enabledTriggers.length !== 1) {
    addError(
      state,
      "invalid_trigger_count",
      "A workflow graph must contain exactly one enabled trigger node.",
    );
  }

  const edgeIds = new Set<string>();
  const edgeRoutes = new Set<string>();
  const edges: J10FlowEdge[] = [];

  for (const edgeValue of value.edges) {
    const edge = validateEdge(
      edgeValue,
      edgeIds,
      edgeRoutes,
      enabledNodeIds,
      state,
    );

    if (edge) {
      edges.push(edge);
    }
  }

  validateRouting(nodes, edges, enabledNodeIds, state);

  const trigger = enabledTriggers[0];

  if (trigger) {
    validateReachability(trigger.id, enabledNodeIds, edges, state);
    validateAcyclicGraph(enabledNodeIds, edges, state);
  }

  validateNoSensitiveGraphData(value, state);

  return finish(state);
}

function validateGraphSize(
  graph: Record<string, unknown>,
  state: MutableValidation,
) {
  try {
    const bytes = new TextEncoder().encode(JSON.stringify(graph)).byteLength;

    if (bytes > J10_FLOW_MAX_GRAPH_BYTES) {
      addError(
        state,
        "graph_too_large",
        `Workflow graph cannot exceed ${J10_FLOW_MAX_GRAPH_BYTES} bytes.`,
      );
    }
  } catch {
    addError(
      state,
      "graph_not_serializable",
      "Workflow graph must be safely JSON serializable.",
    );
  }
}

function validateNode(
  value: unknown,
  nodeIds: Set<string>,
  state: MutableValidation,
): J10FlowNode | null {
  if (!isRecord(value)) {
    addError(state, "invalid_node", "Every workflow node must be an object.");
    return null;
  }

  const nodeId = readBoundedString(value.id, 100);

  if (!nodeId) {
    addError(state, "missing_node_id", "Every graph node needs a stable node id.");
    return null;
  }

  if (nodeIds.has(nodeId)) {
    addError(
      state,
      "duplicate_node_id",
      "Graph node ids must be unique.",
      { nodeId },
    );
  }

  nodeIds.add(nodeId);

  if (!isNodeKind(value.kind)) {
    addError(
      state,
      "unknown_node_type",
      "Workflow contains an unregistered node type.",
      { nodeId },
    );
    return null;
  }

  if (value.nodeVersion !== undefined && value.nodeVersion !== 1) {
    addError(
      state,
      "unsupported_node_version",
      "Workflow node uses an unsupported contract version.",
      { nodeId },
    );
  }

  if (value.nodeVersion === undefined) {
    addWarning(
      state,
      "legacy_node_version",
      "Node uses the compatible Day 16 version-1 default.",
      { nodeId },
    );
  }

  if (typeof value.label !== "string" || value.label.trim().length === 0) {
    addWarning(state, "missing_node_label", "Node label is empty.", { nodeId });
  } else if (value.label.length > 160) {
    addError(
      state,
      "node_label_too_long",
      "Node label cannot exceed 160 characters.",
      { nodeId },
    );
  }

  if (!isValidPosition(value.position)) {
    addError(
      state,
      "invalid_node_position",
      "Node position must contain finite x and y coordinates.",
      { nodeId },
    );
  }

  if (typeof value.enabled !== "boolean") {
    addError(
      state,
      "invalid_node_enabled_state",
      "Node enabled state must be true or false.",
      { nodeId },
    );
  }

  switch (value.kind) {
    case "trigger":
      validateTriggerNode(value, nodeId, state);
      break;

    case "ai_task":
      validateAiTaskNode(value, nodeId, state);
      break;

    case "action":
      validateActionNode(value, nodeId, state);
      break;

    case "condition":
      validateConditionNode(value, nodeId, state);
      break;

    case "approval":
      if (value.approvalType !== "human") {
        addError(
          state,
          "invalid_approval_type",
          "Day 16 approval nodes require human approval.",
          { nodeId },
        );
      }
      break;

    case "activity":
      if (typeof value.instructions !== "string" || !value.instructions.trim()) {
        addError(
          state,
          "missing_activity_instructions",
          "Activity nodes require instructions.",
          { nodeId },
        );
      }
      validateRuntimeConfig(value.config, nodeId, state);
      break;
  }

  return value as unknown as J10FlowNode;
}

function validateTriggerNode(
  node: Record<string, unknown>,
  nodeId: string,
  state: MutableValidation,
) {
  if (!isTriggerType(node.triggerType)) {
    addError(
      state,
      "unsupported_trigger_type",
      "Trigger type is not supported by the Day 12-15 runtime.",
      { nodeId },
    );
    return;
  }

  if (!isRecord(node.triggerConfig)) {
    addError(
      state,
      "invalid_trigger_config",
      "Trigger configuration must be an object.",
      { nodeId },
    );
    return;
  }

  if (
    node.triggerType === "schedule" &&
    !readBoundedString(node.triggerConfig.scheduleExpression, 500)
  ) {
    addError(
      state,
      "missing_schedule_expression",
      "Scheduled workflows require a schedule expression.",
      { nodeId },
    );
  }

  if (node.triggerType === "integration_event") {
    if (
      !readBoundedString(node.triggerConfig.provider, 100) ||
      !readBoundedString(node.triggerConfig.eventType, 200) ||
      !readBoundedString(node.triggerConfig.connectionId, 100)
    ) {
      addError(
        state,
        "missing_integration_trigger_config",
        "Integration event triggers require provider, event type, and a workspace connection.",
        { nodeId },
      );
    }
  }

  const filters = node.triggerConfig.filters;

  if (filters !== undefined) {
    if (!Array.isArray(filters) || filters.length > 20) {
      addError(
        state,
        "invalid_trigger_filters",
        "Trigger filters must be an array containing at most 20 rules.",
        { nodeId },
      );
    } else {
      for (const filter of filters) {
        if (
          !isRecord(filter) ||
          !readBoundedString(filter.field, 160) ||
          !isFilterOperator(filter.operator)
        ) {
          addError(
            state,
            "invalid_trigger_filter",
            "Every trigger filter requires a field and supported operator.",
            { nodeId },
          );
          break;
        }
      }
    }
  }
}

function validateAiTaskNode(
  node: Record<string, unknown>,
  nodeId: string,
  state: MutableValidation,
) {
  if (!readBoundedString(node.employeeId, 100)) {
    addError(
      state,
      "missing_ai_employee",
      "AI task nodes require an exact AI employee.",
      { nodeId },
    );
  }

  if (!readBoundedString(node.taskType, 100)) {
    addError(
      state,
      "missing_ai_task_type",
      "AI task nodes require a task type.",
      { nodeId },
    );
  }

  if (!readBoundedString(node.instructions, 20_000)) {
    addError(
      state,
      "missing_ai_task_instructions",
      "AI task nodes require instructions.",
      { nodeId },
    );
  }

  if (typeof node.requiresApproval !== "boolean") {
    addError(
      state,
      "invalid_approval_requirement",
      "AI task approval requirement must be true or false.",
      { nodeId },
    );
  }

  validateRuntimeConfig(node.config, nodeId, state);
}

function validateActionNode(
  node: Record<string, unknown>,
  nodeId: string,
  state: MutableValidation,
) {
  if (!isActionType(node.actionType)) {
    addError(
      state,
      "unsupported_action_type",
      "Action type is not supported by the Day 12-15 runtime.",
      { nodeId },
    );
    return;
  }

  if (typeof node.requiresApproval !== "boolean") {
    addError(
      state,
      "invalid_approval_requirement",
      "Action approval requirement must be true or false.",
      { nodeId },
    );
  }

  validateRuntimeConfig(node.config, nodeId, state);

  if (node.actionType !== "integration_action") {
    return;
  }

  const config = isRecord(node.config) ? node.config : {};
  const integration = isRecord(config.integration)
    ? config.integration
    : isRecord(config.integrationAction)
      ? {
          provider:
            typeof config.integrationAction.capabilityId === "string"
              ? config.integrationAction.capabilityId.split(".")[0]
              : null,
          capability: config.integrationAction.capabilityId,
          connectionId: config.integrationAction.connectionId,
          mode: config.integrationAction.mode,
          input: config.integrationAction.input,
        }
      : null;

  if (!integration) {
    addError(
      state,
      "missing_integration_action_config",
      "Integration action nodes require registered integration configuration.",
      { nodeId },
    );
    return;
  }

  if (
    !readBoundedString(integration.provider, 100) ||
    !readBoundedString(integration.capability, 200)
  ) {
    addError(
      state,
      "missing_integration_capability",
      "Integration action nodes require provider and capability IDs.",
      { nodeId },
    );
  }

  if (!readBoundedString(integration.connectionId, 100)) {
    addError(
      state,
      "missing_integration_connection",
      "Integration action nodes require a workspace connection ID.",
      { nodeId },
    );
  }

  if (
    integration.mode !== undefined &&
    !["simulate", "sandbox", "live"].includes(String(integration.mode))
  ) {
    addError(
      state,
      "invalid_integration_mode",
      "Integration action mode must be simulate, sandbox, or live.",
      { nodeId },
    );
  }

  if (integration.mode === "live" && node.requiresApproval !== true) {
    addError(
      state,
      "live_action_requires_approval",
      "Live integration actions must require human approval.",
      { nodeId },
    );
  }

  if (!isRecord(integration.input)) {
    addError(
      state,
      "invalid_integration_input",
      "Integration action input must be an object.",
      { nodeId },
    );
  }
}

function validateConditionNode(
  node: Record<string, unknown>,
  nodeId: string,
  state: MutableValidation,
) {
  if (!Array.isArray(node.rules) || node.rules.length === 0) {
    addError(
      state,
      "missing_condition_rules",
      "Condition nodes require at least one typed rule.",
      { nodeId },
    );
    return;
  }

  if (node.rules.length > 1) {
    addError(
      state,
      "multiple_condition_rules_not_supported",
      "The current J10 runtime supports one deterministic condition rule per branch node.",
      { nodeId },
    );
  }

  if (node.mode !== "all" && node.mode !== "any") {
    addError(
      state,
      "invalid_condition_mode",
      "Condition mode must be all or any.",
      { nodeId },
    );
  }

  for (const rule of node.rules) {
    if (
      !isRecord(rule) ||
      !readBoundedString(rule.left, 500) ||
      !isFilterOperator(rule.operator)
    ) {
      addError(
        state,
        "invalid_condition_rule",
        "Every condition rule requires a left value and supported operator.",
        { nodeId },
      );
      break;
    }
  }
}

function validateRuntimeConfig(
  value: unknown,
  nodeId: string,
  state: MutableValidation,
) {
  if (!isRecord(value)) {
    addError(
      state,
      "invalid_runtime_config",
      "Node runtime configuration must be an object.",
      { nodeId },
    );
    return;
  }

  if (value.failurePolicy !== undefined) {
    const policy = value.failurePolicy;

    if (
      !isRecord(policy) ||
      !["stop", "retry", "continue", "human_review"].includes(
        String(policy.mode),
      ) ||
      !isIntegerBetween(policy.maxAttempts, 1, 10) ||
      !isIntegerBetween(policy.retryDelayMs, 0, 300_000) ||
      !["stop", "continue", "human_review"].includes(
        String(policy.afterRetries),
      )
    ) {
      addError(
        state,
        "invalid_failure_policy",
        "Node failure policy is outside the supported retry limits.",
        { nodeId },
      );
    }
  }

  if (value.executionGuardrails !== undefined) {
    const guardrails = value.executionGuardrails;

    if (
      !isRecord(guardrails) ||
      !isIntegerBetween(guardrails.stepTimeoutMs, 100, 120_000) ||
      !isIntegerBetween(guardrails.workflowTimeoutMs, 1_000, 300_000) ||
      Number(guardrails.workflowTimeoutMs) < Number(guardrails.stepTimeoutMs)
    ) {
      addError(
        state,
        "invalid_execution_guardrails",
        "Execution timeouts are missing or outside the supported limits.",
        { nodeId },
      );
    }
  }
}

function validateEdge(
  value: unknown,
  edgeIds: Set<string>,
  edgeRoutes: Set<string>,
  enabledNodeIds: Set<string>,
  state: MutableValidation,
): J10FlowEdge | null {
  if (!isRecord(value)) {
    addError(state, "invalid_edge", "Every workflow edge must be an object.");
    return null;
  }

  const edgeId = readBoundedString(value.id, 140);

  if (!edgeId) {
    addError(state, "missing_edge_id", "Every workflow edge needs a stable id.");
    return null;
  }

  if (edgeIds.has(edgeId)) {
    addError(
      state,
      "duplicate_edge_id",
      "Workflow edge ids must be unique.",
      { edgeId },
    );
  }
  edgeIds.add(edgeId);

  const sourceNodeId = readBoundedString(value.sourceNodeId, 100);
  const targetNodeId = readBoundedString(value.targetNodeId, 100);

  if (!sourceNodeId || !enabledNodeIds.has(sourceNodeId)) {
    addError(
      state,
      "edge_source_missing",
      "Edge source node does not exist or is disabled.",
      { edgeId },
    );
  }

  if (!targetNodeId || !enabledNodeIds.has(targetNodeId)) {
    addError(
      state,
      "edge_target_missing",
      "Edge target node does not exist or is disabled.",
      { edgeId },
    );
  }

  if (sourceNodeId && sourceNodeId === targetNodeId) {
    addError(
      state,
      "self_referencing_edge",
      "A graph edge cannot point to the same node.",
      { edgeId },
    );
  }

  if (!isEdgeKind(value.kind)) {
    addError(
      state,
      "unsupported_edge_kind",
      "Workflow edge uses an unsupported routing kind.",
      { edgeId },
    );
  }

  if (value.kind === "failure") {
    addError(
      state,
      "failure_edge_runtime_unsupported",
      "Failure routing is controlled by the existing step failure policy; the runtime does not yet execute graph failure edges.",
      { edgeId },
    );
  }

  if (sourceNodeId && targetNodeId && isEdgeKind(value.kind)) {
    const routeKey = `${sourceNodeId}:${value.kind}:${targetNodeId}`;

    if (edgeRoutes.has(routeKey)) {
      addError(
        state,
        "duplicate_edge_route",
        "Workflow contains the same routed edge more than once.",
        { edgeId },
      );
    }

    edgeRoutes.add(routeKey);
  }

  return value as unknown as J10FlowEdge;
}

function validateRouting(
  nodes: J10FlowNode[],
  edges: J10FlowEdge[],
  enabledNodeIds: Set<string>,
  state: MutableValidation,
) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const incoming = new Map<string, J10FlowEdge[]>();
  const outgoing = new Map<string, J10FlowEdge[]>();

  for (const edge of edges) {
    if (
      !enabledNodeIds.has(edge.sourceNodeId) ||
      !enabledNodeIds.has(edge.targetNodeId)
    ) {
      continue;
    }

    incoming.set(edge.targetNodeId, [
      ...(incoming.get(edge.targetNodeId) ?? []),
      edge,
    ]);
    outgoing.set(edge.sourceNodeId, [
      ...(outgoing.get(edge.sourceNodeId) ?? []),
      edge,
    ]);
  }

  for (const node of nodes) {
    if (!node.enabled) {
      continue;
    }

    const nodeIncoming = incoming.get(node.id) ?? [];
    const nodeOutgoing = outgoing.get(node.id) ?? [];

    if (node.kind === "trigger") {
      if (nodeIncoming.length > 0) {
        addError(
          state,
          "trigger_has_incoming_edge",
          "The trigger node cannot have an incoming edge.",
          { nodeId: node.id },
        );
      }

      if (nodeOutgoing.length === 0) {
        addError(
          state,
          "trigger_has_no_path",
          "The trigger must connect to at least one enabled node.",
          { nodeId: node.id },
        );
      }
      continue;
    }

    if (nodeIncoming.length === 0) {
      addError(
        state,
        "node_has_no_input",
        "Every enabled non-trigger node requires an incoming edge.",
        { nodeId: node.id },
      );
    }

    if (node.kind === "condition") {
      const trueEdges = nodeOutgoing.filter((edge) => edge.kind === "true");
      const falseEdges = nodeOutgoing.filter((edge) => edge.kind === "false");

      if (trueEdges.length !== 1 || falseEdges.length !== 1) {
        addError(
          state,
          "condition_branch_incomplete",
          "Condition nodes require exactly one true edge and one false edge.",
          { nodeId: node.id },
        );
      }
    } else if (
      nodeOutgoing.some((edge) => edge.kind === "true" || edge.kind === "false")
    ) {
      addError(
        state,
        "branch_edge_from_non_condition",
        "True and false edges can originate only from condition nodes.",
        { nodeId: node.id },
      );
    }

    if (node.kind === "approval") {
      const protectedTargets = nodeOutgoing
        .map((edge) => nodeById.get(edge.targetNodeId))
        .filter(Boolean);

      if (protectedTargets.length === 0) {
        addWarning(
          state,
          "approval_has_no_protected_step",
          "Approval node does not lead to a protected step.",
          { nodeId: node.id },
        );
      }
    }
  }
}

function validateReachability(
  triggerNodeId: string,
  enabledNodeIds: Set<string>,
  edges: J10FlowEdge[],
  state: MutableValidation,
) {
  const outgoing = createOutgoingMap(enabledNodeIds, edges);
  const visited = new Set<string>();
  const queue = [triggerNodeId];

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
      addError(
        state,
        "unreachable_node",
        "Enabled node is not reachable from the trigger.",
        { nodeId },
      );
    }
  }
}

function validateAcyclicGraph(
  enabledNodeIds: Set<string>,
  edges: J10FlowEdge[],
  state: MutableValidation,
) {
  const outgoing = createOutgoingMap(enabledNodeIds, edges);
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(nodeId: string): boolean {
    if (visiting.has(nodeId)) {
      return true;
    }

    if (visited.has(nodeId)) {
      return false;
    }

    visiting.add(nodeId);

    for (const target of outgoing.get(nodeId) ?? []) {
      if (visit(target)) {
        return true;
      }
    }

    visiting.delete(nodeId);
    visited.add(nodeId);
    return false;
  }

  for (const nodeId of enabledNodeIds) {
    if (visit(nodeId)) {
      addError(
        state,
        "unsupported_cycle",
        "Workflow graph contains a cycle. Day 16 runtime requires an acyclic graph.",
        { nodeId },
      );
      return;
    }
  }
}

function createOutgoingMap(
  enabledNodeIds: Set<string>,
  edges: J10FlowEdge[],
) {
  const outgoing = new Map<string, string[]>();

  for (const edge of edges) {
    if (
      !enabledNodeIds.has(edge.sourceNodeId) ||
      !enabledNodeIds.has(edge.targetNodeId)
    ) {
      continue;
    }

    outgoing.set(edge.sourceNodeId, [
      ...(outgoing.get(edge.sourceNodeId) ?? []),
      edge.targetNodeId,
    ]);
  }

  return outgoing;
}

function validateNoSensitiveGraphData(
  graph: Record<string, unknown>,
  state: MutableValidation,
) {
  const visited = new Set<object>();

  function walk(value: unknown, depth: number): string | null {
    if (depth > 20 || value === null || typeof value !== "object") {
      return null;
    }

    if (visited.has(value)) {
      return null;
    }
    visited.add(value);

    if (Array.isArray(value)) {
      for (const item of value) {
        const found = walk(item, depth + 1);
        if (found) return found;
      }
      return null;
    }

    for (const [key, item] of Object.entries(value)) {
      const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");

      if (SENSITIVE_GRAPH_KEYS.has(normalized)) {
        return key;
      }

      const found = walk(item, depth + 1);
      if (found) return found;
    }

    return null;
  }

  const sensitiveKey = walk(graph, 0);

  if (sensitiveKey) {
    addError(
      state,
      "credential_material_forbidden",
      `Workflow graph cannot store credential material (${sensitiveKey}). Use a connection ID instead.`,
    );
  }
}

function isNodeKind(value: unknown): value is J10FlowNodeKind {
  return (
    typeof value === "string" &&
    (J10_FLOW_NODE_KINDS as readonly string[]).includes(value)
  );
}

function isEdgeKind(value: unknown): value is J10FlowEdgeKind {
  return (
    typeof value === "string" &&
    (J10_FLOW_EDGE_KINDS as readonly string[]).includes(value)
  );
}

function isTriggerType(value: unknown): value is AutomationTriggerType {
  return (
    typeof value === "string" &&
    (J10_FLOW_TRIGGER_TYPES as readonly string[]).includes(value)
  );
}

function isActionType(value: unknown): value is AutomationActionType {
  return (
    typeof value === "string" &&
    (J10_FLOW_ACTION_TYPES as readonly string[]).includes(value)
  );
}

function isFilterOperator(
  value: unknown,
): value is AutomationTriggerFilterOperator {
  return (
    typeof value === "string" &&
    (FILTER_OPERATORS as readonly string[]).includes(value)
  );
}

function isValidPosition(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.x === "number" &&
    Number.isFinite(value.x) &&
    Math.abs(value.x) <= 100_000 &&
    typeof value.y === "number" &&
    Number.isFinite(value.y) &&
    Math.abs(value.y) <= 100_000
  );
}

function isIntegerBetween(value: unknown, minimum: number, maximum: number) {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function readBoundedString(value: unknown, maximumLength: number) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maximumLength ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function addError(
  state: MutableValidation,
  code: string,
  message: string,
  target: Pick<J10FlowValidationIssue, "nodeId" | "edgeId"> = {},
) {
  state.errors.push({ code, message, ...target });
}

function addWarning(
  state: MutableValidation,
  code: string,
  message: string,
  target: Pick<J10FlowValidationIssue, "nodeId" | "edgeId"> = {},
) {
  state.warnings.push({ code, message, ...target });
}

function finish(state: MutableValidation): J10FlowValidationResult {
  return {
    valid: state.errors.length === 0,
    errors: state.errors,
    warnings: state.warnings,
  };
}
