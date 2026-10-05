import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { INSTAGRAM_RUNTIME_ADAPTER } from "@/lib/integrations/providers/instagram/adapter";
import { TWILIO_RUNTIME_ADAPTER } from "@/lib/integrations/providers/twilio/adapter";
import { HUBSPOT_RUNTIME_ADAPTER } from "@/lib/integrations/providers/hubspot/adapter";
import { GOOGLE_CALENDAR_RUNTIME_ADAPTER } from "@/lib/integrations/providers/google-calendar/adapter";
import { getIntegrationRuntimeAdapter, listIntegrationRuntimeAdapters } from "@/lib/integrations/runtime-registry";
import { getIntegrationOAuthProviderDefinition } from "@/lib/integrations/oauth/provider-registry";
import type {
  IntegrationRuntimeActionInvocation,
  IntegrationRuntimeInvocationContext,
} from "@/types/integration-runtime";

function createMockContext(
  providerId: string,
  credentialsRecord: Record<string, string> = {},
): IntegrationRuntimeInvocationContext {
  return {
    requestId: "req_test_123",
    correlationId: "corr_test_123",
    userId: "usr_test_123",
    environment: "development",
    signal: new AbortController().signal,
    connection: {
      id: `conn_${providerId}_1`,
      workspaceId: "ws_test_alpha",
      userId: "usr_test_123",
      providerId: providerId as any,
      name: `${providerId} Connection`,
      status: "connected",
      environment: "development",
      credentialReference: "vault_ref_123",
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
  provider: string,
  input: Record<string, unknown>,
  mode: "simulate" | "sandbox" | "live" = "live",
  credentialsRecord: Record<string, string> = {},
): IntegrationRuntimeActionInvocation {
  const context = createMockContext(provider, credentialsRecord);
  return {
    ...context,
    capabilityId,
    mode,
    idempotencyKey: `idem_${Date.now()}`,
    input,
  };
}

describe("Next-Tier Connectors (Batch 3 Queue) Certification & Runtime Testing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. Runtime Registry Verification
  // =========================================================================
  describe("1. Runtime Registry Registration", () => {
    it("registers Instagram, Twilio, HubSpot, and Google Calendar in runtime registry", () => {
      const adapters = listIntegrationRuntimeAdapters();
      const providerIds = adapters.map((a) => a.manifest.providerId);

      expect(providerIds).toContain("instagram-business");
      expect(providerIds).toContain("twilio");
      expect(providerIds).toContain("hubspot");
      expect(providerIds).toContain("google-calendar");
    });

    it("retrieves adapters by exact provider ID", () => {
      const ig = getIntegrationRuntimeAdapter("instagram-business");
      expect(ig).toBeDefined();
      expect(ig?.manifest.adapterId).toBe("j10.instagram-business.runtime");

      const twilio = getIntegrationRuntimeAdapter("twilio");
      expect(twilio).toBeDefined();
      expect(twilio?.manifest.adapterId).toBe("j10.twilio.runtime");

      const hs = getIntegrationRuntimeAdapter("hubspot");
      expect(hs).toBeDefined();
      expect(hs?.manifest.adapterId).toBe("j10.hubspot.runtime");

      const gcal = getIntegrationRuntimeAdapter("google-calendar");
      expect(gcal).toBeDefined();
      expect(gcal?.manifest.adapterId).toBe("j10.google-calendar.runtime");
    });
  });

  // =========================================================================
  // 2. OAuth Registry Verification
  // =========================================================================
  describe("2. OAuth Provider Configuration", () => {
    it("configures Instagram Business Meta OAuth endpoints and scopes", () => {
      const oauth = getIntegrationOAuthProviderDefinition("instagram-business");
      expect(oauth).toBeDefined();
      expect(oauth?.authorizationEndpoint).toBe("https://www.facebook.com/v21.0/dialog/oauth");
      expect(oauth?.tokenEndpoint).toBe("https://graph.facebook.com/v21.0/oauth/access_token");
      expect(oauth?.scopes).toContain("instagram_manage_messages");
      expect(oauth?.scopes).toContain("instagram_basic");
    });

    it("configures HubSpot CRM v3 OAuth endpoints and scopes", () => {
      const oauth = getIntegrationOAuthProviderDefinition("hubspot");
      expect(oauth).toBeDefined();
      expect(oauth?.authorizationEndpoint).toBe("https://app.hubspot.com/oauth/authorize");
      expect(oauth?.tokenEndpoint).toBe("https://api.hubapi.com/oauth/v1/token");
      expect(oauth?.scopes).toContain("crm.objects.contacts.read");
      expect(oauth?.scopes).toContain("crm.objects.deals.write");
    });

    it("configures Google Calendar OAuth endpoints and scopes", () => {
      const oauth = getIntegrationOAuthProviderDefinition("google-calendar");
      expect(oauth).toBeDefined();
      expect(oauth?.authorizationEndpoint).toBe("https://accounts.google.com/o/oauth2/v2/auth");
      expect(oauth?.tokenEndpoint).toBe("https://oauth2.googleapis.com/token");
      expect(oauth?.scopes).toContain("https://www.googleapis.com/auth/calendar.events");
    });
  });

  // =========================================================================
  // 3. Instagram Business Adapter Execution
  // =========================================================================
  describe("3. Instagram Business Runtime Adapter", () => {
    it("executes simulated/sandbox direct message reply cleanly", async () => {
      const invocation = createMockActionInvocation(
        "instagram-business.send_reply",
        "instagram-business",
        { recipient_id: "ig_user_12345", text: "Thanks for reaching out to J10!" },
        "sandbox",
      );

      const result = await INSTAGRAM_RUNTIME_ADAPTER.executeAction!(invocation);

      expect(result.success).toBe(true);
      expect(result.metadata.mode).toBe("sandbox");
      expect(result.metadata.recipientId).toBe("ig_user_12345");
      expect(result.metadata.messageId).toMatch(/^ig_msg_sim_/);
    });

    it("dispatches live direct message reply via Meta Graph API fetch", async () => {
      let capturedUrl = "";
      let capturedBody: any = null;

      vi.spyOn(global, "fetch").mockImplementationOnce(async (url, init) => {
        capturedUrl = String(url);
        capturedBody = JSON.parse(init?.body as string);
        return new Response(JSON.stringify({ recipient_id: "ig_user_9988", message_id: "m_ig_meta_777" }), {
          status: 200,
        });
      });

      const invocation = createMockActionInvocation(
        "instagram-business.send_reply",
        "instagram-business",
        { recipient_id: "ig_user_9988", text: "Hello from J10 NEXUS AI operator!" },
        "live",
        { access_token: "EAAB_test_instagram_token_xyz" },
      );

      const result = await INSTAGRAM_RUNTIME_ADAPTER.executeAction!(invocation);

      expect(result.success).toBe(true);
      expect(result.metadata.mode).toBe("live");
      expect(result.metadata.messageId).toBe("m_ig_meta_777");
      expect(capturedUrl).toBe("https://graph.facebook.com/v21.0/me/messages");
      expect(capturedBody.recipient.id).toBe("ig_user_9988");
      expect(capturedBody.message.text).toBe("Hello from J10 NEXUS AI operator!");
    });

    it("checks Instagram health status with Graph API token validation", async () => {
      vi.spyOn(global, "fetch").mockImplementationOnce(async () => {
        return new Response(JSON.stringify({ id: "ig_account_101", username: "j10_official" }), { status: 200 });
      });

      const context = createMockContext("instagram-business", { access_token: "EAAB_valid_token" });
      const health = await INSTAGRAM_RUNTIME_ADAPTER.healthCheck!(context);

      expect(health.healthy).toBe(true);
      expect(health.externalAccountLabel).toBe("j10_official");
      expect(health.externalAccountId).toBe("ig_account_101");
    });
  });

  // =========================================================================
  // 4. Twilio Voice & SMS Adapter Execution
  // =========================================================================
  describe("4. Twilio Voice & SMS Runtime Adapter", () => {
    it("executes simulated/sandbox SMS dispatch with E.164 normalization", async () => {
      const invocation = createMockActionInvocation(
        "twilio.send_sms",
        "twilio",
        { to: "555-234-5678", body: "Your J10 booking is confirmed for 2:00 PM!" },
        "sandbox",
      );

      const result = await TWILIO_RUNTIME_ADAPTER.executeAction!(invocation);

      expect(result.success).toBe(true);
      expect(result.metadata.mode).toBe("sandbox");
      expect(result.metadata.to).toBe("+15552345678");
      expect(result.metadata.sid).toMatch(/^SM_sim_/);
    });

    it("dispatches live Twilio SMS via REST API with Basic Auth", async () => {
      let capturedUrl = "";
      let capturedHeaders: any = null;

      vi.spyOn(global, "fetch").mockImplementationOnce(async (url, init) => {
        capturedUrl = String(url);
        capturedHeaders = init?.headers;
        return new Response(
          JSON.stringify({
            sid: "SM_twilio_live_receipt_888",
            to: "+15559990000",
            status: "queued",
            direction: "outbound-api",
          }),
          { status: 200 },
        );
      });

      const invocation = createMockActionInvocation(
        "twilio.send_sms",
        "twilio",
        { to: "+15559990000", body: "Hello! We missed your call, how can J10 help?", from: "+15551112222" },
        "live",
        { account_sid: "AC_test_account_123", auth_token: "auth_token_456" },
      );

      const result = await TWILIO_RUNTIME_ADAPTER.executeAction!(invocation);

      expect(result.success).toBe(true);
      expect(result.metadata.mode).toBe("live");
      expect(result.metadata.sid).toBe("SM_twilio_live_receipt_888");
      expect(capturedUrl).toBe("https://api.twilio.com/2010-04-01/Accounts/AC_test_account_123/Messages.json");
      expect(capturedHeaders.Authorization).toContain("Basic ");
    });

    it("checks Twilio credentials health with Account API verification", async () => {
      vi.spyOn(global, "fetch").mockImplementationOnce(async () => {
        return new Response(
          JSON.stringify({
            sid: "AC_test_sid",
            friendly_name: "J10 NEXUS Production Account",
            status: "active",
            type: "Full",
          }),
          { status: 200 },
        );
      });

      const context = createMockContext("twilio", { account_sid: "AC_test_sid", auth_token: "auth_secret" });
      const health = await TWILIO_RUNTIME_ADAPTER.healthCheck!(context);

      expect(health.healthy).toBe(true);
      expect(health.externalAccountLabel).toBe("J10 NEXUS Production Account");
      expect(health.metadata.accountStatus).toBe("active");
    });
  });

  // =========================================================================
  // 5. HubSpot CRM Adapter Execution
  // =========================================================================
  describe("5. HubSpot CRM v3 Runtime Adapter", () => {
    it("executes simulated/sandbox contact creation", async () => {
      const invocation = createMockActionInvocation(
        "hubspot.create_contact",
        "hubspot",
        { email: "sarah@aegis.com", firstname: "Sarah", lastname: "Jenkins" },
        "sandbox",
      );

      const result = await HUBSPOT_RUNTIME_ADAPTER.executeAction!(invocation);

      expect(result.success).toBe(true);
      expect(result.metadata.mode).toBe("sandbox");
      expect(result.metadata.contactId).toMatch(/^hs_con_sim_/);
    });

    it("creates live HubSpot contact and advances deal pipeline stage", async () => {
      let capturedUrl = "";
      let capturedBody: any = null;

      vi.spyOn(global, "fetch").mockImplementationOnce(async (url, init) => {
        capturedUrl = String(url);
        capturedBody = JSON.parse(init?.body as string);
        return new Response(
          JSON.stringify({
            id: "deal_hs_live_9988",
            properties: { dealname: "J10 Pro Deal", amount: "4800", dealstage: "appointmentscheduled" },
            createdAt: new Date().toISOString(),
          }),
          { status: 200 },
        );
      });

      const invocation = createMockActionInvocation(
        "hubspot.update_deal",
        "hubspot",
        { dealname: "J10 Pro Deal", amount: 4800, dealstage: "appointmentscheduled" },
        "live",
        { access_token: "pat-na1-hubspot-token-xyz" },
      );

      const result = await HUBSPOT_RUNTIME_ADAPTER.executeAction!(invocation);

      expect(result.success).toBe(true);
      expect(result.metadata.mode).toBe("live");
      expect(result.metadata.dealId).toBe("deal_hs_live_9988");
      expect(capturedUrl).toBe("https://api.hubapi.com/crm/v3/objects/deals");
      expect(capturedBody.properties.dealname).toBe("J10 Pro Deal");
      expect(capturedBody.properties.amount).toBe("4800");
    });

    it("checks HubSpot CRM health status with contacts query", async () => {
      vi.spyOn(global, "fetch").mockImplementationOnce(async () => {
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      });

      const context = createMockContext("hubspot", { access_token: "pat-na1-valid-token" });
      const health = await HUBSPOT_RUNTIME_ADAPTER.healthCheck!(context);

      expect(health.healthy).toBe(true);
      expect(health.metadata.service).toBe("HubSpot CRM v3 API");
    });
  });

  // =========================================================================
  // 6. Google Calendar Adapter Execution
  // =========================================================================
  describe("6. Google Calendar Runtime Adapter", () => {
    it("executes simulated/sandbox calendar appointment creation", async () => {
      const invocation = createMockActionInvocation(
        "google-calendar.event.create",
        "google-calendar",
        {
          summary: "J10 AI Demo Consultation",
          startTime: "2026-10-10T14:00:00Z",
          endTime: "2026-10-10T14:30:00Z",
        },
        "sandbox",
      );

      const result = await GOOGLE_CALENDAR_RUNTIME_ADAPTER.executeAction!(invocation);

      expect(result.success).toBe(true);
      expect(result.metadata.mode).toBe("sandbox");
      expect(result.metadata.eventId).toMatch(/^gcal_evt_sim_/);
    });

    it("queries live Google Calendar availability freeBusy", async () => {
      let capturedUrl = "";
      let capturedBody: any = null;

      vi.spyOn(global, "fetch").mockImplementationOnce(async (url, init) => {
        capturedUrl = String(url);
        capturedBody = JSON.parse(init?.body as string);
        return new Response(
          JSON.stringify({
            calendars: {
              primary: {
                busy: [{ start: "2026-10-10T15:00:00Z", end: "2026-10-10T16:00:00Z" }],
              },
            },
          }),
          { status: 200 },
        );
      });

      const invocation = createMockActionInvocation(
        "google-calendar.availability.read",
        "google-calendar",
        {
          timeMin: "2026-10-10T00:00:00Z",
          timeMax: "2026-10-10T23:59:59Z",
        },
        "live",
        { access_token: "ya29.google_oauth_token" },
      );

      const result = await GOOGLE_CALENDAR_RUNTIME_ADAPTER.executeAction!(invocation);

      expect(result.success).toBe(true);
      expect(result.metadata.mode).toBe("live");
      expect(result.metadata.available).toBe(false);
      expect(result.metadata.busySlots).toHaveLength(1);
      expect(capturedUrl).toBe("https://www.googleapis.com/calendar/v3/freeBusy");
      expect(capturedBody.items[0].id).toBe("primary");
    });

    it("checks Google Calendar health status with calendarList query", async () => {
      vi.spyOn(global, "fetch").mockImplementationOnce(async () => {
        return new Response(JSON.stringify({ items: [{ id: "primary" }] }), { status: 200 });
      });

      const context = createMockContext("google-calendar", { access_token: "ya29.google_oauth_token" });
      const health = await GOOGLE_CALENDAR_RUNTIME_ADAPTER.healthCheck!(context);

      expect(health.healthy).toBe(true);
      expect(health.metadata.service).toBe("Google Calendar v3 API");
    });
  });
});
