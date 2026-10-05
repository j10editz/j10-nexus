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
import { OUTLOOK_MAIL_RUNTIME_ADAPTER } from "./providers/outlook-mail/adapter";
import { WHATSAPP_RUNTIME_ADAPTER } from "./providers/whatsapp/adapter";
import { INSTAGRAM_RUNTIME_ADAPTER } from "./providers/instagram/adapter";
import { TWILIO_RUNTIME_ADAPTER } from "./providers/twilio/adapter";
import { HUBSPOT_RUNTIME_ADAPTER } from "./providers/hubspot/adapter";
import { SHOPIFY_RUNTIME_ADAPTER } from "./providers/shopify/adapter";
import { STRIPE_RUNTIME_ADAPTER } from "./providers/stripe/adapter";
import { OPENAI_RUNTIME_ADAPTER } from "./providers/openai/adapter";
import { ANTHROPIC_RUNTIME_ADAPTER } from "./providers/anthropic/adapter";
import { GEMINI_RUNTIME_ADAPTER } from "./providers/gemini/adapter";
import { RUNWAY_RUNTIME_ADAPTER } from "./providers/runway/adapter";
import { HIGGSFIELD_RUNTIME_ADAPTER } from "./providers/higgsfield/adapter";
import { PIKA_RUNTIME_ADAPTER } from "./providers/pika/adapter";
import { KLING_RUNTIME_ADAPTER } from "./providers/kling/adapter";
import { ZAPIER_RUNTIME_ADAPTER } from "./providers/zapier/adapter";
import { MAKE_RUNTIME_ADAPTER } from "./providers/make/adapter";
import { N8N_RUNTIME_ADAPTER } from "./providers/n8n/adapter";
import { GOOGLE_BUSINESS_RUNTIME_ADAPTER } from "./providers/google-business/adapter";
import { SLACK_RUNTIME_ADAPTER } from "./providers/slack/adapter";
import { MICROSOFT_TEAMS_RUNTIME_ADAPTER } from "./providers/microsoft-teams/adapter";
import { GOOGLE_SHEETS_RUNTIME_ADAPTER } from "./providers/google-sheets/adapter";
import { GOOGLE_DRIVE_RUNTIME_ADAPTER } from "./providers/google-drive/adapter";
import { SALESFORCE_RUNTIME_ADAPTER } from "./providers/salesforce/adapter";
import { PIPEDRIVE_RUNTIME_ADAPTER } from "./providers/pipedrive/adapter";
import { QUICKBOOKS_RUNTIME_ADAPTER } from "./providers/quickbooks/adapter";
import { XERO_RUNTIME_ADAPTER } from "./providers/xero/adapter";
import { JOBBER_RUNTIME_ADAPTER } from "./providers/jobber/adapter";
import { HOUSECALL_PRO_RUNTIME_ADAPTER } from "./providers/housecall-pro/adapter";
import { MINDBODY_RUNTIME_ADAPTER } from "./providers/mindbody/adapter";
import { MAILCHIMP_RUNTIME_ADAPTER } from "./providers/mailchimp/adapter";
import { META_BUSINESS_RUNTIME_ADAPTER } from "./providers/meta-business/adapter";
import { META_LEAD_ADS_RUNTIME_ADAPTER } from "./providers/meta-lead-ads/adapter";
import { GOOGLE_ADS_RUNTIME_ADAPTER } from "./providers/google-ads/adapter";
import { ONEDRIVE_RUNTIME_ADAPTER } from "./providers/onedrive/adapter";
import { DROPBOX_RUNTIME_ADAPTER } from "./providers/dropbox/adapter";
import { NOTION_RUNTIME_ADAPTER } from "./providers/notion/adapter";
import { AIRTABLE_RUNTIME_ADAPTER } from "./providers/airtable/adapter";
import { ZOOM_RUNTIME_ADAPTER } from "./providers/zoom/adapter";
import { TELNYX_RUNTIME_ADAPTER } from "./providers/telnyx/adapter";
import { DISCORD_RUNTIME_ADAPTER } from "./providers/discord/adapter";
import { TRELLO_RUNTIME_ADAPTER } from "./providers/trello/adapter";
import { ASANA_RUNTIME_ADAPTER } from "./providers/asana/adapter";
import { MONDAY_RUNTIME_ADAPTER } from "./providers/monday/adapter";
import { CLICKUP_RUNTIME_ADAPTER } from "./providers/clickup/adapter";
import { YOUTUBE_RUNTIME_ADAPTER } from "./providers/youtube/adapter";
import { TIKTOK_RUNTIME_ADAPTER } from "./providers/tiktok/adapter";
import { LINKEDIN_RUNTIME_ADAPTER } from "./providers/linkedin/adapter";
import { X_RUNTIME_ADAPTER } from "./providers/x/adapter";
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
    OUTLOOK_MAIL_RUNTIME_ADAPTER,
    WHATSAPP_RUNTIME_ADAPTER,
    INSTAGRAM_RUNTIME_ADAPTER,
    TWILIO_RUNTIME_ADAPTER,
    HUBSPOT_RUNTIME_ADAPTER,
    SHOPIFY_RUNTIME_ADAPTER,
    STRIPE_RUNTIME_ADAPTER,
    OPENAI_RUNTIME_ADAPTER,
    ANTHROPIC_RUNTIME_ADAPTER,
    GEMINI_RUNTIME_ADAPTER,
    RUNWAY_RUNTIME_ADAPTER,
    HIGGSFIELD_RUNTIME_ADAPTER,
    PIKA_RUNTIME_ADAPTER,
    KLING_RUNTIME_ADAPTER,
    ZAPIER_RUNTIME_ADAPTER,
    MAKE_RUNTIME_ADAPTER,
    N8N_RUNTIME_ADAPTER,
    GOOGLE_BUSINESS_RUNTIME_ADAPTER,
    SLACK_RUNTIME_ADAPTER,
    MICROSOFT_TEAMS_RUNTIME_ADAPTER,
    GOOGLE_SHEETS_RUNTIME_ADAPTER,
    GOOGLE_DRIVE_RUNTIME_ADAPTER,
    SALESFORCE_RUNTIME_ADAPTER,
    PIPEDRIVE_RUNTIME_ADAPTER,
    QUICKBOOKS_RUNTIME_ADAPTER,
    XERO_RUNTIME_ADAPTER,
    JOBBER_RUNTIME_ADAPTER,
    HOUSECALL_PRO_RUNTIME_ADAPTER,
    MINDBODY_RUNTIME_ADAPTER,
    MAILCHIMP_RUNTIME_ADAPTER,
    META_BUSINESS_RUNTIME_ADAPTER,
    META_LEAD_ADS_RUNTIME_ADAPTER,
    GOOGLE_ADS_RUNTIME_ADAPTER,
    ONEDRIVE_RUNTIME_ADAPTER,
    DROPBOX_RUNTIME_ADAPTER,
    NOTION_RUNTIME_ADAPTER,
    AIRTABLE_RUNTIME_ADAPTER,
    ZOOM_RUNTIME_ADAPTER,
    TELNYX_RUNTIME_ADAPTER,
    DISCORD_RUNTIME_ADAPTER,
    TRELLO_RUNTIME_ADAPTER,
    ASANA_RUNTIME_ADAPTER,
    MONDAY_RUNTIME_ADAPTER,
    CLICKUP_RUNTIME_ADAPTER,
    YOUTUBE_RUNTIME_ADAPTER,
    TIKTOK_RUNTIME_ADAPTER,
    LINKEDIN_RUNTIME_ADAPTER,
    X_RUNTIME_ADAPTER,
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

export function listIntegrationRuntimeAdapters(): readonly IntegrationConnectorRuntimeAdapter[] {
  return RUNTIME_ADAPTERS;
}

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
