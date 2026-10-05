import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ZOOM_RUNTIME_ADAPTER } from "@/lib/integrations/providers/zoom/adapter";
import { TELNYX_RUNTIME_ADAPTER } from "@/lib/integrations/providers/telnyx/adapter";
import { DISCORD_RUNTIME_ADAPTER } from "@/lib/integrations/providers/discord/adapter";
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
    requestId: "req_comm_123",
    correlationId: "corr_comm_123",
    userId: "usr_comm_123",
    environment: "development",
    signal: new AbortController().signal,
    connection: {
      id: `conn_${providerId}_1`,
      workspaceId: "ws_comm_test",
      userId: "usr_comm_123",
      providerId: providerId as any,
      name: `${providerId} Connection`,
      status: "connected",
      environment: "development",
      credentialReference: "vault_ref_comm",
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
    idempotencyKey: `idem_comm_${Date.now()}`,
    input,
  };
}

describe("Batch 12: Communication, Telephony & Community Connectors", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("Zoom Runtime Adapter", () => {
    it("is registered properly in runtime registry", () => {
      const adapter = getIntegrationRuntimeAdapter("zoom");
      expect(adapter).toBeDefined();
      expect(adapter!.manifest.providerId).toBe("zoom");
      expect(adapter!.manifest.adapterId).toBe("j10.zoom.runtime");
      const capIds = adapter!.manifest.capabilities.map((c) => c.capabilityId);
      expect(capIds).toContain("zoom.create_meeting");
      expect(capIds).toContain("zoom.update_meeting");
      expect(capIds).toContain("zoom.cancel_meeting");
    });

    it("executes simulated create meeting", async () => {
      const invocation = createMockActionInvocation(
        "zoom.create_meeting",
        "zoom",
        { topic: "Client Strategy Sync", duration: 45 },
        "simulate",
      );
      const result = await ZOOM_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.simulated).toBe(true);
    });

    it("creates meeting in live mode", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ id: "zoom_meet_987", join_url: "https://zoom.us/j/987" }),
      } as any);

      const invocation = createMockActionInvocation(
        "zoom.create_meeting",
        "zoom",
        { topic: "Client Strategy Sync", duration: 45 },
        "live",
        { access_token: "zoom_oauth_token_123" },
      );

      const result = await ZOOM_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.meetingId).toBe("zoom_meet_987");
    });

    it("verifies health check", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: "usr_zoom_1", email: "host@j10nexus.com" }),
      } as any);

      const context = createMockContext("zoom", { access_token: "token" });
      const health = await ZOOM_RUNTIME_ADAPTER.healthCheck!(context);
      expect(health.healthy).toBe(true);
      expect(health.externalAccountLabel).toBe("host@j10nexus.com");
    });
  });

  describe("Telnyx Runtime Adapter", () => {
    it("is registered properly in runtime registry", () => {
      const adapter = getIntegrationRuntimeAdapter("telnyx");
      expect(adapter).toBeDefined();
      expect(adapter!.manifest.providerId).toBe("telnyx");
      expect(adapter!.manifest.adapterId).toBe("j10.telnyx.runtime");
      const capIds = adapter!.manifest.capabilities.map((c) => c.capabilityId);
      expect(capIds).toContain("telnyx.send_sms");
      expect(capIds).toContain("telnyx.initiate_call");
      expect(capIds).toContain("telnyx.send_number_verification");
    });

    it("executes simulated send sms", async () => {
      const invocation = createMockActionInvocation(
        "telnyx.send_sms",
        "telnyx",
        { to: "+15551234567", text: "Your verification code is 4492." },
        "simulate",
      );
      const result = await TELNYX_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.simulated).toBe(true);
    });

    it("sends SMS in live mode", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: { id: "telnyx_msg_999", to: "+15551234567" } }),
      } as any);

      const invocation = createMockActionInvocation(
        "telnyx.send_sms",
        "telnyx",
        { to: "+15551234567", text: "Appointment confirmed.", from: "+18005550199" },
        "live",
        { access_token: "KEY_telnyx_live_secret" },
      );

      const result = await TELNYX_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.messageId).toBe("telnyx_msg_999");
    });

    it("verifies health check", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: [{ phone_number: "+18005550199" }] }),
      } as any);

      const context = createMockContext("telnyx", { access_token: "telnyx_token" });
      const health = await TELNYX_RUNTIME_ADAPTER.healthCheck!(context);
      expect(health.healthy).toBe(true);
      expect(health.externalAccountLabel).toBe("Telnyx Communications");
    });
  });

  describe("Discord Runtime Adapter", () => {
    it("is registered properly in runtime registry", () => {
      const adapter = getIntegrationRuntimeAdapter("discord");
      expect(adapter).toBeDefined();
      expect(adapter!.manifest.providerId).toBe("discord");
      expect(adapter!.manifest.adapterId).toBe("j10.discord.runtime");
      const capIds = adapter!.manifest.capabilities.map((c) => c.capabilityId);
      expect(capIds).toContain("discord.send_message");
      expect(capIds).toContain("discord.assign_role");
      expect(capIds).toContain("discord.moderate_member");
    });

    it("executes simulated send message", async () => {
      const invocation = createMockActionInvocation(
        "discord.send_message",
        "discord",
        { channel_id: "1234567890", content: "Welcome to the VIP portal!" },
        "simulate",
      );
      const result = await DISCORD_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.simulated).toBe(true);
    });

    it("sends message in live mode", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: "discord_msg_444", channel_id: "1234567890" }),
      } as any);

      const invocation = createMockActionInvocation(
        "discord.send_message",
        "discord",
        { channel_id: "1234567890", content: "Welcome to the VIP portal!" },
        "live",
        { bot_token: "OTk5OTk5.XyZ.token" },
      );

      const result = await DISCORD_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.providerRequestId).toBe("discord_msg_444");
    });

    it("verifies health check", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: "bot_user_id", username: "J10 Sentinel" }),
      } as any);

      const context = createMockContext("discord", { bot_token: "token" });
      const health = await DISCORD_RUNTIME_ADAPTER.healthCheck!(context);
      expect(health.healthy).toBe(true);
      expect(health.externalAccountLabel).toBe("J10 Sentinel Bot");
    });
  });
});
