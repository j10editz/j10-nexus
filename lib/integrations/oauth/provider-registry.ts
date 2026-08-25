import "server-only";

import {
  INTEGRATION_PROVIDER_IDS,
} from "@/types/integration";

import type {
  IntegrationProviderId,
} from "@/types/integration";

import type {
  IntegrationOAuthProviderDefinition,
} from "@/types/integration-oauth-provider";

import {
  getIntegrationProvider,
} from "../registry";

import {
  IntegrationOAuthError,
} from "./errors";

const ENVIRONMENT_VARIABLE_PATTERN =
  /^[A-Z][A-Z0-9_]{2,127}$/;

const RESERVED_AUTHORIZATION_PARAMETERS =
  new Set([
    "client_id",
    "redirect_uri",
    "response_type",
    "scope",
    "state",
    "code_challenge",
    "code_challenge_method",
  ]);

const GOOGLE_AUTHORIZATION_ENDPOINT =
  "https://accounts.google.com/o/oauth2/v2/auth";

const GOOGLE_TOKEN_ENDPOINT =
  "https://oauth2.googleapis.com/token";

const GOOGLE_CLIENT_ID_ENVIRONMENT_VARIABLE =
  "GOOGLE_OAUTH_CLIENT_ID";

const GOOGLE_CLIENT_SECRET_ENVIRONMENT_VARIABLE =
  "GOOGLE_OAUTH_CLIENT_SECRET";

const GOOGLE_AUTHORIZATION_PARAMETERS =
  Object.freeze({
    access_type:
      "offline",

    include_granted_scopes:
      "true",

    prompt:
      "consent",
  });

const GMAIL_OAUTH_SCOPES =
  Object.freeze([
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.send",
  ] as const);

const GOOGLE_CALENDAR_OAUTH_SCOPES =
  Object.freeze([
    "https://www.googleapis.com/auth/calendar.events",
  ] as const);

export const GOOGLE_OAUTH_PROVIDER_IDS =
  Object.freeze([
    "gmail",
    "google-calendar",
  ] as const satisfies
    readonly IntegrationProviderId[]);

/*
 * Day 15E Google OAuth configuration.
 *
 * Both Google connectors share one Google Cloud web OAuth client,
 * but each provider requests only its catalog-declared scopes.
 *
 * Registration here enables secure OAuth authorization. It does not
 * claim that the Gmail or Google Calendar live adapters are installed.
 * Runtime installation remains guarded by runtime-registry.ts.
 */
export const INTEGRATION_OAUTH_PROVIDER_REGISTRY:
  Readonly<
    Partial<
      Record<
        IntegrationProviderId,
        IntegrationOAuthProviderDefinition
      >
    >
  > =
  Object.freeze({
    gmail:
      Object.freeze({
        providerId:
          "gmail",

        authorizationEndpoint:
          GOOGLE_AUTHORIZATION_ENDPOINT,

        tokenEndpoint:
          GOOGLE_TOKEN_ENDPOINT,

        clientIdEnvironmentVariable:
          GOOGLE_CLIENT_ID_ENVIRONMENT_VARIABLE,

        clientSecretEnvironmentVariable:
          GOOGLE_CLIENT_SECRET_ENVIRONMENT_VARIABLE,

        scopes:
          GMAIL_OAUTH_SCOPES,

        clientAuthenticationMethod:
          "client_secret_post",

        authorizationParameters:
          GOOGLE_AUTHORIZATION_PARAMETERS,
      }),

    "google-calendar":
      Object.freeze({
        providerId:
          "google-calendar",

        authorizationEndpoint:
          GOOGLE_AUTHORIZATION_ENDPOINT,

        tokenEndpoint:
          GOOGLE_TOKEN_ENDPOINT,

        clientIdEnvironmentVariable:
          GOOGLE_CLIENT_ID_ENVIRONMENT_VARIABLE,

        clientSecretEnvironmentVariable:
          GOOGLE_CLIENT_SECRET_ENVIRONMENT_VARIABLE,

        scopes:
          GOOGLE_CALENDAR_OAUTH_SCOPES,

        clientAuthenticationMethod:
          "client_secret_post",

        authorizationParameters:
          GOOGLE_AUTHORIZATION_PARAMETERS,
      }),
  });

