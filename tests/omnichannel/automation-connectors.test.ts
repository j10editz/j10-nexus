import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ZAPIER_RUNTIME_ADAPTER } from "@/lib/integrations/providers/zapier/adapter";
import { MAKE_RUNTIME_ADAPTER } from "@/lib/integrations/providers/make/adapter";
import { N8N_RUNTIME_ADAPTER } from "@/lib/integrations/providers/n8n/adapter";
import { GOOGLE_BUSINESS_RUNTIME_ADAPTER } from "@/lib/integrations/providers/google-business/adapter";
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
    requestId: "req_auto_123",
    correlationId: "corr_auto_123",
    userId: "usr_auto_123",
    environment: "development",
    signal: new AbortController().signal,
    connection: {
      id: `conn_${providerId}_1`,
      workspaceId: "ws_auto_test",
      userId: "usr_auto_123",
      providerId: providerId as any,
      name: `${providerId} Connection`,
      status: "connected",
      environment: "development",
      credentialReference: "vault_ref_auto",
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
  publicConfig: Record<string, any> = {},
): IntegrationRuntimeActionInvocation {
  const context = createMockContext(providerId, credentialsRecord, publicConfig);
  return {
    ...context,
    capabilityId,
    mode,
    idempotencyKey: `idem_auto_${Date.now()}`,
    input,
  };
}

describe("Automation & Lead Ingress Runtime Adapters", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("Zapier Runtime Adapter", () => {
    it("is registered properly in runtime registry", () => {
      const adapter = getIntegrationRuntimeAdapter("zapier");
      expect(adapter).toBeDefined();
      expect(adapter!.manifest.providerId).toBe("zapier");
    });

    it("triggers live Zapier webhook", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "x-request-id": "req_zap_1" }),
        json: async () => ({ status: "success", attempt: 1 }),
      });

      const invocation = createMockActionInvocation(
        "zapier.trigger_zap",
        "zapier",
        { payload: { event: "lead_created", name: "VIP Client" } },
        "live",
        { webhook_url: "https://hooks.zapier.com/hooks/catch/123/abc" }
      );

      const result = await ZAPIER_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
    });
  });

  describe("Make Runtime Adapter", () => {
    it("is registered properly in runtime registry", () => {
      const adapter = getIntegrationRuntimeAdapter("make");
      expect(adapter).toBeDefined();
      expect(adapter!.manifest.providerId).toBe("make");
    });

    it("triggers live Make scenario", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "x-request-id": "req_make_1" }),
        text: async () => "Accepted",
      });

      const invocation = createMockActionInvocation(
        "make.trigger_scenario",
        "make",
        { payload: { event: "booking_confirmed" } },
        "live",
        { webhook_url: "https://hook.eu1.make.com/xyz123" }
      );

      const result = await MAKE_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
    });
  });

  describe("n8n Runtime Adapter", () => {
    it("is registered properly in runtime registry", () => {
      const adapter = getIntegrationRuntimeAdapter("n8n");
      expect(adapter).toBeDefined();
      expect(adapter!.manifest.providerId).toBe("n8n");
    });

    it("triggers live n8n workflow", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "x-request-id": "req_n8n_1" }),
        json: async () => ({ status: "workflow_started" }),
      });

      const invocation = createMockActionInvocation(
        "n8n.execute_workflow",
        "n8n",
        { payload: { customerId: "cust_1" } },
        "live",
        { webhook_url: "https://n8n.mycorp.internal/webhook/start" }
      );

      const result = await N8N_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
    });
  });

  describe("Google Business Profile & Reviews Adapter", () => {
    it("is registered properly in runtime registry", () => {
      const adapter = getIntegrationRuntimeAdapter("google-business");
      expect(adapter).toBeDefined();
      expect(adapter!.manifest.providerId).toBe("google-business");
    });

    it("executes simulated review reply", async () => {
      const invocation = createMockActionInvocation(
        "google-business.reply_to_review",
        "google-business",
        { review_name: "accounts/1/locations/1/reviews/rev1", reply_text: "Thank you!" },
        "simulate"
      );

      const result = await GOOGLE_BUSINESS_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.simulated).toBe(true);
    });
  });
});
