import { readFile } from "node:fs/promises";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const mockAdminSupabase = {
  from: vi.fn(),
  rpc: vi.fn(),
};

vi.mock("@/lib/workspaces/server", () => ({
  getActiveWorkspaceContext: vi.fn(),
  requireApiWorkspaceContext: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  createServerSupabaseClient: vi.fn(() => mockAdminSupabase),
  createAdminSupabaseClient: vi.fn(() => mockAdminSupabase),
}));

vi.mock("@/lib/integrations/credentials", () => ({
  storeIntegrationCredentials: vi.fn().mockResolvedValue({ id: "cred-1" }),
  getIntegrationCredentials: vi.fn(),
}));

vi.mock("@/lib/integrations/webhooks/database", () => ({
  createOrEnableIntegrationWebhookEndpoint: vi.fn().mockResolvedValue({
    endpointKey: "canonical-endpoint-key-123",
    webhookUrl: "/api/webhooks/whatsapp/canonical-endpoint-key-123",
    status: "active",
  }),
  disableIntegrationWebhookEndpoint: vi.fn().mockResolvedValue({
    endpointKey: "canonical-endpoint-key-123",
    status: "disabled",
  }),
  getIntegrationWebhookEndpointByConnection: vi.fn().mockResolvedValue({
    endpointKey: "canonical-endpoint-key-123",
    status: "active",
  }),
}));

vi.mock("@/lib/integrations/webhooks/service-client", () => ({
  createWebhookServiceClient: vi.fn(() => mockAdminSupabase),
}));

vi.mock("@/lib/whatsapp/webhook-handler", () => ({
  processWhatsAppPayload: vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ success: true, processed: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  ),
}));

