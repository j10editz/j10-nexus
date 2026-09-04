import type {
  IntegrationConnectionStatus,
  IntegrationProviderId,
} from "./integration";

export type IntegrationReadinessState =
  | "blocked"
  | "needs_configuration"
  | "needs_credentials"
  | "needs_authorization"
  | "ready"
  | "operational"
  | "attention";

export type IntegrationReadinessCheckStatus =
  | "pass"
  | "warning"
  | "fail";

export type IntegrationHealthCheckMode =
  | "configuration"
  | "provider"
  | "none";

export interface IntegrationReadinessCheck {
  readonly code: string;
  readonly label: string;
  readonly status: IntegrationReadinessCheckStatus;
  readonly message: string;
}

export interface IntegrationReadinessReport {
  readonly connectionId: string;
  readonly providerId: IntegrationProviderId;
  readonly connectionStatus: IntegrationConnectionStatus;
  readonly evaluatedAt: string;
  readonly state: IntegrationReadinessState;
  readonly readyForUse: boolean;
  readonly canRunHealthCheck: boolean;
  readonly healthCheckMode: IntegrationHealthCheckMode;
  readonly checks: readonly IntegrationReadinessCheck[];
  readonly blockers: readonly IntegrationReadinessCheck[];
  readonly warnings: readonly IntegrationReadinessCheck[];
  readonly nextAction: string;
}

export type IntegrationHealthCheckOutcome =
  | "passed"
  | "blocked"
  | "unsupported";

export interface IntegrationHealthCheckResult {
  readonly connectionId: string;
  readonly providerId: IntegrationProviderId;
  readonly checkedAt: string;
  readonly durationMs: number;
  readonly outcome: IntegrationHealthCheckOutcome;
  readonly mode: IntegrationHealthCheckMode;
  readonly liveRequestPerformed: boolean;
  readonly message: string;
  readonly readiness: IntegrationReadinessReport;
  readonly latencyMs?: number;
  readonly externalAccountId?: string | null;
  readonly externalAccountLabel?: string | null;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
