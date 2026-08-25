import "server-only";

import type {
  IntegrationEnvironment,
  IntegrationProviderId,
} from "@/types/integration";
import {
  INTEGRATION_RUNTIME_SCHEMA_VERSION,
  IntegrationRuntimeError,
} from "@/types/integration-runtime";
import type {
  IntegrationConnectorRuntimeAdapter,
  IntegrationRuntimeMode,
  IntegrationRuntimeProviderStatus,
  IntegrationRuntimeSummary,
} from "@/types/integration-runtime";
import { GMAIL_RUNTIME_ADAPTER } from "./providers/gmail/adapter";
import { GOOGLE_CALENDAR_RUNTIME_ADAPTER } from "./providers/google-calendar/adapter";
import {
  getIntegrationProvider,
  listIntegrationProviders,
} from "./registry";

/*
 * A catalog entry is not an executable connector. Only adapters listed here
 * have passed the runtime contract. Development adapters can simulate and
 * run the isolated sandbox, but live execution remains blocked until their
 * state is explicitly promoted to installed after acceptance.
 */
const RUNTIME_ADAPTERS:
  readonly IntegrationConnectorRuntimeAdapter[] = [
    GMAIL_RUNTIME_ADAPTER,
    GOOGLE_CALENDAR_RUNTIME_ADAPTER,
  ];

function manifestError(
  code: string,
  message: string,
): IntegrationRuntimeError {
  return new IntegrationRuntimeError(message, {
    code,
    category: "configuration",
  });
}

function requireUniqueStrings(
  values: readonly string[],
  label: string,
): void {
  const normalized = values.map((value) => value.trim());

  if (normalized.some((value) => !value)) {
    throw manifestError(
      "INVALID_RUNTIME_ADAPTER_MANIFEST",
      `${label} cannot contain empty values.`,
    );
  }

  if (new Set(normalized).size !== normalized.length) {
    throw manifestError(
      "DUPLICATE_RUNTIME_ADAPTER_VALUE",
      `${label} contains duplicate values.`,
    );
  }
}

function requireRuntimeFunction(
  enabled: boolean,
  runtimeFunction: unknown,
  label: string,
): void {
  if (
    enabled &&
    typeof runtimeFunction !== "function"
  ) {
    throw manifestError(
      "RUNTIME_FUNCTION_MISSING",
      `${label} is declared but not implemented.`,
    );
  }
}

