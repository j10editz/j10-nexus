import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { OPENAI_RUNTIME_ADAPTER } from "@/lib/integrations/providers/openai/adapter";
import { ANTHROPIC_RUNTIME_ADAPTER } from "@/lib/integrations/providers/anthropic/adapter";
import { getIntegrationRuntimeAdapter, listIntegrationRuntimeAdapters } from "@/lib/integrations/runtime-registry";
import type {
  IntegrationRuntimeActionInvocation,
  IntegrationRuntimeInvocationContext,
} from "@/types/integration-runtime";

function createMockContext(
  providerId: string,
  credentialsRecord: Record<string, string> = {},
  publicConfiguration: Record<string, string | number | boolean | null> = {},
): IntegrationRuntimeInvocationContext {
  return {
    requestId: "req_ai_test_123",
    correlationId: "corr_ai_test_123",
    userId: "usr_ai_test_123",
    environment: "development",
    signal: new AbortController().signal,
    connection: {
      id: `conn_${providerId}_1`,
      workspaceId: "ws_test_ai",
      userId: "usr_ai_test_123",
      providerId: providerId as any,
      name: `${providerId} Connection`,
      status: "connected",
      environment: "development",
      credentialReference: "vault_ref_ai",
      externalAccountId: null,
      externalAccountLabel: null,
      grantedScopes: [],
      enabledCapabilities: [],
      publicConfiguration,
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
  publicConfiguration: Record<string, string | number | boolean | null> = {},
): IntegrationRuntimeActionInvocation {
  const context = createMockContext(providerId, credentialsRecord, publicConfiguration);
  return {
    ...context,
    capabilityId,
    mode,
    idempotencyKey: `idem_ai_${Date.now()}`,
    input,
  };
}

describe("AI Model Orchestration Runtime Adapters", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("OpenAI Runtime Adapter", () => {
    it("is registered properly in the central runtime registry", () => {
      const adapter = getIntegrationRuntimeAdapter("openai");
      expect(adapter).toBeDefined();
      expect(adapter!.manifest.providerId).toBe("openai");
      expect(adapter!.manifest.adapterId).toBe("j10.openai.runtime");
      expect(adapter!.manifest.state).toBe("installed");
      expect(adapter!.manifest.authType).toBe("secret_key");
      expect(adapter!.manifest.supportsHealthChecks).toBe(true);

      const allAdapters = listIntegrationRuntimeAdapters();
      expect(allAdapters.some((a) => a.manifest.providerId === "openai")).toBe(true);
    });

    it("executes simulated chat completion with zero credentials", async () => {
      const invocation = createMockActionInvocation(
        "openai.generate_response",
        "openai",
        { prompt: "Schedule a VIP call with the CEO" },
        "simulate",
      );

      const result = await OPENAI_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.responseStatus).toBe(200);
      expect(result.metadata.simulated).toBe(true);
      expect((result.metadata.message as any).role).toBe("assistant");
    });

    it("executes live OpenAI chat completions with function calling / tools", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "x-request-id": "req_openai_999" }),
        json: async () => ({
          id: "chatcmpl_999",
          model: "gpt-4o",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call_abc",
                    type: "function",
                    function: { name: "bookAppointment", arguments: '{"slot":"2026-10-06T10:00:00Z"}' },
                  },
                ],
              },
              finish_reason: "tool_calls",
            },
          ],
          usage: { prompt_tokens: 15, completion_tokens: 20, total_tokens: 35 },
        }),
      });

      const invocation = createMockActionInvocation(
        "openai.chat_completions",
        "openai",
        {
          model: "gpt-4o",
          messages: [{ role: "user", content: "Book an appointment for tomorrow at 10 AM" }],
          tools: [
            {
              type: "function",
              function: {
                name: "bookAppointment",
                description: "Book an appointment slot",
                parameters: { type: "object", properties: { slot: { type: "string" } } },
              },
            },
          ],
        },
        "live",
        { api_key: "sk-openai-live-key" },
      );

      const result = await OPENAI_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.responseStatus).toBe(200);
      expect(result.providerRequestId).toBe("req_openai_999");
      expect((result.metadata.message as any).tool_calls).toHaveLength(1);
      expect((result.metadata.message as any).tool_calls[0].function.name).toBe("bookAppointment");
    });

    it("executes live OpenAI Assistant run invocation", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "x-request-id": "req_asst_123" }),
        json: async () => ({
          id: "run_abc123",
          thread_id: "thread_xyz789",
          status: "queued",
        }),
      });

      const invocation = createMockActionInvocation(
        "openai.run_assistant",
        "openai",
        {
          assistant_id: "asst_j10_concierge",
          content: "Process customer intake questionnaire",
        },
        "live",
        { api_key: "sk-openai-test-key" },
      );

      const result = await OPENAI_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.runId).toBe("run_abc123");
      expect(result.metadata.threadId).toBe("thread_xyz789");
    });

    it("executes live OpenAI Vision media analysis", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "x-request-id": "req_vis_123" }),
        json: async () => ({
          id: "chatcmpl_vis",
          choices: [
            {
              message: {
                role: "assistant",
                content: "The document is an approved enterprise invoice totaling $12,500.",
              },
            },
          ],
        }),
      });

      const invocation = createMockActionInvocation(
        "openai.analyze_media",
        "openai",
        {
          image_url: "https://example.com/invoice.png",
          prompt: "Extract the total amount and approval status",
        },
        "live",
        { api_key: "sk-openai-test-key" },
      );

      const result = await OPENAI_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.analysis).toContain("invoice totaling $12,500");
    });

    it("executes live DALL-E 3 image generation", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "x-request-id": "req_img_123" }),
        json: async () => ({
          data: [
            {
              url: "https://oaidalleapiprodscus.blob.core.windows.net/generated_image.png",
              revised_prompt: "A luxury automotive concierge showroom in royal gold and obsidian.",
            },
          ],
        }),
      });

      const invocation = createMockActionInvocation(
        "openai.generate_image",
        "openai",
        {
          prompt: "Luxury automotive concierge showroom",
          size: "1024x1024",
        },
        "live",
        { api_key: "sk-openai-test-key" },
      );

      const result = await OPENAI_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.url).toContain("generated_image.png");
    });

    it("performs accurate health checks for OpenAI", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });

      const healthyContext = createMockContext("openai", { api_key: "sk-openai-valid" });
      const healthyResult = await OPENAI_RUNTIME_ADAPTER.healthCheck!(healthyContext);
      expect(healthyResult.healthy).toBe(true);
      expect(healthyResult.externalAccountLabel).toContain("OpenAI");

      const unauthContext = createMockContext("openai", {});
      const degradedResult = await OPENAI_RUNTIME_ADAPTER.healthCheck!(unauthContext);
      expect(degradedResult.healthy).toBe(false);
      expect(degradedResult.metadata?.reason).toContain("missing");
    });
  });

  describe("Anthropic Claude Runtime Adapter", () => {
    it("is registered properly in the central runtime registry", () => {
      const adapter = getIntegrationRuntimeAdapter("anthropic");
      expect(adapter).toBeDefined();
      expect(adapter!.manifest.providerId).toBe("anthropic");
      expect(adapter!.manifest.adapterId).toBe("j10.anthropic.runtime");
      expect(adapter!.manifest.state).toBe("installed");
      expect(adapter!.manifest.authType).toBe("secret_key");
      expect(adapter!.manifest.supportsHealthChecks).toBe(true);

      const allAdapters = listIntegrationRuntimeAdapters();
      expect(allAdapters.some((a) => a.manifest.providerId === "anthropic")).toBe(true);
    });

    it("executes simulated Claude message generation with zero credentials", async () => {
      const invocation = createMockActionInvocation(
        "anthropic.generate_message",
        "anthropic",
        { prompt: "Draft an enterprise legal advisory" },
        "simulate",
      );

      const result = await ANTHROPIC_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.responseStatus).toBe(200);
      expect(result.metadata.simulated).toBe(true);
      expect(result.metadata.model).toBe("claude-3-5-sonnet-20241022");
    });

    it("executes live Anthropic Messages API with Claude 3.5 Sonnet", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "request-id": "req_ant_sonnet_123" }),
        json: async () => ({
          id: "msg_01XyZ",
          type: "message",
          role: "assistant",
          model: "claude-3-5-sonnet-20241022",
          content: [
            {
              type: "text",
              text: "Here is your refined business intelligence briefing.",
            },
          ],
          stop_reason: "end_turn",
          usage: { input_tokens: 40, output_tokens: 30 },
        }),
      });

      const invocation = createMockActionInvocation(
        "anthropic.create_message",
        "anthropic",
        {
          model: "claude-3-5-sonnet-20241022",
          system: "You are the J10 NEXUS Executive Intelligence Assistant.",
          messages: [{ role: "user", content: "Provide weekly summary" }],
        },
        "live",
        { api_key: "sk-ant-api03-live-test-key" },
      );

      const result = await ANTHROPIC_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.responseStatus).toBe(200);
      expect(result.providerRequestId).toBe("req_ant_sonnet_123");
      expect((result.metadata.content as any)[0].text).toContain("business intelligence briefing");
    });

    it("executes live Anthropic Tool Use with function definitions", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "request-id": "req_ant_tool_123" }),
        json: async () => ({
          id: "msg_tool_01",
          type: "message",
          role: "assistant",
          model: "claude-3-5-sonnet-20241022",
          content: [
            {
              type: "tool_use",
              id: "toolu_01A",
              name: "send_slack_notification",
              input: { channel: "#general", text: "New high-value lead closed" },
            },
          ],
          stop_reason: "tool_use",
          usage: { input_tokens: 60, output_tokens: 25 },
        }),
      });

      const invocation = createMockActionInvocation(
        "anthropic.execute_tool",
        "anthropic",
        {
          messages: [{ role: "user", content: "Notify team about the closed deal" }],
          tools: [
            {
              name: "send_slack_notification",
              description: "Sends a notification to a Slack channel",
              input_schema: {
                type: "object",
                properties: {
                  channel: { type: "string" },
                  text: { type: "string" },
                },
                required: ["channel", "text"],
              },
            },
          ],
        },
        "live",
        { api_key: "sk-ant-live-key" },
      );

      const result = await ANTHROPIC_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.toolUses).toHaveLength(1);
      expect((result.metadata.toolUses as any)[0].name).toBe("send_slack_notification");
      expect((result.metadata.toolUses as any)[0].input.channel).toBe("#general");
    });

    it("executes live Anthropic Document Analysis", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "request-id": "req_doc_123" }),
        json: async () => ({
          id: "msg_doc_01",
          model: "claude-3-5-sonnet-20241022",
          content: [
            {
              type: "text",
              text: "Risk evaluation: Low risk. Agreement includes standard indemnity clause.",
            },
          ],
        }),
      });

      const invocation = createMockActionInvocation(
        "anthropic.analyze_document",
        "anthropic",
        {
          document_text: "SECTION 4. INDEMNIFICATION AND WARRANTIES...",
          prompt: "Summarize legal risk factors",
        },
        "live",
        { api_key: "sk-ant-live-key" },
      );

      const result = await ANTHROPIC_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.analysis).toContain("Low risk");
    });

    it("performs accurate health checks for Anthropic", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: "msg_ping" }),
      });

      const healthyContext = createMockContext("anthropic", { api_key: "sk-ant-valid" });
      const healthyResult = await ANTHROPIC_RUNTIME_ADAPTER.healthCheck!(healthyContext);
      expect(healthyResult.healthy).toBe(true);
      expect(healthyResult.externalAccountLabel).toContain("Claude 3.5 Sonnet");

      const unauthContext = createMockContext("anthropic", {});
      const degradedResult = await ANTHROPIC_RUNTIME_ADAPTER.healthCheck!(unauthContext);
      expect(degradedResult.healthy).toBe(false);
      expect(degradedResult.metadata?.reason).toContain("missing");
    });
  });
});
