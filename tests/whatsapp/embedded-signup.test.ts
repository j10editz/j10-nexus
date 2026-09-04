import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const clientPath = "components/whatsapp/WhatsAppEmbeddedSignup.tsx";
const routePath = "app/api/integrations/[id]/whatsapp/embedded-signup/route.ts";

describe("WhatsApp Embedded Signup", () => {
  it("uses Meta's official WhatsApp Business App onboarding session", async () => {
    const source = await readFile(clientPath, "utf8");
    expect(source).toContain('featureType: "whatsapp_business_app_onboarding"');
    expect(source).toContain('sessionInfoVersion: "3"');
    expect(source).toContain('response_type: "code"');
  });

  it("keeps the app secret and authorization exchange on the server", async () => {
    const [client, route] = await Promise.all([readFile(clientPath, "utf8"), readFile(routePath, "utf8")]);
    expect(client).not.toContain("META_WHATSAPP_APP_SECRET");
    expect(route).toContain("META_WHATSAPP_APP_SECRET");
    expect(route).toContain("/oauth/access_token");
  });

  it("verifies WABA ownership before encrypted credential storage", async () => {
    const source = await readFile(routePath, "utf8");
    expect(source).toContain("/phone_numbers?fields=");
    expect(source.indexOf("const phone =")).toBeLessThan(source.lastIndexOf("storeIntegrationCredentials"));
    expect(source).toContain("getIntegrationCredentials");
  });
});
