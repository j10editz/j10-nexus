import type {
  AutomationActionType,
  AutomationTriggerType,
} from "@/types/automation";

import type {
  J10FlowActionNode,
  J10FlowActivityNode,
  J10FlowAiTaskNode,
  J10FlowApprovalNode,
  J10FlowConditionNode,
  J10FlowEdge,
  J10FlowGraph,
  J10FlowNode,
  J10FlowNodeId,
  J10FlowTriggerNode,
  J10FlowValidationIssue,
} from "@/types/automation-graph";

import {
  validateJ10FlowGraph,
} from "./graph-contract";

export type CompiledAutomationFields = {
  name: string;
  description: string | null;
  triggerType: AutomationTriggerType;
  triggerConfig: Record<string, unknown>;
  scheduleExpression: string | null;
  timezone: string;
};

export type CompiledAutomationStepInput = {
  sourceNodeId: string;
  stepOrder: number;
  name: string | null;
  stepType: "ai_task" | "action" | "condition" | "approval" | "activity";
  actionType: AutomationActionType;
  employeeId: string | null;
  taskType: string | null;
  instructions: string | null;
  config: Record<string, unknown>;
  conditionConfig: Record<string, unknown>;
  requiresApproval: boolean;
  approvalType: "human" | null;
  isEnabled: boolean;
};

export type J10FlowCompileResult = {
  automation: CompiledAutomationFields;
  steps: CompiledAutomationStepInput[];
  nodeOrder: string[];
  warnings: J10FlowValidationIssue[];
};

export function compileJ10FlowGraph(
  graph: J10FlowGraph
): J10FlowCompileResult {
  const validation = validateJ10FlowGraph(graph);

  if (!validation.valid) {
    const message = validation.errors
      .map((error) => error.message)
      .join(" ");

    throw new Error(
      message || "J10 Flow graph validation failed."
    );
  }

  const enabledNodes = graph.nodes.filter(
    (node) => node.enabled
  );

  const triggerNode = enabledNodes.find(
    (node): node is J10FlowTriggerNode =>
      node.kind === "trigger"
  );

  if (!triggerNode) {
    throw new Error("A trigger node is required.");
  }

  const orderedNodes = topologicalOrderFromTrigger(
    triggerNode.id,
    enabledNodes,
    graph.edges
  );

  const executableNodes = orderedNodes.filter(
    (node) => node.kind !== "trigger"
  );

  const nodeOrder = orderedNodes.map(
    (node) => node.id
  );

  const steps = executableNodes.map(
    (node, index) =>
      compileNodeToStep(
        node,
        index + 1,
        graph.edges,
        nodeOrder
      )
  );

  return {
    automation: compileAutomationFields(graph, triggerNode),
    steps,
    nodeOrder,
    warnings: validation.warnings,
  };
}

function compileAutomationFields(
  graph: J10FlowGraph,
  triggerNode: J10FlowTriggerNode
): CompiledAutomationFields {
  return {
    name: graph.name.trim(),
    description: graph.description?.trim() || null,
    triggerType: triggerNode.triggerType,
    triggerConfig: {
      ...triggerNode.triggerConfig,
      j10Flow: {
        graphVersion: graph.version,
        triggerNodeId: triggerNode.id,
      },
    },
    scheduleExpression:
      triggerNode.triggerType === "schedule"
        ? triggerNode.triggerConfig.scheduleExpression ?? null
        : null,
    timezone:
      triggerNode.triggerConfig.timezone?.trim() || "UTC",
  };
}

