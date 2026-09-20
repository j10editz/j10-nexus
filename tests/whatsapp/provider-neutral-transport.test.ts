import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  D360_WEBHOOK_SECRET_HEADER,
  resolveWhatsAppTransport,
  whatsappTransportHeaders,
  whatsappTransportMessageEndpoint,
  whatsappTransportWebhookAuthMode,
} from "@/lib/integrations/providers/whatsapp/transport";
import { WHATSAPP_RUNTIME_ADAPTER } from "@/lib/integrations/providers/whatsapp/adapter";

const connection = (configuration: Record<string, string | boolean | null>) => ({
  id: "integration-360",
  workspaceId: "workspace-a",
  providerId: "whatsapp-business" as const,
  name: "Sandbox",
  status: "connected" as const,
  environment: "development" as const,
  credentialReference: "vault-ref",
  externalAccountId: null,
  externalAccountLabel: null,
  grantedScopes: [],
  enabledCapabilities: ["whatsapp.message.send"],
  publicConfiguration: configuration,
  lastConnectedAt: null,
  lastHealthCheckAt: null,
  lastErrorCode: null,
  lastErrorMessage: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

afterEach(() => vi.restoreAllMocks());

describe("provider-neutral WhatsApp transport", () => {
  it("keeps existing workspace bindings on Meta Cloud unless an owner opts in", () => {
    expect(resolveWhatsAppTransport({})).toBe("meta_cloud");
    expect(resolveWhatsAppTransport({ transport: "360dialog" })).toBe("360dialog");
  });

  it("uses the official 360dialog sandbox endpoint and never serializes its API key", () => {
    expect(whatsappTransportMessageEndpoint({ transport: "360dialog", mode: "sandbox", phoneNumberId: "ignored", graphApiVersion: "v26.0" }))
      .toBe("https://waba-sandbox.360dialog.io/v1/messages");
    expect(whatsappTransportHeaders({ transport: "360dialog", credential: "secret" }))
      .toEqual({ "D360-API-KEY": "secret" });
  });

  it("requires native signatures for Meta and a per-workspace secret header for 360dialog", () => {
    expect(whatsappTransportWebhookAuthMode("meta_cloud")).toBe("meta_hmac");
    expect(whatsappTransportWebhookAuthMode("360dialog")).toBe("static_header");
    expect(D360_WEBHOOK_SECRET_HEADER).toBe("x-j10-webhook-secret");
  });

  it("rejects spoofed 360dialog deliveries before payload parsing", () => {
    const route = readFileSync(
      resolve(process.cwd(), "app/api/webhooks/whatsapp/[endpointKey]/route.ts"),
      "utf8",
    );
    expect(route).toContain("D360_WEBHOOK_SECRET_HEADER");
    expect(route).toContain("safeStringEqual(staticHeader, appSecret)");
    expect(route).toContain("WEBHOOK_SIGNATURE_INVALID");
  });

  it("rejects unrecognized transports before any provider request", () => {
    expect(() => resolveWhatsAppTransport({ transport: "unofficial-qr" })).toThrow("unsupported");
  });

  it("makes Meta identifiers conditional so a 360dialog sandbox connection does not fake them", () => {
    const api = readFileSync(
      resolve(process.cwd(), "lib/integrations/api.ts"),
      "utf8",
    );
    expect(api).toContain('transport !== "meta_cloud" && transport !== "360dialog"');
    expect(api).toContain('if (transport === "360dialog")');
    expect(api).toContain("Do not force Meta identifiers");
  });

  it("uses the sandbox credential only in the provider header and returns safe metadata", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: "wamid.safe" }] }), { status: 201 }),
    );
    const result = await WHATSAPP_RUNTIME_ADAPTER.executeAction!({
      requestId: "request-1",
      correlationId: "correlation-1",
      userId: "owner-a",
      connection: connection({ transport: "360dialog" }),
      environment: "development",
      signal: new AbortController().signal,
      credentials: { read: async () => ({ api_key: "test-api-key" }) },
      capabilityId: "whatsapp.message.send",
      mode: "sandbox",
      idempotencyKey: "idempotency-1",
      input: { to: "15551234567", message: "safe test" },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://waba-sandbox.360dialog.io/v1/messages",
      expect.objectContaining({ headers: expect.objectContaining({ "D360-API-KEY": "test-api-key" }) }),
    );
    expect(JSON.stringify(result.metadata)).not.toContain("test-api-key");
    expect(result.metadata).toMatchObject({ transport: "360dialog", messageId: "wamid.safe" });
  });

  it("fails closed for a revoked workspace credential before any provider call", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await expect(WHATSAPP_RUNTIME_ADAPTER.executeAction!({
      requestId: "request-2", correlationId: "correlation-2", userId: "owner-a",
      connection: connection({ transport: "360dialog", credential_lifecycle_state: "revoked" }),
      environment: "development", signal: new AbortController().signal,
      credentials: { read: async () => ({ api_key: "never-used" }) },
      capabilityId: "whatsapp.message.send", mode: "sandbox", idempotencyKey: "idempotency-2",
      input: { to: "15551234567", message: "safe test" },
    })).rejects.toMatchObject({ code: "WHATSAPP_CREDENTIAL_RECONNECT_REQUIRED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
