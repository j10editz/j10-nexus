import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { SLACK_RUNTIME_ADAPTER } from "@/lib/integrations/providers/slack/adapter";
import { MICROSOFT_TEAMS_RUNTIME_ADAPTER } from "@/lib/integrations/providers/microsoft-teams/adapter";
import { GOOGLE_SHEETS_RUNTIME_ADAPTER } from "@/lib/integrations/providers/google-sheets/adapter";
import { GOOGLE_DRIVE_RUNTIME_ADAPTER } from "@/lib/integrations/providers/google-drive/adapter";
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
    requestId: "req_team_123",
    correlationId: "corr_team_123",
    userId: "usr_team_123",
    environment: "development",
    signal: new AbortController().signal,
    connection: {
      id: `conn_${providerId}_1`,
      workspaceId: "ws_team_test",
      userId: "usr_team_123",
      providerId: providerId as any,
      name: `${providerId} Connection`,
      status: "connected",
      environment: "development",
      credentialReference: "vault_ref_team",
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
    idempotencyKey: `idem_team_${Date.now()}`,
    input,
  };
}

describe("Batch 7: Team & Collaborative Data Connectors", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("Slack Runtime Adapter", () => {
    it("is registered properly in runtime registry", () => {
      const adapter = getIntegrationRuntimeAdapter("slack");
      expect(adapter).toBeDefined();
      expect(adapter!.manifest.providerId).toBe("slack");
      expect(adapter!.manifest.adapterId).toBe("j10.slack.runtime");
      const capIds = adapter!.manifest.capabilities.map((c) => c.capabilityId);
      expect(capIds).toContain("slack.send_message");
    });

    it("executes simulated send message", async () => {
      const invocation = createMockActionInvocation("slack.send_message", "slack", { channel: "C123", text: "Hello Slack" }, "simulate");
      const result = await SLACK_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.simulated).toBe(true);
      expect(result.metadata.channel).toBe("C123");
    });

    it("rejects live execution when bot_token is missing", async () => {
      const invocation = createMockActionInvocation("slack.send_message", "slack", { channel: "C123", text: "Hello" }, "live");
      await expect(SLACK_RUNTIME_ADAPTER.executeAction!(invocation)).rejects.toThrow("Slack Bot User OAuth Token is missing");
    });

    it("performs live health check successfully", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, user_id: "U123", team: "Acme HQ" }),
      } as any);

      const context = createMockContext("slack", { bot_token: "xoxb-valid-test-token" });
      const health = await SLACK_RUNTIME_ADAPTER.healthCheck!(context);
      expect(health.healthy).toBe(true);
      expect(health.externalAccountId).toBe("U123");
    });
  });

  describe("Microsoft Teams Runtime Adapter", () => {
    it("is registered properly in runtime registry", () => {
      const adapter = getIntegrationRuntimeAdapter("microsoft-teams");
      expect(adapter).toBeDefined();
      expect(adapter!.manifest.providerId).toBe("microsoft-teams");
      expect(adapter!.manifest.adapterId).toBe("j10.microsoft-teams.runtime");
      const capIds = adapter!.manifest.capabilities.map((c) => c.capabilityId);
      expect(capIds).toContain("microsoft-teams.send_channel_message");
    });

    it("executes simulated message posting", async () => {
      const invocation = createMockActionInvocation("microsoft-teams.send_channel_message", "microsoft-teams", { content: "New Lead arrived" }, "simulate");
      const result = await MICROSOFT_TEAMS_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.simulated).toBe(true);
    });

    it("delivers via incoming webhook url when configured", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      } as any);

      const invocation = createMockActionInvocation(
        "microsoft-teams.send_channel_message",
        "microsoft-teams",
        { content: "Webhook message" },
        "live",
        { webhook_url: "https://outlook.office.com/webhook/test" }
      );

      const result = await MICROSOFT_TEAMS_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.deliveredVia).toBe("webhook");
    });
  });

  describe("Google Sheets Runtime Adapter", () => {
    it("is registered properly in runtime registry", () => {
      const adapter = getIntegrationRuntimeAdapter("google-sheets");
      expect(adapter).toBeDefined();
      expect(adapter!.manifest.providerId).toBe("google-sheets");
      expect(adapter!.manifest.adapterId).toBe("j10.google_sheets.runtime");
      const capIds = adapter!.manifest.capabilities.map((c) => c.capabilityId);
      expect(capIds).toContain("google-sheets.add_row");
    });

    it("executes simulated row append", async () => {
      const invocation = createMockActionInvocation("google-sheets.add_row", "google-sheets", {
        spreadsheet_id: "sheet_xyz_123",
        values: ["Alice", "alice@example.com", "Qualified"],
      }, "simulate");
      const result = await GOOGLE_SHEETS_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.simulated).toBe(true);
      expect(result.metadata.spreadsheetId).toBe("sheet_xyz_123");
    });

    it("executes live row append via Google Sheets REST API", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          updates: { updatedRange: "Sheet1!A2:C2", updatedRows: 1 },
        }),
      } as any);

      const invocation = createMockActionInvocation(
        "google-sheets.add_row",
        "google-sheets",
        { spreadsheet_id: "sheet_live_123", values: ["Bob", "bob@example.com"] },
        "live",
        { access_token: "mock_google_token" }
      );

      const result = await GOOGLE_SHEETS_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.updatedRange).toBe("Sheet1!A2:C2");
    });
  });

  describe("Google Drive Runtime Adapter", () => {
    it("is registered properly in runtime registry", () => {
      const adapter = getIntegrationRuntimeAdapter("google-drive");
      expect(adapter).toBeDefined();
      expect(adapter!.manifest.providerId).toBe("google-drive");
      expect(adapter!.manifest.adapterId).toBe("j10.google_drive.runtime");
      const capIds = adapter!.manifest.capabilities.map((c) => c.capabilityId);
      expect(capIds).toContain("google-drive.upload_file");
    });

    it("executes simulated file upload", async () => {
      const invocation = createMockActionInvocation("google-drive.upload_file", "google-drive", {
        name: "client_onboarding.pdf",
      }, "simulate");
      const result = await GOOGLE_DRIVE_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.simulated).toBe(true);
      expect(result.metadata.fileName).toBe("client_onboarding.pdf");
    });

    it("executes live multipart file upload via Drive API", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "drive_file_987",
          name: "contract.pdf",
          webViewLink: "https://drive.google.com/file/d/drive_file_987/view",
        }),
      } as any);

      const invocation = createMockActionInvocation(
        "google-drive.upload_file",
        "google-drive",
        { name: "contract.pdf", mime_type: "application/pdf", content: "%PDF-1.4..." },
        "live",
        { access_token: "mock_drive_token" }
      );

      const result = await GOOGLE_DRIVE_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.fileId).toBe("drive_file_987");
      expect(result.metadata.webViewLink).toContain("drive_file_987");
    });
  });
});
