export type TelegramApiResult = {
  ok: boolean;
  result?: unknown;
  description?: string;
};

export type VerifiedIntegration = {
  id: string;
  workspaceId: string;
  status: string;
};

export class TelegramRegistrationError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "TelegramRegistrationError";
  }
}

export type ExistingRegistrationDependencies = {
  stagePending: () => Promise<VerifiedIntegration>;
  restorePreviousState: () => Promise<void>;
  persistVault: () => Promise<void>;
  setWebhook: () => Promise<TelegramApiResult>;
  getWebhookInfo: () => Promise<TelegramApiResult>;
  activate: () => Promise<VerifiedIntegration>;
  markDegraded: () => Promise<void>;
  compensateWebhook: () => Promise<TelegramApiResult>;
};

function requireTelegramSuccess(value: TelegramApiResult, phase: string) {
  if (!value || value.ok !== true || value.result === undefined || value.result === null) {
    throw new TelegramRegistrationError("TELEGRAM_REJECTED", `${phase} was not accepted by Telegram.`);
  }
}

function assertExactRow(value: unknown, expected: VerifiedIntegration): asserts value is VerifiedIntegration {
  if (!value || typeof value !== "object") {
    throw new TelegramRegistrationError("EXACT_ROW_REQUIRED", "The integration update did not return a row.");
  }
  const row = value as Partial<VerifiedIntegration>;
  if (
    row.id !== expected.id ||
    row.workspaceId !== expected.workspaceId ||
    !row.status
  ) {
    throw new TelegramRegistrationError("EXACT_ROW_REQUIRED", "The integration update did not return the expected row.");
  }
}

async function compensate(deps: ExistingRegistrationDependencies) {
  const result = await deps.compensateWebhook();
  requireTelegramSuccess(result, "Webhook compensation");
}

/**
 * Performs the only permitted existing-integration registration lifecycle.
 * No caller receives success until vault storage, Telegram readback, and the
 * exact final integration activation have all succeeded.
 */
export async function registerExistingTelegramIntegration(
  expected: VerifiedIntegration,
  expectedWebhookUrl: string,
  deps: ExistingRegistrationDependencies,
) {
  let staged = false;
  let remoteChanged = false;
  let exactExpected = expected;
  try {
    const pending = await deps.stagePending();
    // First-time onboarding has no integration ID until its pending row is
    // created. Every later operation is still bound to that exact returned row.
    if (!exactExpected.id) exactExpected = { ...exactExpected, id: pending.id };
    assertExactRow(pending, exactExpected);
    if (pending.status !== "pending") {
      throw new TelegramRegistrationError("EXACT_ROW_REQUIRED", "Integration was not staged as pending.");
    }
    staged = true;

    // Vault is intentionally first: it prevents a remote change without local recovery material.
    await deps.persistVault();
    const registered = await deps.setWebhook();
    requireTelegramSuccess(registered, "Webhook registration");
    remoteChanged = true;

    const readback = await deps.getWebhookInfo();
    requireTelegramSuccess(readback, "Webhook readback");
    const url = (readback.result as { url?: unknown }).url;
    if (url !== expectedWebhookUrl) {
      throw new TelegramRegistrationError("WEBHOOK_URL_MISMATCH", "Telegram did not retain the intended callback URL.");
    }

    const active = await deps.activate();
    assertExactRow(active, exactExpected);
    if (active.status !== "connected") {
      throw new TelegramRegistrationError("EXACT_ROW_REQUIRED", "Integration activation did not return connected.");
    }
    return active;
  } catch (error) {
    if (remoteChanged) {
      try {
        await compensate(deps);
        // The callback was changed and then removed.  Do not restore an old
        // "connected" state: it would claim a working webhook that no longer
        // exists.  Keep the exact integration retryable and visibly pending.
        await deps.markDegraded();
      } catch {
        await deps.markDegraded().catch(() => undefined);
        throw new TelegramRegistrationError("COMPENSATION_REQUIRED", "Webhook compensation could not be verified.");
      }
    } else if (staged) {
      await deps.restorePreviousState().catch(() => undefined);
    }
    if (error instanceof TelegramRegistrationError) throw error;
    throw new TelegramRegistrationError("REGISTRATION_FAILED", "Telegram registration did not complete.");
  }
}
