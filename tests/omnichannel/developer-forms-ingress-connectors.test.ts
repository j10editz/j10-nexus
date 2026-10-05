import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { OUTLOOK_CALENDAR_RUNTIME_ADAPTER } from "@/lib/integrations/providers/outlook-calendar/adapter";
import { WORDPRESS_RUNTIME_ADAPTER } from "@/lib/integrations/providers/wordpress/adapter";
import { TYPEFORM_RUNTIME_ADAPTER } from "@/lib/integrations/providers/typeform/adapter";
import { JOTFORM_RUNTIME_ADAPTER } from "@/lib/integrations/providers/jotform/adapter";
import { MESSENGER_RUNTIME_ADAPTER } from "@/lib/integrations/providers/messenger/adapter";
import { GITHUB_RUNTIME_ADAPTER } from "@/lib/integrations/providers/github/adapter";
import { HUGGING_FACE_RUNTIME_ADAPTER } from "@/lib/integrations/providers/hugging-face/adapter";
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
    requestId: "req_dev_forms_123",
    correlationId: "corr_dev_forms_123",
    userId: "usr_dev_forms_123",
    environment: "development",
    signal: new AbortController().signal,
    connection: {
      id: `conn_${providerId}_1`,
      workspaceId: "ws_dev_forms_test",
      userId: "usr_dev_forms_123",
      providerId: providerId as any,
      name: `${providerId} Connection`,
      status: "connected",
      environment: "development",
      credentialReference: "vault_ref_dev_forms",
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
    idempotencyKey: `idem_dev_${Date.now()}`,
    input,
  };
}

