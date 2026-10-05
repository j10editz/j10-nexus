import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { TRELLO_RUNTIME_ADAPTER } from "@/lib/integrations/providers/trello/adapter";
import { ASANA_RUNTIME_ADAPTER } from "@/lib/integrations/providers/asana/adapter";
import { MONDAY_RUNTIME_ADAPTER } from "@/lib/integrations/providers/monday/adapter";
import { CLICKUP_RUNTIME_ADAPTER } from "@/lib/integrations/providers/clickup/adapter";
import { getIntegrationRuntimeAdapter } from "@/lib/integrations/runtime-registry";
import type {
  IntegrationRuntimeActionInvocation,
  IntegrationRuntimeInvocationContext,
} from "@/types/integration-runtime";

function createMockContext(
  providerId: string,
  credentialsRecord: Record<string, string> = {},
  publicConfig: Record<string, any> = {},
): IntegrationRuntimeInvocationContext {
  return {
    requestId: "req_pm_123",
    correlationId: "corr_pm_123",
    userId: "usr_pm_123",
    environment: "development",
    signal: new AbortController().signal,
    connection: {
      id: `conn_${providerId}_1`,
      workspaceId: "ws_pm_test",
      userId: "usr_pm_123",
      providerId: providerId as any,
      name: `${providerId} Connection`,
      status: "connected",
      environment: "development",
      credentialReference: "vault_ref_pm",
      externalAccountId: null,
      externalAccountLabel: null,
      grantedScopes: [],
      enabledCapabilities: [],
      publicConfiguration: publicConfig,
      lastConnectedAt: new Date().toISOString(),
      lastHealthCheckAt: new Date().toISOString(),
      lastErrorCode: null,
      lastErrorMessage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    credentials: {
      async read(keys: readonly string[]) {
        const result: Record<string, string> = {};
        for (const key of keys) {
          if (credentialsRecord[key] !== undefined) {
            result[key] = credentialsRecord[key];
          }
        }
        return result;
      },
    },
  };
}

function createMockActionInvocation(
  capabilityId: string,
  providerId: string,
  input: Record<string, unknown>,
  mode: "simulate" | "sandbox" | "live" = "live",
  credentialsRecord: Record<string, string> = {},
): IntegrationRuntimeActionInvocation {
  const context = createMockContext(providerId, credentialsRecord);
  return {
    ...context,
    capabilityId,
    mode,
    idempotencyKey: `idem_pm_${Date.now()}`,
    input,
  };
}

describe("Batch 13: Project Management & Workflow Connectors", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("Trello Runtime Adapter", () => {
    it("is registered properly in runtime registry", () => {
      const adapter = getIntegrationRuntimeAdapter("trello");
      expect(adapter).toBeDefined();
      expect(adapter!.manifest.providerId).toBe("trello");
      expect(adapter!.manifest.adapterId).toBe("j10.trello.runtime");
      const capIds = adapter!.manifest.capabilities.map((c) => c.capabilityId);
      expect(capIds).toContain("trello.create_card");
      expect(capIds).toContain("trello.move_card");
      expect(capIds).toContain("trello.add_comment");
    });

    it("executes simulated create card", async () => {
      const invocation = createMockActionInvocation(
        "trello.create_card",
        "trello",
        { list_id: "list_abc", name: "Deploy v2 Client Portal" },
        "simulate",
      );
      const result = await TRELLO_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.simulated).toBe(true);
    });

    it("creates card in live mode", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: "card_trello_999", name: "Deploy v2 Client Portal", url: "https://trello.com/c/999" }),
      } as any);

      const invocation = createMockActionInvocation(
        "trello.create_card",
        "trello",
        { list_id: "list_abc", name: "Deploy v2 Client Portal" },
        "live",
        { token: "trello_token_xyz", api_key: "trello_key_123" },
      );

      const result = await TRELLO_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.cardId).toBe("card_trello_999");
    });

    it("verifies health check", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: "member_1", fullName: "Trello PM" }),
      } as any);

      const context = createMockContext("trello", { token: "token", api_key: "key" });
      const health = await TRELLO_RUNTIME_ADAPTER.healthCheck!(context);
      expect(health.healthy).toBe(true);
      expect(health.externalAccountLabel).toBe("Trello PM");
    });
  });

  describe("Asana Runtime Adapter", () => {
    it("is registered properly in runtime registry", () => {
      const adapter = getIntegrationRuntimeAdapter("asana");
      expect(adapter).toBeDefined();
      expect(adapter!.manifest.providerId).toBe("asana");
      expect(adapter!.manifest.adapterId).toBe("j10.asana.runtime");
      const capIds = adapter!.manifest.capabilities.map((c) => c.capabilityId);
      expect(capIds).toContain("asana.create_task");
      expect(capIds).toContain("asana.update_task");
      expect(capIds).toContain("asana.add_comment");
    });

    it("executes simulated create task", async () => {
      const invocation = createMockActionInvocation(
        "asana.create_task",
        "asana",
        { name: "Finalize Contract Clauses" },
        "simulate",
      );
      const result = await ASANA_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.simulated).toBe(true);
    });

    it("creates task in live mode", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ data: { gid: "task_asana_456", name: "Finalize Contract Clauses" } }),
      } as any);

      const invocation = createMockActionInvocation(
        "asana.create_task",
        "asana",
        { name: "Finalize Contract Clauses" },
        "live",
        { access_token: "1/asana_token" },
      );

      const result = await ASANA_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.taskId).toBe("task_asana_456");
    });

    it("verifies health check", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: { gid: "user_asana_1", name: "Asana Lead" } }),
      } as any);

      const context = createMockContext("asana", { access_token: "token" });
      const health = await ASANA_RUNTIME_ADAPTER.healthCheck!(context);
      expect(health.healthy).toBe(true);
      expect(health.externalAccountLabel).toBe("Asana Lead");
    });
  });

  describe("monday.com Runtime Adapter", () => {
    it("is registered properly in runtime registry", () => {
      const adapter = getIntegrationRuntimeAdapter("monday");
      expect(adapter).toBeDefined();
      expect(adapter!.manifest.providerId).toBe("monday");
      expect(adapter!.manifest.adapterId).toBe("j10.monday.runtime");
      const capIds = adapter!.manifest.capabilities.map((c) => c.capabilityId);
      expect(capIds).toContain("monday.create_item");
      expect(capIds).toContain("monday.update_item");
      expect(capIds).toContain("monday.assign_owner");
    });

    it("executes simulated create item", async () => {
      const invocation = createMockActionInvocation(
        "monday.create_item",
        "monday",
        { board_id: "board_123", item_name: "Sprint Deliverable 3" },
        "simulate",
      );
      const result = await MONDAY_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.simulated).toBe(true);
    });

    it("creates item in live mode via GraphQL", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: { create_item: { id: "item_monday_789", name: "Sprint Deliverable 3" } } }),
      } as any);

      const invocation = createMockActionInvocation(
        "monday.create_item",
        "monday",
        { board_id: "board_123", item_name: "Sprint Deliverable 3" },
        "live",
        { access_token: "monday_api_token" },
      );

      const result = await MONDAY_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.itemId).toBe("item_monday_789");
    });

    it("verifies health check", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: { me: { id: "user_monday_1", name: "Monday Admin" } } }),
      } as any);

      const context = createMockContext("monday", { access_token: "token" });
      const health = await MONDAY_RUNTIME_ADAPTER.healthCheck!(context);
      expect(health.healthy).toBe(true);
      expect(health.externalAccountLabel).toBe("Monday Admin");
    });
  });

  describe("ClickUp Runtime Adapter", () => {
    it("is registered properly in runtime registry", () => {
      const adapter = getIntegrationRuntimeAdapter("clickup");
      expect(adapter).toBeDefined();
      expect(adapter!.manifest.providerId).toBe("clickup");
      expect(adapter!.manifest.adapterId).toBe("j10.clickup.runtime");
      const capIds = adapter!.manifest.capabilities.map((c) => c.capabilityId);
      expect(capIds).toContain("clickup.create_task");
      expect(capIds).toContain("clickup.update_task");
      expect(capIds).toContain("clickup.add_comment");
    });

    it("executes simulated create task", async () => {
      const invocation = createMockActionInvocation(
        "clickup.create_task",
        "clickup",
        { list_id: "list_cu_1", name: "QA Acceptance Review" },
        "simulate",
      );
      const result = await CLICKUP_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.simulated).toBe(true);
    });

    it("creates task in live mode", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: "cu_task_321", name: "QA Acceptance Review", url: "https://app.clickup.com/t/321" }),
      } as any);

      const invocation = createMockActionInvocation(
        "clickup.create_task",
        "clickup",
        { list_id: "list_cu_1", name: "QA Acceptance Review" },
        "live",
        { access_token: "pk_clickup_token" },
      );

      const result = await CLICKUP_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.taskId).toBe("cu_task_321");
    });

    it("verifies health check", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ user: { id: 101, username: "ClickUp Architect" } }),
      } as any);

      const context = createMockContext("clickup", { access_token: "token" });
      const health = await CLICKUP_RUNTIME_ADAPTER.healthCheck!(context);
      expect(health.healthy).toBe(true);
      expect(health.externalAccountLabel).toBe("ClickUp Architect");
    });
  });
});