describe("WhatsApp Embedded Signup Flow - CTO Security Hardened", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdminSupabase.from.mockReset();
    mockAdminSupabase.rpc.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. Client Components & Fail-Closed Browser Contracts", () => {
    const clientPath = "components/whatsapp/WhatsAppEmbeddedSignup.tsx";
    const connectionsPath = "app/dashboard/connections/page.tsx";
    const whatsappDashboardPath = "app/dashboard/whatsapp/page.tsx";

    it("no hardcoded production Meta App ID or Configuration ID in component", async () => {
      const source = await readFile(clientPath, "utf8");
      expect(source).not.toContain("1830547288111074");
      expect(source).not.toContain("28294076036901722");
    });

    it("fails closed when session initialization fails and does not launch FB.login", async () => {
      const source = await readFile(clientPath, "utf8");
      // Must check session failure and stop immediately
      expect(source).toContain("WhatsApp connection is not configured");
      expect(source).toContain("if (!sessionRes.ok)");
    });

    it("fails closed behaviorally when FB.init throws: stops immediately, sets working false, shows error, never invokes FB.login", async () => {
      const { initiateMetaSignupFlow } = await import("@/components/whatsapp/WhatsAppEmbeddedSignup");
      const setWorking = vi.fn();
      const setIsError = vi.fn();
      const setMessage = vi.fn();
      const onCodeReceived = vi.fn();

      const mockFb = {
        init: vi.fn(() => {
          throw new Error("FB.init explosion in browser");
        }),
        login: vi.fn(),
      };

      const sessionData = {
        success: true,
        state: "was_state12345678901234567890123",
        appId: "app-id-123456",
        configId: "config-id-654321",
        graphVersion: "v26.0",
      };

      const result = await initiateMetaSignupFlow({
        sessionData,
        fb: mockFb,
        setWorking,
        setIsError,
        setMessage,
        onCodeReceived,
      });

      expect(result).toBe(false);
      expect(mockFb.init).toHaveBeenCalledWith(
        expect.objectContaining({
          appId: "app-id-123456",
          version: "v26.0",
        })
      );
      expect(mockFb.login).not.toHaveBeenCalled();
      expect(setWorking).toHaveBeenCalledWith(false);
      expect(setIsError).toHaveBeenCalledWith(true);
      expect(setMessage).toHaveBeenCalledWith(
        "Failed to initialize Meta SDK. Please check your browser settings or try again."
      );
      expect(onCodeReceived).not.toHaveBeenCalled();
    });

    it("exact state travels from session response to /connect via coordinateMetaSignupFlow", async () => {
      const { coordinateMetaSignupFlow } = await import("@/components/whatsapp/WhatsAppEmbeddedSignup");

      const expectedState = "was_exact_token_coordinate_999";
      let connectBodySent: any = null;

      const mockFetchSession = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          state: expectedState,
          appId: "meta-app-123",
          configId: "meta-cfg-123",
          graphVersion: "v26.0",
        }),
      });

      const mockFetchConnect = vi.fn(async (body: any) => {
        connectBodySent = body;
        return {
          ok: true,
          json: async () => ({ success: true, status: "connected" }),
        } as Response;
      });

      const mockFb = {
        init: vi.fn(),
        login: vi.fn((cb) => {
          cb({ authResponse: { code: "meta_auth_code_xyz" } });
        }),
      };

      const result = await coordinateMetaSignupFlow({
        fetchSession: mockFetchSession,
        fetchConnect: mockFetchConnect,
        fb: mockFb,
        metaFinishEvent: {
          waba_id: "waba_finish_123",
          phone_number_id: "phone_finish_123",
        },
      });

      expect(result.success).toBe(true);
      expect(result.stateUsed).toBe(expectedState);
      expect(connectBodySent).not.toBeNull();
      expect(connectBodySent.state).toBe(expectedState);
      expect(connectBodySent.code).toBe("meta_auth_code_xyz");
      expect(connectBodySent.wabaId).toBe("waba_finish_123");
      expect(connectBodySent.phoneNumberId).toBe("phone_finish_123");
    });

    it("missing state never opens Meta login", async () => {
      const { coordinateMetaSignupFlow } = await import("@/components/whatsapp/WhatsAppEmbeddedSignup");

      const mockFetchSession = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          state: "",
          appId: "meta-app-123",
          configId: "meta-cfg-123",
        }),
      });

      const mockFetchConnect = vi.fn();
      const mockFb = {
        init: vi.fn(),
        login: vi.fn(),
      };

      const result = await coordinateMetaSignupFlow({
        fetchSession: mockFetchSession,
        fetchConnect: mockFetchConnect,
        fb: mockFb,
        metaFinishEvent: {
          waba_id: "waba_1",
          phone_number_id: "phone_1",
        },
      });

      expect(result.success).toBe(false);
      expect(mockFb.login).not.toHaveBeenCalled();
      expect(mockFetchConnect).not.toHaveBeenCalled();
    });

    it("always connects via the canonical /api/integrations/whatsapp/connect route", async () => {
      const source = await readFile(clientPath, "utf8");
      expect(source).toContain('fetch("/api/integrations/whatsapp/connect"');
      expect(source).not.toContain("/embedded-signup`");
    });

    it("no fake +1 (555) 677-1423 values remain in production dashboard files", async () => {
      const waDash = await readFile(whatsappDashboardPath, "utf8");
      expect(waDash).not.toContain("+1 (555) 677-1423");
      expect(waDash).not.toContain("555-677-1423");

      const connDash = await readFile(connectionsPath, "utf8");
      expect(connDash).not.toContain("+1 (555) 677-1423");
      expect(connDash).not.toContain("Phone Not Set");
    });

    it("displays 'Not connected' when no real integration exists", async () => {
      const waDash = await readFile(whatsappDashboardPath, "utf8");
      expect(waDash).toContain('"Not connected"');
    });
  });

  describe("2. Fail-Closed Session Creation & Validation", () => {
    it("session insert failure throws error and returns 500 without state token", async () => {
      const { createWhatsAppConnectionSession } = await import("@/lib/whatsapp/embedded-signup");
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: { message: "table missing" } }),
            }),
          }),
        }),
      } as any;

      await expect(
        createWhatsAppConnectionSession(mockSupabase, {
          workspaceId: "ws-1",
          userId: "usr-1",
        })
      ).rejects.toThrow("Failed to persist WhatsApp connection session.");
    });

    it("session endpoint returns sanitized 500 when session creation fails", async () => {
      const origAppId = process.env.META_WHATSAPP_APP_ID;
      const origConfigId = process.env.META_WHATSAPP_CONFIG_ID;
      process.env.META_WHATSAPP_APP_ID = "test_app_id_123";
      process.env.META_WHATSAPP_CONFIG_ID = "test_config_id_123";

      try {
        const { getActiveWorkspaceContext } = await import("@/lib/workspaces/server");
        vi.mocked(getActiveWorkspaceContext).mockResolvedValueOnce({
          workspace: { id: "ws-1", status: "active" } as any,
          membership: { role: "owner" } as any,
          user: { id: "usr-1" } as any,
        });

        mockAdminSupabase.from.mockReturnValueOnce({
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: { message: "DB Error" } }),
            }),
          }),
        });

        const { POST } = await import("@/app/api/integrations/whatsapp/session/route");
        const res = await POST();
        expect(res.status).toBe(500);
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(body.error).toBe("Failed to initialize WhatsApp connection session.");
        expect(body.state).toBeUndefined();
      } finally {
        process.env.META_WHATSAPP_APP_ID = origAppId;
        process.env.META_WHATSAPP_CONFIG_ID = origConfigId;
      }
    });

    it("unconfigured Meta environment returns 503 without inserting a session", async () => {
      const origAppId = process.env.NEXT_PUBLIC_META_APP_ID;
      const origWaAppId = process.env.META_WHATSAPP_APP_ID;
      const origConfigId = process.env.META_WHATSAPP_CONFIG_ID;
      const origPubConfigId = process.env.NEXT_PUBLIC_META_WHATSAPP_CONFIG_ID;

      delete process.env.NEXT_PUBLIC_META_APP_ID;
      delete process.env.META_WHATSAPP_APP_ID;
      delete process.env.META_APP_ID;
      delete process.env.META_WHATSAPP_CONFIG_ID;
      delete process.env.NEXT_PUBLIC_META_WHATSAPP_CONFIG_ID;

      const { getActiveWorkspaceContext } = await import("@/lib/workspaces/server");
      vi.mocked(getActiveWorkspaceContext).mockResolvedValueOnce({
        workspace: { id: "ws-1", status: "active" } as any,
        membership: { role: "owner" } as any,
        user: { id: "usr-1" } as any,
      });

      const insertSpy = vi.fn();
      mockAdminSupabase.from.mockReturnValueOnce({
        insert: insertSpy,
      });

      const { POST } = await import("@/app/api/integrations/whatsapp/session/route");
      const res = await POST();

      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.code).toBe("META_CONFIGURATION_MISSING");
      expect(insertSpy).not.toHaveBeenCalled();

      // restore
      if (origAppId) process.env.NEXT_PUBLIC_META_APP_ID = origAppId;
      if (origWaAppId) process.env.META_WHATSAPP_APP_ID = origWaAppId;
      if (origConfigId) process.env.META_WHATSAPP_CONFIG_ID = origConfigId;
      if (origPubConfigId) process.env.NEXT_PUBLIC_META_WHATSAPP_CONFIG_ID = origPubConfigId;
    });

    it("missing session table or RPC fails closed", async () => {
      const { validateAndConsumeWhatsAppSession } = await import("@/lib/whatsapp/embedded-signup");
      const mockSupabase = {
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "function consume_whatsapp_connection_session does not exist" },
        }),
      } as any;

      const result = await validateAndConsumeWhatsAppSession(
        mockSupabase,
        "was_validtoken1234567890123456789012345",
        "ws-1",
        "usr-1"
      );
      expect(result.valid).toBe(false);
      expect(result.sessionId).toBeUndefined();
    });

    it("unknown or malformed state token is rejected", async () => {
      const { validateAndConsumeWhatsAppSession } = await import("@/lib/whatsapp/embedded-signup");
      const mockSupabase = {
        rpc: vi.fn().mockResolvedValue({
          data: [{ valid: false, session_id: null, error_message: "Session token not found or invalid" }],
          error: null,
        }),
      } as any;

      const result = await validateAndConsumeWhatsAppSession(
        mockSupabase,
        "was_unknowntoken1234567890123456789012345",
        "ws-1",
        "usr-1"
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Session token not found or invalid");
    });

    it("replayed state token is rejected", async () => {
      const { validateAndConsumeWhatsAppSession } = await import("@/lib/whatsapp/embedded-signup");
      const mockSupabase = {
        rpc: vi.fn().mockResolvedValue({
          data: [{ valid: false, session_id: null, error_message: "Session token has already been consumed" }],
          error: null,
        }),
      } as any;

      const result = await validateAndConsumeWhatsAppSession(
        mockSupabase,
        "was_replayedtoken1234567890123456789012345",
        "ws-1",
        "usr-1"
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("already been consumed");
    });

    it("expired state token is rejected", async () => {
      const { validateAndConsumeWhatsAppSession } = await import("@/lib/whatsapp/embedded-signup");
      const mockSupabase = {
        rpc: vi.fn().mockResolvedValue({
          data: [{ valid: false, session_id: null, error_message: "Session token has expired" }],
          error: null,
        }),
      } as any;

      const result = await validateAndConsumeWhatsAppSession(
        mockSupabase,
        "was_expiredtoken1234567890123456789012345",
        "ws-1",
        "usr-1"
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("expired");
    });

    it("initiating-user mismatch is rejected", async () => {
      const { validateAndConsumeWhatsAppSession } = await import("@/lib/whatsapp/embedded-signup");
      const mockSupabase = {
        rpc: vi.fn().mockResolvedValue({
          data: [{ valid: false, session_id: null, error_message: "Initiating user mismatch" }],
          error: null,
        }),
      } as any;

      const result = await validateAndConsumeWhatsAppSession(
        mockSupabase,
        "was_token12345678901234567890123456789012",
        "ws-1",
        "usr-DIFFERENT"
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Initiating user mismatch");
    });

    it("workspace mismatch is rejected", async () => {
      const { validateAndConsumeWhatsAppSession } = await import("@/lib/whatsapp/embedded-signup");
      const mockSupabase = {
        rpc: vi.fn().mockResolvedValue({
          data: [{ valid: false, session_id: null, error_message: "Session token not found or invalid" }],
          error: null,
        }),
      } as any;

      const result = await validateAndConsumeWhatsAppSession(
        mockSupabase,
        "was_token12345678901234567890123456789012",
        "ws-WRONG",
        "usr-1"
      );
      expect(result.valid).toBe(false);
    });

    it("valid session and user binding confirms valid = true", async () => {
      const { validateAndConsumeWhatsAppSession } = await import("@/lib/whatsapp/embedded-signup");
      const mockSupabase = {
        rpc: vi.fn().mockResolvedValue({
          data: [{ valid: true, session_id: "sess-valid-123", error_message: null }],
          error: null,
        }),
      } as any;

      const result = await validateAndConsumeWhatsAppSession(
        mockSupabase,
        "was_token12345678901234567890123456789012",
        "ws-1",
        "usr-1"
      );
      expect(result.valid).toBe(true);
      expect(result.sessionId).toBe("sess-valid-123");
    });
  });

  describe("3. Route Consolidation & CSRF Bypass Prevention", () => {
    it("legacy duplicate route /api/integrations/[id]/whatsapp/embedded-signup is removed", async () => {
      const { existsSync } = await import("node:fs");
      expect(existsSync("app/api/integrations/[id]/whatsapp/embedded-signup/route.ts")).toBe(false);
    });

    it("canonical connect route rejects missing CSRF state token", async () => {
      const { getActiveWorkspaceContext } = await import("@/lib/workspaces/server");
      vi.mocked(getActiveWorkspaceContext).mockResolvedValueOnce({
        workspace: { id: "ws-1", status: "active" } as any,
        user: { id: "usr-1" } as any,
        membership: { role: "admin" } as any,
      } as any);

      const { POST } = await import("@/app/api/integrations/whatsapp/connect/route");
      const req = new Request("http://localhost/api/integrations/whatsapp/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: "auth-code-12345678901234",
          wabaId: "12345678",
          phoneNumberId: "87654321",
          // Notice: missing state token!
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Missing required CSRF state token");
    });

    it("canonical connect route rejects invalid CSRF state token", async () => {
      const { getActiveWorkspaceContext } = await import("@/lib/workspaces/server");
      vi.mocked(getActiveWorkspaceContext).mockResolvedValueOnce({
        workspace: { id: "ws-1", status: "active" } as any,
        user: { id: "usr-1" } as any,
        membership: { role: "admin" } as any,
      } as any);

      mockAdminSupabase.rpc.mockResolvedValueOnce({
        data: [{ valid: false, error_message: "Session token not found or invalid" }],
        error: null,
      });

      const { POST } = await import("@/app/api/integrations/whatsapp/connect/route");
      const req = new Request("http://localhost/api/integrations/whatsapp/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: "auth-code-12345678901234",
          state: "was_forgedstate12345678901234567890123",
          wabaId: "12345678",
          phoneNumberId: "87654321",
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toContain("Session token not found or invalid");
    });
  });

  describe("4. Cross-Workspace Conflict & PostgreSQL Enforcement", () => {
    it("RLS cannot hide cross-workspace conflict across pending, connected, or degraded statuses", async () => {
      const { assertNoCrossWorkspaceConflict } = await import("@/lib/whatsapp/embedded-signup");
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                neq: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: "int-other",
                      workspace_id: "ws-OTHER",
                      status: "degraded",
                      external_account_id: "phone-conflict-999",
                      public_configuration: { phone_number_id: "phone-conflict-999" },
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        }),
      } as any;

      await expect(
        assertNoCrossWorkspaceConflict(mockSupabase, "ws-CURRENT", "phone-conflict-999", "waba-123")
      ).rejects.toThrow("Cross-workspace conflict: this WhatsApp phone number is already registered to another workspace.");
    });

    it("migration enforces unique constraint on pending, connected, degraded phone numbers and WABAs", async () => {
      const migrationSql = await readFile("supabase/migrations/20261007_whatsapp_embedded_signup.sql", "utf8");
      expect(migrationSql).toContain("uq_active_whatsapp_phone_number_id");
      expect(migrationSql).toContain("uq_active_whatsapp_waba_id");
      expect(migrationSql).toContain("status IN ('pending', 'connected', 'degraded')");
      expect(migrationSql).toContain("COALESCE(external_account_id, public_configuration->>'phone_number_id')");
      expect(migrationSql).toContain("COALESCE(public_configuration->>'waba_id', public_configuration->>'business_account_id')");
      expect(migrationSql).toContain("created_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE");
      expect(migrationSql).toContain("uq_whatsapp_conn_sessions_token_hash");
      expect(migrationSql).toContain("REVOKE ALL ON FUNCTION public.consume_whatsapp_connection_session(TEXT, UUID, UUID) FROM PUBLIC, anon, authenticated;");
      expect(migrationSql).toContain("GRANT EXECUTE ON FUNCTION public.consume_whatsapp_connection_session(TEXT, UUID, UUID) TO service_role;");
    });
  });

  describe("5. Webhook Subscription Failure & Status Integrity", () => {
    it("failed Meta webhook subscription yields action_required status and does not display Active", async () => {
      const { upsertWhatsAppIntegration } = await import("@/lib/whatsapp/embedded-signup");

      const updateMock = vi.fn().mockResolvedValue({ error: null });
      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === "integrations") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: {
                        id: "int-1",
                        status: "action_required",
                        public_configuration: {},
                      },
                      error: null,
                    }),
                  }),
                }),
              }),
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: updateMock,
                }),
              }),
            };
          }
          return {};
        }),
      } as any;

      const result = await upsertWhatsAppIntegration(mockSupabase, {
        workspaceId: "ws-1",
        userId: "usr-1",
        phoneNumberId: "phone-1",
        wabaId: "waba-1",
        accessToken: "EAAB_token",
        appSecret: "secret",
        webhookSubscribed: false, // FAILED
      });

      expect(result.status).toBe("action_required");
      expect(updateMock).toHaveBeenCalled();
    });

    it("getWhatsAppConnectionStatus returns action_required and connected=false when webhook failed", async () => {
      const { getWhatsAppConnectionStatus } = await import("@/lib/whatsapp/embedded-signup");
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: "int-1",
                    status: "action_required",
                    public_configuration: { webhook_subscribed: false },
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      } as any;

      const status = await getWhatsAppConnectionStatus(mockSupabase, "ws-1");
      expect(status.connected).toBe(false);
      expect(status.status).toBe("action_required");
      expect(status.webhookSubscribed).toBe(false);
    });

    it("authorized second workspace admin can read the integration status", async () => {
      const { getActiveWorkspaceContext } = await import("@/lib/workspaces/server");
      vi.mocked(getActiveWorkspaceContext).mockResolvedValueOnce({
        workspace: { id: "ws-1" } as any,
        membership: { role: "admin" } as any,
        user: { id: "usr-2" } as any, // Different admin from creator
      });

      mockAdminSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: "int-1",
                  status: "connected",
                  public_configuration: {
                    waba_name: "Team Workspace Account",
                    display_phone_number: "+1 (555) 0199",
                    webhook_subscribed: true,
                  },
                },
                error: null,
              }),
            }),
          }),
        }),
      });

      const { GET } = await import("@/app/api/integrations/whatsapp/status/route");
      const res = await GET();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.connected).toBe(true);
      expect(body.data.wabaName).toBe("Team Workspace Account");
    });
  });

  describe("6. Database Mutation Integrity & Compensation", () => {
    it("two-phase activation: initial write puts status in pending, not connected", async () => {
      const { upsertWhatsAppIntegration } = await import("@/lib/whatsapp/embedded-signup");
      let initialInsertedStatus: string | undefined;

      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === "integrations") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                  }),
                }),
              }),
              insert: vi.fn((row: any) => {
                initialInsertedStatus = row.status;
                return {
                  select: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({ data: { id: "int-new" }, error: null }),
                  }),
                };
              }),
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ error: null }),
                }),
              }),
            };
          }
          return {};
        }),
      } as any;

      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (typeof url === "string" && url.includes("/subscribed_apps")) {
          return {
            ok: true,
            json: async () => ({ success: true }),
          } as Response;
        }
        return originalFetch(url);
      });

      try {
        const result = await upsertWhatsAppIntegration(mockSupabase, {
          workspaceId: "ws-1",
          userId: "usr-1",
          phoneNumberId: "phone-1",
          wabaId: "waba-1",
          accessToken: "EAAB_token",
          appSecret: "secret",
        });

        expect(initialInsertedStatus).toBe("pending");
        expect(result.status).toBe("connected");
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("failed credential storage never produces Active and triggers compensation to status degraded", async () => {
      const { upsertWhatsAppIntegration } = await import("@/lib/whatsapp/embedded-signup");
      const { storeIntegrationCredentials } = await import("@/lib/integrations/credentials");
      vi.mocked(storeIntegrationCredentials).mockRejectedValueOnce(new Error("Vault unavailable"));

      let compensatedStatus: string | undefined;
      let compensatedErrorCode: string | undefined;

      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === "integrations") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { id: "int-1", status: "pending", public_configuration: {} },
                      error: null,
                    }),
                  }),
                }),
              }),
              update: vi.fn((payload: any) => {
                if (payload.status === "degraded") {
                  compensatedStatus = payload.status;
                  compensatedErrorCode = payload.last_error_code;
                }
                return {
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockResolvedValue({ error: null }),
                  }),
                };
              }),
            };
          }
          return {};
        }),
      } as any;

      await expect(
        upsertWhatsAppIntegration(mockSupabase, {
          workspaceId: "ws-1",
          userId: "usr-1",
          phoneNumberId: "phone-1",
          wabaId: "waba-1",
          accessToken: "EAAB_token",
          appSecret: "secret",
        })
      ).rejects.toThrow("Failed to store encrypted credentials securely.");

      expect(compensatedStatus).toBe("degraded");
      expect(compensatedErrorCode).toBe("CREDENTIAL_STORAGE_FAILED");
    });

    it("failed endpoint creation disables endpoint and sets status to degraded", async () => {
      const { upsertWhatsAppIntegration } = await import("@/lib/whatsapp/embedded-signup");
      const { createOrEnableIntegrationWebhookEndpoint, disableIntegrationWebhookEndpoint } =
        await import("@/lib/integrations/webhooks/database");
      vi.mocked(createOrEnableIntegrationWebhookEndpoint).mockRejectedValueOnce(new Error("Endpoint failure"));

      let compensatedStatus: string | undefined;

      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === "integrations") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { id: "int-1", status: "pending", public_configuration: {} },
                      error: null,
                    }),
                  }),
                }),
              }),
              update: vi.fn((payload: any) => {
                if (payload.status === "degraded") {
                  compensatedStatus = payload.status;
                }
                return {
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockResolvedValue({ error: null }),
                  }),
                };
              }),
            };
          }
          return {};
        }),
      } as any;

      await expect(
        upsertWhatsAppIntegration(mockSupabase, {
          workspaceId: "ws-1",
          userId: "usr-1",
          phoneNumberId: "phone-1",
          wabaId: "waba-1",
          accessToken: "EAAB_token",
          appSecret: "secret",
        })
      ).rejects.toThrow("Failed to configure integration webhook endpoint.");

      expect(disableIntegrationWebhookEndpoint).toHaveBeenCalledWith(mockSupabase, "ws-1", "int-1");
      expect(compensatedStatus).toBe("degraded");
    });

    it("failed Meta subscription disables endpoint, sets degraded status, and returns action_required", async () => {
      const { upsertWhatsAppIntegration } = await import("@/lib/whatsapp/embedded-signup");
      const { disableIntegrationWebhookEndpoint } = await import("@/lib/integrations/webhooks/database");

      let compensatedStatus: string | undefined;

      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === "integrations") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { id: "int-1", status: "pending", public_configuration: {} },
                      error: null,
                    }),
                  }),
                }),
              }),
              update: vi.fn((payload: any) => {
                if (payload.status === "degraded") {
                  compensatedStatus = payload.status;
                }
                return {
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockResolvedValue({ error: null }),
                  }),
                };
              }),
            };
          }
          return {};
        }),
      } as any;

      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (typeof url === "string" && url.includes("/subscribed_apps")) {
          return {
            ok: false,
            json: async () => ({ success: false }),
          } as Response;
        }
        return originalFetch(url);
      });

      try {
        const result = await upsertWhatsAppIntegration(mockSupabase, {
          workspaceId: "ws-1",
          userId: "usr-1",
          phoneNumberId: "phone-1",
          wabaId: "waba-1",
          accessToken: "EAAB_token",
          appSecret: "secret",
        });

        expect(result.status).toBe("action_required");
        expect(disableIntegrationWebhookEndpoint).toHaveBeenCalledWith(mockSupabase, "ws-1", "int-1");
        expect(compensatedStatus).toBe("degraded");
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("activation happens only after endpoint creation and Meta subscription succeed", async () => {
      const { upsertWhatsAppIntegration } = await import("@/lib/whatsapp/embedded-signup");
      const { createOrEnableIntegrationWebhookEndpoint } = await import("@/lib/integrations/webhooks/database");

      const executionOrder: string[] = [];

      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === "integrations") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                  }),
                }),
              }),
              insert: vi.fn((row: any) => {
                executionOrder.push(`insert_${row.status}`);
                return {
                  select: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({ data: { id: "int-seq" }, error: null }),
                  }),
                };
              }),
              update: vi.fn((row: any) => {
                executionOrder.push(`update_${row.status}`);
                return {
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockResolvedValue({ error: null }),
                  }),
                };
              }),
            };
          }
          return {};
        }),
      } as any;

      vi.mocked(createOrEnableIntegrationWebhookEndpoint).mockImplementationOnce(async () => {
        executionOrder.push("create_endpoint");
        return { endpointKey: "epk-seq", status: "active" } as any;
      });

      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (typeof url === "string" && url.includes("/subscribed_apps")) {
          executionOrder.push("subscribe_meta");
          return {
            ok: true,
            json: async () => ({ success: true }),
          } as Response;
        }
        return originalFetch(url);
      });

      try {
        const result = await upsertWhatsAppIntegration(mockSupabase, {
          workspaceId: "ws-seq",
          userId: "usr-seq",
          phoneNumberId: "phone-seq",
          wabaId: "waba-seq",
          accessToken: "EAAB_token_seq",
          appSecret: "secret_seq",
        });

        expect(result.status).toBe("connected");
        expect(executionOrder).toEqual([
          "insert_pending",
          "create_endpoint",
          "subscribe_meta",
          "update_connected",
        ]);
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("failed endpoint cleanup reports COMPENSATION_REQUIRED", async () => {
      const { upsertWhatsAppIntegration } = await import("@/lib/whatsapp/embedded-signup");
      const { disableIntegrationWebhookEndpoint } = await import("@/lib/integrations/webhooks/database");

      vi.mocked(disableIntegrationWebhookEndpoint).mockRejectedValueOnce(new Error("Cleanup network error"));

      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (typeof url === "string" && url.includes("/subscribed_apps")) {
          return {
            ok: false,
            json: async () => ({ success: false }),
          } as Response;
        }
        return originalFetch(url);
      });

      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === "integrations") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                  }),
                }),
              }),
              insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: { id: "int-comp" }, error: null }),
                }),
              }),
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ error: null }),
                }),
              }),
            };
          }
          return {};
        }),
      } as any;

      try {
        await expect(
          upsertWhatsAppIntegration(mockSupabase, {
            workspaceId: "ws-comp",
            userId: "usr-comp",
            phoneNumberId: "phone-comp",
            wabaId: "waba-comp",
            accessToken: "EAAB_token_comp",
            appSecret: "secret_comp",
          })
        ).rejects.toThrow("COMPENSATION_REQUIRED");
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("compensation failure is handled and never produces Active", async () => {
      const { upsertWhatsAppIntegration } = await import("@/lib/whatsapp/embedded-signup");
      const { storeIntegrationCredentials } = await import("@/lib/integrations/credentials");
      vi.mocked(storeIntegrationCredentials).mockRejectedValueOnce(new Error("Vault unreachable"));

      let updateCallCount = 0;
      const updateMock = vi.fn(() => {
        updateCallCount++;
        return {
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              error: updateCallCount === 1 ? null : { code: "DB_FAIL", message: "compensation error" },
            }),
          }),
        };
      });

      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === "integrations") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { id: "int-1", status: "pending", public_configuration: {} },
                      error: null,
                    }),
                  }),
                }),
              }),
              update: updateMock,
            };
          }
          return {};
        }),
      } as any;

      await expect(
        upsertWhatsAppIntegration(mockSupabase, {
          workspaceId: "ws-1",
          userId: "usr-1",
          phoneNumberId: "phone-1",
          wabaId: "waba-1",
          accessToken: "EAAB_token",
          appSecret: "secret",
        })
      ).rejects.toThrow("COMPENSATION_REQUIRED");
    });

    it("disconnect fails closed when endpoint disable fails and does not claim success", async () => {
      const { disconnectWhatsAppIntegration } = await import("@/lib/whatsapp/embedded-signup");
      const { disableIntegrationWebhookEndpoint } = await import("@/lib/integrations/webhooks/database");
      vi.mocked(disableIntegrationWebhookEndpoint).mockRejectedValueOnce(new Error("Endpoint service down"));

      const updateMock = vi.fn();
      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === "integrations") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { id: "int-1", public_configuration: {} },
                      error: null,
                    }),
                  }),
                }),
              }),
              update: updateMock,
            };
          }
          return {};
        }),
      } as any;

      await expect(
        disconnectWhatsAppIntegration(mockSupabase, "ws-1", "User disconnect")
      ).rejects.toThrow("Failed to disable webhook endpoint. Please retry disconnecting.");

      expect(updateMock).not.toHaveBeenCalled();
    });

    it("disconnect reports action required if database status update fails after endpoint disable", async () => {
      const { disconnectWhatsAppIntegration } = await import("@/lib/whatsapp/embedded-signup");
      const { disableIntegrationWebhookEndpoint } = await import("@/lib/integrations/webhooks/database");
      vi.mocked(disableIntegrationWebhookEndpoint).mockResolvedValueOnce({
        endpointKey: "key-123",
        status: "disabled",
      } as any);

      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === "integrations") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { id: "int-1", public_configuration: {} },
                      error: null,
                    }),
                  }),
                }),
              }),
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ error: { code: "DB_ERROR", message: "connection dropped" } }),
                }),
              }),
            };
          }
          return {};
        }),
      } as any;

      await expect(
        disconnectWhatsAppIntegration(mockSupabase, "ws-1", "User disconnect")
      ).rejects.toThrow("Webhook processing disabled, but failed to update status. Action required.");
    });

    it("getWhatsAppConnectionStatus distinguishes no integration from database query failure", async () => {
      const { getWhatsAppConnectionStatus } = await import("@/lib/whatsapp/embedded-signup");

      // 1. No integration found -> returns not_connected
      const mockSupabaseEmpty = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        }),
      } as any;

      const emptyRes = await getWhatsAppConnectionStatus(mockSupabaseEmpty, "ws-1");
      expect(emptyRes.status).toBe("not_connected");
      expect(emptyRes.connected).toBe(false);

      // 2. Database query error -> throws error instead of converting to not_connected
      const mockSupabaseErr = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: null,
                  error: { code: "PG_TIMEOUT", message: "statement timeout" },
                }),
              }),
            }),
          }),
        }),
      } as any;

      await expect(
        getWhatsAppConnectionStatus(mockSupabaseErr, "ws-1")
      ).rejects.toThrow("Failed to load WhatsApp integration status.");
    });
  });

  describe("7. Unified Graph API Version Contract", () => {
    it("uses uniform META_WHATSAPP_GRAPH_API_VERSION defaulting to v26.0", async () => {
      const { META_WHATSAPP_GRAPH_API_VERSION, GRAPH_API_VERSION } = await import("@/lib/whatsapp/embedded-signup");
      expect(META_WHATSAPP_GRAPH_API_VERSION).toBe("v26.0");
      expect(GRAPH_API_VERSION).toBe("v26.0");
    });
  });

  describe("8. PostgreSQL Disposable Engine Certification (PGlite)", () => {
    it("executes migration 20261007 and enforces cross-workspace uniqueness & user-bound RPC in Postgres", async () => {
      const { PGlite } = await import("@electric-sql/pglite");
      const db = new PGlite();

      // Bootstrap foundational schema
      await db.exec(`
        CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
        CREATE SCHEMA IF NOT EXISTS auth;
        CREATE TABLE IF NOT EXISTS auth.users (id uuid primary key default gen_random_uuid());
        CREATE TABLE IF NOT EXISTS public.workspaces (id uuid primary key default gen_random_uuid(), owner_user_id uuid references auth.users(id));
        CREATE OR REPLACE FUNCTION public.is_workspace_member(p_workspace_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
        CREATE OR REPLACE FUNCTION public.has_workspace_role(p_workspace_id uuid, p_roles text[]) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
        CREATE TABLE IF NOT EXISTS public.integrations (
          id uuid primary key default gen_random_uuid(),
          workspace_id uuid not null references public.workspaces(id) on delete cascade,
          user_id uuid not null references auth.users(id) on delete cascade,
          provider text not null,
          status text not null default 'not_configured',
          external_account_id text,
          public_configuration jsonb not null default '{}'::jsonb,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        );
      `);

      // Run migration 20261007
      const migrationSql = await readFile("supabase/migrations/20261007_whatsapp_embedded_signup.sql", "utf8");
      await db.exec(migrationSql);

      // Create test users & workspaces
      const userRes = await db.query<{ id: string }>("INSERT INTO auth.users DEFAULT VALUES RETURNING id;");
      const user1 = userRes.rows[0].id;
      const user2Res = await db.query<{ id: string }>("INSERT INTO auth.users DEFAULT VALUES RETURNING id;");
      const user2 = user2Res.rows[0].id;

      const ws1Res = await db.query<{ id: string }>(`INSERT INTO public.workspaces (owner_user_id) VALUES ('${user1}') RETURNING id;`);
      const ws1 = ws1Res.rows[0].id;
      const ws2Res = await db.query<{ id: string }>(`INSERT INTO public.workspaces (owner_user_id) VALUES ('${user2}') RETURNING id;`);
      const ws2 = ws2Res.rows[0].id;

      // 1. Test user-bound consume RPC in Postgres
      const tokenHash = "hash_" + "1".repeat(59);
      const expiresAt = new Date(Date.now() + 60000).toISOString();
      await db.query(`
        INSERT INTO public.whatsapp_connection_sessions (workspace_id, created_by_user_id, state_token_hash, status, expires_at)
        VALUES ('${ws1}', '${user1}', '${tokenHash}', 'pending', '${expiresAt}');
      `);

      // 1a. User mismatch fails closed
      const mismatchRes = await db.query<{ valid: boolean; error_message: string }>(`
        SELECT valid, error_message FROM public.consume_whatsapp_connection_session('${tokenHash}', '${ws1}'::uuid, '${user2}'::uuid);
      `);
      expect(mismatchRes.rows[0].valid).toBe(false);
      expect(mismatchRes.rows[0].error_message).toContain("Initiating user mismatch");

      // 1b. Correct user consumes session successfully
      const consumeRes = await db.query<{ valid: boolean; error_message: string }>(`
        SELECT valid, error_message FROM public.consume_whatsapp_connection_session('${tokenHash}', '${ws1}'::uuid, '${user1}'::uuid);
      `);
      expect(consumeRes.rows[0].valid).toBe(true);

      // 1c. Replay attempt fails closed
      const replayRes = await db.query<{ valid: boolean; error_message: string }>(`
        SELECT valid, error_message FROM public.consume_whatsapp_connection_session('${tokenHash}', '${ws1}'::uuid, '${user1}'::uuid);
      `);
      expect(replayRes.rows[0].valid).toBe(false);
      expect(replayRes.rows[0].error_message).toContain("already been consumed");

      // 1d. NULL / missing initiator fails closed
      const nullInitiatorRes = await db.query<{ valid: boolean; error_message: string }>(`
        SELECT valid, error_message FROM public.consume_whatsapp_connection_session('${tokenHash}', '${ws1}'::uuid, NULL);
      `);
      expect(nullInitiatorRes.rows[0].valid).toBe(false);
      expect(nullInitiatorRes.rows[0].error_message).toContain("Initiating user mismatch");

      // 2. Test PostgreSQL cross-workspace partial unique index enforcement
      // Connect phone in workspace 1
      await db.query(`
        INSERT INTO public.integrations (workspace_id, user_id, provider, status, external_account_id, public_configuration)
        VALUES ('${ws1}', '${user1}', 'whatsapp-business', 'connected', 'phone_shared_999', '{"waba_id": "waba_shared_999"}'::jsonb);
      `);

      // 2a. Attempt to connect SAME phone in workspace 2 -> MUST throw unique violation in Postgres
      await expect(
        db.query(`
          INSERT INTO public.integrations (workspace_id, user_id, provider, status, external_account_id, public_configuration)
          VALUES ('${ws2}', '${user2}', 'whatsapp-business', 'connected', 'phone_shared_999', '{"waba_id": "waba_diff_111"}'::jsonb);
        `)
      ).rejects.toThrow();

      // 2b. Attempt to connect SAME WABA in workspace 2 -> MUST throw unique violation in Postgres
      await expect(
        db.query(`
          INSERT INTO public.integrations (workspace_id, user_id, provider, status, external_account_id, public_configuration)
          VALUES ('${ws2}', '${user2}', 'whatsapp-business', 'connected', 'phone_diff_222', '{"waba_id": "waba_shared_999"}'::jsonb);
        `)
      ).rejects.toThrow();

      // 2c. Legacy JSON-only phone ID conflicts are blocked
      await db.query(`
        INSERT INTO public.integrations (workspace_id, user_id, provider, status, external_account_id, public_configuration)
        VALUES ('${ws1}', '${user1}', 'whatsapp-business', 'connected', NULL, '{"phone_number_id": "phone_legacy_777"}'::jsonb);
      `);
      await expect(
        db.query(`
          INSERT INTO public.integrations (workspace_id, user_id, provider, status, external_account_id, public_configuration)
          VALUES ('${ws2}', '${user2}', 'whatsapp-business', 'connected', 'phone_legacy_777', '{}'::jsonb);
        `)
      ).rejects.toThrow();

      // 2d. Legacy business_account_id conflicts are blocked
      await db.query(`
        INSERT INTO public.integrations (workspace_id, user_id, provider, status, external_account_id, public_configuration)
        VALUES ('${ws1}', '${user1}', 'whatsapp-business', 'connected', 'phone_diff_888', '{"business_account_id": "legacy_waba_888"}'::jsonb);
      `);
      await expect(
        db.query(`
          INSERT INTO public.integrations (workspace_id, user_id, provider, status, external_account_id, public_configuration)
          VALUES ('${ws2}', '${user2}', 'whatsapp-business', 'connected', 'phone_diff_889', '{"waba_id": "legacy_waba_888"}'::jsonb);
        `)
      ).rejects.toThrow();

      // 2e. Two degraded/pending workspaces cannot store the same phone or WABA
      await db.query(`
        INSERT INTO public.integrations (workspace_id, user_id, provider, status, external_account_id, public_configuration)
        VALUES ('${ws1}', '${user1}', 'whatsapp-business', 'pending', 'phone_res_111', '{"waba_id": "waba_res_111"}'::jsonb);
      `);
      await expect(
        db.query(`
          INSERT INTO public.integrations (workspace_id, user_id, provider, status, external_account_id, public_configuration)
          VALUES ('${ws2}', '${user2}', 'whatsapp-business', 'degraded', 'phone_res_111', '{"waba_id": "waba_res_222"}'::jsonb);
        `)
      ).rejects.toThrow();

      await expect(
        db.query(`
          INSERT INTO public.integrations (workspace_id, user_id, provider, status, external_account_id, public_configuration)
          VALUES ('${ws2}', '${user2}', 'whatsapp-business', 'pending', 'phone_res_333', '{"waba_id": "waba_res_111"}'::jsonb);
        `)
      ).rejects.toThrow();

      // 2f. A disconnected record allows a new authorized connection
      await db.query(`
        INSERT INTO public.integrations (workspace_id, user_id, provider, status, external_account_id, public_configuration)
        VALUES ('${ws1}', '${user1}', 'whatsapp-business', 'disconnected', 'phone_disc_999', '{"waba_id": "waba_disc_999"}'::jsonb);
      `);
      await expect(
        db.query(`
          INSERT INTO public.integrations (workspace_id, user_id, provider, status, external_account_id, public_configuration)
          VALUES ('${ws2}', '${user2}', 'whatsapp-business', 'connected', 'phone_disc_999', '{"waba_id": "waba_disc_999"}'::jsonb);
        `)
      ).resolves.toBeDefined();

      // 2g. Reconnect in same workspace (update) succeeds without constraint violation
      await expect(
        db.query(`
          UPDATE public.integrations
          SET updated_at = now()
          WHERE workspace_id = '${ws1}' AND provider = 'whatsapp-business';
        `)
      ).resolves.toBeDefined();
    });

    it("migration upgrades or explicitly rejects a legacy nullable session schema", async () => {
      const { PGlite } = await import("@electric-sql/pglite");
      const migrationSql = await readFile("supabase/migrations/20261007_whatsapp_embedded_signup.sql", "utf8");

      // Scenario A: Active unexpired session with NULL created_by_user_id must cause migration to fail closed
      const dbFail = new PGlite();
      await dbFail.exec(`
        CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
        CREATE SCHEMA IF NOT EXISTS auth;
        CREATE TABLE IF NOT EXISTS auth.users (id uuid primary key default gen_random_uuid());
        CREATE TABLE IF NOT EXISTS public.workspaces (id uuid primary key default gen_random_uuid(), owner_user_id uuid references auth.users(id));
        CREATE TABLE IF NOT EXISTS public.whatsapp_connection_sessions (
          id uuid primary key default gen_random_uuid(),
          workspace_id uuid not null references public.workspaces(id),
          created_by_user_id uuid, -- legacy nullable
          state_token_hash text not null,
          status text not null default 'pending',
          expires_at timestamptz not null default now() + interval '10 minutes',
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        );
      `);

      const wsRes = await dbFail.query<{ id: string }>("INSERT INTO public.workspaces DEFAULT VALUES RETURNING id;");
      const wsId = wsRes.rows[0].id;

      // Insert active unexpired NULL initiator session
      await dbFail.query(`
        INSERT INTO public.whatsapp_connection_sessions (workspace_id, created_by_user_id, state_token_hash, status, expires_at)
        VALUES ('${wsId}', NULL, 'hash_active_null_session', 'pending', now() + interval '5 minutes');
      `);

      // Migration must fail with explicit preflight error
      await expect(dbFail.exec(migrationSql)).rejects.toThrow(/Audit failed: \d+ active whatsapp_connection_sessions have NULL created_by_user_id/);

      // Scenario B: Expired/consumed NULL initiator session is safely cleaned up, table hardened to NOT NULL
      const dbSuccess = new PGlite();
      await dbSuccess.exec(`
        CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
        CREATE SCHEMA IF NOT EXISTS auth;
        CREATE TABLE IF NOT EXISTS auth.users (id uuid primary key default gen_random_uuid());
        CREATE TABLE IF NOT EXISTS public.workspaces (id uuid primary key default gen_random_uuid(), owner_user_id uuid references auth.users(id));
        CREATE OR REPLACE FUNCTION public.is_workspace_member(p_workspace_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
        CREATE OR REPLACE FUNCTION public.has_workspace_role(p_workspace_id uuid, p_roles text[]) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
        CREATE TABLE IF NOT EXISTS public.integrations (
          id uuid primary key default gen_random_uuid(),
          workspace_id uuid not null references public.workspaces(id) on delete cascade,
          user_id uuid not null references auth.users(id) on delete cascade,
          provider text not null,
          status text not null default 'not_configured',
          external_account_id text,
          public_configuration jsonb not null default '{}'::jsonb,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        );
        CREATE TABLE IF NOT EXISTS public.whatsapp_connection_sessions (
          id uuid primary key default gen_random_uuid(),
          workspace_id uuid not null references public.workspaces(id),
          created_by_user_id uuid, -- legacy nullable
          state_token_hash text not null,
          status text not null default 'pending',
          expires_at timestamptz not null default now() - interval '1 minute',
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        );
      `);

      const wsRes2 = await dbSuccess.query<{ id: string }>("INSERT INTO public.workspaces DEFAULT VALUES RETURNING id;");
      const wsId2 = wsRes2.rows[0].id;

      // Insert expired NULL session
      await dbSuccess.query(`
        INSERT INTO public.whatsapp_connection_sessions (workspace_id, created_by_user_id, state_token_hash, status, expires_at)
        VALUES ('${wsId2}', NULL, 'hash_expired_null_session', 'pending', now() - interval '5 minutes');
      `);

      // Migration succeeds and purges expired session
      await expect(dbSuccess.exec(migrationSql)).resolves.toBeDefined();

      const remainingRows = await dbSuccess.query("SELECT * FROM public.whatsapp_connection_sessions;");
      expect(remainingRows.rows.length).toBe(0);

      // Verify created_by_user_id is now NOT NULL
      const colCheck = await dbSuccess.query<{ is_nullable: string }>(`
        SELECT is_nullable FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'whatsapp_connection_sessions' AND column_name = 'created_by_user_id';
      `);
      expect(colCheck.rows[0].is_nullable).toBe("NO");
    });
  });

  describe("9. Multi-Tenant Meta Callback Route (/api/webhooks/whatsapp/meta)", () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
      mockAdminSupabase.from.mockReset();
      process.env.META_WHATSAPP_APP_SECRET = "test_meta_app_secret_12345";
      process.env.META_WHATSAPP_VERIFY_TOKEN = "test_meta_verify_token_54321";
    });

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it("GET performs Meta webhook verification using server-configured verification token", async () => {
      const { GET } = await import("@/app/api/webhooks/whatsapp/meta/route");

      // Valid subscription request
      const validReq = new Request(
        "https://j10-nexus.vercel.app/api/webhooks/whatsapp/meta?hub.mode=subscribe&hub.verify_token=test_meta_verify_token_54321&hub.challenge=challenge_token_abc"
      );
      const validRes = await GET(validReq);
      expect(validRes.status).toBe(200);
      expect(await validRes.text()).toBe("challenge_token_abc");

      // Invalid verification token
      const invalidReq = new Request(
        "https://j10-nexus.vercel.app/api/webhooks/whatsapp/meta?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=challenge_token_abc"
      );
      const invalidRes = await GET(invalidReq);
      expect(invalidRes.status).toBe(403);
    });

    it("POST rejects an invalid signature before database resolution (zero queries)", async () => {
      const { POST } = await import("@/app/api/webhooks/whatsapp/meta/route");

      const body = JSON.stringify({
        object: "whatsapp_business_account",
        entry: [
          {
            id: "waba-123",
            changes: [
              {
                value: {
                  messaging_product: "whatsapp",
                  metadata: { phone_number_id: "phone-123" },
                  messages: [{ from: "15551234567", id: "wamid.123", text: { body: "hi" } }],
                },
              },
            ],
          },
        ],
      });

      const req = new Request("https://j10-nexus.vercel.app/api/webhooks/whatsapp/meta", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-hub-signature-256": "sha256=invalid_hex_signature_0000000000000000000000000000000000000000000000",
        },
        body,
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.code).toBe("WEBHOOK_SIGNATURE_INVALID");

      // Verify zero database interaction
      expect(mockAdminSupabase.from).not.toHaveBeenCalled();
    });

    it("POST with valid signature plus unique connected phone resolves correct workspace and delegates to processor", async () => {
      const { POST } = await import("@/app/api/webhooks/whatsapp/meta/route");
      const { hmacSha256Hex } = await import("@/lib/integrations/webhooks/crypto");
      const { processWhatsAppPayload } = await import("@/lib/whatsapp/webhook-handler");

      const payload = {
        object: "whatsapp_business_account",
        entry: [
          {
            id: "waba-target",
            changes: [
              {
                field: "messages",
                value: {
                  messaging_product: "whatsapp",
                  metadata: {
                    display_phone_number: "15551234567",
                    phone_number_id: "phone-target-999",
                  },
                  messages: [
                    {
                      from: "15559876543",
                      id: "wamid.test.123",
                      timestamp: "1720000000",
                      text: { body: "Hello J10" },
                      type: "text",
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const rawBody = JSON.stringify(payload);
      const sig = "sha256=" + hmacSha256Hex("test_meta_app_secret_12345", rawBody);

      const targetIntegrationRow = {
        id: "int-target-999",
        workspace_id: "ws-target-111",
        provider: "whatsapp-business",
        status: "connected",
        external_account_id: "phone-target-999",
        public_configuration: {
          phone_number_id: "phone-target-999",
          waba_id: "waba-target",
          webhook_subscribed: true,
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockAdminSupabase.from.mockImplementation((table: string) => {
        if (table === "integrations") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn((col: string, val: string) => {
                if (val === "whatsapp-business") {
                  return {
                    eq: vi.fn((col2: string, val2: string) => {
                      if (val2 === "phone-target-999") {
                        return Promise.resolve({ data: [targetIntegrationRow], error: null });
                      }
                      return Promise.resolve({ data: [], error: null });
                    }),
                  };
                }
                return {
                  eq: vi.fn().mockResolvedValue({ data: [], error: null }),
                };
              }),
            }),
          };
        }
        return {};
      });

      const req = new Request("https://j10-nexus.vercel.app/api/webhooks/whatsapp/meta", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-hub-signature-256": sig,
        },
        body: rawBody,
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      expect(processWhatsAppPayload).toHaveBeenCalledWith(
        expect.objectContaining({
          connection: expect.objectContaining({
            id: "int-target-999",
            workspaceId: "ws-target-111",
            providerId: "whatsapp-business",
            status: "connected",
          }),
        })
      );
    });

    it("POST with unknown phone returns a safe 404 rejection with no persistence", async () => {
      const { POST } = await import("@/app/api/webhooks/whatsapp/meta/route");
      const { hmacSha256Hex } = await import("@/lib/integrations/webhooks/crypto");
      const { processWhatsAppPayload } = await import("@/lib/whatsapp/webhook-handler");

      const payload = {
        object: "whatsapp_business_account",
        entry: [
          {
            changes: [
              {
                value: {
                  messaging_product: "whatsapp",
                  metadata: { phone_number_id: "phone-unknown-404" },
                },
              },
            ],
          },
        ],
      };

      const rawBody = JSON.stringify(payload);
      const sig = "sha256=" + hmacSha256Hex("test_meta_app_secret_12345", rawBody);

      mockAdminSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      });

      const req = new Request("https://j10-nexus.vercel.app/api/webhooks/whatsapp/meta", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-hub-signature-256": sig,
        },
        body: rawBody,
      });

      const res = await POST(req);
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.code).toBe("WHATSAPP_INTEGRATION_NOT_FOUND");
      expect(processWhatsAppPayload).not.toHaveBeenCalled();
    });

    it("POST with degraded or disconnected integration cannot process a webhook (rejects 403)", async () => {
      const { POST } = await import("@/app/api/webhooks/whatsapp/meta/route");
      const { hmacSha256Hex } = await import("@/lib/integrations/webhooks/crypto");
      const { processWhatsAppPayload } = await import("@/lib/whatsapp/webhook-handler");

      const payload = {
        object: "whatsapp_business_account",
        entry: [
          {
            changes: [
              {
                value: {
                  messaging_product: "whatsapp",
                  metadata: { phone_number_id: "phone-degraded-123" },
                },
              },
            ],
          },
        ],
      };

      const rawBody = JSON.stringify(payload);
      const sig = "sha256=" + hmacSha256Hex("test_meta_app_secret_12345", rawBody);

      const degradedRow = {
        id: "int-degraded-123",
        workspace_id: "ws-degraded-123",
        provider: "whatsapp-business",
        status: "degraded",
        external_account_id: "phone-degraded-123",
        public_configuration: {
          webhook_subscribed: true,
        },
      };

      mockAdminSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [degradedRow], error: null }),
          }),
        }),
      });

      const req = new Request("https://j10-nexus.vercel.app/api/webhooks/whatsapp/meta", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-hub-signature-256": sig,
        },
        body: rawBody,
      });

      const res = await POST(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.code).toBe("WHATSAPP_INTEGRATION_NOT_CONNECTED");
      expect(processWhatsAppPayload).not.toHaveBeenCalled();
    });

    it("POST rejects integration if webhook_subscribed is not true", async () => {
      const { POST } = await import("@/app/api/webhooks/whatsapp/meta/route");
      const { hmacSha256Hex } = await import("@/lib/integrations/webhooks/crypto");
      const { processWhatsAppPayload } = await import("@/lib/whatsapp/webhook-handler");

      const payload = {
        object: "whatsapp_business_account",
        entry: [
          {
            changes: [
              {
                value: {
                  messaging_product: "whatsapp",
                  metadata: { phone_number_id: "phone-unsub-123" },
                },
              },
            ],
          },
        ],
      };

      const rawBody = JSON.stringify(payload);
      const sig = "sha256=" + hmacSha256Hex("test_meta_app_secret_12345", rawBody);

      const unsubRow = {
        id: "int-unsub-123",
        workspace_id: "ws-unsub-123",
        provider: "whatsapp-business",
        status: "connected",
        external_account_id: "phone-unsub-123",
        public_configuration: {
          webhook_subscribed: false,
        },
      };

      mockAdminSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [unsubRow], error: null }),
          }),
        }),
      });

      const req = new Request("https://j10-nexus.vercel.app/api/webhooks/whatsapp/meta", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-hub-signature-256": sig,
        },
        body: rawBody,
      });

      const res = await POST(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.code).toBe("WHATSAPP_WEBHOOK_NOT_SUBSCRIBED");
      expect(processWhatsAppPayload).not.toHaveBeenCalled();
    });
  });
});