function validateAdapter(
  adapter: IntegrationConnectorRuntimeAdapter,
): void {
  const manifest = adapter.manifest;

  if (
    manifest.schemaVersion !==
    INTEGRATION_RUNTIME_SCHEMA_VERSION
  ) {
    throw manifestError(
      "UNSUPPORTED_RUNTIME_SCHEMA",
      `Unsupported runtime schema for ${manifest.adapterId}.`,
    );
  }

  if (
    !/^[a-z0-9][a-z0-9._-]{2,99}$/.test(
      manifest.adapterId,
    )
  ) {
    throw manifestError(
      "INVALID_RUNTIME_ADAPTER_ID",
      "Runtime adapter ID is invalid.",
    );
  }

  if (!manifest.adapterVersion.trim()) {
    throw manifestError(
      "INVALID_RUNTIME_ADAPTER_VERSION",
      "Runtime adapter version is required.",
    );
  }

  if (
    !Number.isInteger(manifest.requestTimeoutMs) ||
    manifest.requestTimeoutMs < 1_000 ||
    manifest.requestTimeoutMs > 60_000
  ) {
    throw manifestError(
      "INVALID_RUNTIME_TIMEOUT",
      "Runtime request timeout must be between 1 and 60 seconds.",
    );
  }

  if (
    !Number.isInteger(manifest.maxConcurrency) ||
    manifest.maxConcurrency < 1 ||
    manifest.maxConcurrency > 100
  ) {
    throw manifestError(
      "INVALID_RUNTIME_CONCURRENCY",
      "Runtime concurrency must be between 1 and 100.",
    );
  }

  const provider = getIntegrationProvider(
    manifest.providerId,
  );

  if (manifest.authType !== provider.auth.type) {
    throw manifestError(
      "RUNTIME_AUTH_TYPE_MISMATCH",
      `${manifest.adapterId} authentication does not match ${provider.name}.`,
    );
  }

  requireUniqueStrings(
    manifest.environments,
    "Runtime environments",
  );

  requireUniqueStrings(
    manifest.modes,
    "Runtime modes",
  );

  const unsupportedEnvironment =
    manifest.environments.find(
      (environment) =>
        !provider.environments.includes(environment),
    );

  if (unsupportedEnvironment) {
    throw manifestError(
      "UNSUPPORTED_RUNTIME_ENVIRONMENT",
      `${provider.name} does not support the ${unsupportedEnvironment} environment.`,
    );
  }

  const catalogCapabilities = new Map(
    provider.capabilities.map((capability) => [
      capability.id,
      capability,
    ]),
  );

  requireUniqueStrings(
    manifest.capabilities.map(
      (capability) => capability.capabilityId,
    ),
    "Runtime capabilities",
  );

  for (const capability of manifest.capabilities) {
    const catalogCapability =
      catalogCapabilities.get(
        capability.capabilityId,
      );

    if (!catalogCapability) {
      throw manifestError(
        "UNKNOWN_RUNTIME_CAPABILITY",
        `${manifest.adapterId} declares an unknown capability: ${capability.capabilityId}`,
      );
    }

    if (
      catalogCapability.kind !== capability.kind
    ) {
      throw manifestError(
        "RUNTIME_CAPABILITY_KIND_MISMATCH",
        `${capability.capabilityId} has a capability-kind mismatch.`,
      );
    }

    requireUniqueStrings(
      capability.modes,
      `${capability.capabilityId} modes`,
    );

    requireUniqueStrings(
      capability.requiredScopes,
      `${capability.capabilityId} scopes`,
    );

    const unsupportedMode =
      capability.modes.find(
        (mode) =>
          !manifest.modes.includes(mode),
      );

    if (unsupportedMode) {
      throw manifestError(
        "UNSUPPORTED_RUNTIME_CAPABILITY_MODE",
        `${capability.capabilityId} uses a disabled mode: ${unsupportedMode}.`,
      );
    }

    const unsupportedScope =
      capability.requiredScopes.find(
        (scope) =>
          !provider.auth.requiredScopes.includes(
            scope,
          ),
      );

    if (unsupportedScope) {
      throw manifestError(
        "UNDECLARED_RUNTIME_SCOPE",
        `${capability.capabilityId} requests an undeclared provider scope.`,
      );
    }
  }

  requireRuntimeFunction(
    manifest.capabilities.some(
      (capability) =>
        capability.kind === "action",
    ),
    adapter.executeAction,
    `${provider.name} action runtime`,
  );

  if (
    manifest.supportsHealthChecks &&
    !provider.supportsHealthChecks
  ) {
    throw manifestError(
      "RUNTIME_HEALTH_CHECK_MISMATCH",
      `${provider.name} does not declare health-check support.`,
    );
  }

  if (
    manifest.supportsTokenRefresh &&
    !provider.auth.supportsRefreshTokens
  ) {
    throw manifestError(
      "RUNTIME_REFRESH_TOKEN_MISMATCH",
      `${provider.name} does not declare refresh-token support.`,
    );
  }

  requireRuntimeFunction(
    manifest.supportsHealthChecks,
    adapter.healthCheck,
    `${provider.name} health check`,
  );

  requireRuntimeFunction(
    manifest.supportsTokenRefresh,
    adapter.refreshAuthorization,
    `${provider.name} token refresh`,
  );

  requireRuntimeFunction(
    manifest.supportsTokenRevocation,
    adapter.revokeAuthorization,
    `${provider.name} token revocation`,
  );
}

function createRuntimeMap(
  adapters:
    readonly IntegrationConnectorRuntimeAdapter[],
): ReadonlyMap<
  IntegrationProviderId,
  IntegrationConnectorRuntimeAdapter
> {
  const runtimeMap = new Map<
    IntegrationProviderId,
    IntegrationConnectorRuntimeAdapter
  >();

  for (const adapter of adapters) {
    validateAdapter(adapter);

    if (
      runtimeMap.has(
        adapter.manifest.providerId,
      )
    ) {
      throw manifestError(
        "DUPLICATE_RUNTIME_ADAPTER",
        `Duplicate runtime adapter for ${adapter.manifest.providerId}.`,
      );
    }

    runtimeMap.set(
      adapter.manifest.providerId,
      adapter,
    );
  }

  return runtimeMap;
}

const RUNTIME_ADAPTER_MAP =
  createRuntimeMap(RUNTIME_ADAPTERS);

export function getIntegrationRuntimeAdapter(
  providerId: IntegrationProviderId,
): IntegrationConnectorRuntimeAdapter | null {
  return (
    RUNTIME_ADAPTER_MAP.get(providerId) ??
    null
  );
}

