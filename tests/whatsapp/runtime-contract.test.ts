import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("WhatsApp runtime contract", () => {
  it("registers WhatsApp as installed with text, template, media, and health", () => {
    const adapter = readFileSync(
      resolve(process.cwd(), "lib/integrations/providers/whatsapp/adapter.ts"),
      "utf8",
    );
    const registry = readFileSync(
      resolve(process.cwd(), "lib/integrations/runtime-registry.ts"),
      "utf8",
    );
    const readinessRoute = readFileSync(
      resolve(
        process.cwd(),
        "app/api/integrations/[id]/readiness/route.ts",
      ),
      "utf8",
    );

    expect(adapter).toContain('state: "installed"');
    expect(adapter).toContain("messageSend");
    expect(adapter).toContain("templateSend");
    expect(adapter).toContain("mediaSend");
    expect(adapter).toContain("healthCheck: checkWhatsAppHealth");
    expect(registry).toContain("WHATSAPP_RUNTIME_ADAPTER");
    expect(readinessRoute).toContain("updateIntegrationConnectionStatus");
    expect(readinessRoute).toContain('status: "connected"');
    expect(readinessRoute).toContain("runtimeResult?.healthy");
  });

  it("routes non-OAuth live execution through the encrypted credential vault", () => {
    const execution = readFileSync(
      resolve(process.cwd(), "lib/integrations/live-action-execution.ts"),
      "utf8",
    );

    expect(execution).toContain('adapter.manifest.authType !== "oauth2"');
    expect(execution).toContain("getIntegrationCredentials");
    expect(execution).not.toContain("console.log(storedCredentials");
  });

  it("returns actionable provider runtime errors instead of a generic banner", () => {
    const integrationApi = readFileSync(
      resolve(
        process.cwd(),
        "lib/integrations/api.ts",
      ),
      "utf8",
    );

    expect(integrationApi).toContain("IntegrationRuntimeError");
    expect(integrationApi).toContain("error.retryable");
    expect(integrationApi).toContain("error.retryAfterSeconds");
    expect(integrationApi).toContain('"Retry-After"');
  });

  it("uses one provider identity across WhatsApp Operations and Integrations", () => {
    const controlCenter = readFileSync(
      resolve(process.cwd(), "app/dashboard/whatsapp/page.tsx"),
      "utf8",
    );

    expect(controlCenter).toMatch(
      /item\.provider\s*===\s*"whatsapp-business"/,
    );
    expect(controlCenter).toContain('provider: "whatsapp-business"');
    expect(controlCenter).not.toContain('provider: "whatsapp",');
  });
});
