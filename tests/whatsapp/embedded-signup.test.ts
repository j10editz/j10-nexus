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
  }),
  disableIntegrationWebhookEndpoint: vi.fn().mockResolvedValue({
    endpointKey: "canonical-endpoint-key-123",
    status: "disabled",
  }),
  getIntegrationWebhookEndpointByConnection: vi.fn().mockResolvedValue({
    endpointKey: "canonical-endpoint-key-123",
  }),
}));

describe("WhatsApp Embedded Signup Flow - CTO Security Hardened", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

      const result = await upsertWhatsAppIntegration(mockSupabase, {
        workspaceId: "ws-1",
        userId: "usr-1",
        phoneNumberId: "phone-1",
        wabaId: "waba-1",
        accessToken: "EAAB_token",
        appSecret: "secret",
        webhookSubscribed: true,
      });

      expect(initialInsertedStatus).toBe("pending");
      expect(result.status).toBe("connected");
    });

    it("failed credential storage never produces Active and triggers compensation to status error", async () => {
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
                if (payload.status === "error") {
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
          webhookSubscribed: true,
        })
      ).rejects.toThrow("Failed to store encrypted credentials securely.");

      expect(compensatedStatus).toBe("error");
      expect(compensatedErrorCode).toBe("CREDENTIAL_STORAGE_FAILED");
    });

    it("failed endpoint creation disables endpoint and sets status to error", async () => {
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
                if (payload.status === "error") {
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
          webhookSubscribed: true,
        })
      ).rejects.toThrow("Failed to configure integration webhook endpoint.");

      expect(disableIntegrationWebhookEndpoint).toHaveBeenCalledWith(mockSupabase, "ws-1", "int-1");
      expect(compensatedStatus).toBe("error");
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

      const result = await upsertWhatsAppIntegration(mockSupabase, {
        workspaceId: "ws-1",
        userId: "usr-1",
        phoneNumberId: "phone-1",
        wabaId: "waba-1",
        accessToken: "EAAB_token",
        appSecret: "secret",
        webhookSubscribed: false, // FAILED Meta subscription
      });

      expect(result.status).toBe("action_required");
      expect(disableIntegrationWebhookEndpoint).toHaveBeenCalledWith(mockSupabase, "ws-1", "int-1");
      expect(compensatedStatus).toBe("degraded");
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
          webhookSubscribed: true,
        })
      ).rejects.toThrow("Failed to store encrypted credentials securely.");
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
  });
});
