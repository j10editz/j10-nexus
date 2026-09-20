import { describe, expect, it, vi } from "vitest";

import { getIntegrationOAuthProviderDefinition } from "@/lib/integrations/oauth/provider-registry";
import { GMAIL_RUNTIME_ADAPTER } from "@/lib/integrations/providers/gmail/adapter";
import { getIntegrationProvider } from "@/lib/integrations/registry";
import type { IntegrationRuntimeActionInvocation } from "@/types/integration-runtime";

const GMAIL_MODIFY_SCOPE =
  "https://www.googleapis.com/auth/gmail.modify";
const GMAIL_SEND_SCOPE =
  "https://www.googleapis.com/auth/gmail.send";

function invocation(
  capabilityId: string,
  input: Readonly<Record<string, unknown>>,
  mode: "simulate" | "live" = "simulate",
): IntegrationRuntimeActionInvocation {
  return {
    requestId: "request-a",
    correlationId: "correlation-a",
    userId: "user-a",
    connection: {
      id: "gmail-workspace-a",
      workspaceId: "workspace-a",
      userId: "user-a",
      providerId: "gmail",
      name: "Gmail",
      status: "connected",
      environment: "production",
      credentialReference: "credential-a",
      externalAccountId: "account-a",
      externalAccountLabel: null,
      grantedScopes: [GMAIL_MODIFY_SCOPE, GMAIL_SEND_SCOPE],
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
    credentials: {
      read: async () => ({ access_token: "test-token" }),
    },
    capabilityId,
    mode,
    idempotencyKey: "gmail-action-key-a",
    input,
  };
}

describe("Gmail production integration contract", () => {
  it("publishes only the scopes required by its declared Gmail capabilities", () => {
    const provider = getIntegrationProvider("gmail");
    const oauth = getIntegrationOAuthProviderDefinition("gmail");

    expect(provider.availability).toBe("available");
    expect(provider.auth.requiredScopes).toEqual([
      GMAIL_MODIFY_SCOPE,
      GMAIL_SEND_SCOPE,
    ]);
    expect(oauth?.scopes).toEqual(provider.auth.requiredScopes);
    expect(oauth?.authorizationParameters).toEqual(expect.objectContaining({
      access_type: "offline",
      prompt: "consent",
    }));
    expect(oauth?.scopes).not.toContain("https://mail.google.com/");
  });

  it("declares token lifecycle support and route-level idempotency", () => {
    const capabilities = GMAIL_RUNTIME_ADAPTER.manifest.capabilities;

    expect(GMAIL_RUNTIME_ADAPTER.manifest.supportsTokenRefresh).toBe(true);
    expect(GMAIL_RUNTIME_ADAPTER.manifest.supportsTokenRevocation).toBe(true);
    expect(capabilities.find((item) => item.capabilityId === "gmail.message.send")?.supportsIdempotency).toBe(true);
    expect(capabilities.find((item) => item.capabilityId === "gmail.message.reply")?.supportsIdempotency).toBe(true);
  });

  it("redacts email content from simulated action metadata", async () => {
    const result = await GMAIL_RUNTIME_ADAPTER.executeAction!(
      invocation("gmail.message.send", {
        to: ["customer@example.test"],
        subject: "Private subject",
        body: "Private body",
      }),
    );

    expect(result.metadata).toEqual(expect.objectContaining({
      providerId: "gmail",
      providerCall: false,
      externalSideEffect: false,
      inputKeys: ["body", "subject", "to"],
    }));
    expect(JSON.stringify(result.metadata)).not.toContain("Private");
    expect(JSON.stringify(result.metadata)).not.toContain("customer@example.test");
  });

  it("returns Gmail message and thread identifiers without returning email content", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        id: "provider-message-a",
        threadId: "provider-thread-a",
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    try {
      const result = await GMAIL_RUNTIME_ADAPTER.executeAction!(
        invocation("gmail.message.send", {
          to: ["customer@example.test"],
          subject: "Private subject",
          body: "Private body",
        }, "live"),
      );

      expect(result.metadata).toEqual(expect.objectContaining({
        providerMessageId: "provider-message-a",
        threadId: "provider-thread-a",
        recipientCount: 1,
      }));
      expect(JSON.stringify(result.metadata)).not.toContain("Private");
      expect(JSON.stringify(result.metadata)).not.toContain("customer@example.test");
    }
    finally {
      fetchMock.mockRestore();
    }
  });

  it("replies in the provider thread without exposing the source email metadata", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        threadId: "provider-thread-a",
        payload: {
          headers: [
            { name: "From", value: "customer@example.test" },
            { name: "Subject", value: "Private source subject" },
            { name: "Message-ID", value: "<source-message@example.test>" },
          ],
        },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "provider-reply-a",
        threadId: "provider-thread-a",
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));

    try {
      const result = await GMAIL_RUNTIME_ADAPTER.executeAction!(
        invocation("gmail.message.reply", {
          messageId: "source-message-a",
          body: "Private reply body",
        }, "live"),
      );

      expect(result.metadata).toEqual(expect.objectContaining({
        providerMessageId: "provider-reply-a",
        threadId: "provider-thread-a",
      }));
      expect(JSON.stringify(result.metadata)).not.toContain("Private");
      expect(JSON.stringify(result.metadata)).not.toContain("customer@example.test");
    }
    finally {
      fetchMock.mockRestore();
    }
  });
});
