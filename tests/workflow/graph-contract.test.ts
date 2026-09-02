import { describe, expect, it } from "vitest";

import { validateJ10FlowGraph } from "@/lib/automation/graph-contract";
import { makeValidActivityGraph } from "./fixtures";

describe("Typed workflow graph contract", () => {
  it("accepts a reachable, acyclic workflow with one trigger", () => {
    const result = validateJ10FlowGraph(makeValidActivityGraph());

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects cycles before compilation", () => {
    const graph = makeValidActivityGraph();
    graph.edges.push({
      id: "cycle",
      sourceNodeId: "activity",
      targetNodeId: "trigger",
      kind: "next",
    });

    const result = validateJ10FlowGraph(graph);

    expect(result.valid).toBe(false);
    expect(result.errors.some((issue) => issue.code === "unsupported_cycle")).toBe(true);
  });

  it("rejects a graph without exactly one enabled trigger", () => {
    const graph = makeValidActivityGraph();
    graph.nodes = graph.nodes.filter((node) => node.kind !== "trigger");
    graph.edges = [];

    const result = validateJ10FlowGraph(graph);

    expect(result.valid).toBe(false);
    expect(result.errors.some((issue) => issue.code === "invalid_trigger_count")).toBe(true);
  });

  it("rejects credential-shaped material in persisted graph JSON", () => {
    const graph = makeValidActivityGraph() as unknown as Record<string, unknown>;
    graph.client_secret = "this-must-never-be-persisted";

    const result = validateJ10FlowGraph(graph);

    expect(result.valid).toBe(false);
    expect(result.errors.some((issue) => issue.code === "credential_material_forbidden")).toBe(true);
  });

  it("requires complete true and false condition routes", () => {
    const graph = makeValidActivityGraph();
    graph.nodes.splice(1, 0, {
      id: "condition",
      kind: "condition",
      nodeVersion: 1,
      label: "Check status",
      position: { x: 280, y: 100 },
      enabled: true,
      rules: [{ left: "trigger.status", operator: "equals", right: "ready" }],
      mode: "all",
      fallback: "stop",
    });
    graph.edges = [
      { id: "to-condition", sourceNodeId: "trigger", targetNodeId: "condition", kind: "next" },
      { id: "true-only", sourceNodeId: "condition", targetNodeId: "activity", kind: "true" },
    ];

    const result = validateJ10FlowGraph(graph);

    expect(result.errors.some((issue) => issue.code === "condition_branch_incomplete")).toBe(true);
  });

  it("blocks multiple rules until the existing runtime supports them", () => {
    const graph = makeValidActivityGraph();
    graph.nodes.splice(1, 0, {
      id: "condition",
      kind: "condition",
      nodeVersion: 1,
      label: "Check two values",
      position: { x: 280, y: 100 },
      enabled: true,
      rules: [
        { left: "trigger.status", operator: "equals", right: "ready" },
        { left: "trigger.score", operator: "greater_than", right: 10 },
      ],
      mode: "all",
      fallback: "stop",
    });
    graph.nodes.push({
      id: "false-activity",
      kind: "activity",
      nodeVersion: 1,
      label: "Record false",
      position: { x: 400, y: 300 },
      enabled: true,
      instructions: "Record false branch.",
      config: {},
    });
    graph.edges = [
      { id: "to-condition", sourceNodeId: "trigger", targetNodeId: "condition", kind: "next" },
      { id: "true", sourceNodeId: "condition", targetNodeId: "activity", kind: "true" },
      { id: "false", sourceNodeId: "condition", targetNodeId: "false-activity", kind: "false" },
    ];

    const result = validateJ10FlowGraph(graph);

    expect(result.errors.some((issue) => issue.code === "multiple_condition_rules_not_supported")).toBe(true);
  });
});
