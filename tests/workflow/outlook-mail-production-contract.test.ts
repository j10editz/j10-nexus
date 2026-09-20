import { describe, expect, it, vi } from "vitest";

import {
  assertIntegrationOAuthState,
  createIntegrationOAuthTransaction,
} from "@/lib/integrations/oauth/state";
import { getIntegrationOAuthProviderDefinition } from "@/lib/integrations/oauth/provider-registry";
import { OUTLOOK_MAIL_RUNTIME_ADAPTER } from "@/lib/integrations/providers/outlook-mail/adapter";
import { getIntegrationProvider } from "@/lib/integrations/registry";
import type { IntegrationRuntimeActionInvocation } from "@/types/integration-runtime";

const MAIL_READ_WRITE = "https://graph.microsoft.com/Mail.ReadWrite";
const MAIL_SEND = "https://graph.microsoft.com/Mail.Send";

function invocation(
  capabilityId: string,
  input: Readonly<Record<string, unknown>>,
  mode: "simulate" | "live" = "simulate",
  workspaceId = "workspace-a",
): IntegrationRuntimeActionInvocation {
  return {
    requestId: "request-a",
    correlationId: "correlation-a",
    userId: "user-a",
    connection: {
      id: `outlook-${workspaceId}`,
      workspaceId,
      userId: "user-a",
      providerId: "outlook-mail",
      name: "Outlook Mail",
      status: "connected",
      environment: "production",
      credentialReference: "credential-a",
      externalAccountId: "microsoft-account-a",
      externalAccountLabel: null,
      grantedScopes: [MAIL_READ_WRITE, MAIL_SEND, "offline_access"],
      enabledCapabilities: [capabilityId],
      publicConfiguration: {},
      lastConnectedAt: null,
      lastHealthCheckAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    environment: "production",
    signal: new AbortController().signal,
    credentials: { read: async () => ({ access_token: "test-token" }) },
    capabilityId,
    mode,
    idempotencyKey: "outlook-idempotency-key-a",
    input,
  };
}

describe("Outlook Mail production integration contract", () => {
  it("uses only delegated Graph permissions needed to draft, send, reply, and refresh", () => {
    const provider = getIntegrationProvider("outlook-mail");
    const oauth = getIntegrationOAuthProviderDefinition("outlook-mail");

    expect(provider.availability).toBe("available");
    expect(provider.auth.requiredScopes).toEqual([MAIL_READ_WRITE, MAIL_SEND, "offline_access"]);
    expect(oauth?.scopes).toEqual(provider.auth.requiredScopes);
    expect(oauth?.authorizationEndpoint).toBe("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
    expect(oauth?.authorizationParameters).toEqual({ prompt: "select_account" });
    expect(oauth?.scopes).not.toContain("https://graph.microsoft.com/.default");
  });

  it("rejects a mismatched OAuth state before a Microsoft authorization code can be used", () => {
    const transaction = createIntegrationOAuthTransaction({
      userId: "11111111-1111-4111-8111-111111111111",
      connectionId: "22222222-2222-4222-8222-222222222222",
      providerId: "outlook-mail",
      state: "a".repeat(43),
      codeVerifier: "b".repeat(43),
    });

    expect(() => assertIntegrationOAuthState("c".repeat(43), transaction)).toThrow("did not match");
  });

  it("declares generic route idempotency and no provider revocation shortcut", () => {
    const capabilities = OUTLOOK_MAIL_RUNTIME_ADAPTER.manifest.capabilities;
    expect(capabilities.every((capability) => capability.supportsIdempotency)).toBe(true);
    expect(OUTLOOK_MAIL_RUNTIME_ADAPTER.manifest.supportsTokenRefresh).toBe(true);
    expect(OUTLOOK_MAIL_RUNTIME_ADAPTER.manifest.supportsTokenRevocation).toBe(false);
  });

  it("fails closed when token refresh has no vault refresh token", async () => {
    const action = invocation(
      "outlook-mail.message.send",
      { to: "customer@example.test", subject: "Subject", body: "Body" },
    );

    await expect(OUTLOOK_MAIL_RUNTIME_ADAPTER.refreshAuthorization!({
      ...action,
      grantedScopes: action.connection.grantedScopes,
      credentials: { read: async () => ({}) },
    })).rejects.toMatchObject({
      code: "MICROSOFT_OAUTH_REFRESH_TOKEN_MISSING",
      status: 401,
    });
  });

  it("keeps tenant context and sensitive content out of simulated action metadata", async () => {
    const result = await OUTLOOK_MAIL_RUNTIME_ADAPTER.executeAction!(invocation(
      "outlook-mail.message.send",
      { to: ["customer@example.test"], subject: "Private subject", body: "Private body" },
      "simulate",
      "workspace-b",
    ));

    expect(result.metadata).toEqual(expect.objectContaining({
      providerId: "outlook-mail", providerCall: false, externalSideEffect: false,
      inputKeys: ["body", "subject", "to"],
    }));
    expect(JSON.stringify(result.metadata)).not.toContain("workspace-b");
    expect(JSON.stringify(result.metadata)).not.toContain("Private");
    expect(JSON.stringify(result.metadata)).not.toContain("customer@example.test");
  });

  it("sends once through a mocked Graph draft and returns only provider identifiers", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "message-a", conversationId: "conversation-a" }), { status: 201 }))
      .mockResolvedValueOnce(new Response("", { status: 202 }));

    try {
      const result = await OUTLOOK_MAIL_RUNTIME_ADAPTER.executeAction!(invocation(
        "outlook-mail.message.send",
        { to: ["customer@example.test"], subject: "Private subject", body: "Private body" },
        "live",
      ));
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(result.metadata).toEqual(expect.objectContaining({
        providerMessageId: "message-a", conversationId: "conversation-a", status: "sent",
      }));
      expect(JSON.stringify(result.metadata)).not.toContain("Private");
      expect(JSON.stringify(result.metadata)).not.toContain("customer@example.test");
    }
    finally { fetchMock.mockRestore(); }
  });

  it("replies through a mocked Graph conversation without reading mailbox content", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "reply-a", conversationId: "conversation-a" }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "reply-a" }), { status: 200 }))
      .mockResolvedValueOnce(new Response("", { status: 202 }));

    try {
      const result = await OUTLOOK_MAIL_RUNTIME_ADAPTER.executeAction!(invocation(
        "outlook-mail.message.reply",
        { messageId: "source-message-a", body: "Private reply" },
        "live",
      ));
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(result.metadata).toEqual(expect.objectContaining({
        providerMessageId: "reply-a", conversationId: "conversation-a", status: "sent",
      }));
      expect(JSON.stringify(result.metadata)).not.toContain("Private");
      expect(JSON.stringify(result.metadata)).not.toContain("source-message-a");
    }
    finally { fetchMock.mockRestore(); }
  });

  it("fails closed when Microsoft reports revoked consent", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: { code: "InvalidAuthenticationToken" } }), { status: 401 }));
    try {
      await expect(OUTLOOK_MAIL_RUNTIME_ADAPTER.healthCheck!(invocation(
        "outlook-mail.message.send", { to: "customer@example.test", subject: "Subject", body: "Body" }, "simulate",
      ))).rejects.toMatchObject({ code: "OUTLOOK_MAIL_AUTHENTICATION_FAILED", status: 401 });
    }
    finally { fetchMock.mockRestore(); }
  });
});