function configurationError(
  message: string,
): IntegrationOAuthError {
  return new IntegrationOAuthError(
    "INTEGRATION_OAUTH_CONFIGURATION_ERROR",
    message,
    503,
  );
}

function validateEndpoint(
  value: string,
  label: string,
): void {
  let endpoint: URL;

  try {
    endpoint =
      new URL(
        value,
      );
  }
  catch {
    throw configurationError(
      `${label} is invalid.`,
    );
  }

  if (
    endpoint.protocol !==
      "https:" ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash
  ) {
    throw configurationError(
      `${label} must use a clean HTTPS URL.`,
    );
  }
}

function validateEnvironmentVariable(
  value: string,
  label: string,
): void {
  if (
    !ENVIRONMENT_VARIABLE_PATTERN.test(
      value,
    )
  ) {
    throw configurationError(
      `${label} is invalid.`,
    );
  }
}

function validateScope(
  value: string,
): void {
  if (
    !value ||
    value.length >
      512 ||
    /[\u0000-\u0020\u007f"\\]/.test(
      value,
    )
  ) {
    throw configurationError(
      "OAuth provider scopes are invalid.",
    );
  }
}

function validateCatalogAlignment(
  providerId:
    IntegrationProviderId,
  definition:
    IntegrationOAuthProviderDefinition,
): void {
  const catalogProvider =
    getIntegrationProvider(
      providerId,
    );

  if (
    catalogProvider.auth.type !==
    "oauth2"
  ) {
    throw configurationError(
      `${catalogProvider.name} is not declared as an OAuth 2.0 provider.`,
    );
  }

  if (
    !catalogProvider.auth
      .supportsRefreshTokens
  ) {
    throw configurationError(
      `${catalogProvider.name} does not declare refresh-token support.`,
    );
  }

  const catalogScopes =
    new Set(
      catalogProvider.auth
        .requiredScopes,
    );

  const providerScopes =
    new Set(
      definition.scopes,
    );

  if (
    catalogScopes.size !==
      providerScopes.size ||
    catalogProvider.auth
      .requiredScopes.some(
        (scope) =>
          !providerScopes.has(
            scope,
          ),
      ) ||
    definition.scopes.some(
      (scope) =>
        !catalogScopes.has(
          scope,
        ),
    )
  ) {
    throw configurationError(
      `${catalogProvider.name} OAuth scopes do not match the integration catalog.`,
    );
  }
}

function validateGoogleProviderDefinition(
  providerId:
    IntegrationProviderId,
  definition:
    IntegrationOAuthProviderDefinition,
): void {
  if (
    !GOOGLE_OAUTH_PROVIDER_IDS.includes(
      providerId as
        (typeof GOOGLE_OAUTH_PROVIDER_IDS)[number],
    )
  ) {
    return;
  }

  if (
    definition.authorizationEndpoint !==
      GOOGLE_AUTHORIZATION_ENDPOINT ||
    definition.tokenEndpoint !==
      GOOGLE_TOKEN_ENDPOINT
  ) {
    throw configurationError(
      "Google OAuth endpoints are configured incorrectly.",
    );
  }

  if (
    definition.clientIdEnvironmentVariable !==
      GOOGLE_CLIENT_ID_ENVIRONMENT_VARIABLE ||
    definition.clientSecretEnvironmentVariable !==
      GOOGLE_CLIENT_SECRET_ENVIRONMENT_VARIABLE
  ) {
    throw configurationError(
      "Google OAuth environment variable names are configured incorrectly.",
    );
  }

  const parameters =
    definition.authorizationParameters;

  if (
    parameters?.access_type !==
      "offline" ||
    parameters
      ?.include_granted_scopes !==
      "true" ||
    parameters?.prompt !==
      "consent"
  ) {
    throw configurationError(
      "Google OAuth offline authorization parameters are incomplete.",
    );
  }
}

