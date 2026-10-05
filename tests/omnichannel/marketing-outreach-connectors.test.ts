import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { MAILCHIMP_RUNTIME_ADAPTER } from "@/lib/integrations/providers/mailchimp/adapter";
import { META_BUSINESS_RUNTIME_ADAPTER } from "@/lib/integrations/providers/meta-business/adapter";
import { META_LEAD_ADS_RUNTIME_ADAPTER } from "@/lib/integrations/providers/meta-lead-ads/adapter";
import { GOOGLE_ADS_RUNTIME_ADAPTER } from "@/lib/integrations/providers/google-ads/adapter";
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
    requestId: "req_mktg_123",
    correlationId: "corr_mktg_123",
    userId: "usr_mktg_123",
    environment: "development",
    signal: new AbortController().signal,
    connection: {
      id: `conn_${providerId}_1`,
      workspaceId: "ws_mktg_test",
      userId: "usr_mktg_123",
      providerId: providerId as any,
      name: `${providerId} Connection`,
      status: "connected",
      environment: "development",
      credentialReference: "vault_ref_mktg",
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
    idempotencyKey: `idem_mktg_${Date.now()}`,
    input,
  };
}

describe("Batch 10: Marketing & Outreach Connectors", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("Mailchimp Runtime Adapter", () => {
    it("is registered properly in runtime registry", () => {
      const adapter = getIntegrationRuntimeAdapter("mailchimp");
      expect(adapter).toBeDefined();
      expect(adapter!.manifest.providerId).toBe("mailchimp");
      expect(adapter!.manifest.adapterId).toBe("j10.mailchimp.runtime");
      const capIds = adapter!.manifest.capabilities.map((c) => c.capabilityId);
      expect(capIds).toContain("mailchimp.add_subscriber");
      expect(capIds).toContain("mailchimp.create_campaign");
      expect(capIds).toContain("mailchimp.tag_contact");
    });

    it("executes simulated subscriber addition", async () => {
      const invocation = createMockActionInvocation(
        "mailchimp.add_subscriber",
        "mailchimp",
        { list_id: "list_123", email: "client@example.com" },
        "simulate",
      );
      const result = await MAILCHIMP_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.simulated).toBe(true);
    });

    it("adds subscriber in live mode", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: "mc_sub_uuid_456", email_address: "client@example.com" }),
      } as any);

      const invocation = createMockActionInvocation(
        "mailchimp.add_subscriber",
        "mailchimp",
        { list_id: "list_123", email: "client@example.com", first_name: "Bruce" },
        "live",
        { api_key: "abc123def456-us19" },
      );

      const result = await MAILCHIMP_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.email).toBe("client@example.com");
    });

    it("verifies health check", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ health_status: "Everything's Chimpy!" }),
      } as any);

      const context = createMockContext("mailchimp", { api_key: "abc-us19" });
      const health = await MAILCHIMP_RUNTIME_ADAPTER.healthCheck!(context);
      expect(health.healthy).toBe(true);
      expect(health.externalAccountLabel).toBe("Mailchimp Account");
    });
  });

  describe("Meta Business Runtime Adapter", () => {
    it("is registered properly in runtime registry", () => {
      const adapter = getIntegrationRuntimeAdapter("meta-business");
      expect(adapter).toBeDefined();
      expect(adapter!.manifest.providerId).toBe("meta-business");
      expect(adapter!.manifest.adapterId).toBe("j10.meta-business.runtime");
      const capIds = adapter!.manifest.capabilities.map((c) => c.capabilityId);
      expect(capIds).toContain("meta-business.create_campaign");
      expect(capIds).toContain("meta-business.publish_page_post");
      expect(capIds).toContain("meta-business.reply_to_lead");
    });

    it("executes simulated campaign creation", async () => {
      const invocation = createMockActionInvocation(
        "meta-business.create_campaign",
        "meta-business",
        { name: "Fall Retargeting", objective: "OUTCOME_LEADS" },
        "simulate",
      );
      const result = await META_BUSINESS_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.simulated).toBe(true);
    });

    it("creates campaign in live mode", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: "meta_camp_111" }),
      } as any);

      const invocation = createMockActionInvocation(
        "meta-business.create_campaign",
        "meta-business",
        { name: "Fall Retargeting", ad_account_id: "act_12345678" },
        "live",
        { access_token: "meta_access_token_123" },
      );

      const result = await META_BUSINESS_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.providerRequestId).toBe("meta_camp_111");
    });

    it("verifies health check", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: "10987654321", name: "J10 Agency Page" }),
      } as any);

      const context = createMockContext("meta-business", { access_token: "meta_token" });
      const health = await META_BUSINESS_RUNTIME_ADAPTER.healthCheck!(context);
      expect(health.healthy).toBe(true);
      expect(health.externalAccountLabel).toBe("J10 Agency Page");
    });
  });

  describe("Meta Lead Ads Runtime Adapter", () => {
    it("is registered properly in runtime registry", () => {
      const adapter = getIntegrationRuntimeAdapter("meta-lead-ads");
      expect(adapter).toBeDefined();
      expect(adapter!.manifest.providerId).toBe("meta-lead-ads");
      expect(adapter!.manifest.adapterId).toBe("j10.meta-lead-ads.runtime");
      const capIds = adapter!.manifest.capabilities.map((c) => c.capabilityId);
      expect(capIds).toContain("meta-lead-ads.retrieve_lead_details");
      expect(capIds).toContain("meta-lead-ads.sync_lead_to_crm");
    });

    it("executes simulated lead details retrieval", async () => {
      const invocation = createMockActionInvocation(
        "meta-lead-ads.retrieve_lead_details",
        "meta-lead-ads",
        { leadgen_id: "lead_999888" },
        "simulate",
      );
      const result = await META_LEAD_ADS_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.simulated).toBe(true);
    });

    it("retrieves lead details in live mode", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: "lead_999888",
          field_data: [
            { name: "email", values: ["clark@dailyplanet.com"] },
            { name: "full_name", values: ["Clark Kent"] },
          ],
        }),
      } as any);

      const invocation = createMockActionInvocation(
        "meta-lead-ads.retrieve_lead_details",
        "meta-lead-ads",
        { leadgen_id: "lead_999888" },
        "live",
        { access_token: "meta_lead_token" },
      );

      const result = await META_LEAD_ADS_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.fieldsCount).toBe(2);
    });

    it("verifies health check", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: "lead_account_id", name: "Daily Planet Ads" }),
      } as any);

      const context = createMockContext("meta-lead-ads", { access_token: "token" });
      const health = await META_LEAD_ADS_RUNTIME_ADAPTER.healthCheck!(context);
      expect(health.healthy).toBe(true);
      expect(health.externalAccountLabel).toBe("Daily Planet Ads");
    });
  });

  describe("Google Ads Runtime Adapter", () => {
    it("is registered properly in runtime registry", () => {
      const adapter = getIntegrationRuntimeAdapter("google-ads");
      expect(adapter).toBeDefined();
      expect(adapter!.manifest.providerId).toBe("google-ads");
      expect(adapter!.manifest.adapterId).toBe("j10.google-ads.runtime");
      const capIds = adapter!.manifest.capabilities.map((c) => c.capabilityId);
      expect(capIds).toContain("google-ads.upload_offline_conversion");
      expect(capIds).toContain("google-ads.create_customer_list");
    });

    it("executes simulated offline conversion upload", async () => {
      const invocation = createMockActionInvocation(
        "google-ads.upload_offline_conversion",
        "google-ads",
        { customer_id: "123-456-7890", conversion_action: "customers/123/conversionActions/456", gclid: "gclid_test_123" },
        "simulate",
      );
      const result = await GOOGLE_ADS_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.simulated).toBe(true);
    });

    it("uploads offline conversion in live mode", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ results: [{ conversionDateTime: "2026-10-05T12:00:00Z" }] }),
      } as any);

      const invocation = createMockActionInvocation(
        "google-ads.upload_offline_conversion",
        "google-ads",
        { customer_id: "123-456-7890", conversion_action: "customers/123/conversionActions/456", gclid: "gclid_test_123" },
        "live",
        { access_token: "google_ads_token", developer_token: "dev_tok_99" },
      );

      const result = await GOOGLE_ADS_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.gclid).toBe("gclid_test_123");
    });

    it("verifies health check", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ resourceNames: ["customers/1234567890"] }),
      } as any);

      const context = createMockContext("google-ads", { access_token: "token", developer_token: "tok" });
      const health = await GOOGLE_ADS_RUNTIME_ADAPTER.healthCheck!(context);
      expect(health.healthy).toBe(true);
      expect(health.externalAccountLabel).toBe("Google Ads Manager");
    });
  });
});
