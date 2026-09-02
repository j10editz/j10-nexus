import { describe, expect, it } from "vitest";

import {
  buildJ10FlowGraphFromRuntime,
  type RuntimeAutomationForGraph,
  type RuntimeStepForGraph,
} from "@/lib/automation/graph-from-runtime";

const automation: RuntimeAutomationForGraph = {
  id: "00000000-0000-4000-8000-000000000016",
  name: "Reopened integration workflow",
  description: "Runtime reconstruction fixture.",
  trigger_type: "integration_event",
  trigger_config: {
    provider: "gmail",
    eventType: "gmail.message.received",
    connectionId: "connection-gmail",
  },
  schedule_expression: null,
  timezone: "UTC",
};

function integrationStep(
  config: Record<string, unknown>,
): RuntimeStepForGraph {
  return {
    id: "00000000-0000-4000-8000-000000000017",
    step_order: 1,
    name: "Create calendar event",
    step_type: "action",
    action_type: "integration_action",
    employee_id: null,
    task_type: null,
    instructions: "Create a calendar event.",
    config,
    condition_config: null,
    requires_approval: true,
    on_success_step_id: null,
    on_failure_step_id: null,
    is_enabled: true,
  };
}

describe("Runtime graph reconstruction", () => {
  it("preserves explicit integration identity when reopening a workflow", () => {
    const graph = buildJ10FlowGraphFromRuntime(automation, [
      integrationStep({
        integration: {
          provider: "google-calendar",
          capability: "google-calendar.event.create",
          connectionId: "connection-calendar",
          mode: "sandbox",
          input: { summary: "J10 review" },
        },
        integrationAction: {
          connectionId: "legacy-connection",
          capabilityId: "gmail.message.send",
          mode: "simulate",
          input: { to: "legacy@example.com" },
        },
      }),
    ]);

    const trigger = graph.nodes.find((node) => node.kind === "trigger");
    const action = graph.nodes.find((node) => node.kind === "action");

    expect(trigger?.triggerConfig).toMatchObject({
      provider: "gmail",
      eventType: "gmail.message.received",
      connectionId: "connection-gmail",
    });
    expect(action?.config.integration).toEqual({
      provider: "google-calendar",
      capability: "google-calendar.event.create",
      connectionId: "connection-calendar",
      mode: "sandbox",
      input: { summary: "J10 review" },
    });
    expect(action?.config.integrationAction).toEqual({
      connectionId: "connection-calendar",
      capabilityId: "google-calendar.event.create",
      mode: "sandbox",
      input: { summary: "J10 review" },
    });
  });

  it("reconstructs provider identity from legacy runtime-only fields", () => {
    const graph = buildJ10FlowGraphFromRuntime(automation, [
      integrationStep({
        integrationAction: {
          connectionId: "connection-calendar",
          capabilityId: "google-calendar.event.create",
          mode: "live",
          input: { summary: "Legacy workflow" },
        },
      }),
    ]);

    const action = graph.nodes.find((node) => node.kind === "action");

    expect(action?.config.integration).toEqual({
      provider: "google-calendar",
      capability: "google-calendar.event.create",
      connectionId: "connection-calendar",
      mode: "live",
      input: { summary: "Legacy workflow" },
    });
  });
});
