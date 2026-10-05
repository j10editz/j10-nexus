import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { YOUTUBE_RUNTIME_ADAPTER } from "@/lib/integrations/providers/youtube/adapter";
import { TIKTOK_RUNTIME_ADAPTER } from "@/lib/integrations/providers/tiktok/adapter";
import { LINKEDIN_RUNTIME_ADAPTER } from "@/lib/integrations/providers/linkedin/adapter";
import { X_RUNTIME_ADAPTER } from "@/lib/integrations/providers/x/adapter";
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
    requestId: "req_social_123",
    correlationId: "corr_social_123",
    userId: "usr_social_123",
    environment: "development",
    signal: new AbortController().signal,
    connection: {
      id: `conn_${providerId}_1`,
      workspaceId: "ws_social_test",
      userId: "usr_social_123",
      providerId: providerId as any,
      name: `${providerId} Connection`,
      status: "connected",
      environment: "development",
      credentialReference: "vault_ref_social",
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
    idempotencyKey: `idem_social_${Date.now()}`,
    input,
  };
}

describe("Batch 14: Social Media Runtime Connectors", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("YouTube Runtime Adapter", () => {
    it("is registered properly in runtime registry", () => {
      const adapter = getIntegrationRuntimeAdapter("youtube");
      expect(adapter).toBeDefined();
      expect(adapter!.manifest.providerId).toBe("youtube");
      expect(adapter!.manifest.adapterId).toBe("j10.youtube.runtime");
      const capIds = adapter!.manifest.capabilities.map((c) => c.capabilityId);
      expect(capIds).toContain("youtube.upload_video");
      expect(capIds).toContain("youtube.update_video");
      expect(capIds).toContain("youtube.add_to_playlist");
    });

    it("executes simulated upload video", async () => {
      const invocation = createMockActionInvocation(
        "youtube.upload_video",
        "youtube",
        { title: "Product Launch Keynote", description: "J10 Nexus v2 overview" },
        "simulate",
      );
      const result = await YOUTUBE_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.simulated).toBe(true);
    });

    it("uploads video in live mode", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "x-request-id": "yt_req_999" }),
        json: async () => ({ id: "vid_yt_123", snippet: { title: "Product Launch Keynote" } }),
      } as any);

      const invocation = createMockActionInvocation(
        "youtube.upload_video",
        "youtube",
        { title: "Product Launch Keynote" },
        "live",
        { access_token: "ya29.mock_token" },
      );
      const result = await YOUTUBE_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.id).toBe("vid_yt_123");
    });

    it("performs health check", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          items: [{ id: "UC_12345", snippet: { title: "Nexus Studio" } }],
        }),
      } as any);

      const context = createMockContext("youtube", { access_token: "ya29.mock_token" });
      const health = await YOUTUBE_RUNTIME_ADAPTER.healthCheck!(context);
      expect(health.healthy).toBe(true);
      expect(health.externalAccountId).toBe("UC_12345");
      expect(health.externalAccountLabel).toBe("Nexus Studio");
    });
  });

  describe("TikTok Runtime Adapter", () => {
    it("is registered properly in runtime registry", () => {
      const adapter = getIntegrationRuntimeAdapter("tiktok");
      expect(adapter).toBeDefined();
      expect(adapter!.manifest.providerId).toBe("tiktok");
      expect(adapter!.manifest.adapterId).toBe("j10.tiktok.runtime");
      const capIds = adapter!.manifest.capabilities.map((c) => c.capabilityId);
      expect(capIds).toContain("tiktok.upload_content");
      expect(capIds).toContain("tiktok.publish_content");
    });

    it("executes simulated upload content", async () => {
      const invocation = createMockActionInvocation(
        "tiktok.upload_content",
        "tiktok",
        { video_url: "https://example.com/demo.mp4", title: "New Feature Reveal" },
        "simulate",
      );
      const result = await TIKTOK_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.simulated).toBe(true);
    });

    it("uploads content in live mode", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "x-tt-logid": "tt_log_888" }),
        json: async () => ({ data: { publish_id: "pub_tt_456" }, error: { code: "ok" } }),
      } as any);

      const invocation = createMockActionInvocation(
        "tiktok.upload_content",
        "tiktok",
        { video_url: "https://example.com/demo.mp4" },
        "live",
        { access_token: "tt_act_123" },
      );
      const result = await TIKTOK_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.data.publish_id).toBe("pub_tt_456");
    });

    it("performs health check", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: { user: { open_id: "tt_open_001", display_name: "Nexus Official" } },
        }),
      } as any);

      const context = createMockContext("tiktok", { access_token: "tt_act_123" });
      const health = await TIKTOK_RUNTIME_ADAPTER.healthCheck!(context);
      expect(health.healthy).toBe(true);
      expect(health.externalAccountId).toBe("tt_open_001");
      expect(health.externalAccountLabel).toBe("Nexus Official");
    });
  });

  describe("LinkedIn Runtime Adapter", () => {
    it("is registered properly in runtime registry", () => {
      const adapter = getIntegrationRuntimeAdapter("linkedin");
      expect(adapter).toBeDefined();
      expect(adapter!.manifest.providerId).toBe("linkedin");
      expect(adapter!.manifest.adapterId).toBe("j10.linkedin.runtime");
      const capIds = adapter!.manifest.capabilities.map((c) => c.capabilityId);
      expect(capIds).toContain("linkedin.publish_post");
      expect(capIds).toContain("linkedin.create_campaign");
      expect(capIds).toContain("linkedin.reply_to_lead");
    });

    it("executes simulated publish post", async () => {
      const invocation = createMockActionInvocation(
        "linkedin.publish_post",
        "linkedin",
        { text: "Announcing Enterprise Integrations on Nexus!" },
        "simulate",
      );
      const result = await LINKEDIN_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.simulated).toBe(true);
    });

    it("publishes post in live mode", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        headers: new Headers(),
        json: async () => ({ id: "urn:li:share:12345" }),
      } as any);

      const invocation = createMockActionInvocation(
        "linkedin.publish_post",
        "linkedin",
        { text: "Announcing Enterprise Integrations on Nexus!" },
        "live",
        { access_token: "li_oauth_token", author_urn: "urn:li:organization:9999" },
      );
      const result = await LINKEDIN_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.id).toBe("urn:li:share:12345");
    });

    it("performs health check", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          sub: "li_usr_777",
          name: "CTO Nexus",
        }),
      } as any);

      const context = createMockContext("linkedin", { access_token: "li_oauth_token" });
      const health = await LINKEDIN_RUNTIME_ADAPTER.healthCheck!(context);
      expect(health.healthy).toBe(true);
      expect(health.externalAccountId).toBe("li_usr_777");
      expect(health.externalAccountLabel).toBe("CTO Nexus");
    });
  });

  describe("X Runtime Adapter", () => {
    it("is registered properly in runtime registry", () => {
      const adapter = getIntegrationRuntimeAdapter("x");
      expect(adapter).toBeDefined();
      expect(adapter!.manifest.providerId).toBe("x");
      expect(adapter!.manifest.adapterId).toBe("j10.x.runtime");
      const capIds = adapter!.manifest.capabilities.map((c) => c.capabilityId);
      expect(capIds).toContain("x.publish_post");
      expect(capIds).toContain("x.reply_to_post");
      expect(capIds).toContain("x.send_direct_message");
    });

    it("executes simulated publish post", async () => {
      const invocation = createMockActionInvocation(
        "x.publish_post",
        "x",
        { text: "Hello Nexus AI Engine" },
        "simulate",
      );
      const result = await X_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.simulated).toBe(true);
    });

    it("publishes post in live mode", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        headers: new Headers({ "x-request-id": "x_req_777" }),
        json: async () => ({ data: { id: "tweet_1234567890", text: "Hello Nexus AI Engine" } }),
      } as any);

      const invocation = createMockActionInvocation(
        "x.publish_post",
        "x",
        { text: "Hello Nexus AI Engine" },
        "live",
        { access_token: "x_bearer_token" },
      );
      const result = await X_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.data.id).toBe("tweet_1234567890");
    });

    it("performs health check", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: { id: "x_user_555", username: "nexus_official" },
        }),
      } as any);

      const context = createMockContext("x", { access_token: "x_bearer_token" });
      const health = await X_RUNTIME_ADAPTER.healthCheck!(context);
      expect(health.healthy).toBe(true);
      expect(health.externalAccountId).toBe("x_user_555");
      expect(health.externalAccountLabel).toBe("@nexus_official");
    });
  });
});