function topologicalOrderFromTrigger(
  triggerNodeId: string,
  nodes: J10FlowNode[],
  edges: J10FlowEdge[]
): J10FlowNode[] {
  const nodeById = new Map(
    nodes.map((node) => [node.id, node])
  );

  const enabledNodeIds = new Set(
    nodes.map((node) => node.id)
  );

  const incomingCount = new Map<string, number>();
  const outgoing = new Map<string, string[]>();

  for (const node of nodes) {
    incomingCount.set(node.id, 0);
    outgoing.set(node.id, []);
  }

  for (const edge of edges) {
    if (
      !enabledNodeIds.has(edge.sourceNodeId) ||
      !enabledNodeIds.has(edge.targetNodeId)
    ) {
      continue;
    }

    outgoing.get(edge.sourceNodeId)?.push(edge.targetNodeId);

    incomingCount.set(
      edge.targetNodeId,
      (incomingCount.get(edge.targetNodeId) ?? 0) + 1
    );
  }

  const reachable = collectReachableNodeIds(
    triggerNodeId,
    outgoing
  );

  const queue = nodes
    .filter(
      (node) =>
        reachable.has(node.id) &&
        (incomingCount.get(node.id) ?? 0) === 0
    )
    .sort(compareNodesForStableOrder);

  const ordered: J10FlowNode[] = [];

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current) {
      continue;
    }

    ordered.push(current);

    const targets = outgoing.get(current.id) ?? [];

    for (const targetId of targets) {
      if (!reachable.has(targetId)) {
        continue;
      }

      const nextCount =
        (incomingCount.get(targetId) ?? 0) - 1;

      incomingCount.set(targetId, nextCount);

      if (nextCount === 0) {
        const targetNode = nodeById.get(targetId);

        if (targetNode) {
          queue.push(targetNode);
          queue.sort(compareNodesForStableOrder);
        }
      }
    }
  }

  if (ordered.length !== reachable.size) {
    throw new Error(
      "J10 Flow graph contains a cycle. Runtime compilation requires an acyclic graph."
    );
  }

  return ordered;
}

function collectReachableNodeIds(
  startNodeId: string,
  outgoing: Map<string, string[]>
): Set<string> {
  const visited = new Set<string>();
  const queue = [startNodeId];

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

  return visited;
}

function compileNodeToStep(
  node: Exclude<J10FlowNode, J10FlowTriggerNode>,
  stepOrder: number,
  edges: J10FlowEdge[],
  nodeOrder: string[]
): CompiledAutomationStepInput {
  if (node.kind === "ai_task") {
    return compileAiTaskNode(node, stepOrder, edges, nodeOrder);
  }

  if (node.kind === "action") {
    return compileActionNode(node, stepOrder, edges, nodeOrder);
  }

  if (node.kind === "condition") {
    return compileConditionNode(node, stepOrder, edges, nodeOrder);
  }

  if (node.kind === "approval") {
    return compileApprovalNode(node, stepOrder, edges, nodeOrder);
  }

  return compileActivityNode(node, stepOrder, edges, nodeOrder);
}

function compileAiTaskNode(
  node: J10FlowAiTaskNode,
  stepOrder: number,
  edges: J10FlowEdge[],
  nodeOrder: string[]
): CompiledAutomationStepInput {
  return {
    sourceNodeId: node.id,
    stepOrder,
    name: nullableTrim(node.label),
    stepType: "ai_task",
    actionType: "run_ai_employee",
    employeeId: node.employeeId,
    taskType: node.taskType,
    instructions: nullableTrim(node.instructions),
    config: withJ10FlowMetadata(node, edges, nodeOrder),
    conditionConfig: {},
    requiresApproval: node.requiresApproval,
    approvalType: node.requiresApproval ? "human" : null,
    isEnabled: true,
  };
}

function compileActionNode(
  node: J10FlowActionNode,
  stepOrder: number,
  edges: J10FlowEdge[],
  nodeOrder: string[]
): CompiledAutomationStepInput {
  return {
    sourceNodeId: node.id,
    stepOrder,
    name: nullableTrim(node.label),
    stepType: "action",
    actionType: node.actionType,
    employeeId: node.employeeId ?? null,
    taskType: null,
    instructions: nullableTrim(node.instructions ?? null),
    config: withJ10FlowMetadata(node, edges, nodeOrder),
    conditionConfig: {},
    requiresApproval: node.requiresApproval,
    approvalType: node.requiresApproval ? "human" : null,
    isEnabled: true,
  };
}

