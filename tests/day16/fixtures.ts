import type { J10FlowGraph } from "@/types/automation-graph";

export function makeValidActivityGraph(): J10FlowGraph {
  return {
    version: "2026-08-day16",
    automationId: "00000000-0000-4000-8000-000000000016",
    name: "Day 16 deterministic activity",
    description: "Repo-native Day 16 graph fixture.",
    nodes: [
      {
        id: "trigger",
        kind: "trigger",
        nodeVersion: 1,
        label: "Manual Trigger",
        position: { x: 100, y: 100 },
        enabled: true,
        triggerType: "manual",
        triggerConfig: { timezone: "UTC", filters: [], filterMode: "all" },
      },
      {
        id: "activity",
        kind: "activity",
        nodeVersion: 1,
        label: "Record result",
        position: { x: 400, y: 100 },
        enabled: true,
        instructions: "Record the deterministic Day 16 result.",
        config: {
          failurePolicy: {
            mode: "stop",
            maxAttempts: 3,
            retryDelayMs: 0,
            afterRetries: "stop",
          },
          executionGuardrails: {
            stepTimeoutMs: 30_000,
            workflowTimeoutMs: 120_000,
          },
        },
      },
    ],
    edges: [
      {
        id: "trigger-next-activity",
        sourceNodeId: "trigger",
        targetNodeId: "activity",
        kind: "next",
        sourcePortId: "next",
        targetPortId: "input",
      },
    ],
    variables: {},
  };
}
