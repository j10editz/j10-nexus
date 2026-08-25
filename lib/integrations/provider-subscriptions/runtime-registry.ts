import "server-only";

import type {
  IntegrationProviderId,
} from "@/types/integration";

import {
  INTEGRATION_PROVIDER_SUBSCRIPTION_SCHEMA_VERSION,
} from "@/types/integration-provider-subscription";

import type {
  IntegrationProviderSubscriptionAdapter,
  IntegrationProviderSubscriptionRuntimeStatus,
} from "@/types/integration-provider-subscription";

import {
  IntegrationRuntimeError,
} from "@/types/integration-runtime";

import {
  GOOGLE_PROVIDER_SUBSCRIPTION_ADAPTER,
} from "../providers/google/subscription-runtime";

const SUBSCRIPTION_ADAPTERS:
  readonly IntegrationProviderSubscriptionAdapter[] = [
    GOOGLE_PROVIDER_SUBSCRIPTION_ADAPTER,
  ];

function registryError(
  code: string,
  message: string,
): IntegrationRuntimeError {
  return new IntegrationRuntimeError(
    message,
    {
      code,
      category:
        "configuration",
      status:
        500,
    },
  );
}

function validateAdapter(
  adapter:
    IntegrationProviderSubscriptionAdapter,
): void {
  const manifest =
    adapter.manifest;

  if (
    manifest.schemaVersion !==
    INTEGRATION_PROVIDER_SUBSCRIPTION_SCHEMA_VERSION
  ) {
    throw registryError(
      "INTEGRATION_SUBSCRIPTION_SCHEMA_UNSUPPORTED",
      `Unsupported provider subscription schema for ${manifest.adapterId}.`,
    );
  }

  if (
    !/^[a-z0-9][a-z0-9._-]{2,99}$/.test(
      manifest.adapterId,
    )
  ) {
    throw registryError(
      "INTEGRATION_SUBSCRIPTION_ADAPTER_ID_INVALID",
      "Provider subscription adapter ID is invalid.",
    );
  }

  if (
    !manifest.adapterVersion
      .trim()
  ) {
    throw registryError(
      "INTEGRATION_SUBSCRIPTION_ADAPTER_VERSION_INVALID",
      "Provider subscription adapter version is required.",
    );
  }

  if (
    manifest.providerIds
      .length === 0 ||
    new Set(
      manifest.providerIds,
    ).size !==
      manifest.providerIds
        .length
  ) {
    throw registryError(
      "INTEGRATION_SUBSCRIPTION_PROVIDERS_INVALID",
      "Provider subscription adapter providers are invalid.",
    );
  }

  if (
    manifest.kinds
      .length === 0 ||
    new Set(
      manifest.kinds,
    ).size !==
      manifest.kinds
        .length
  ) {
    throw registryError(
      "INTEGRATION_SUBSCRIPTION_KINDS_INVALID",
      "Provider subscription adapter kinds are invalid.",
    );
  }

  if (
    manifest.modes
      .length === 0 ||
    new Set(
      manifest.modes,
    ).size !==
      manifest.modes
        .length
  ) {
    throw registryError(
      "INTEGRATION_SUBSCRIPTION_MODES_INVALID",
      "Provider subscription adapter modes are invalid.",
    );
  }

  if (
    !Number.isInteger(
      manifest.requestTimeoutMs,
    ) ||
    manifest.requestTimeoutMs <
      1_000 ||
    manifest.requestTimeoutMs >
      60_000
  ) {
    throw registryError(
      "INTEGRATION_SUBSCRIPTION_TIMEOUT_INVALID",
      "Provider subscription timeout must be between 1 and 60 seconds.",
    );
  }

  if (
    manifest.supportsStart &&
    typeof adapter.create !==
      "function"
  ) {
    throw registryError(
      "INTEGRATION_SUBSCRIPTION_CREATE_MISSING",
      `${manifest.adapterId} does not implement subscription creation.`,
    );
  }

  if (
    manifest.supportsStop &&
    typeof adapter.stop !==
      "function"
  ) {
    throw registryError(
      "INTEGRATION_SUBSCRIPTION_STOP_MISSING",
      `${manifest.adapterId} does not implement subscription shutdown.`,
    );
  }
}

function buildRuntimeMap() {
  const runtimeMap =
    new Map<
      IntegrationProviderId,
      IntegrationProviderSubscriptionAdapter
    >();

  for (
    const adapter of
    SUBSCRIPTION_ADAPTERS
  ) {
    validateAdapter(
      adapter,
    );

    for (
      const providerId of
      adapter.manifest
        .providerIds
    ) {
      if (
        runtimeMap.has(
          providerId,
        )
      ) {
        throw registryError(
          "INTEGRATION_SUBSCRIPTION_ADAPTER_DUPLICATE",
          `Duplicate provider subscription adapter for ${providerId}.`,
        );
      }

      runtimeMap.set(
        providerId,
        adapter,
      );
    }
  }

  return runtimeMap;
}

const SUBSCRIPTION_RUNTIME_MAP =
  buildRuntimeMap();

export function getProviderSubscriptionAdapter(
  providerId:
    IntegrationProviderId,
): IntegrationProviderSubscriptionAdapter | null {
  return (
    SUBSCRIPTION_RUNTIME_MAP
      .get(
        providerId,
      ) ??
    null
  );
}

export function requireProviderSubscriptionAdapter(
  providerId:
    IntegrationProviderId,
): IntegrationProviderSubscriptionAdapter {
  const adapter =
    getProviderSubscriptionAdapter(
      providerId,
    );

  if (!adapter) {
    throw new IntegrationRuntimeError(
      "This provider does not have a subscription runtime.",
      {
        code:
          "INTEGRATION_SUBSCRIPTION_ADAPTER_NOT_INSTALLED",
        category:
          "configuration",
        status:
          501,
      },
    );
  }

  if (
    adapter.manifest.state ===
      "disabled"
  ) {
    throw new IntegrationRuntimeError(
      "This provider subscription runtime is disabled.",
      {
        code:
          "INTEGRATION_SUBSCRIPTION_ADAPTER_DISABLED",
        category:
          "configuration",
        status:
          503,
      },
    );
  }

  return adapter;
}

export function listProviderSubscriptionRuntimeStatuses():
  IntegrationProviderSubscriptionRuntimeStatus[] {
  const providerIds:
    readonly IntegrationProviderId[] = [
      "gmail",
      "google-calendar",
    ];

  return providerIds.map(
    (
      providerId,
    ): IntegrationProviderSubscriptionRuntimeStatus => {
      const adapter =
        getProviderSubscriptionAdapter(
          providerId,
        );

      if (!adapter) {
        return {
          providerId,
          registered:
            false,
          adapterId:
            null,
          adapterVersion:
            null,
          adapterState:
            "not_installed",
          kinds:
            [],
          modes:
            [],
          startReady:
            false,
          stopReady:
            false,
        };
      }

      return {
        providerId,
        registered:
          true,
        adapterId:
          adapter.manifest
            .adapterId,
        adapterVersion:
          adapter.manifest
            .adapterVersion,
        adapterState:
          adapter.manifest
            .state,
        kinds:
          adapter.manifest
            .kinds,
        modes:
          adapter.manifest
            .modes,
        startReady:
          adapter.manifest
            .supportsStart,
        stopReady:
          adapter.manifest
            .supportsStop,
      };
    },
  );
}