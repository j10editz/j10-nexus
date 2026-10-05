import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { GEMINI_RUNTIME_ADAPTER } from "@/lib/integrations/providers/gemini/adapter";
import { RUNWAY_RUNTIME_ADAPTER } from "@/lib/integrations/providers/runway/adapter";
import { HIGGSFIELD_RUNTIME_ADAPTER } from "@/lib/integrations/providers/higgsfield/adapter";
import { PIKA_RUNTIME_ADAPTER } from "@/lib/integrations/providers/pika/adapter";
import { KLING_RUNTIME_ADAPTER } from "@/lib/integrations/providers/kling/adapter";
import { getIntegrationRuntimeAdapter } from "@/lib/integrations/runtime-registry";
import type {
  IntegrationRuntimeActionInvocation,
  IntegrationRuntimeInvocationContext,
} from "@/types/integration-runtime";

function createMockContext(
  providerId: string,
  credentialsRecord: Record<string, string> = {},
): IntegrationRuntimeInvocationContext {
  return {
    requestId: "req_creative_123",
    correlationId: "corr_creative_123",
    userId: "usr_creative_123",
    environment: "development",
    signal: new AbortController().signal,
    connection: {
      id: `conn_${providerId}_1`,
      workspaceId: "ws_creative_test",
      userId: "usr_creative_123",
      providerId: providerId as any,
      name: `${providerId} Connection`,
      status: "connected",
      environment: "development",
      credentialReference: "vault_ref_creative",
      externalAccountId: null,
      externalAccountLabel: null,
      grantedScopes: [],
      enabledCapabilities: [],
      publicConfiguration: {},
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
    idempotencyKey: `idem_creative_${Date.now()}`,
    input,
  };
}

describe("Creative AI Runtime Adapters", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("Google Gemini Multimodal Adapter", () => {
    it("is registered properly in runtime registry", () => {
      const adapter = getIntegrationRuntimeAdapter("gemini");
      expect(adapter).toBeDefined();
      expect(adapter!.manifest.providerId).toBe("gemini");
      expect(adapter!.manifest.adapterId).toBe("j10.gemini.runtime");
    });

    it("executes simulated generate content", async () => {
      const invocation = createMockActionInvocation("gemini.generate_content", "gemini", { prompt: "Hello" }, "simulate");
      const result = await GEMINI_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.simulated).toBe(true);
    });

    it("executes live content generation", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "x-goog-request-id": "req_gemini_1" }),
        json: async () => ({
          candidates: [{ content: { parts: [{ text: "Gemini AI response" }] } }],
        }),
      });

      const invocation = createMockActionInvocation("gemini.generate_content", "gemini", { prompt: "Summarize" }, "live", { api_key: "gemini_key" });
      const result = await GEMINI_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.text).toBe("Gemini AI response");
    });
  });

  describe("Runway Gen-3 Adapter", () => {
    it("is registered properly in runtime registry", () => {
      const adapter = getIntegrationRuntimeAdapter("runway");
      expect(adapter).toBeDefined();
      expect(adapter!.manifest.providerId).toBe("runway");
    });

    it("executes live video generation task dispatch", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "x-request-id": "req_runway_1" }),
        json: async () => ({ id: "task_runway_123", status: "PENDING" }),
      });

      const invocation = createMockActionInvocation("runway.generate_video", "runway", { prompt: "Luxury car" }, "live", { api_key: "runway_key" });
      const result = await RUNWAY_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.taskId).toBe("task_runway_123");
    });
  });

  describe("Higgsfield Motion AI Adapter", () => {
    it("is registered properly in runtime registry", () => {
      const adapter = getIntegrationRuntimeAdapter("higgsfield");
      expect(adapter).toBeDefined();
      expect(adapter!.manifest.providerId).toBe("higgsfield");
    });

    it("executes simulated motion ad creation", async () => {
      const invocation = createMockActionInvocation("higgsfield.create_ad_creative", "higgsfield", { prompt: "Ad creative" }, "simulate");
      const result = await HIGGSFIELD_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.simulated).toBe(true);
    });
  });

  describe("Pika AI Video Effects Adapter", () => {
    it("is registered properly in runtime registry", () => {
      const adapter = getIntegrationRuntimeAdapter("pika");
      expect(adapter).toBeDefined();
      expect(adapter!.manifest.providerId).toBe("pika");
    });

    it("executes simulated video generation", async () => {
      const invocation = createMockActionInvocation("pika.generate_video", "pika", { prompt: "Pika video" }, "simulate");
      const result = await PIKA_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.simulated).toBe(true);
    });
  });

  describe("Kling AI Cinematic Video Adapter", () => {
    it("is registered properly in runtime registry", () => {
      const adapter = getIntegrationRuntimeAdapter("kling");
      expect(adapter).toBeDefined();
      expect(adapter!.manifest.providerId).toBe("kling");
    });

    it("executes simulated video generation", async () => {
      const invocation = createMockActionInvocation("kling.generate_video", "kling", { prompt: "Kling video" }, "simulate");
      const result = await KLING_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.simulated).toBe(true);
    });
  });
});
