import "server-only";

export class IntegrationWebhookError extends Error {
  readonly code: string;
  readonly status: number;
  readonly expose: boolean;

  constructor(
    message: string,
    code = "INTEGRATION_WEBHOOK_ERROR",
    status = 500,
    expose = status < 500,
  ) {
    super(message);

    this.name = "IntegrationWebhookError";
    this.code = code;
    this.status = status;
    this.expose = expose;
  }
}

export function normalizeWebhookError(error: unknown) {
  if (error instanceof IntegrationWebhookError) {
    return error;
  }

  console.error("J10 webhook foundation error:", error);

  return new IntegrationWebhookError(
    "J10 NEXUS could not accept this webhook delivery.",
    "INTEGRATION_WEBHOOK_INTERNAL_ERROR",
    500,
    true,
  );
}