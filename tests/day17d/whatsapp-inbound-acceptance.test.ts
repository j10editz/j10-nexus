import {
  readFileSync,
} from "node:fs";
import {
  resolve,
} from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

function source(path: string) {
  return readFileSync(
    resolve(process.cwd(), path),
    "utf8",
  );
}

describe("Day 17D inbound WhatsApp acceptance", () => {
  it("keeps Meta challenge verification on the stable WhatsApp alias", () => {
    const route = source(
      "app/api/webhooks/whatsapp/[endpointKey]/route.ts",
    );

    expect(route).toContain(
      '?.trim() || "meta"',
    );
    expect(route).toContain(
      'url.searchParams.get("hub.mode")',
    );
    expect(route).toContain(
      "META_WHATSAPP_VERIFY_TOKEN",
    );
  });

  it("routes real deliveries through the verified generic webhook pipeline", () => {
    const route = source(
      "app/api/webhooks/whatsapp/[endpointKey]/route.ts",
    );

    expect(route).toContain(
      "POST as processIntegrationWebhook",
    );
    expect(route).toContain(
      "return processIntegrationWebhook",
    );
    expect(route).toContain(
      "resolvePipelineEndpointKey",
    );
    expect(route).toContain(
      '"integration_id",\n        integrationId',
    );
    expect(route).toContain(
      '"user_id",\n        userId',
    );
    expect(route.indexOf("await loadWhatsAppConnection()"))
      .toBeLessThan(
        route.indexOf("await findActivePipelineEndpointKey("),
      );
  });

  it("normalizes inbound Meta messages into the canonical workflow event", () => {
    const adapter = source(
      "lib/integrations/external-trigger-adapter.ts",
    );

    expect(adapter).toContain(
      'capabilityId: "whatsapp.message.received"',
    );
    expect(adapter).toContain(
      '"whatsapp_contact"',
    );
    expect(adapter).toContain(
      "message.from ?? contact?.wa_id",
    );
    expect(adapter).toContain(
      "wrappedChange ?? sampleChange",
    );

    const verification = source(
      "lib/integrations/webhooks/verification.ts",
    );

    expect(verification).toContain(
      "wrappedChange ?? sampleChange",
    );
  });

  it("dispatches the normalized event through the automation engine", () => {
    const route = source(
      "app/api/webhooks/integrations/[endpointKey]/route.ts",
    );
    const bridge = source(
      "lib/integrations/automation-trigger-bridge.ts",
    );

    expect(route).toContain(
      "dispatchIntegrationAutomationEvent",
    );
    expect(bridge).toContain(
      "dispatchAutomationEvent",
    );
    expect(bridge).toContain(
      "INTEGRATION_AUTOMATION_TRIGGER_TYPE",
    );
  });

  it("exposes authenticated receipt proof without returning message text", () => {
    const route = source(
      "app/api/integrations/[id]/whatsapp/inbound-status/route.ts",
    );

    expect(route).toContain(
      "getAuthenticatedIntegrationUser",
    );
    expect(route).toContain(
      '"whatsapp.message.received"',
    );
    expect(route).toContain(
      "maskSender",
    );
    expect(route).not.toContain(
      "message.text",
    );
  });

  it("reports signature, processing, and workflow-dispatch outcomes", () => {
    const route = source(
      "app/api/integrations/[id]/whatsapp/inbound-status/route.ts",
    );

    expect(route).toContain(
      "signatureStatus",
    );
    expect(route).toContain(
      "processingStatus",
    );
    expect(route).toContain(
      "matchedAutomations",
    );
    expect(route).toContain(
      "executedAutomations",
    );
  });

  it("provides one controlled listening flow and never auto-replies", () => {
    const page = source(
      "app/dashboard/whatsapp/page.tsx",
    );

    expect(page).toContain(
      "INBOUND MESSAGE VERIFICATION",
    );
    expect(page).toContain(
      "Start listening",
    );
    expect(page).toContain(
      "Send to server v26.0",
    );
    expect(page).toContain(
      "automatic",
    );
    expect(page).toContain(
      "j10.whatsapp.inbound-listening-started-at",
    );
    expect(page).toContain(
      "inboundStatus?.latestInbound ?? null",
    );
    expect(page).not.toContain(
      "Date.parse(\n      inboundStatus.latestInbound.receivedAt",
    );
  });
});
