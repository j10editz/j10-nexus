import { describe, expect, it } from "vitest";

import { compileJ10FlowGraph } from "@/lib/automation/graph-compiler";
import { evaluateAutomationCondition } from "@/lib/automation/condition-engine";
import type { J10FlowGraph } from "@/types/automation-graph";

describe("Day 16 deterministic compiler", () => {
  it("compiles a condition into runtime-compatible targeted branch JSON", () => {
    const graph: J10FlowGraph = {
      version: "2026-08-day16",
      name: "Condition routing",
      nodes: [
        { id: "trigger", kind: "trigger", nodeVersion: 1, label: "Manual", position: { x: 0, y: 0 }, enabled: true, triggerType: "manual", triggerConfig: { timezone: "UTC" } },
        { id: "condition", kind: "condition", nodeVersion: 1, label: "Route", position: { x: 300, y: 0 }, enabled: true, rules: [{ left: "trigger.status", operator: "starts_with", right: "ready" }], mode: "all", fallback: "stop" },
        { id: "true-node", kind: "activity", nodeVersion: 1, label: "True", position: { x: 600, y: 0 }, enabled: true, instructions: "true", config: {} },
        { id: "false-node", kind: "activity", nodeVersion: 1, label: "False", position: { x: 600, y: 300 }, enabled: true, instructions: "false", config: {} },
      ],
      edges: [
        { id: "e1", sourceNodeId: "trigger", targetNodeId: "condition", kind: "next" },
        { id: "e2", sourceNodeId: "condition", targetNodeId: "true-node", kind: "true" },
        { id: "e3", sourceNodeId: "condition", targetNodeId: "false-node", kind: "false" },
      ],
    };

    const compiled = compileJ10FlowGraph(graph);
    const conditionStep = compiled.steps.find((step) => step.sourceNodeId === "condition");
    const instructions = JSON.parse(conditionStep?.instructions ?? "{}") as Record<string, unknown>;

    expect(instructions).toMatchObject({
      field: "trigger.status",
      operator: "starts_with",
      value: "ready",
      onTrueStep: 2,
      onFalseStep: 3,
    });

    const evaluation = evaluateAutomationCondition({
      instructions: conditionStep?.instructions,
      context: {
        trigger: { status: "ready-now" },
        workflow: { id: "workflow", name: "Condition routing", triggerType: "manual" },
        execution: { id: "run", mode: "development", startedAt: null },
        steps: {},
        variables: {},
      },
    });

    expect(evaluation.matched).toBe(true);
    expect(evaluation.branchTargetStepOrder).toBe(2);
  });

  it("produces stable step order regardless of source array order", () => {
    const graph: J10FlowGraph = {
      version: "2026-08-day16",
      name: "Stable order",
      nodes: [
        { id: "second", kind: "activity", nodeVersion: 1, label: "Second", position: { x: 600, y: 0 }, enabled: true, instructions: "second", config: {} },
        { id: "trigger", kind: "trigger", nodeVersion: 1, label: "Manual", position: { x: 0, y: 0 }, enabled: true, triggerType: "manual", triggerConfig: {} },
        { id: "first", kind: "activity", nodeVersion: 1, label: "First", position: { x: 300, y: 0 }, enabled: true, instructions: "first", config: {} },
      ],
      edges: [
        { id: "two", sourceNodeId: "first", targetNodeId: "second", kind: "next" },
        { id: "one", sourceNodeId: "trigger", targetNodeId: "first", kind: "next" },
      ],
    };

    expect(compileJ10FlowGraph(graph).nodeOrder).toEqual(["trigger", "first", "second"]);
  });
});
