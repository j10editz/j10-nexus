import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { CALENDLY_RUNTIME_ADAPTER } from "@/lib/integrations/providers/calendly/adapter";
import { ACUITY_SCHEDULING_RUNTIME_ADAPTER } from "@/lib/integrations/providers/acuity-scheduling/adapter";
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
    requestId: "req_booking_123",
    correlationId: "corr_booking_123",
    userId: "usr_booking_123",
    environment: "development",
    signal: new AbortController().signal,
    connection: {
      id: `conn_${providerId}_1`,
      workspaceId: "ws_booking_test",
      userId: "usr_booking_123",
      providerId: providerId as any,
      name: `${providerId} Connection`,
      status: "connected",
      environment: "development",
      credentialReference: "vault_ref_booking",
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
    idempotencyKey: `idem_booking_${Date.now()}`,
    input,
  };
}

describe("Batch 15: Appointment Booking Runtime Connectors", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("Calendly Runtime Adapter", () => {
    it("is registered properly in runtime registry", () => {
      const adapter = getIntegrationRuntimeAdapter("calendly");
      expect(adapter).toBeDefined();
      expect(adapter!.manifest.providerId).toBe("calendly");
      expect(adapter!.manifest.adapterId).toBe("j10.calendly.runtime");
      const capIds = adapter!.manifest.capabilities.map((c) => c.capabilityId);
      expect(capIds).toContain("calendly.create_scheduling_link");
      expect(capIds).toContain("calendly.cancel_event");
    });

    it("executes simulated create scheduling link", async () => {
      const invocation = createMockActionInvocation(
        "calendly.create_scheduling_link",
        "calendly",
        { owner: "https://api.calendly.com/event_types/ET123" },
        "simulate",
      );
      const result = await CALENDLY_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.simulated).toBe(true);
    });

    it("creates scheduling link in live mode", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        headers: new Headers({ "x-request-id": "cal_req_111" }),
        json: async () => ({
          resource: {
            booking_url: "https://calendly.com/d/abc-123/single-use",
            owner: "https://api.calendly.com/event_types/ET123",
          },
        }),
      } as any);

      const invocation = createMockActionInvocation(
        "calendly.create_scheduling_link",
        "calendly",
        { owner: "https://api.calendly.com/event_types/ET123" },
        "live",
        { access_token: "cal_test_token" },
      );
      const result = await CALENDLY_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect((result.metadata as any).resource.booking_url).toContain("single-use");
    });

    it("cancels event in live mode", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          resource: {
            canceled: true,
          },
        }),
      } as any);

      const invocation = createMockActionInvocation(
        "calendly.cancel_event",
        "calendly",
        { uuid: "evt_uuid_999", reason: "Client requested rescheduling" },
        "live",
        { access_token: "cal_test_token" },
      );
      const result = await CALENDLY_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
    });

    it("performs health check", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          resource: {
            uri: "https://api.calendly.com/users/U12345",
            name: "Dr. Alexander Ross",
          },
        }),
      } as any);

      const context = createMockContext("calendly", { access_token: "cal_test_token" });
      const health = await CALENDLY_RUNTIME_ADAPTER.healthCheck!(context);
      expect(health.healthy).toBe(true);
      expect(health.externalAccountId).toBe("https://api.calendly.com/users/U12345");
      expect(health.externalAccountLabel).toBe("Dr. Alexander Ross");
    });
  });

  describe("Acuity Scheduling Runtime Adapter", () => {
    it("is registered properly in runtime registry", () => {
      const adapter = getIntegrationRuntimeAdapter("acuity-scheduling");
      expect(adapter).toBeDefined();
      expect(adapter!.manifest.providerId).toBe("acuity-scheduling");
      expect(adapter!.manifest.adapterId).toBe("j10.acuity-scheduling.runtime");
      const capIds = adapter!.manifest.capabilities.map((c) => c.capabilityId);
      expect(capIds).toContain("acuity-scheduling.book_appointment");
      expect(capIds).toContain("acuity-scheduling.cancel_appointment");
      expect(capIds).toContain("acuity-scheduling.check_availability");
    });

    it("executes simulated book appointment", async () => {
      const invocation = createMockActionInvocation(
        "acuity-scheduling.book_appointment",
        "acuity-scheduling",
        {
          datetime: "2026-10-15T14:00:00",
          appointmentTypeID: 1001,
          firstName: "Jane",
          lastName: "Doe",
          email: "jane@example.com",
        },
        "simulate",
      );
      const result = await ACUITY_SCHEDULING_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(result.metadata.simulated).toBe(true);
    });

    it("books appointment in live mode", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          id: 554433,
          firstName: "Jane",
          lastName: "Doe",
          datetime: "2026-10-15T14:00:00",
        }),
      } as any);

      const invocation = createMockActionInvocation(
        "acuity-scheduling.book_appointment",
        "acuity-scheduling",
        {
          datetime: "2026-10-15T14:00:00",
          appointmentTypeID: 1001,
          firstName: "Jane",
          lastName: "Doe",
          email: "jane@example.com",
        },
        "live",
        { access_token: "acuity_token_123" },
      );
      const result = await ACUITY_SCHEDULING_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect((result.metadata as any).id).toBe(554433);
    });

    it("checks availability in live mode", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ([
          { time: "2026-10-15T09:00:00-0400", slotsAvailable: 2 },
          { time: "2026-10-15T10:00:00-0400", slotsAvailable: 1 },
        ]),
      } as any);

      const invocation = createMockActionInvocation(
        "acuity-scheduling.check_availability",
        "acuity-scheduling",
        {
          appointmentTypeID: 1001,
          date: "2026-10-15",
        },
        "live",
        { access_token: "acuity_token_123" },
      );
      const result = await ACUITY_SCHEDULING_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
      expect(Array.isArray((result.metadata as any).availability)).toBe(true);
    });

    it("cancels appointment in live mode", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          id: 554433,
          canceled: true,
        }),
      } as any);

      const invocation = createMockActionInvocation(
        "acuity-scheduling.cancel_appointment",
        "acuity-scheduling",
        {
          id: 554433,
          cancel_reason: "Customer requested alternative slot",
        },
        "live",
        { access_token: "acuity_token_123" },
      );
      const result = await ACUITY_SCHEDULING_RUNTIME_ADAPTER.executeAction!(invocation);
      expect(result.success).toBe(true);
    });

    it("performs health check", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: 8877,
          businessName: "Metropolis Dental Clinic",
        }),
      } as any);

      const context = createMockContext("acuity-scheduling", { access_token: "acuity_token_123" });
      const health = await ACUITY_SCHEDULING_RUNTIME_ADAPTER.healthCheck!(context);
      expect(health.healthy).toBe(true);
      expect(health.externalAccountId).toBe("8877");
      expect(health.externalAccountLabel).toBe("Metropolis Dental Clinic");
    });
  });
});
