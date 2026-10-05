import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ONEDRIVE_RUNTIME_ADAPTER } from "@/lib/integrations/providers/onedrive/adapter";
import { DROPBOX_RUNTIME_ADAPTER } from "@/lib/integrations/providers/dropbox/adapter";
import { NOTION_RUNTIME_ADAPTER } from "@/lib/integrations/providers/notion/adapter";
import { AIRTABLE_RUNTIME_ADAPTER } from "@/lib/integrations/providers/airtable/adapter";
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
    requestId: "req_storage_123",
    correlationId: "corr_storage_123",
    userId: "usr_storage_123",
    environment: "development",
    signal: new AbortController().signal,
    connection: {
      id: `conn_${providerId}_1`,
      workspaceId: "ws_storage_test",
      userId: "usr_storage_123",
      providerId: providerId as any,
      name: `${providerId} Connection`,
      status: "connected",
      environment: "development",
      credentialReference: "vault_ref_storage",
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
    idempotencyKey: `idem_storage_${Date.now()}`,
    input,
  };
}

describe("Batch 11: File Storage & Structured Doc Connectors", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("OneDrive Runtime Adapter", () => {
    it("is registered properly in runtime registry", () => {
      const adapter = getIntegrationRuntimeAdapter("onedrive");
      expect(adapter).toBeDefined();
      expect(adapter!.manifest.providerId).toBe("onedrive");
      expect(adapter!.manifest.adapterId).toBe("j10.onedrive.runtime");
      const capIds = adapter!.manifest.capabilities.map((c) => c.capabilityId);
      expect(capIds).toContain("onedrive.upload_file");
      expect(capIds).toContain("onedrive.create_folder");
      expect(capIds).toContain("onedrive.share_file");
    });

    it("executes simulated upload file", async () => {
      const invocation = createMockActionInvocation(
        "onedrive.upload_file",
        "onedrive",
        { file_name: "financials.pdf", content: "dummy-bytes" },
        "simulate",
      );
      const result = await ONEDRIVE_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.simulated).toBe(true);
    });

    it("creates folder in live mode", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ id: "folder_od_123", name: "Q4 Audits", webUrl: "https://onedrive.live.com/view/123" }),
      } as any);

      const invocation = createMockActionInvocation(
        "onedrive.create_folder",
        "onedrive",
        { folder_name: "Q4 Audits" },
        "live",
        { access_token: "onedrive_access_token_123" },
      );

      const result = await ONEDRIVE_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.folderId).toBe("folder_od_123");
    });

    it("verifies health check", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: "drive_999", driveType: "business" }),
      } as any);

      const context = createMockContext("onedrive", { access_token: "token" });
      const health = await ONEDRIVE_RUNTIME_ADAPTER.healthCheck!(context);
      expect(health.healthy).toBe(true);
      expect(health.externalAccountLabel).toBe("OneDrive (business)");
    });
  });

  describe("Dropbox Runtime Adapter", () => {
    it("is registered properly in runtime registry", () => {
      const adapter = getIntegrationRuntimeAdapter("dropbox");
      expect(adapter).toBeDefined();
      expect(adapter!.manifest.providerId).toBe("dropbox");
      expect(adapter!.manifest.adapterId).toBe("j10.dropbox.runtime");
      const capIds = adapter!.manifest.capabilities.map((c) => c.capabilityId);
      expect(capIds).toContain("dropbox.upload_file");
      expect(capIds).toContain("dropbox.create_folder");
      expect(capIds).toContain("dropbox.share_file");
    });

    it("executes simulated share file", async () => {
      const invocation = createMockActionInvocation(
        "dropbox.share_file",
        "dropbox",
        { file_path: "/Clients/Summary.pdf" },
        "simulate",
      );
      const result = await DROPBOX_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.simulated).toBe(true);
    });

    it("creates folder in live mode", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ metadata: { id: "id:folder_dbx_555", name: "Invoices" } }),
      } as any);

      const invocation = createMockActionInvocation(
        "dropbox.create_folder",
        "dropbox",
        { folder_path: "/Invoices" },
        "live",
        { access_token: "dbx_token_abc" },
      );

      const result = await DROPBOX_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.folderId).toBe("id:folder_dbx_555");
    });

    it("verifies health check", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ account_id: "dbid:123", name: { display_name: "Sarah Connor" } }),
      } as any);

      const context = createMockContext("dropbox", { access_token: "token" });
      const health = await DROPBOX_RUNTIME_ADAPTER.healthCheck!(context);
      expect(health.healthy).toBe(true);
      expect(health.externalAccountLabel).toBe("Sarah Connor");
    });
  });

  describe("Notion Runtime Adapter", () => {
    it("is registered properly in runtime registry", () => {
      const adapter = getIntegrationRuntimeAdapter("notion");
      expect(adapter).toBeDefined();
      expect(adapter!.manifest.providerId).toBe("notion");
      expect(adapter!.manifest.adapterId).toBe("j10.notion.runtime");
      const capIds = adapter!.manifest.capabilities.map((c) => c.capabilityId);
      expect(capIds).toContain("notion.create_page");
      expect(capIds).toContain("notion.update_page");
      expect(capIds).toContain("notion.add_database_item");
    });

    it("executes simulated add database item", async () => {
      const invocation = createMockActionInvocation(
        "notion.add_database_item",
        "notion",
        { database_id: "db_notion_123", title: "New Lead Intake" },
        "simulate",
      );
      const result = await NOTION_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.simulated).toBe(true);
    });

    it("creates page in live mode", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: "page_uuid_777", url: "https://notion.so/page_777" }),
      } as any);

      const invocation = createMockActionInvocation(
        "notion.create_page",
        "notion",
        { parent_page_id: "parent_uuid_999", title: "Meeting Notes" },
        "live",
        { secret_key: "secret_notion_internal_key" },
      );

      const result = await NOTION_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.pageId).toBe("page_uuid_777");
    });

    it("verifies health check", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: "bot_123", name: "J10 Sync Bot" }),
      } as any);

      const context = createMockContext("notion", { secret_key: "secret" });
      const health = await NOTION_RUNTIME_ADAPTER.healthCheck!(context);
      expect(health.healthy).toBe(true);
      expect(health.externalAccountLabel).toBe("J10 Sync Bot");
    });
  });

  describe("Airtable Runtime Adapter", () => {
    it("is registered properly in runtime registry", () => {
      const adapter = getIntegrationRuntimeAdapter("airtable");
      expect(adapter).toBeDefined();
      expect(adapter!.manifest.providerId).toBe("airtable");
      expect(adapter!.manifest.adapterId).toBe("j10.airtable.runtime");
      const capIds = adapter!.manifest.capabilities.map((c) => c.capabilityId);
      expect(capIds).toContain("airtable.create_record");
      expect(capIds).toContain("airtable.update_record");
      expect(capIds).toContain("airtable.delete_record");
    });

    it("executes simulated create record", async () => {
      const invocation = createMockActionInvocation(
        "airtable.create_record",
        "airtable",
        { base_id: "app123", table_name: "Contacts", fields: { Name: "Peter Parker" } },
        "simulate",
      );
      const result = await AIRTABLE_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.simulated).toBe(true);
    });

    it("creates record in live mode", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: "rec998877", fields: { Name: "Peter Parker" } }),
      } as any);

      const invocation = createMockActionInvocation(
        "airtable.create_record",
        "airtable",
        { base_id: "app123", table_name: "Contacts", fields: { Name: "Peter Parker" } },
        "live",
        { secret_key: "pat_airtable_token" },
      );

      const result = await AIRTABLE_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.recordId).toBe("rec998877");
    });

    it("verifies health check", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: "usr_airtable", email: "team@j10nexus.com" }),
      } as any);

      const context = createMockContext("airtable", { secret_key: "pat_token" });
      const health = await AIRTABLE_RUNTIME_ADAPTER.healthCheck!(context);
      expect(health.healthy).toBe(true);
      expect(health.externalAccountLabel).toBe("team@j10nexus.com");
    });
  });
});