describe("Batch 17: Developer, Forms, Ingress & Calendar Runtime Connectors", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("Outlook Calendar Runtime Adapter", () => {
    it("is registered properly in runtime registry", () => {
      const adapter = getIntegrationRuntimeAdapter("outlook-calendar");
      expect(adapter).toBeDefined();
      expect(adapter!.manifest.providerId).toBe("outlook-calendar");
      expect(adapter!.manifest.adapterId).toBe("j10.outlook-calendar.runtime");
      const capIds = adapter!.manifest.capabilities.map((c) => c.capabilityId);
      expect(capIds).toContain("outlook-calendar.create_event");
      expect(capIds).toContain("outlook-calendar.update_event");
      expect(capIds).toContain("outlook-calendar.cancel_event");
    });

    it("executes simulated create event", async () => {
      const invocation = createMockActionInvocation(
        "outlook-calendar.create_event",
        "outlook-calendar",
        { subject: "Executive Review" },
        "simulate",
      );
      const result = await OUTLOOK_CALENDAR_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.simulated).toBe(true);
    });

    it("creates event in live mode", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        headers: new Headers({ "request-id": "msft_req_123" }),
        json: async () => ({ id: "event_msft_999", subject: "Executive Review" }),
      } as any);

      const invocation = createMockActionInvocation(
        "outlook-calendar.create_event",
        "outlook-calendar",
        { subject: "Executive Review" },
        "live",
        { access_token: "msft_tok_mock" },
      );
      const result = await OUTLOOK_CALENDAR_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect((result.metadata as any).id).toBe("event_msft_999");
    });

    it("performs health check", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: "cal_1122", name: "Executive Calendar" }),
      } as any);

      const context = createMockContext("outlook-calendar", { access_token: "msft_tok_mock" });
      const health = await OUTLOOK_CALENDAR_RUNTIME_ADAPTER.healthCheck!(context);
      expect(health.healthy).toBe(true);
      expect(health.externalAccountLabel).toBe("Executive Calendar");
    });
  });

  describe("WordPress Runtime Adapter", () => {
    it("is registered properly in runtime registry", () => {
      const adapter = getIntegrationRuntimeAdapter("wordpress");
      expect(adapter).toBeDefined();
      expect(adapter!.manifest.providerId).toBe("wordpress");
      expect(adapter!.manifest.adapterId).toBe("j10.wordpress.runtime");
      const capIds = adapter!.manifest.capabilities.map((c) => c.capabilityId);
      expect(capIds).toContain("wordpress.create_post");
      expect(capIds).toContain("wordpress.update_post");
      expect(capIds).toContain("wordpress.capture_inbound_lead");
    });

    it("executes simulated create post", async () => {
      const invocation = createMockActionInvocation(
        "wordpress.create_post",
        "wordpress",
        { title: "Announcing Nexus v2", content: "Exciting updates!" },
        "simulate",
      );
      const result = await WORDPRESS_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.simulated).toBe(true);
    });

    it("creates post in live mode", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        headers: new Headers(),
        json: async () => ({ id: 456, link: "https://blog.example.com/announcing-v2" }),
      } as any);

      const invocation = createMockActionInvocation(
        "wordpress.create_post",
        "wordpress",
        { title: "Announcing Nexus v2" },
        "live",
        { site_url: "https://blog.example.com", access_token: "wp_tok_mock" },
      );
      const result = await WORDPRESS_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect((result.metadata as any).id).toBe(456);
    });

    it("performs health check", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 1, name: "Editor in Chief" }),
      } as any);

      const context = createMockContext("wordpress", { site_url: "https://blog.example.com", access_token: "wp_tok_mock" });
      const health = await WORDPRESS_RUNTIME_ADAPTER.healthCheck!(context);
      expect(health.healthy).toBe(true);
      expect(health.externalAccountLabel).toContain("Editor in Chief");
    });
  });

  describe("Typeform Runtime Adapter", () => {
    it("is registered properly in runtime registry", () => {
      const adapter = getIntegrationRuntimeAdapter("typeform");
      expect(adapter).toBeDefined();
      expect(adapter!.manifest.providerId).toBe("typeform");
      expect(adapter!.manifest.adapterId).toBe("j10.typeform.runtime");
      const capIds = adapter!.manifest.capabilities.map((c) => c.capabilityId);
      expect(capIds).toContain("typeform.fetch_submission_data");
      expect(capIds).toContain("typeform.generate_form_link");
    });

    it("generates form link", async () => {
      const invocation = createMockActionInvocation(
        "typeform.generate_form_link",
        "typeform",
        { form_id: "FORM_XYZ", hidden_fields: { source: "nexus_campaign", utm_medium: "ai" } },
        "live",
        { access_token: "tf_tok_mock" },
      );
      const result = await TYPEFORM_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect((result.metadata as any).formUrl).toContain("https://form.typeform.com/to/FORM_XYZ");
      expect((result.metadata as any).formUrl).toContain("source=nexus_campaign");
    });

    it("performs health check", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ user_id: "tf_usr_77", email: "admin@metropolis.com" }),
      } as any);

      const context = createMockContext("typeform", { access_token: "tf_tok_mock" });
      const health = await TYPEFORM_RUNTIME_ADAPTER.healthCheck!(context);
      expect(health.healthy).toBe(true);
      expect(health.externalAccountId).toBe("tf_usr_77");
      expect(health.externalAccountLabel).toBe("admin@metropolis.com");
    });
  });

  describe("Jotform Runtime Adapter", () => {
    it("is registered properly in runtime registry", () => {
      const adapter = getIntegrationRuntimeAdapter("jotform");
      expect(adapter).toBeDefined();
      expect(adapter!.manifest.providerId).toBe("jotform");
      expect(adapter!.manifest.adapterId).toBe("j10.jotform.runtime");
      const capIds = adapter!.manifest.capabilities.map((c) => c.capabilityId);
      expect(capIds).toContain("jotform.retrieve_submission");
      expect(capIds).toContain("jotform.send_pre_filled_form");
    });

    it("retrieves submission in live mode", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ responseCode: 200, content: { id: "sub_9988", form_id: "223344" } }),
      } as any);

      const invocation = createMockActionInvocation(
        "jotform.retrieve_submission",
        "jotform",
        { submission_id: "sub_9988" },
        "live",
        { api_key: "jf_api_key_mock" },
      );
      const result = await JOTFORM_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect((result.metadata as any).id).toBe("sub_9988");
    });

    it("performs health check", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ responseCode: 200, content: { username: "j10_admin", email: "admin@j10.nexus" } }),
      } as any);

      const context = createMockContext("jotform", { api_key: "jf_api_key_mock" });
      const health = await JOTFORM_RUNTIME_ADAPTER.healthCheck!(context);
      expect(health.healthy).toBe(true);
      expect(health.externalAccountId).toBe("j10_admin");
      expect(health.externalAccountLabel).toBe("admin@j10.nexus");
    });
  });

  describe("Messenger Runtime Adapter", () => {
    it("is registered properly in runtime registry", () => {
      const adapter = getIntegrationRuntimeAdapter("messenger");
      expect(adapter).toBeDefined();
      expect(adapter!.manifest.providerId).toBe("messenger");
      expect(adapter!.manifest.adapterId).toBe("j10.messenger.runtime");
      const capIds = adapter!.manifest.capabilities.map((c) => c.capabilityId);
      expect(capIds).toContain("messenger.send_message");
      expect(capIds).toContain("messenger.send_quick_reply");
    });

    it("sends message in live mode", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ recipient_id: "usr_fb_123", message_id: "m_mid_999" }),
      } as any);

      const invocation = createMockActionInvocation(
        "messenger.send_message",
        "messenger",
        { recipient_id: "usr_fb_123", text: "Your reservation is confirmed." },
        "live",
        { page_access_token: "page_tok_mock" },
      );
      const result = await MESSENGER_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect((result.metadata as any).message_id).toBe("m_mid_999");
    });

    it("performs health check", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: "page_123456", name: "Metropolis Concierge Page" }),
      } as any);

      const context = createMockContext("messenger", { page_access_token: "page_tok_mock" });
      const health = await MESSENGER_RUNTIME_ADAPTER.healthCheck!(context);
      expect(health.healthy).toBe(true);
      expect(health.externalAccountId).toBe("page_123456");
      expect(health.externalAccountLabel).toBe("Metropolis Concierge Page");
    });
  });

  describe("GitHub Runtime Adapter", () => {
    it("is registered properly in runtime registry", () => {
      const adapter = getIntegrationRuntimeAdapter("github");
      expect(adapter).toBeDefined();
      expect(adapter!.manifest.providerId).toBe("github");
      expect(adapter!.manifest.adapterId).toBe("j10.github.runtime");
      const capIds = adapter!.manifest.capabilities.map((c) => c.capabilityId);
      expect(capIds).toContain("github.create_issue");
      expect(capIds).toContain("github.add_comment");
      expect(capIds).toContain("github.dispatch_workflow");
    });

    it("creates issue in live mode", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        headers: new Headers({ "x-github-request-id": "gh_req_123" }),
        json: async () => ({ number: 101, title: "Feature: Omnichannel v3", html_url: "https://github.com/org/repo/issues/101" }),
      } as any);

      const invocation = createMockActionInvocation(
        "github.create_issue",
        "github",
        { owner: "j10editz", repo: "j10-nexus", title: "Feature: Omnichannel v3" },
        "live",
        { access_token: "ghp_mock_token" },
      );
      const result = await GITHUB_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect((result.metadata as any).number).toBe(101);
    });

    it("dispatches workflow in live mode", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        headers: new Headers(),
      } as any);

      const invocation = createMockActionInvocation(
        "github.dispatch_workflow",
        "github",
        { owner: "j10editz", repo: "j10-nexus", workflow_id: "deploy.yml", ref: "main" },
        "live",
        { access_token: "ghp_mock_token" },
      );
      const result = await GITHUB_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect((result.metadata as any).dispatched).toBe(true);
    });

    it("performs health check", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ login: "octocat", name: "Mona Lisa Octocat" }),
      } as any);

      const context = createMockContext("github", { access_token: "ghp_mock_token" });
      const health = await GITHUB_RUNTIME_ADAPTER.healthCheck!(context);
      expect(health.healthy).toBe(true);
      expect(health.externalAccountId).toBe("octocat");
      expect(health.externalAccountLabel).toContain("octocat");
    });
  });

  describe("Hugging Face Runtime Adapter", () => {
    it("is registered properly in runtime registry", () => {
      const adapter = getIntegrationRuntimeAdapter("hugging-face");
      expect(adapter).toBeDefined();
      expect(adapter!.manifest.providerId).toBe("hugging-face");
      expect(adapter!.manifest.adapterId).toBe("j10.hugging-face.runtime");
      const capIds = adapter!.manifest.capabilities.map((c) => c.capabilityId);
      expect(capIds).toContain("hugging-face.run_inference");
      expect(capIds).toContain("hugging-face.generate_embedding");
      expect(capIds).toContain("hugging-face.classify_content");
    });

    it("runs inference in live mode", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ([{ generated_text: "AI response from Mistral" }]),
      } as any);

      const invocation = createMockActionInvocation(
        "hugging-face.run_inference",
        "hugging-face",
        { inputs: "Summarize this article" },
        "live",
        { access_token: "hf_tok_mock" },
      );
      const result = await HUGGING_FACE_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(Array.isArray((result.metadata as any).output)).toBe(true);
    });

    it("performs health check", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ name: "hf_engineer", type: "user", email: "hf@example.com" }),
      } as any);

      const context = createMockContext("hugging-face", { access_token: "hf_tok_mock" });
      const health = await HUGGING_FACE_RUNTIME_ADAPTER.healthCheck!(context);
      expect(health.healthy).toBe(true);
      expect(health.externalAccountId).toBe("hf_engineer");
      expect(health.externalAccountLabel).toContain("hf_engineer");
    });
  });
});
