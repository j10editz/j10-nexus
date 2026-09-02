import { describe, expect, it } from "vitest";

import { compileJ10FlowGraph } from "@/lib/automation/graph-compiler";
import { J10_FLOW_NODE_CATALOG } from "@/lib/automation/node-catalog";
import type { J10FlowGraph } from "@/types/automation-graph";

describe("Zero-cost integration sandbox contract", () => {
  it("creates integration actions in simulate mode with approval-safe configuration", () => {
    const entry = J10_FLOW_NODE_CATALOG.find(
      (candidate) =>
        candidate.category === "integration" &&
        candidate.nodeKind === "action" &&
        candidate.providerId === "gmail" &&
        candidate.createNode,
    );

    expect(entry).toBeDefined();
    const action = entry!.createNode!("gmail-action", { x: 400, y: 100 });

    if (action.kind !== "action" || !action.config.integration) {
      throw new Error("Expected a typed integration action.");
    }

    action.config.integration.connectionId = "00000000-0000-4000-8000-000000000015";
    action.config.integrationAction!.connectionId = action.config.integration.connectionId;

    const graph: J10FlowGraph = {
      version: "2026-08-day16",
      name: "Zero-cost sandbox compile",
      nodes: [
        { id: "trigger", kind: "trigger", nodeVersion: 1, label: "Manual", position: { x: 100, y: 100 }, enabled: true, triggerType: "manual", triggerConfig: {} },
        action,
      ],
      edges: [{ id: "edge", sourceNodeId: "trigger", targetNodeId: action.id, kind: "next" }],
    };

    const compiled = compileJ10FlowGraph(graph);
    const config = compiled.steps[0].config as {
      integrationAction?: { mode?: string };
    };

    expect(config.integrationAction?.mode).toBe("simulate");
    expect(action.config.integration.mode).toBe("simulate");
    expect(JSON.stringify(compiled)).not.toContain("access_token");
    expect(JSON.stringify(compiled)).not.toContain("client_secret");
  });
});
