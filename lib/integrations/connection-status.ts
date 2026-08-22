import type { IntegrationConnectionStatus } from "../../types/integration";

export const INTEGRATION_STATUS_TRANSITIONS = {
  not_configured: ["pending"],
  pending: ["connected", "disconnected", "error"],
  connected: [
    "degraded",
    "disconnected",
    "error",
    "revoked",
    "disabled",
  ],
  degraded: [
    "connected",
    "disconnected",
    "error",
    "revoked",
    "disabled",
  ],
  disconnected: [
    "pending",
    "connected",
    "revoked",
    "disabled",
  ],
  error: [
    "pending",
    "connected",
    "disconnected",
    "revoked",
    "disabled",
  ],
  revoked: ["pending", "disabled"],
  disabled: ["pending", "connected"],
} as const satisfies Readonly<
  Record<
    IntegrationConnectionStatus,
    readonly IntegrationConnectionStatus[]
  >
>;

export function getAllowedIntegrationStatusTransitions(
  currentStatus: IntegrationConnectionStatus,
): readonly IntegrationConnectionStatus[] {
  return INTEGRATION_STATUS_TRANSITIONS[currentStatus];
}

export function canTransitionIntegrationStatus(
  currentStatus: IntegrationConnectionStatus,
  nextStatus: IntegrationConnectionStatus,
): boolean {
  if (currentStatus === nextStatus) {
    return true;
  }

  const allowedStatuses: readonly IntegrationConnectionStatus[] =
    INTEGRATION_STATUS_TRANSITIONS[currentStatus];

  return allowedStatuses.includes(nextStatus);
}

export function assertIntegrationStatusTransition(
  currentStatus: IntegrationConnectionStatus,
  nextStatus: IntegrationConnectionStatus,
): void {
  if (
    !canTransitionIntegrationStatus(currentStatus, nextStatus)
  ) {
    throw new Error(
      `Invalid integration status transition: ${currentStatus} -> ${nextStatus}`,
    );
  }
}

export function isIntegrationConnectionOperational(
  status: IntegrationConnectionStatus,
): boolean {
  return status === "connected" || status === "degraded";
}

export function integrationConnectionNeedsAttention(
  status: IntegrationConnectionStatus,
): boolean {
  return [
    "degraded",
    "disconnected",
    "error",
    "revoked",
  ].includes(status);
}