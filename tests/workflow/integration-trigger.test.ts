import { describe, expect, it } from "vitest";

import { evaluateIntegrationTriggerBinding } from "@/lib/automation/integration-trigger";

describe("Integration trigger identity", () => {
  const trigger = {
    provider: "gmail",
    eventType: "gmail.message.received",
    connectionId: "connection-a",
  };

  it("matches only the configured provider, capability, and connection", () => {
    expect(
      evaluateIntegrationTriggerBinding(trigger, {
        providerId: "gmail",
        capabilityId: "gmail.message.received",
        integrationId: "connection-a",
      }).passed,
    ).toBe(true);
  });

  it("does not fan a Google event into unrelated integration workflows", () => {
    expect(
      evaluateIntegrationTriggerBinding(trigger, {
        providerId: "google-calendar",
        capabilityId: "google-calendar.event.created",
        integrationId: "connection-a",
      }).passed,
    ).toBe(false);

    expect(
      evaluateIntegrationTriggerBinding(trigger, {
        providerId: "gmail",
        capabilityId: "gmail.message.received",
        integrationId: "connection-b",
      }).passed,
    ).toBe(false);
  });
});
