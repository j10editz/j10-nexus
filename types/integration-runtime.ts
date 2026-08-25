import type {
  IntegrationAuthType,
  IntegrationAvailability,
  IntegrationCapabilityKind,
  IntegrationConnection,
  IntegrationEnvironment,
  IntegrationProviderId,
} from "./integration";

export const INTEGRATION_RUNTIME_SCHEMA_VERSION =
  "j10.integration-runtime.v1" as const;

export const INTEGRATION_RUNTIME_ADAPTER_STATES = [
  "development",
  "installed",
  "disabled",
] as const;

export type IntegrationRuntimeAdapterState =
  (typeof INTEGRATION_RUNTIME_ADAPTER_STATES)[number];

export const INTEGRATION_RUNTIME_MODES = [
  "simulate",
  "sandbox",
  "live",
] as const;

export type IntegrationRuntimeMode =
  (typeof INTEGRATION_RUNTIME_MODES)[number];

export const INTEGRATION_RUNTIME_ERROR_CATEGORIES = [
  "authentication",
  "authorization",
  "validation",
  "rate_limit",
  "provider",
  "network",
  "timeout",
  "configuration",
  "internal",
] as const;

export type IntegrationRuntimeErrorCategory =
  (typeof INTEGRATION_RUNTIME_ERROR_CATEGORIES)[number];

export interface IntegrationRuntimeCapabilityContract {
  readonly capabilityId: string;
  readonly kind: IntegrationCapabilityKind;
  readonly modes: readonly IntegrationRuntimeMode[];
  readonly requiredScopes: readonly string[];
  readonly supportsIdempotency: boolean;
}

export interface IntegrationRuntimeAdapterManifest {
  readonly schemaVersion:
    typeof INTEGRATION_RUNTIME_SCHEMA_VERSION;

  readonly adapterId: string;
  readonly adapterVersion: string;
  readonly providerId: IntegrationProviderId;
  readonly state: IntegrationRuntimeAdapterState;
  readonly authType: IntegrationAuthType;

  readonly environments:
    readonly IntegrationEnvironment[];

  readonly modes:
    readonly IntegrationRuntimeMode[];

  readonly capabilities:
    readonly IntegrationRuntimeCapabilityContract[];

  readonly supportsHealthChecks: boolean;
  readonly supportsTokenRefresh: boolean;
  readonly supportsTokenRevocation: boolean;

  readonly requestTimeoutMs: number;
  readonly maxConcurrency: number;
}

export interface IntegrationRuntimeRateLimit {
  readonly limit: number | null;
  readonly remaining: number | null;
  readonly resetAt: string | null;
  readonly retryAfterSeconds: number | null;
}

export interface IntegrationRuntimeResult {
  readonly success: boolean;
  readonly responseStatus: number | null;
  readonly providerRequestId: string | null;
  readonly rateLimit: IntegrationRuntimeRateLimit | null;

  readonly metadata:
    Readonly<Record<string, unknown>>;
}

export interface IntegrationRuntimeHealthResult {
  readonly healthy: boolean;
  readonly checkedAt: string;
  readonly latencyMs: number;
  readonly externalAccountId: string | null;
  readonly externalAccountLabel: string | null;

  readonly metadata:
    Readonly<Record<string, unknown>>;
}

export interface IntegrationRuntimeCredentialReader {
  /**
   * Returns only the explicitly requested credential fields.
   * Implementations must never log or serialize returned values.
   */
  read(
    keys: readonly string[],
  ): Promise<Readonly<Record<string, string>>>;
}

export interface IntegrationRuntimeInvocationContext {
  readonly requestId: string;
  readonly correlationId: string;
  readonly userId: string;
  readonly connection: IntegrationConnection;
  readonly environment: IntegrationEnvironment;
  readonly signal: AbortSignal;
  readonly credentials: IntegrationRuntimeCredentialReader;
}

export interface IntegrationRuntimeActionInvocation
  extends IntegrationRuntimeInvocationContext {
  readonly capabilityId: string;
  readonly mode: IntegrationRuntimeMode;
  readonly idempotencyKey: string;

  readonly input:
    Readonly<Record<string, unknown>>;
}

export interface IntegrationRuntimeTokenRefreshInvocation
  extends IntegrationRuntimeInvocationContext {
  readonly grantedScopes: readonly string[];
}

export interface IntegrationRuntimeTokenRefreshResult {
  readonly credentialValues:
    Readonly<Record<string, string>>;

  readonly grantedScopes: readonly string[];
  readonly expiresAt: string | null;
  readonly providerAccountId: string | null;
  readonly providerAccountLabel: string | null;
}

export interface IntegrationRuntimeTokenRevocationResult {
  readonly revoked: boolean;
  readonly revokedAt: string;
}

export interface IntegrationConnectorRuntimeAdapter {
  readonly manifest: IntegrationRuntimeAdapterManifest;

  healthCheck?(
    context: IntegrationRuntimeInvocationContext,
  ): Promise<IntegrationRuntimeHealthResult>;

  executeAction?(
    invocation: IntegrationRuntimeActionInvocation,
  ): Promise<IntegrationRuntimeResult>;

  refreshAuthorization?(
    invocation: IntegrationRuntimeTokenRefreshInvocation,
  ): Promise<IntegrationRuntimeTokenRefreshResult>;

  revokeAuthorization?(
    context: IntegrationRuntimeInvocationContext,
  ): Promise<IntegrationRuntimeTokenRevocationResult>;
}

export interface IntegrationRuntimeProviderStatus {
  readonly providerId: IntegrationProviderId;
  readonly providerName: string;
  readonly catalogAvailability: IntegrationAvailability;
  readonly authType: IntegrationAuthType;

  readonly adapterState:
    IntegrationRuntimeAdapterState |
    "not_installed";

  readonly adapterId: string | null;
  readonly adapterVersion: string | null;
  readonly registered: boolean;
  readonly liveReady: boolean;
  readonly sandboxReady: boolean;
  readonly healthCheckReady: boolean;
  readonly tokenRefreshReady: boolean;
  readonly tokenRevocationReady: boolean;
  readonly capabilityCount: number;
}

export interface IntegrationRuntimeSummary {
  readonly schemaVersion:
    typeof INTEGRATION_RUNTIME_SCHEMA_VERSION;

  readonly catalogProviders: number;
  readonly registeredAdapters: number;
  readonly liveReadyProviders: number;
  readonly sandboxReadyProviders: number;
  readonly disabledAdapters: number;

  readonly providers:
    readonly IntegrationRuntimeProviderStatus[];
}

export class IntegrationRuntimeError extends Error {
  readonly code: string;
  readonly category: IntegrationRuntimeErrorCategory;
  readonly status: number;
  readonly retryable: boolean;
  readonly retryAfterSeconds: number | null;
  readonly details: unknown;

  constructor(
    message: string,
    options: {
      code?: string;
      category?: IntegrationRuntimeErrorCategory;
      status?: number;
      retryable?: boolean;
      retryAfterSeconds?: number | null;
      details?: unknown;
    } = {},
  ) {
    super(message);

    this.name =
      "IntegrationRuntimeError";

    this.code =
      options.code ??
      "INTEGRATION_RUNTIME_ERROR";

    this.category =
      options.category ??
      "internal";

    this.status =
      options.status ??
      500;

    this.retryable =
      options.retryable ??
      false;

    this.retryAfterSeconds =
      options.retryAfterSeconds ??
      null;

    this.details =
      options.details;
  }
}