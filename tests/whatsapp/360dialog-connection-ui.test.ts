import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  Dialog360WebhookRegistrationError,
  register360DialogWebhook,
} from "@/lib/whatsapp/360dialog-connection";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("360dialog Connections UI", () => {
  it("uses a server-generated secret only for authenticated registration and verifies a readback", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        url: "https://preview.example/api/webhooks/whatsapp/endpoint-a",
        headers: { "x-j10-webhook-secret": "server-generated-secret" },
      }), { status: 200 }));

    await expect(register360DialogWebhook({
      apiKey: "customer-supplied-key",
      webhookSecret: "server-generated-secret",
      callbackUrl: "https://preview.example/api/webhooks/whatsapp/endpoint-a",
      mode: "sandbox",
      fetchImpl,
    })).resolves.toBeUndefined();

    expect(fetchImpl).toHaveBeenNthCalledWith(1,
      "https://waba-sandbox.360dialog.io/v1/configs/webhook",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "D360-API-KEY": "customer-supplied-key" }),
      }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(2,
      "https://waba-sandbox.360dialog.io/v1/configs/webhook",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("fails closed if 360dialog does not verify the registered callback", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ url: "https://wrong.example/webhook" }), { status: 200 }));

    await expect(register360DialogWebhook({
      apiKey: "key",
      webhookSecret: "secret",
      callbackUrl: "https://preview.example/api/webhooks/whatsapp/endpoint-a",
      mode: "sandbox",
      fetchImpl,
    })).rejects.toBeInstanceOf(Dialog360WebhookRegistrationError);
  });

  it("keeps the API key ephemeral and exposes no browser secret storage or reveal control", () => {
    const component = source("components/whatsapp/WhatsAppConnectionChoice.tsx");
    expect(component).toContain('type="password"');
    expect(component).toContain('value={apiKey}');
    expect(component).toContain('setApiKey("");');
    expect(component).toContain('const submittedApiKey = apiKey');
    expect(component).toContain('fetch("/api/integrations/whatsapp/360dialog/connect"');
    expect(component).not.toMatch(/localStorage|sessionStorage|document\.cookie|console\./);
    expect(component).toContain("submissionInFlight");
  });

  it("enforces owner/admin access, duplicate protection, and cleanup on a failed registration", () => {
    const route = source("app/api/integrations/whatsapp/360dialog/connect/route.ts");
    expect(route).toContain("['owner', 'admin'].includes(context.membership.role)");
    expect(route).toContain("createIntegrationConnection");
    expect(route).toContain("storeIntegrationCredentials");
    expect(route).toContain("generate360DialogWebhookSecret");
    expect(route).toContain("createOrEnableIntegrationWebhookEndpoint");
    expect(route).toContain("register360DialogWebhook");
    expect(route).toContain("configuredWebhookOrigin");
    expect(route).toContain('url.protocol === "https:"');
    expect(route).toContain("disableIntegrationWebhookEndpoint");
    expect(route).toContain("deleteIntegrationCredentials");
    expect(route).toContain('status: "error"');
    expect(route).not.toContain("console.");
  });

  it("preserves the Meta Embedded Signup component while adding an explicit transport choice", () => {
    const component = source("components/whatsapp/WhatsAppConnectionChoice.tsx");
    const dashboard = source("app/dashboard/connections/page.tsx");
    const meta = source("components/whatsapp/WhatsAppEmbeddedSignup.tsx");

    expect(component).toContain("Meta Cloud / Embedded Signup");
    expect(component).toContain("<WhatsAppEmbeddedSignup");
    expect(component).toContain("Sandbox");
    expect(component).toContain("Production");
    expect(component).toContain("Ready for test");
    expect(dashboard).toContain("WhatsAppConnectionChoice");
    expect(meta).toContain('fetch("/api/integrations/whatsapp/connect"');
  });
});
