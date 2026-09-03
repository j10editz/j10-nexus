import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("WhatsApp AI Agent Studio", () => {
  it("stores non-secret agent configuration on the owned integration", () => {
    const route = source("app/api/integrations/[id]/whatsapp/agent/route.ts");
    expect(route).toContain("updateIntegrationConnectionConfiguration");
    expect(route).toContain("WHATSAPP_AGENT_CONFIG_KEY");
    expect(route).toContain("user!.id");
  });

  it("keeps autonomous delivery locked", () => {
    const route = source("app/api/integrations/[id]/whatsapp/agent/route.ts");
    const studio = source("components/whatsapp/WhatsAppAgentStudio.tsx");
    expect(route).toContain('body.mode === "automatic"');
    expect(studio).toContain("Locked pending production safety approval");
  });

  it("simulates without sending a WhatsApp action", () => {
    const simulator = source("app/api/integrations/[id]/whatsapp/agent/simulate/route.ts");
    expect(simulator).toContain("sent: false");
    expect(simulator).not.toContain("executeIntegrationAction");
  });

  it("grounds inbox suggestions in the saved agent profile", () => {
    const suggestions = source("app/api/integrations/[id]/whatsapp/replies/suggest/route.ts");
    expect(suggestions).toContain("getWhatsAppAgentConfig");
    expect(suggestions).toContain("buildWhatsAppAgentInstructions");
  });
});
