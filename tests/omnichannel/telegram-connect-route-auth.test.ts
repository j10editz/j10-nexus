import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActiveWorkspaceContext: vi.fn(),
  registerExistingTelegramIntegration: vi.fn(),
  createTelegramBindingToken: vi.fn(),
  mockClient: { from: vi.fn() },
}));

vi.mock("@/lib/workspaces/server", () => ({ getActiveWorkspaceContext: mocks.getActiveWorkspaceContext }));
vi.mock("@/lib/auth", () => ({
  createServerSupabaseClient: () => mocks.mockClient,
  createAdminSupabaseClient: () => mocks.mockClient,
}));
vi.mock("@/lib/integrations/credentials", () => ({ storeIntegrationCredentials: vi.fn() }));
vi.mock("@/lib/telegram/binding-token", () => ({ createTelegramBindingToken: mocks.createTelegramBindingToken }));
vi.mock("@/lib/telegram/registration-transaction", () => ({
  registerExistingTelegramIntegration: mocks.registerExistingTelegramIntegration,
  TelegramRegistrationError: class TelegramRegistrationError extends Error {},
}));

import { POST } from "@/app/api/integrations/telegram/connect/route";

describe("Telegram connection authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.J10_APP_URL = "https://example.test";
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    process.env.TELEGRAM_WEBHOOK_SECRET = "test-webhook-secret";
  });

  it("rejects an unauthenticated cutover before database or Telegram work", async () => {
    mocks.getActiveWorkspaceContext.mockResolvedValue(null);
    const response = await POST(new Request("https://example.test/api/integrations/telegram/connect", {
      method: "POST",
      body: JSON.stringify({ action: "activate_official", integrationId: "integration-1" }),
    }));
    expect(response.status).toBe(401);
    expect(mocks.mockClient.from).not.toHaveBeenCalled();
    expect(mocks.registerExistingTelegramIntegration).not.toHaveBeenCalled();
  });

  it("rejects a cross-workspace integration before registration", async () => {
    mocks.getActiveWorkspaceContext.mockResolvedValue({
      workspace: { id: "workspace-a", status: "active" },
      user: { id: "user-a" },
    });
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: "integration-1", workspace_id: "workspace-b", status: "connected", metadata: {}, public_configuration: {} },
      }),
    };
    mocks.mockClient.from.mockReturnValue(query);
    const response = await POST(new Request("https://example.test/api/integrations/telegram/connect", {
      method: "POST",
      body: JSON.stringify({ action: "activate_official", integrationId: "integration-1" }),
    }));
    expect(response.status).toBe(409);
    expect(mocks.registerExistingTelegramIntegration).not.toHaveBeenCalled();
    expect(mocks.createTelegramBindingToken).not.toHaveBeenCalled();
  });
});
