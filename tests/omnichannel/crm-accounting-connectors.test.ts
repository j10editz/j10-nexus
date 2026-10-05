import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { SALESFORCE_RUNTIME_ADAPTER } from "@/lib/integrations/providers/salesforce/adapter";
import { PIPEDRIVE_RUNTIME_ADAPTER } from "@/lib/integrations/providers/pipedrive/adapter";
import { QUICKBOOKS_RUNTIME_ADAPTER } from "@/lib/integrations/providers/quickbooks/adapter";
import { XERO_RUNTIME_ADAPTER } from "@/lib/integrations/providers/xero/adapter";
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
    requestId: "req_crm_123",
    correlationId: "corr_crm_123",
    userId: "usr_crm_123",
    environment: "development",
    signal: new AbortController().signal,
    connection: {
      id: `conn_${providerId}_1`,
      workspaceId: "ws_crm_test",
      userId: "usr_crm_123",
      providerId: providerId as any,
      name: `${providerId} Connection`,
      status: "connected",
      environment: "development",
      credentialReference: "vault_ref_crm",
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
    idempotencyKey: `idem_crm_${Date.now()}`,
    input,
  };
}

describe("Batch 8: Enterprise CRM & Accounting Connectors", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("Salesforce Runtime Adapter", () => {
    it("is registered properly in runtime registry", () => {
      const adapter = getIntegrationRuntimeAdapter("salesforce");
      expect(adapter).toBeDefined();
      expect(adapter!.manifest.providerId).toBe("salesforce");
      expect(adapter!.manifest.adapterId).toBe("j10.salesforce.runtime");
      const capIds = adapter!.manifest.capabilities.map((c) => c.capabilityId);
      expect(capIds).toContain("salesforce.create_lead");
      expect(capIds).toContain("salesforce.update_opportunity");
      expect(capIds).toContain("salesforce.create_case");
    });

    it("executes simulated lead creation", async () => {
      const invocation = createMockActionInvocation(
        "salesforce.create_lead",
        "salesforce",
        { last_name: "Wayne", company: "Wayne Enterprises", email: "bruce@wayne.com" },
        "simulate",
      );
      const result = await SALESFORCE_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.simulated).toBe(true);
      expect(result.responseStatus).toBe(200);
    });

    it("creates lead in live mode when authenticated", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ id: "00Q5g00000abc123", success: true }),
      } as any);

      const invocation = createMockActionInvocation(
        "salesforce.create_lead",
        "salesforce",
        { last_name: "Wayne", company: "Wayne Enterprises" },
        "live",
        { access_token: "test_sf_token", instance_url: "https://custom.salesforce.com" },
      );

      const result = await SALESFORCE_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.leadId).toBe("00Q5g00000abc123");
    });

    it("verifies health check", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ sobjects: [] }),
      } as any);

      const context = createMockContext("salesforce", {
        access_token: "test_sf_token",
        instance_url: "https://custom.salesforce.com",
      });
      const health = await SALESFORCE_RUNTIME_ADAPTER.healthCheck!(context);
      expect(health.healthy).toBe(true);
      expect(health.externalAccountLabel).toBe("Salesforce Enterprise");
    });
  });

  describe("Pipedrive Runtime Adapter", () => {
    it("is registered properly in runtime registry", () => {
      const adapter = getIntegrationRuntimeAdapter("pipedrive");
      expect(adapter).toBeDefined();
      expect(adapter!.manifest.providerId).toBe("pipedrive");
      expect(adapter!.manifest.adapterId).toBe("j10.pipedrive.runtime");
      const capIds = adapter!.manifest.capabilities.map((c) => c.capabilityId);
      expect(capIds).toContain("pipedrive.create_person");
      expect(capIds).toContain("pipedrive.create_deal");
      expect(capIds).toContain("pipedrive.update_deal");
    });

    it("executes simulated deal creation", async () => {
      const invocation = createMockActionInvocation(
        "pipedrive.create_deal",
        "pipedrive",
        { title: "Enterprise Pilot Deal", value: 50000 },
        "simulate",
      );
      const result = await PIPEDRIVE_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.simulated).toBe(true);
    });

    it("creates person in live mode", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ data: { id: 42, name: "Diana Prince" } }),
      } as any);

      const invocation = createMockActionInvocation(
        "pipedrive.create_person",
        "pipedrive",
        { name: "Diana Prince", email: "diana@themyscira.gov" },
        "live",
        { api_token: "pipedrive_token_123" },
      );

      const result = await PIPEDRIVE_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.personId).toBe(42);
    });

    it("verifies health check", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: { name: "Pipedrive User", id: 1 } }),
      } as any);

      const context = createMockContext("pipedrive", { api_token: "pipe_token" });
      const health = await PIPEDRIVE_RUNTIME_ADAPTER.healthCheck!(context);
      expect(health.healthy).toBe(true);
      expect(health.externalAccountLabel).toBe("Pipedrive User");
    });
  });

  describe("QuickBooks Online Runtime Adapter", () => {
    it("is registered properly in runtime registry", () => {
      const adapter = getIntegrationRuntimeAdapter("quickbooks");
      expect(adapter).toBeDefined();
      expect(adapter!.manifest.providerId).toBe("quickbooks");
      expect(adapter!.manifest.adapterId).toBe("j10.quickbooks.runtime");
      const capIds = adapter!.manifest.capabilities.map((c) => c.capabilityId);
      expect(capIds).toContain("quickbooks.create_invoice");
      expect(capIds).toContain("quickbooks.create_customer");
      expect(capIds).toContain("quickbooks.record_expense");
    });

    it("executes simulated invoice creation", async () => {
      const invocation = createMockActionInvocation(
        "quickbooks.create_invoice",
        "quickbooks",
        { customer_id: "cust_123", amount: 1500 },
        "simulate",
      );
      const result = await QUICKBOOKS_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.simulated).toBe(true);
    });

    it("creates invoice in live mode", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ Invoice: { Id: "qb_inv_999", TotalAmt: 1500 } }),
      } as any);

      const invocation = createMockActionInvocation(
        "quickbooks.create_invoice",
        "quickbooks",
        { customer_id: "cust_123", amount: 1500 },
        "live",
        { access_token: "qb_access_token", realm_id: "987654321" },
      );

      const result = await QUICKBOOKS_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.invoiceId).toBe("qb_inv_999");
    });

    it("verifies health check", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ CompanyInfo: { CompanyName: "Acme Corp" } }),
      } as any);

      const context = createMockContext("quickbooks", {
        access_token: "qb_access_token",
        realm_id: "987654321",
      });
      const health = await QUICKBOOKS_RUNTIME_ADAPTER.healthCheck!(context);
      expect(health.healthy).toBe(true);
      expect(health.externalAccountLabel).toBe("QuickBooks Online");
    });
  });

  describe("Xero Runtime Adapter", () => {
    it("is registered properly in runtime registry", () => {
      const adapter = getIntegrationRuntimeAdapter("xero");
      expect(adapter).toBeDefined();
      expect(adapter!.manifest.providerId).toBe("xero");
      expect(adapter!.manifest.adapterId).toBe("j10.xero.runtime");
      const capIds = adapter!.manifest.capabilities.map((c) => c.capabilityId);
      expect(capIds).toContain("xero.create_invoice");
      expect(capIds).toContain("xero.create_contact");
      expect(capIds).toContain("xero.create_bill");
    });

    it("executes simulated invoice and contact creation", async () => {
      const invocation = createMockActionInvocation(
        "xero.create_invoice",
        "xero",
        { contact_name: "Stark Industries", amount: 4500 },
        "simulate",
      );
      const result = await XERO_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.simulated).toBe(true);
    });

    it("creates contact in live mode", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          Contacts: [{ ContactID: "xero_contact_uuid_123", Name: "Stark Industries" }],
        }),
      } as any);

      const invocation = createMockActionInvocation(
        "xero.create_contact",
        "xero",
        { name: "Stark Industries", email: "tony@stark.com" },
        "live",
        { access_token: "xero_token_123", tenant_id: "tenant_uuid_456" },
      );

      const result = await XERO_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.contactId).toBe("xero_contact_uuid_123");
    });

    it("verifies health check", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [{ tenantId: "tenant_uuid_456", tenantName: "Stark Global" }],
      } as any);

      const context = createMockContext("xero", {
        access_token: "xero_token_123",
        tenant_id: "tenant_uuid_456",
      });
      const health = await XERO_RUNTIME_ADAPTER.healthCheck!(context);
      expect(health.healthy).toBe(true);
      expect(health.externalAccountLabel).toBe("Xero Organization");
    });
  });
});
