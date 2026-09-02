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

describe("Controlled WhatsApp delivery", () => {
  it("rejects email addresses and duplicate Meta identifiers", () => {
    const api = source(
      "lib/integrations/api.ts",
    );

    expect(api).toContain(
      "INVALID_WHATSAPP_BUSINESS_ACCOUNT_ID",
    );
    expect(api).toContain(
      "not an email address or App ID",
    );
    expect(api).toContain(
      "DUPLICATE_WHATSAPP_IDENTIFIERS",
    );
  });

  it("corrects public identifiers without deleting encrypted credentials", () => {
    const route = source(
      "app/api/integrations/[id]/route.ts",
    );
    const database = source(
      "lib/integrations/database.ts",
    );

    expect(route).toContain(
      "export async function PUT",
    );
    expect(route).toContain(
      "updateIntegrationConnectionConfiguration",
    );
    expect(database).toContain(
      "public_configuration",
    );
    expect(database).not.toContain(
      "deleteIntegrationCredentials",
    );
  });

  it("enables the full provider capability set during setup and correction", () => {
    const page = source(
      "app/dashboard/settings/integrations/page.tsx",
    );

    expect(page).toContain(
      "publicConfigurationChanged",
    );
    expect(page).toContain(
      'method: "PUT"',
    );
    expect(page).toContain(
      "integration.capabilities.map",
    );
    expect(page).toContain(
      "inputMode={",
    );
    expect(page).toContain(
      '? "numeric"',
    );
  });

  it("prepares only Meta's hello_world template with an expiring signed approval", () => {
    const route = source(
      "app/api/integrations/[id]/actions/approval/route.ts",
    );
    const approval = source(
      "lib/integrations/operator-approval.ts",
    );

    expect(route).toContain(
      'templateName:\n          "hello_world"',
    );
    expect(route).toContain(
      'languageCode:\n          "en_US"',
    );
    expect(approval).toContain(
      "createHmac",
    );
    expect(approval).toContain(
      "APPROVAL_TTL_MS",
    );
    expect(approval).toContain(
      '"whatsapp_test_delivery"',
    );
  });

  it("binds explicit approval to the exact idempotent external action", () => {
    const actionRoute = source(
      "app/api/integrations/[id]/actions/route.ts",
    );

    expect(actionRoute).toContain(
      "verifyIntegrationOperatorApproval",
    );
    expect(actionRoute).toContain(
      "approvedDevelopmentWhatsAppTest",
    );
    expect(actionRoute).toContain(
      'input.templateName ===\n        "hello_world"',
    );
    expect(actionRoute).toContain(
      "claimIntegrationActionExecution",
    );
  });

  it("requires prepare then approve before one live test delivery", () => {
    const page = source(
      "app/dashboard/whatsapp/page.tsx",
    );

    expect(page).toContain(
      "CONTROLLED WHATSAPP DELIVERY",
    );
    expect(page).toContain(
      "prepareTestDelivery",
    );
    expect(page).toContain(
      "confirmTestDelivery",
    );
    expect(page).toContain(
      "Approve and send once",
    );
  });

  it("merges a rotated access token with existing encrypted credentials", () => {
    const route = source(
      "app/api/integrations/[id]/credentials/route.ts",
    );
    const page = source(
      "app/dashboard/settings/integrations/page.tsx",
    );

    expect(route).toContain(
      "getIntegrationCredentials",
    );
    expect(route).toContain(
      "mergedValues",
    );
    expect(route).toContain(
      "...values",
    );
    expect(page).toContain(
      "isCredentialSetupRequired",
    );
    expect(page).toContain(
      ": undefined",
    );
  });

  it("maps the canonical integration response into WhatsApp Operations", () => {
    const page = source(
      "app/dashboard/whatsapp/page.tsx",
    );

    expect(page).toMatch(
      /integration\?\.status\s*===\s*"connected"/,
    );
    expect(page).toContain(
      "integration?.metadata",
    );
    expect(page).toContain(
      "accountLabel",
    );
    expect(page).not.toMatch(
      /integration\?\.status\s*===\s*"Connected"/,
    );
  });
});
