import { describe, expect, it } from "vitest";

import { J10_FLOW_NODE_CATALOG } from "@/lib/automation/node-catalog";

describe("Workflow node catalog", () => {
  it("is generated from registered integrations including the WhatsApp runtime", () => {
    const integrationEntries = J10_FLOW_NODE_CATALOG.filter(
      (entry) => entry.category === "integration",
    );

    expect(integrationEntries.length).toBeGreaterThan(0);
    expect(integrationEntries.some((entry) => entry.providerId === "gmail")).toBe(true);
    expect(integrationEntries.some((entry) => entry.providerId === "google-calendar")).toBe(true);
    expect(integrationEntries.some((entry) => entry.providerId === "whatsapp-business")).toBe(true);
  });

  it("shows unsupported delay and data mapping honestly as unavailable", () => {
    const delay = J10_FLOW_NODE_CATALOG.find((entry) => entry.id === "logic.delay");
    const mapping = J10_FLOW_NODE_CATALOG.find((entry) => entry.id === "logic.data_mapping");

    expect(delay?.available).toBe(false);
    expect(mapping?.available).toBe(false);
    expect(delay?.createNode).toBeUndefined();
    expect(mapping?.createNode).toBeUndefined();
  });
});
