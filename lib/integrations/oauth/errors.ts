import "server-only";

import type {
  IntegrationOAuthErrorCode,
} from "@/types/integration-oauth";

export class IntegrationOAuthError extends Error {
  readonly code: IntegrationOAuthErrorCode;
  readonly status: number;
  readonly details:
    | Readonly<Record<string, unknown>>
    | undefined;

  constructor(
    code: IntegrationOAuthErrorCode,
    message: string,
    status: number,
    details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);

    this.name =
      "IntegrationOAuthError";

    this.code =
      code;

    this.status =
      status;

    this.details =
      details;
  }
}

export function isIntegrationOAuthError(
  error: unknown,
): error is IntegrationOAuthError {
  return error instanceof IntegrationOAuthError;
}