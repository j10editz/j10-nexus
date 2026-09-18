import { describe, expect, it, vi } from "vitest";
import { registerExistingTelegramIntegration, TelegramRegistrationError } from "@/lib/telegram/registration-transaction";

const expected = { id: "integration-1", workspaceId: "workspace-1", status: "connected" };
const url = "https://j10-nexus.vercel.app/api/webhooks/telegram";

function deps(overrides: Record<string, unknown> = {}) {
  return {
    stagePending: vi.fn().mockResolvedValue({ ...expected, status: "pending" }),
    restorePreviousState: vi.fn().mockResolvedValue(undefined),
    persistVault: vi.fn().mockResolvedValue(undefined),
    setWebhook: vi.fn().mockResolvedValue({ ok: true, result: true }),
    getWebhookInfo: vi.fn().mockResolvedValue({ ok: true, result: { url } }),
    activate: vi.fn().mockResolvedValue(expected),
    markDegraded: vi.fn().mockResolvedValue(undefined),
    compensateWebhook: vi.fn().mockResolvedValue({ ok: true, result: true }),
    ...overrides,
  } as any;
}

describe("Telegram registration transaction", () => {
  it("rejects HTTP / ok false / malformed Telegram responses", async () => {
    for (const response of [{ ok: false, result: true }, { ok: true }, null]) {
      const d = deps({ setWebhook: vi.fn().mockResolvedValue(response) });
      await expect(registerExistingTelegramIntegration(expected, url, d)).rejects.toBeInstanceOf(TelegramRegistrationError);
      expect(d.activate).not.toHaveBeenCalled();
    }
  });

  it("does not mutate Telegram when vault persistence fails", async () => {
    const d = deps({ persistVault: vi.fn().mockRejectedValue(new Error("vault")) });
    await expect(registerExistingTelegramIntegration(expected, url, d)).rejects.toMatchObject({ code: "REGISTRATION_FAILED" });
    expect(d.setWebhook).not.toHaveBeenCalled();
    expect(d.restorePreviousState).toHaveBeenCalledOnce();
  });

  it("rejects zero-row, wrong-ID, wrong-workspace, and wrong-status updates", async () => {
    for (const value of [null, { ...expected, id: "other", status: "pending" }, { ...expected, workspaceId: "other", status: "pending" }, { ...expected, status: "wrong" }]) {
      const d = deps({ stagePending: vi.fn().mockResolvedValue(value) });
      await expect(registerExistingTelegramIntegration(expected, url, d)).rejects.toMatchObject({ code: "EXACT_ROW_REQUIRED" });
      expect(d.setWebhook).not.toHaveBeenCalled();
    }
  });

  it("compensates after final activation failure and returns retryable failure", async () => {
    const d = deps({ activate: vi.fn().mockRejectedValue(new Error("zero rows")) });
    await expect(registerExistingTelegramIntegration(expected, url, d)).rejects.toMatchObject({ code: "REGISTRATION_FAILED" });
    expect(d.compensateWebhook).toHaveBeenCalledOnce();
    expect(d.restorePreviousState).not.toHaveBeenCalled();
    expect(d.markDegraded).toHaveBeenCalledOnce();
  });

  it("surfaces COMPENSATION_REQUIRED when compensation cannot be verified", async () => {
    const d = deps({ activate: vi.fn().mockRejectedValue(new Error("activate")), compensateWebhook: vi.fn().mockResolvedValue({ ok: false }) });
    await expect(registerExistingTelegramIntegration(expected, url, d)).rejects.toMatchObject({ code: "COMPENSATION_REQUIRED" });
    expect(d.markDegraded).toHaveBeenCalledOnce();
  });

  it("is idempotent for a verified existing integration", async () => {
    const d = deps();
    await expect(registerExistingTelegramIntegration(expected, url, d)).resolves.toEqual(expected);
    expect(d.stagePending).toHaveBeenCalledOnce();
    expect(d.activate).toHaveBeenCalledOnce();
  });

  it("binds first-time onboarding to the exact newly returned pending row", async () => {
    const created = { ...expected, id: "integration-created", status: "pending" };
    const d = deps({
      stagePending: vi.fn().mockResolvedValue(created),
      activate: vi.fn().mockResolvedValue({ ...expected, id: "integration-created" }),
    });
    await expect(registerExistingTelegramIntegration({ ...expected, id: "" }, url, d)).resolves.toMatchObject({ id: "integration-created", status: "connected" });
    expect(d.activate).toHaveBeenCalledOnce();
  });

  it("rejects wrong webhook readback and never activates", async () => {
    const d = deps({ getWebhookInfo: vi.fn().mockResolvedValue({ ok: true, result: { url: "https://wrong.example" } }) });
    await expect(registerExistingTelegramIntegration(expected, url, d)).rejects.toMatchObject({ code: "WEBHOOK_URL_MISMATCH" });
    expect(d.activate).not.toHaveBeenCalled();
    expect(d.compensateWebhook).toHaveBeenCalledOnce();
  });

  it("completes only after vault, Telegram, verified readback, and exact activation", async () => {
    const d = deps();
    await expect(registerExistingTelegramIntegration(expected, url, d)).resolves.toEqual(expected);
    expect(d.persistVault.mock.invocationCallOrder[0]).toBeLessThan(d.setWebhook.mock.invocationCallOrder[0]);
    expect(d.setWebhook.mock.invocationCallOrder[0]).toBeLessThan(d.getWebhookInfo.mock.invocationCallOrder[0]);
    expect(d.getWebhookInfo.mock.invocationCallOrder[0]).toBeLessThan(d.activate.mock.invocationCallOrder[0]);
  });
});