function compileConditionNode(
  node: J10FlowConditionNode,
  stepOrder: number,
  edges: J10FlowEdge[],
  nodeOrder: string[]
): CompiledAutomationStepInput {
  const conditionConfig = {
    mode: node.mode,
    fallback: node.fallback,
    rules: node.rules,
  };

  return {
    sourceNodeId: node.id,
    stepOrder,
    name: nullableTrim(node.label),
    stepType: "condition",
    actionType: "evaluate_condition",
    employeeId: null,
    taskType: null,
    instructions: compileConditionInstructions(node),
    config: withJ10FlowMetadata(node, edges, nodeOrder),
    conditionConfig,
    requiresApproval: false,
    approvalType: null,
    isEnabled: true,
  };
}

function compileApprovalNode(
  node: J10FlowApprovalNode,
  stepOrder: number,
  edges: J10FlowEdge[],
  nodeOrder: string[]
): CompiledAutomationStepInput {
  return {
    sourceNodeId: node.id,
    stepOrder,
    name: nullableTrim(node.label),
    stepType: "approval",
    actionType: "human_approval",
    employeeId: null,
    taskType: null,
    instructions: nullableTrim(node.instructions ?? null),
    config: withJ10FlowMetadata(node, edges, nodeOrder),
    conditionConfig: {},
    requiresApproval: true,
    approvalType: "human",
    isEnabled: true,
  };
}

function compileActivityNode(
  node: J10FlowActivityNode,
  stepOrder: number,
  edges: J10FlowEdge[],
  nodeOrder: string[]
): CompiledAutomationStepInput {
  return {
    sourceNodeId: node.id,
    stepOrder,
    name: nullableTrim(node.label),
    stepType: "activity",
    actionType: "record_activity",
    employeeId: null,
    taskType: null,
    instructions: nullableTrim(node.instructions),
    config: withJ10FlowMetadata(node, edges, nodeOrder),
    conditionConfig: {},
    requiresApproval: false,
    approvalType: null,
    isEnabled: true,
  };
}

function withJ10FlowMetadata(
  node: Exclude<J10FlowNode, J10FlowTriggerNode>,
  edges: J10FlowEdge[],
  nodeOrder: string[]
): Record<string, unknown> {
  const outgoingEdges = edges.filter(
    (edge) => edge.sourceNodeId === node.id
  );

  const forwardEdges = outgoingEdges.filter(
    (edge) =>
      nodeOrder.indexOf(edge.targetNodeId) >
      nodeOrder.indexOf(edge.sourceNodeId)
  );

  if (forwardEdges.length !== outgoingEdges.length) {
    throw new Error(
      `Node ${node.id} contains a backward edge. The current runtime only supports forward execution.`
    );
  }

  return {
    ...("config" in node ? node.config : {}),
    j10Flow: {
      nodeId: node.id,
      nodeKind: node.kind,
      outgoing: forwardEdges.map((edge) => ({
        edgeId: edge.id,
        kind: edge.kind,
        targetNodeId: edge.targetNodeId,
        targetStepOrder:
          nodeOrder.indexOf(edge.targetNodeId),
      })),
    },
  };
}

function compileConditionInstructions(
  node: J10FlowConditionNode
): string {
  const rules = node.rules.map((rule) => {
    return `${rule.left} ${rule.operator} ${String(rule.right)}`;
  });

  return [
    `Evaluate ${node.mode.toUpperCase()} condition rules.`,
    ...rules,
    `Fallback: ${node.fallback}.`,
  ].join("\n");
}

function compareNodesForStableOrder(
  left: J10FlowNode,
  right: J10FlowNode
): number {
  if (left.position.y !== right.position.y) {
    return left.position.y - right.position.y;
  }

  if (left.position.x !== right.position.x) {
    return left.position.x - right.position.x;
  }

  return left.id.localeCompare(right.id);
}

function nullableTrim(
  value: string | null | undefined
): string | null {
  const trimmed = value?.trim() ?? "";

  return trimmed.length > 0 ? trimmed : null;
}
