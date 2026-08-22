export const INTEGRATION_SANDBOX_SCHEMA_VERSION =
  "j10.integration-sandbox.v1" as const;

export const INTEGRATION_SANDBOX_SCENARIO_IDS = [
  "registry_integrity",
  "action_simulation",
  "internal_sandbox_receipt",
  "live_mode_guardrail",
  "approval_guardrail",
  "trigger_normalization",
  "idempotency_contract",
  "credential_redaction",
] as const;

export type IntegrationSandboxScenarioId =
  (typeof INTEGRATION_SANDBOX_SCENARIO_IDS)[number];

export type IntegrationSandboxScenarioStatus =
  | "passed"
  | "failed";

export interface IntegrationSandboxScenarioResult {
  readonly id: IntegrationSandboxScenarioId;
  readonly name: string;
  readonly description: string;
  readonly status: IntegrationSandboxScenarioStatus;
  readonly assertions: number;
  readonly durationMs: number;
  readonly evidence: Readonly<Record<string, unknown>>;
  readonly error: string | null;
}

export interface IntegrationSandboxSummary {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly assertions: number;
  readonly internalRequests: number;
  readonly externalRequests: number;
  readonly externalSideEffects: number;
  readonly databaseWrites: number;
  readonly aiRequests: number;
  readonly estimatedCostUsd: number;
}

export interface IntegrationSandboxRun {
  readonly schemaVersion:
    typeof INTEGRATION_SANDBOX_SCHEMA_VERSION;
  readonly runId: string;
  readonly environment: "development";
  readonly deterministic: true;
  readonly seed: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly durationMs: number;
  readonly success: boolean;
  readonly summary: IntegrationSandboxSummary;
  readonly scenarios: readonly IntegrationSandboxScenarioResult[];
}

export interface IntegrationSandboxRequest {
  readonly scenarioIds?: readonly IntegrationSandboxScenarioId[];
  readonly seed?: string;
}

export interface IntegrationSandboxDescriptor {
  readonly schemaVersion:
    typeof INTEGRATION_SANDBOX_SCHEMA_VERSION;
  readonly environment: "development";
  readonly deterministic: true;
  readonly productionDisabled: true;
  readonly zeroCost: true;
  readonly scenarioIds: readonly IntegrationSandboxScenarioId[];
}

export interface IntegrationSandboxApiResponse {
  readonly success: boolean;
  readonly descriptor?: IntegrationSandboxDescriptor;
  readonly sandbox?: IntegrationSandboxRun;
  readonly error?: string;
}