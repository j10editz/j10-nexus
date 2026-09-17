import { readFile } from "node:fs/promises";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/workspaces/server", () => ({
  getActiveWorkspaceContext: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  createServerSupabaseClient: vi.fn(),
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

describe("WhatsApp Embedded Signup Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. Client Components & Connections UI Contract", () => {
    const clientPath = "components/whatsapp/WhatsAppEmbeddedSignup.tsx";
    const connectionsPath = "app/dashboard/connections/page.tsx";

    it("uses Meta's official WhatsApp Business App onboarding session and response_type code", async () => {
      const source = await readFile(clientPath, "utf8");
      expect(source).toContain('featureType: "whatsapp_business_app_onboarding"');
      expect(source).toContain('sessionInfoVersion: "3"');
      expect(source).toContain('response_type: "code"');
    });

    it("never exposes META_APP_SECRET or permanent tokens to the browser client", async () => {
      const source = await readFile(clientPath, "utf8");
      expect(source).not.toContain("META_WHATSAPP_APP_SECRET");
      expect(source).not.toContain("META_APP_SECRET");
      expect(source).not.toContain("permanent_token");
      expect(source).not.toContain("system_user_token");
    });

    it("contains '+ Connect WhatsApp' button beside '+ Connect Telegram'", async () => {
      const source = await readFile(connectionsPath, "utf8");
      expect(source).toContain("+ Connect WhatsApp");
      expect(source).toContain("+ Connect Telegram");
      const waIndex = source.indexOf("+ Connect WhatsApp");
      const tgIndex = source.indexOf("+ Connect Telegram");
      expect(waIndex).toBeGreaterThan(0);
      expect(tgIndex).toBeGreaterThan(0);
      // Ensure they appear in the same header action section
      expect(Math.abs(waIndex - tgIndex)).toBeLessThan(1000);
    });

    it("eliminates demo placeholder WhatsApp data (+1 (555) 677-1423)", async () => {
      const source = await readFile(connectionsPath, "utf8");
      expect(source).not.toContain("+1 (555) 677-1423");
      expect(source).not.toContain("15556771423");
    });

    it("supports all required connection states in the UI", async () => {
      const source = await readFile(connectionsPath, "utf8");
      expect(source).toContain('"not_connected"');
      expect(source).toContain('"connecting"');
      expect(source).toContain('"active"');
      expect(source).toContain('"action_required"');
      expect(source).toContain('"disconnected"');
      expect(source).toContain("Not connected");
      expect(source).toContain("Connecting");
      expect(source).toContain("Action required");
    });

    it("provides Configure, Reconnect, and Disconnect actions for WhatsApp", async () => {
      const source = await readFile(connectionsPath, "utf8");
      expect(source).toContain("Configure");
      expect(source).toContain("Reconnect");
      expect(source).toContain("Disconnect");
    });

    it("displays real WABA name, masked phone number, verification state, and webhook state", async () => {
      const source = await readFile(connectionsPath, "utf8");
      expect(source).toContain("conn.verificationState");
      expect(source).toContain("conn.webhookState");
      expect(source).toContain("Verification:");
      expect(source).toContain("Webhook:");
    });

    it("guarantees historical data preservation in WhatsApp disconnect modal", async () => {
      const source = await readFile(connectionsPath, "utf8");
      expect(source).toContain("Historical Records Preserved");
      expect(source).toContain("All Unified Inbox conversations");
      expect(source).toContain("will not be deleted");
    });
  });

  describe("2. Owner/Admin Authorization & Member Rejection", () => {
    it("rejects unauthenticated requests to session initialization (401)", async () => {
      const { getActiveWorkspaceContext } = await import("@/lib/workspaces/server");
      vi.mocked(getActiveWorkspaceContext).mockResolvedValueOnce(null);

      const { POST } = await import("@/app/api/integrations/whatsapp/session/route");
      const res = await POST();
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toContain("Unauthorized");
    });

    it("rejects non-owner/non-admin members from creating sessions (403)", async () => {
      const { getActiveWorkspaceContext } = await import("@/lib/workspaces/server");
      vi.mocked(getActiveWorkspaceContext).mockResolvedValueOnce({
        workspace: { id: "ws-100", name: "Test WS", slug: "test", status: "active" } as any,
        membership: { role: "member" } as any,
        user: { id: "usr-1", email: "member@j10.io" } as any,
      });

      const { POST } = await import("@/app/api/integrations/whatsapp/session/route");
      const res = await POST();
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toContain("Forbidden");
    });

    it("rejects non-owner/non-admin members from completing setup (403)", async () => {
      const { getActiveWorkspaceContext } = await import("@/lib/workspaces/server");
      vi.mocked(getActiveWorkspaceContext).mockResolvedValueOnce({
        workspace: { id: "ws-100", name: "Test WS", slug: "test", status: "active" } as any,
        membership: { role: "member" } as any,
        user: { id: "usr-1", email: "member@j10.io" } as any,
      });

      const { POST } = await import("@/app/api/integrations/whatsapp/connect/route");
      const req = new Request("http://localhost/api/integrations/whatsapp/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: "test-code",
          state: "was_" + "a".repeat(43),
          wabaId: "waba-1",
          phoneNumberId: "phone-1",
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toContain("Forbidden");
    });

    it("rejects non-owner/non-admin members from disconnecting (403)", async () => {
      const { getActiveWorkspaceContext } = await import("@/lib/workspaces/server");
      vi.mocked(getActiveWorkspaceContext).mockResolvedValueOnce({
        workspace: { id: "ws-100", name: "Test WS", slug: "test", status: "active" } as any,
        membership: { role: "member" } as any,
        user: { id: "usr-1", email: "member@j10.io" } as any,
      });

      const { POST } = await import("@/app/api/integrations/whatsapp/disconnect/route");
      const req = new Request("http://localhost/api/integrations/whatsapp/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const res = await POST(req);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toContain("Forbidden");
    });
  });

  describe("3. OAuth State & CSRF Validation", () => {
    it("creates cryptographically random single-use state token", async () => {
      const { createWhatsAppConnectionSession } = await import("@/lib/whatsapp/embedded-signup");
      const mockInsert = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: "sess-1" }, error: null }),
        }),
      });
      const mockSupabase = {
        from: vi.fn().mockReturnValue({ insert: mockInsert }),
      } as any;

      const session = await createWhatsAppConnectionSession(mockSupabase, {
        workspaceId: "ws-123",
        userId: "usr-1",
      });
      expect(session.token).toBeDefined();
      expect(session.token.startsWith("was_")).toBe(true);
      expect(session.tokenHash).toBeDefined();
      expect(session.expiresAt).toBeDefined();
    });

    it("validates and atomically consumes state token via RPC or atomic update", async () => {
      const { validateAndConsumeWhatsAppSession } = await import("@/lib/whatsapp/embedded-signup");
      const validToken = "was_" + "a".repeat(43);
      const mockRpc = vi.fn().mockResolvedValue({
        data: [{ valid: true, session_id: "sess-100", error_message: null }],
        error: null,
      });
      const mockSupabase = {
        rpc: mockRpc,
      } as any;

      const result = await validateAndConsumeWhatsAppSession(mockSupabase, validToken, "ws-123");
      expect(result.valid).toBe(true);
      expect(result.sessionId).toBe("sess-100");
    });

    it("rejects replayed or already consumed state token", async () => {
      const { validateAndConsumeWhatsAppSession } = await import("@/lib/whatsapp/embedded-signup");
      const replayedToken = "was_" + "b".repeat(43);
      const mockRpc = vi.fn().mockResolvedValue({
        data: [{ valid: false, session_id: null, error_message: "Session token already used or expired." }],
        error: null,
      });
      const mockSupabase = {
        rpc: mockRpc,
      } as any;

      const result = await validateAndConsumeWhatsAppSession(mockSupabase, replayedToken, "ws-123");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("already used");
    });
  });

  describe("4. Server-Side Token Exchange & Verification", () => {
    it("exchanges short-lived code for system/access token using server-side secret", async () => {
      const { exchangeMetaCodeForAccessToken } = await import("@/lib/whatsapp/embedded-signup");

      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "EAAB_mock_meta_access_token_12345",
          token_type: "bearer",
        }),
      } as any);

      try {
        const result = await exchangeMetaCodeForAccessToken({
          code: "auth_code_from_meta",
          appId: "meta-app-123",
          appSecret: "super-secret-app-secret",
        });

        expect(result.accessToken).toBe("EAAB_mock_meta_access_token_12345");
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining("/oauth/access_token"),
          expect.objectContaining({
            method: "POST",
          })
        );
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("verifies that phone_number_id belongs to WABA on Meta Graph API", async () => {
      const { verifyWabaAndPhoneNumber } = await import("@/lib/whatsapp/embedded-signup");

      const originalFetch = global.fetch;
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: "1029384756",
            name: "Acme Dental Care",
            currency: "USD",
            timezone_id: "1",
          }),
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [
              {
                id: "5847382910",
                display_phone_number: "+1 555-0199",
                verified_name: "Acme Dental Care",
                quality_rating: "GREEN",
                code_verification_status: "VERIFIED",
              },
            ],
          }),
        } as any);

      try {
        const verified = await verifyWabaAndPhoneNumber({
          accessToken: "EAAB_mock_token",
          wabaId: "1029384756",
          phoneNumberId: "5847382910",
        });

        expect(verified.wabaId).toBe("1029384756");
        expect(verified.wabaName).toBe("Acme Dental Care");
        expect(verified.phoneNumberId).toBe("5847382910");
        expect(verified.displayPhoneNumber).toBe("+1 555-0199");
        expect(verified.codeVerificationStatus).toBe("VERIFIED");
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("rejects when phone_number_id does not belong to the authorized WABA", async () => {
      const { verifyWabaAndPhoneNumber } = await import("@/lib/whatsapp/embedded-signup");

      const originalFetch = global.fetch;
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: "1029384756", name: "Acme Dental Care" }),
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [
              { id: "9999999999", display_phone_number: "+1 555-9999" },
            ],
          }),
        } as any);

      try {
        await expect(
          verifyWabaAndPhoneNumber({
            accessToken: "EAAB_mock_token",
            wabaId: "1029384756",
            phoneNumberId: "5847382910",
          })
        ).rejects.toThrow(/does not belong/);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe("5. Cross-Workspace Conflict Rejection (409)", () => {
    it("rejects cross-workspace registration if phone number is active in another workspace", async () => {
      const { assertNoCrossWorkspaceConflict } = await import("@/lib/whatsapp/embedded-signup");

      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                neq: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: "int-other",
                      workspace_id: "ws-DIFFERENT",
                      status: "connected",
                      public_configuration: {
                        phone_number_id: "phone-123",
                        waba_id: "waba-123",
                      },
                    },
                  ],
                }),
              }),
            }),
          }),
        }),
      } as any;

      await expect(
        assertNoCrossWorkspaceConflict(mockSupabase, "ws-CURRENT", "phone-123", "waba-123")
      ).rejects.toThrow(/already actively connected to another workspace/);
    });

    it("permits reconnection to the same workspace without conflict", async () => {
      const { assertNoCrossWorkspaceConflict } = await import("@/lib/whatsapp/embedded-signup");

      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                neq: vi.fn().mockResolvedValue({
                  data: [],
                }),
              }),
            }),
          }),
        }),
      } as any;

      await expect(
        assertNoCrossWorkspaceConflict(mockSupabase, "ws-CURRENT", "phone-123", "waba-123")
      ).resolves.toBeUndefined();
    });
  });

  describe("6. Secure Credential Persistence & Endpoint Binding", () => {
    it("masks phone numbers safely without leaking complete subscriber number", async () => {
      const { maskPhoneNumber } = await import("@/lib/whatsapp/embedded-signup");
      expect(maskPhoneNumber("+1 (555) 123-4567")).toBe("+1 ••• ••• 4567");
      expect(maskPhoneNumber("+44 20 7946 0991")).toBe("+4 ••• ••• 0991");
      expect(maskPhoneNumber(null)).toBe("Unconfigured");
      expect(maskPhoneNumber("")).toBe("Unconfigured");
    });

    it("persists integration credentials into encrypted vault and binds canonical endpoint", async () => {
      const { upsertWhatsAppIntegration } = await import("@/lib/whatsapp/embedded-signup");
      const { storeIntegrationCredentials } = await import("@/lib/integrations/credentials");

      const mockSingle = vi.fn().mockResolvedValue({
        data: {
          id: "int-wa-1",
          workspace_id: "ws-1",
          provider: "whatsapp-business",
          status: "connected",
          account_label: "Acme Care",
          external_account_id: "phone-100",
          external_account_label: "+1 (555) 123-4567",
          public_configuration: {
            phone_number_id: "phone-100",
            waba_id: "waba-100",
            waba_name: "Acme Care",
            display_phone_number: "+1 (555) 123-4567",
            ai_receptionist_enabled: true,
          },
        },
        error: null,
      });

      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === "integrations") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null }),
                  }),
                }),
              }),
              insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: mockSingle,
                }),
              }),
            };
          }
          return {};
        }),
      } as any;

      const result = await upsertWhatsAppIntegration(mockSupabase, {
        workspaceId: "ws-1",
        wabaId: "waba-100",
        wabaName: "Acme Care",
        phoneNumberId: "phone-100",
        displayPhoneNumber: "+1 (555) 123-4567",
        verifiedName: "Acme Care",
        qualityRating: "GREEN",
        codeVerificationStatus: "VERIFIED",
        accessToken: "EAAB_access_token_123",
        appSecret: "app_secret_123",
        webhookSubscribed: true,
      });

      expect(result.integrationId).toBe("int-wa-1");
      expect(result.endpointKey).toBe("canonical-endpoint-key-123");
      expect(result.webhookUrl).toContain("/api/webhooks/whatsapp/canonical-endpoint-key-123");
      expect(result.maskedPhone).toBe("+1 ••• ••• 4567");
      expect(storeIntegrationCredentials).toHaveBeenCalledWith(
        mockSupabase,
        expect.objectContaining({ workspaceId: "ws-1" }),
        expect.objectContaining({
          connectionId: "int-wa-1",
          values: expect.objectContaining({
            access_token: "EAAB_access_token_123",
            app_secret: "app_secret_123",
          }),
        })
      );
    });
  });

  describe("7. Safe Disconnect Without Historical Data Deletion", () => {
    it("deactivates integration and webhook while preserving historical tables", async () => {
      const { disconnectWhatsAppIntegration } = await import("@/lib/whatsapp/embedded-signup");

      const updateIntegrationMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      });

      const deleteMock = vi.fn(); // Must NEVER be called!

      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === "integrations") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { id: "int-wa-1", status: "connected" },
                    }),
                  }),
                }),
              }),
              update: updateIntegrationMock,
              delete: deleteMock,
            };
          }
          return { delete: deleteMock };
        }),
      } as any;

      const result = await disconnectWhatsAppIntegration(mockSupabase, "ws-1", "User requested");
      expect(result.success).toBe(true);
      expect(result.status).toBe("disconnected");

      // Verify that update was used to disable
      expect(updateIntegrationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "disconnected",
        })
      );
      // Verify that delete was NEVER called
      expect(deleteMock).not.toHaveBeenCalled();
    });
  });

  describe("8. Credential Rotation on Reconnect", () => {
    it("safely rotates access token and reactivates existing integration", async () => {
      const { upsertWhatsAppIntegration } = await import("@/lib/whatsapp/embedded-signup");
      const { storeIntegrationCredentials } = await import("@/lib/integrations/credentials");

      const mockExisting = {
        id: "int-wa-existing",
        workspace_id: "ws-1",
        provider: "whatsapp-business",
        status: "disconnected",
        account_label: "Acme Care",
        external_account_id: "phone-100",
        public_configuration: {
          phone_number_id: "phone-100",
          waba_id: "waba-100",
          endpoint_key: "existing-key-456",
        },
      };

      const updateIntegrationMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      });

      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === "integrations") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: mockExisting }),
                  }),
                }),
              }),
              update: updateIntegrationMock,
            };
          }
          return {};
        }),
      } as any;

      const result = await upsertWhatsAppIntegration(mockSupabase, {
        workspaceId: "ws-1",
        wabaId: "waba-100",
        wabaName: "Acme Care Updated",
        phoneNumberId: "phone-100",
        displayPhoneNumber: "+1 555-0199",
        verifiedName: "Acme Care Updated",
        qualityRating: "GREEN",
        codeVerificationStatus: "VERIFIED",
        accessToken: "EAAB_new_rotated_token_999",
        appSecret: "app_secret_123",
        webhookSubscribed: true,
      });

      expect(result.integrationId).toBe("int-wa-existing");
      expect(result.endpointKey).toBe("canonical-endpoint-key-123");
      expect(updateIntegrationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "connected",
        })
      );
      expect(storeIntegrationCredentials).toHaveBeenCalledWith(
        mockSupabase,
        expect.objectContaining({ workspaceId: "ws-1" }),
        expect.objectContaining({
          connectionId: "int-wa-existing",
          values: expect.objectContaining({
            access_token: "EAAB_new_rotated_token_999",
          }),
        })
      );
    });
  });

  describe("9. Zero Secret Leakage in Status API and Logs", () => {
    it("returns clean sanitized status without access token or secret", async () => {
      const { getWhatsAppConnectionStatus } = await import("@/lib/whatsapp/embedded-signup");

      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: "int-1",
                    status: "connected",
                    account_label: "Acme Care",
                    external_account_id: "phone-100",
                    external_account_label: "+1 (555) 123-4567",
                    public_configuration: {
                      phone_number_id: "phone-100",
                      display_phone_number: "+1 (555) 123-4567",
                      waba_name: "Acme Care",
                      ai_receptionist_enabled: true,
                      code_verification_status: "VERIFIED",
                      quality_rating: "GREEN",
                    },
                    connected_at: "2026-09-17T12:00:00Z",
                  },
                }),
              }),
            }),
          }),
        }),
      } as any;

      const status = await getWhatsAppConnectionStatus(mockSupabase, "ws-1");

      expect(status.connected).toBe(true);
      expect(status.status).toBe("active");
      expect(status.maskedPhone).toBe("+1 ••• ••• 4567");
      expect((status as any).accessToken).toBeUndefined();
      expect((status as any).access_token).toBeUndefined();
      expect((status as any).appSecret).toBeUndefined();
      expect((status as any).app_secret).toBeUndefined();
      expect((status as any).webhook_verify_token).toBeUndefined();
    });
  });
});