export function requireIntegrationRuntimeAdapter(
  providerId: IntegrationProviderId,
  mode: IntegrationRuntimeMode,
  environment: IntegrationEnvironment,
  capabilityId: string,
): IntegrationConnectorRuntimeAdapter {
  const provider =
    getIntegrationProvider(providerId);

  const adapter =
    getIntegrationRuntimeAdapter(providerId);

  if (!adapter) {
    throw new IntegrationRuntimeError(
      `${provider.name} does not have a registered runtime adapter.`,
      {
        code:
          "INTEGRATION_RUNTIME_ADAPTER_NOT_INSTALLED",
        category: "configuration",
        status: 501,
      },
    );
  }

  if (adapter.manifest.state === "disabled") {
    throw new IntegrationRuntimeError(
      `${provider.name} runtime is disabled.`,
      {
        code:
          "INTEGRATION_RUNTIME_ADAPTER_DISABLED",
        category: "configuration",
        status: 503,
      },
    );
  }

  if (
    mode === "live" &&
    adapter.manifest.state !== "installed"
  ) {
    throw new IntegrationRuntimeError(
      `${provider.name} runtime has not passed live acceptance.`,
      {
        code:
          "INTEGRATION_RUNTIME_NOT_LIVE_READY",
        category: "configuration",
        status: 503,
      },
    );
  }

  if (
    !adapter.manifest.modes.includes(mode)
  ) {
    throw new IntegrationRuntimeError(
      `${provider.name} does not support ${mode} execution.`,
      {
        code:
          "INTEGRATION_RUNTIME_MODE_NOT_SUPPORTED",
        category: "configuration",
        status: 409,
      },
    );
  }

  if (
    !adapter.manifest.environments.includes(
      environment,
    )
  ) {
    throw new IntegrationRuntimeError(
      `${provider.name} does not support the ${environment} environment.`,
      {
        code:
          "INTEGRATION_RUNTIME_ENVIRONMENT_NOT_SUPPORTED",
        category: "configuration",
        status: 409,
      },
    );
  }

  const capability =
    adapter.manifest.capabilities.find(
      (item) =>
        item.capabilityId === capabilityId,
    );

  if (
    !capability ||
    !capability.modes.includes(mode)
  ) {
    throw new IntegrationRuntimeError(
      `${provider.name} does not implement ${capabilityId} in ${mode} mode.`,
      {
        code:
          "INTEGRATION_RUNTIME_CAPABILITY_NOT_INSTALLED",
        category: "configuration",
        status: 501,
      },
    );
  }

  return adapter;
}

function createProviderStatus(
  providerId: IntegrationProviderId,
): IntegrationRuntimeProviderStatus {
  const provider =
    getIntegrationProvider(providerId);

  const adapter =
    getIntegrationRuntimeAdapter(providerId);

  if (!adapter) {
    return {
      providerId: provider.id,
      providerName: provider.name,
      catalogAvailability:
        provider.availability,
      authType: provider.auth.type,
      adapterState: "not_installed",
      adapterId: null,
      adapterVersion: null,
      registered: false,
      liveReady: false,
      sandboxReady: false,
      healthCheckReady: false,
      tokenRefreshReady: false,
      tokenRevocationReady: false,
      capabilityCount: 0,
    };
  }

  const manifest = adapter.manifest;

  return {
    providerId: provider.id,
    providerName: provider.name,
    catalogAvailability:
      provider.availability,
    authType: provider.auth.type,
    adapterState: manifest.state,
    adapterId: manifest.adapterId,
    adapterVersion: manifest.adapterVersion,
    registered: true,
    liveReady:
      manifest.state === "installed" &&
      manifest.modes.includes("live") &&
      manifest.environments.includes(
        "production",
      ),
    sandboxReady:
      manifest.state !== "disabled" &&
      manifest.modes.includes("sandbox"),
    healthCheckReady:
      manifest.supportsHealthChecks &&
      typeof adapter.healthCheck ===
        "function",
    tokenRefreshReady:
      manifest.supportsTokenRefresh &&
      typeof adapter.refreshAuthorization ===
        "function",
    tokenRevocationReady:
      manifest.supportsTokenRevocation &&
      typeof adapter.revokeAuthorization ===
        "function",
    capabilityCount:
      manifest.capabilities.length,
  };
}

export function listIntegrationRuntimeProviderStatuses():
  IntegrationRuntimeProviderStatus[] {
  return listIntegrationProviders().map(
    (provider) =>
      createProviderStatus(provider.id),
  );
}

export function getIntegrationRuntimeSummary():
  IntegrationRuntimeSummary {
  const providers =
    listIntegrationRuntimeProviderStatuses();

  return {
    schemaVersion:
      INTEGRATION_RUNTIME_SCHEMA_VERSION,
    catalogProviders:
      providers.length,
    registeredAdapters:
      providers.filter(
        (provider) => provider.registered,
      ).length,
    liveReadyProviders:
      providers.filter(
        (provider) => provider.liveReady,
      ).length,
    sandboxReadyProviders:
      providers.filter(
        (provider) => provider.sandboxReady,
      ).length,
    disabledAdapters:
      providers.filter(
        (provider) =>
          provider.adapterState ===
          "disabled",
      ).length,
    providers,
  };
}