function validateProviderDefinition(
  providerId:
    IntegrationProviderId,
  definition:
    IntegrationOAuthProviderDefinition,
): IntegrationOAuthProviderDefinition {
  if (
    definition.providerId !==
    providerId
  ) {
    throw configurationError(
      "OAuth provider registry identity mismatch.",
    );
  }

  validateEndpoint(
    definition.authorizationEndpoint,
    "OAuth authorization endpoint",
  );

  validateEndpoint(
    definition.tokenEndpoint,
    "OAuth token endpoint",
  );

  validateEnvironmentVariable(
    definition.clientIdEnvironmentVariable,
    "OAuth client ID environment variable",
  );

  validateEnvironmentVariable(
    definition.clientSecretEnvironmentVariable,
    "OAuth client secret environment variable",
  );

  if (
    definition.clientAuthenticationMethod !==
    "client_secret_post"
  ) {
    throw configurationError(
      "OAuth client authentication method is unsupported.",
    );
  }

  if (
    definition.scopes.length ===
      0 ||
    definition.scopes.length >
      100
  ) {
    throw configurationError(
      "OAuth provider scopes are not configured correctly.",
    );
  }

  const uniqueScopes =
    new Set<string>();

  for (
    const scope of
      definition.scopes
  ) {
    validateScope(
      scope,
    );

    uniqueScopes.add(
      scope,
    );
  }

  if (
    uniqueScopes.size !==
    definition.scopes.length
  ) {
    throw configurationError(
      "OAuth provider scopes contain duplicates.",
    );
  }

  for (
    const [key, value] of
      Object.entries(
        definition.authorizationParameters ??
        {},
      )
  ) {
    if (
      !key ||
      key.length >
        100 ||
      RESERVED_AUTHORIZATION_PARAMETERS.has(
        key,
      ) ||
      !value ||
      value.length >
        1000 ||
      /[\u0000-\u001f\u007f]/.test(
        value,
      )
    ) {
      throw configurationError(
        "OAuth authorization parameters are invalid.",
      );
    }
  }

  validateCatalogAlignment(
    providerId,
    definition,
  );

  validateGoogleProviderDefinition(
    providerId,
    definition,
  );

  return definition;
}

function hasEnvironmentValue(
  environmentVariable:
    string,
): boolean {
  return Boolean(
    process.env[
      environmentVariable
    ]?.trim(),
  );
}

export function getIntegrationOAuthProviderDefinition(
  providerId:
    IntegrationProviderId,
): IntegrationOAuthProviderDefinition | null {
  const definition =
    INTEGRATION_OAUTH_PROVIDER_REGISTRY[
      providerId
    ];

  if (!definition) {
    return null;
  }

  return validateProviderDefinition(
    providerId,
    definition,
  );
}

export function requireIntegrationOAuthProviderDefinition(
  providerId:
    IntegrationProviderId,
): IntegrationOAuthProviderDefinition {
  const definition =
    getIntegrationOAuthProviderDefinition(
      providerId,
    );

  if (!definition) {
    throw configurationError(
      "This OAuth provider is not configured for live authorization yet.",
    );
  }

  return definition;
}

export function getIntegrationOAuthProviderMissingEnvironmentVariables(
  providerId:
    IntegrationProviderId,
): readonly string[] {
  const definition =
    getIntegrationOAuthProviderDefinition(
      providerId,
    );

  if (!definition) {
    return [];
  }

  const environmentVariables =
    [
      definition
        .clientIdEnvironmentVariable,

      definition
        .clientSecretEnvironmentVariable,
    ];

  return environmentVariables.filter(
    (environmentVariable) =>
      !hasEnvironmentValue(
        environmentVariable,
      ),
  );
}

export function isIntegrationOAuthProviderConfigured(
  providerId:
    IntegrationProviderId,
): boolean {
  const definition =
    getIntegrationOAuthProviderDefinition(
      providerId,
    );

  return Boolean(
    definition &&
    getIntegrationOAuthProviderMissingEnvironmentVariables(
      providerId,
    ).length ===
      0,
  );
}

export function listIntegrationOAuthProviderDefinitions():
  readonly IntegrationOAuthProviderDefinition[] {
  const definitions:
    IntegrationOAuthProviderDefinition[] =
    [];

  for (
    const providerId of
      INTEGRATION_PROVIDER_IDS
  ) {
    const definition =
      getIntegrationOAuthProviderDefinition(
        providerId,
      );

    if (definition) {
      definitions.push(
        definition,
      );
    }
  }

  return definitions;
}