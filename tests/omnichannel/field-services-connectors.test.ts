import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { JOBBER_RUNTIME_ADAPTER } from "@/lib/integrations/providers/jobber/adapter";
import { HOUSECALL_PRO_RUNTIME_ADAPTER } from "@/lib/integrations/providers/housecall-pro/adapter";
import { MINDBODY_RUNTIME_ADAPTER } from "@/lib/integrations/providers/mindbody/adapter";
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
    requestId: "req_field_123",
    correlationId: "corr_field_123",
    userId: "usr_field_123",
    environment: "development",
    signal: new AbortController().signal,
    connection: {
      id: `conn_${providerId}_1`,
      workspaceId: "ws_field_test",
      userId: "usr_field_123",
      providerId: providerId as any,
      name: `${providerId} Connection`,
      status: "connected",
      environment: "development",
      credentialReference: "vault_ref_field",
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
    idempotencyKey: `idem_field_${Date.now()}`,
    input,
  };
}

describe("Batch 9: Field Services Connectors", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("Jobber Runtime Adapter", () => {
    it("is registered properly in runtime registry", () => {
      const adapter = getIntegrationRuntimeAdapter("jobber");
      expect(adapter).toBeDefined();
      expect(adapter!.manifest.providerId).toBe("jobber");
      expect(adapter!.manifest.adapterId).toBe("j10.jobber.runtime");
      const capIds = adapter!.manifest.capabilities.map((c) => c.capabilityId);
      expect(capIds).toContain("jobber.create_job");
      expect(capIds).toContain("jobber.schedule_visit");
      expect(capIds).toContain("jobber.create_invoice");
    });

    it("executes simulated job creation", async () => {
      const invocation = createMockActionInvocation(
        "jobber.create_job",
        "jobber",
        { title: "HVAC Spring Tuneup", client_id: "client_jobber_123" },
        "simulate",
      );
      const result = await JOBBER_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.simulated).toBe(true);
    });

    it("creates job in live mode via GraphQL", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            jobCreate: {
              job: { id: "job_graphql_456", title: "HVAC Repair", jobStatus: "active" },
            },
          },
        }),
      } as any);

      const invocation = createMockActionInvocation(
        "jobber.create_job",
        "jobber",
        { title: "HVAC Repair", client_id: "client_jobber_123" },
        "live",
        { access_token: "jobber_oauth_token" },
      );

      const result = await JOBBER_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.jobId).toBe("job_graphql_456");
    });

    it("verifies health check", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: { currentUser: { id: "user_789", name: "Jobber Admin" } },
        }),
      } as any);

      const context = createMockContext("jobber", { access_token: "jobber_token" });
      const health = await JOBBER_RUNTIME_ADAPTER.healthCheck!(context);
      expect(health.healthy).toBe(true);
      expect(health.externalAccountLabel).toBe("Jobber Field Service");
    });
  });

  describe("Housecall Pro Runtime Adapter", () => {
    it("is registered properly in runtime registry", () => {
      const adapter = getIntegrationRuntimeAdapter("housecall-pro");
      expect(adapter).toBeDefined();
      expect(adapter!.manifest.providerId).toBe("housecall-pro");
      expect(adapter!.manifest.adapterId).toBe("j10.housecall-pro.runtime");
      const capIds = adapter!.manifest.capabilities.map((c) => c.capabilityId);
      expect(capIds).toContain("housecall-pro.create_job");
      expect(capIds).toContain("housecall-pro.send_on_my_way_text");
      expect(capIds).toContain("housecall-pro.create_estimate");
    });

    it("executes simulated on-my-way dispatch", async () => {
      const invocation = createMockActionInvocation(
        "housecall-pro.send_on_my_way_text",
        "housecall-pro",
        { job_id: "hcp_job_888", eta_minutes: 15 },
        "simulate",
      );
      const result = await HOUSECALL_PRO_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.simulated).toBe(true);
    });

    it("creates job in live mode", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ id: "hcp_live_job_321", status: "scheduled" }),
      } as any);

      const invocation = createMockActionInvocation(
        "housecall-pro.create_job",
        "housecall-pro",
        { customer_id: "cust_hcp_999", description: "Plumbing leak repair" },
        "live",
        { access_token: "hcp_token_abc" },
      );

      const result = await HOUSECALL_PRO_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.jobId).toBe("hcp_live_job_321");
    });

    it("verifies health check", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ name: "Apex Plumbing LLC" }),
      } as any);

      const context = createMockContext("housecall-pro", { access_token: "hcp_token" });
      const health = await HOUSECALL_PRO_RUNTIME_ADAPTER.healthCheck!(context);
      expect(health.healthy).toBe(true);
      expect(health.externalAccountLabel).toBe("Housecall Pro");
    });
  });

  describe("Mindbody Runtime Adapter", () => {
    it("is registered properly in runtime registry", () => {
      const adapter = getIntegrationRuntimeAdapter("mindbody");
      expect(adapter).toBeDefined();
      expect(adapter!.manifest.providerId).toBe("mindbody");
      expect(adapter!.manifest.adapterId).toBe("j10.mindbody.runtime");
      const capIds = adapter!.manifest.capabilities.map((c) => c.capabilityId);
      expect(capIds).toContain("mindbody.book_class");
      expect(capIds).toContain("mindbody.check_in_client");
      expect(capIds).toContain("mindbody.sync_schedule");
    });

    it("executes simulated class booking", async () => {
      const invocation = createMockActionInvocation(
        "mindbody.book_class",
        "mindbody",
        { client_id: "client_mb_101", class_id: 505 },
        "simulate",
      );
      const result = await MINDBODY_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.simulated).toBe(true);
    });

    it("books class in live mode", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ Visit: { Id: 98765, Action: "Added" } }),
      } as any);

      const invocation = createMockActionInvocation(
        "mindbody.book_class",
        "mindbody",
        { client_id: "client_mb_101", class_id: 505 },
        "live",
        { api_key: "mb_api_key_secret", site_id: "123456" },
      );

      const result = await MINDBODY_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.visitId).toBe(98765);
    });

    it("verifies health check", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ Sites: [{ Id: 123456, Name: "Zen Yoga" }] }),
      } as any);

      const context = createMockContext("mindbody", { api_key: "mb_key", site_id: "123456" });
      const health = await MINDBODY_RUNTIME_ADAPTER.healthCheck!(context);
      expect(health.healthy).toBe(true);
      expect(health.externalAccountLabel).toBe("Mindbody Wellness");
    });
  });
});
