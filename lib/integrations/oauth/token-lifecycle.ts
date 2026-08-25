import "server-only";

import type {
  SupabaseClient,
} from "@supabase/supabase-js";

import {
  getIntegrationCredentials,
  storeIntegrationCredentials,
} from "@/lib/integrations/credentials";

import {
  getIntegrationProvider,
} from "@/lib/integrations/registry";

import {
  INTEGRATION_OAUTH_TOKEN_SCHEMA_VERSION,
} from "@/types/integration-oauth-token";

import type {
  IntegrationOAuthTokenErrorCode,
  IntegrationOAuthTokenLifecycleState,
  IntegrationOAuthTokenMetadata,
  IntegrationOAuthTokenSet,
  ParseIntegrationOAuthTokenResponseOptions,
} from "@/types/integration-oauth-token";

import type {
  IntegrationProviderId,
} from "@/types/integration";

const TOKEN_REFRESH_SKEW_SECONDS =
  5 * 60;

const MAX_ACCESS_TOKEN_LENGTH =
  32_768;

const MAX_REFRESH_TOKEN_LENGTH =
  32_768;

const MAX_SCOPE_COUNT =
  100;

const MAX_SCOPE_LENGTH =
  512;

const MAX_COMBINED_SCOPE_LENGTH =
  8_192;

const MAX_TOKEN_LIFETIME_SECONDS =
  366 * 24 * 60 * 60;

const TOKEN_TYPE_PATTERN =
  /^[A-Za-z][A-Za-z0-9._~-]{0,63}$/;

const PROVIDER_ERROR_PATTERN =
  /^[A-Za-z0-9._~-]{1,160}$/;

export class IntegrationOAuthTokenError extends Error {
  readonly code:
    IntegrationOAuthTokenErrorCode;

  readonly status:
    number;

  readonly details:
    Readonly<Record<string, unknown>> | undefined;

  constructor(
    code: IntegrationOAuthTokenErrorCode,
    message: string,
    status: number,
    details?: Readonly<Record<string, unknown>>,
  ) {
    super(
      message,
    );

    this.name =
      "IntegrationOAuthTokenError";

    this.code =
      code;

    this.status =
      status;

    this.details =
      details;
  }
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value ===
      "object" &&
    value !== null &&
    !Array.isArray(
      value,
    )
  );
}

function normalizeRequiredToken(
  value: unknown,
  fieldName: string,
  maximumLength: number,
): string {
  if (
    typeof value !==
      "string"
  ) {
    throw new IntegrationOAuthTokenError(
      "INTEGRATION_OAUTH_TOKEN_INVALID",
      "The OAuth provider returned an invalid token response.",
      502,
      {
        field:
          fieldName,
      },
    );
  }

  const normalizedValue =
    value.trim();

  if (
    !normalizedValue ||
    normalizedValue.length >
      maximumLength ||
    /[\u0000-\u001f\u007f]/.test(
      normalizedValue,
    )
  ) {
    throw new IntegrationOAuthTokenError(
      "INTEGRATION_OAUTH_TOKEN_INVALID",
      "The OAuth provider returned an invalid token response.",
      502,
      {
        field:
          fieldName,
      },
    );
  }

  return normalizedValue;
}

function normalizeOptionalToken(
  value: unknown,
  fieldName: string,
  maximumLength: number,
): string | null {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  return normalizeRequiredToken(
    value,
    fieldName,
    maximumLength,
  );
}

function normalizeTokenType(
  value: unknown,
): string {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return "Bearer";
  }

  if (
    typeof value !==
      "string"
  ) {
    throw new IntegrationOAuthTokenError(
      "INTEGRATION_OAUTH_TOKEN_INVALID",
      "The OAuth token type is invalid.",
      502,
    );
  }

  const tokenType =
    value.trim();

  if (
    !TOKEN_TYPE_PATTERN.test(
      tokenType,
    )
  ) {
    throw new IntegrationOAuthTokenError(
      "INTEGRATION_OAUTH_TOKEN_INVALID",
      "The OAuth token type is invalid.",
      502,
    );
  }

  return tokenType;
}

function normalizeScopeEntry(
  value: string,
): string {
  const scope =
    value.trim();

  if (
    !scope ||
    scope.length >
      MAX_SCOPE_LENGTH ||
    /[\u0000-\u0020\u007f]/.test(
      scope,
    )
  ) {
    throw new IntegrationOAuthTokenError(
      "INTEGRATION_OAUTH_TOKEN_INVALID",
      "The OAuth provider returned an invalid scope.",
      502,
    );
  }

  return scope;
}

function normalizeScopes(
  value: unknown,
  fallbackScopes:
    readonly string[] = [],
): readonly string[] {
  let rawScopes:
    readonly string[];

  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    rawScopes =
      fallbackScopes;
  }
  else if (
    typeof value ===
      "string"
  ) {
    rawScopes =
      value
        .trim()
        .split(
          /\s+/,
        )
        .filter(
          Boolean,
        );
  }
  else if (
    Array.isArray(
      value,
    ) &&
    value.every(
      (entry) =>
        typeof entry ===
        "string",
    )
  ) {
    rawScopes =
      value;
  }
  else {
    throw new IntegrationOAuthTokenError(
      "INTEGRATION_OAUTH_TOKEN_INVALID",
      "The OAuth provider returned invalid scopes.",
      502,
    );
  }

  const normalizedScopes =
    Array.from(
      new Set(
        rawScopes.map(
          normalizeScopeEntry,
        ),
      ),
    );

  const combinedLength =
    normalizedScopes
      .join(
        " ",
      )
      .length;

  if (
    normalizedScopes.length >
      MAX_SCOPE_COUNT ||
    combinedLength >
      MAX_COMBINED_SCOPE_LENGTH
  ) {
    throw new IntegrationOAuthTokenError(
      "INTEGRATION_OAUTH_TOKEN_INVALID",
      "The OAuth scope response exceeds J10 security limits.",
      502,
    );
  }

  return normalizedScopes;
}

function normalizeExpiresIn(
  value: unknown,
): number | null {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  const numericValue =
    typeof value ===
      "number"
      ? value
      : typeof value ===
          "string"
        ? Number(
            value,
          )
        : Number.NaN;

  if (
    !Number.isFinite(
      numericValue,
    ) ||
    !Number.isInteger(
      numericValue,
    ) ||
    numericValue <= 0 ||
    numericValue >
      MAX_TOKEN_LIFETIME_SECONDS
  ) {
    throw new IntegrationOAuthTokenError(
      "INTEGRATION_OAUTH_TOKEN_INVALID",
      "The OAuth token expiration is invalid.",
      502,
    );
  }

  return numericValue;
}

function normalizeStoredExpiration(
  value: unknown,
): string | null {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  if (
    typeof value !==
      "string"
  ) {
    throw new IntegrationOAuthTokenError(
      "INTEGRATION_OAUTH_TOKEN_INVALID",
      "The stored OAuth expiration is invalid.",
      500,
    );
  }

  const expirationTime =
    Date.parse(
      value,
    );

  if (
    !Number.isFinite(
      expirationTime,
    )
  ) {
    throw new IntegrationOAuthTokenError(
      "INTEGRATION_OAUTH_TOKEN_INVALID",
      "The stored OAuth expiration is invalid.",
      500,
    );
  }

  return new Date(
    expirationTime,
  ).toISOString();
}

function assertOAuthProvider(
  providerId: IntegrationProviderId,
): void {
  const provider =
    getIntegrationProvider(
      providerId,
    );

  if (
    provider.auth.type !==
    "oauth2"
  ) {
    throw new IntegrationOAuthTokenError(
      "INTEGRATION_OAUTH_PROVIDER_MISMATCH",
      `${provider.name} does not use the OAuth token lifecycle.`,
      400,
      {
        providerId:
          provider.id,
      },
    );
  }
}

function normalizeProviderError(
  value: unknown,
): string | null {
  if (
    typeof value !==
      "string"
  ) {
    return null;
  }

  const providerError =
    value.trim();

  if (
    !PROVIDER_ERROR_PATTERN.test(
      providerError,
    )
  ) {
    return null;
  }

  return providerError;
}

export function parseIntegrationOAuthTokenResponse(
  value: unknown,
  options:
    ParseIntegrationOAuthTokenResponseOptions,
): IntegrationOAuthTokenSet {
  assertOAuthProvider(
    options.providerId,
  );

  if (
    !isRecord(
      value,
    )
  ) {
    throw new IntegrationOAuthTokenError(
      "INTEGRATION_OAUTH_TOKEN_INVALID",
      "The OAuth provider returned an invalid token response.",
      502,
    );
  }

  const providerError =
    normalizeProviderError(
      value.error,
    );

  if (providerError) {
    throw new IntegrationOAuthTokenError(
      "INTEGRATION_OAUTH_PROVIDER_ERROR",
      "The OAuth provider rejected the token request.",
      502,
      {
        providerError,
      },
    );
  }

  const accessToken =
    normalizeRequiredToken(
      value.access_token,
      "access_token",
      MAX_ACCESS_TOKEN_LENGTH,
    );

  const returnedRefreshToken =
    normalizeOptionalToken(
      value.refresh_token,
      "refresh_token",
      MAX_REFRESH_TOKEN_LENGTH,
    );

  const previousRefreshToken =
    normalizeOptionalToken(
      options.previousRefreshToken,
      "previous_refresh_token",
      MAX_REFRESH_TOKEN_LENGTH,
    );

  const refreshToken =
    returnedRefreshToken ??
    previousRefreshToken;

  const tokenType =
    normalizeTokenType(
      value.token_type,
    );

  const scopes =
    normalizeScopes(
      value.scope,
      options.fallbackScopes,
    );

  const expiresIn =
    normalizeExpiresIn(
      value.expires_in,
    );

  const now =
    options.now ??
    new Date();

  const expiresAt =
    expiresIn === null
      ? null
      : new Date(
          now.getTime() +
          expiresIn *
            1000,
        ).toISOString();

  return {
    schemaVersion:
      INTEGRATION_OAUTH_TOKEN_SCHEMA_VERSION,
    providerId:
      options.providerId,
    accessToken,
    refreshToken,
    tokenType,
    scopes,
    expiresAt,
  };
}

export function evaluateIntegrationOAuthTokenLifecycle(
  tokenSet:
    IntegrationOAuthTokenSet | null,
  now:
    Date = new Date(),
): IntegrationOAuthTokenLifecycleState {
  if (!tokenSet) {
    return {
      status:
        "missing",
      usable:
        false,
      refreshRequired:
        false,
      reauthorizationRequired:
        true,
      expiresInSeconds:
        null,
    };
  }

  if (
    tokenSet.expiresAt ===
    null
  ) {
    return {
      status:
        "valid",
      usable:
        true,
      refreshRequired:
        false,
      reauthorizationRequired:
        false,
      expiresInSeconds:
        null,
    };
  }

  const expirationTime =
    Date.parse(
      tokenSet.expiresAt,
    );

  if (
    !Number.isFinite(
      expirationTime,
    )
  ) {
    throw new IntegrationOAuthTokenError(
      "INTEGRATION_OAUTH_TOKEN_INVALID",
      "The OAuth token expiration is invalid.",
      500,
    );
  }

  const expiresInSeconds =
    Math.floor(
      (
        expirationTime -
        now.getTime()
      ) /
      1000,
    );

  if (
    expiresInSeconds <= 0
  ) {
    return {
      status:
        "expired",
      usable:
        false,
      refreshRequired:
        Boolean(
          tokenSet.refreshToken,
        ),
      reauthorizationRequired:
        !tokenSet.refreshToken,
      expiresInSeconds,
    };
  }

  if (
    expiresInSeconds <=
    TOKEN_REFRESH_SKEW_SECONDS
  ) {
    return {
      status:
        "refresh_required",
      usable:
        true,
      refreshRequired:
        Boolean(
          tokenSet.refreshToken,
        ),
      reauthorizationRequired:
        !tokenSet.refreshToken,
      expiresInSeconds,
    };
  }

  return {
    status:
      "valid",
    usable:
      true,
    refreshRequired:
      false,
    reauthorizationRequired:
      false,
    expiresInSeconds,
  };
}

export async function readIntegrationOAuthTokenSet(
  supabase:
    SupabaseClient,
  userId:
    string,
  connectionId:
    string,
): Promise<IntegrationOAuthTokenSet | null> {
  const credentials =
    await getIntegrationCredentials(
      supabase,
      userId,
      connectionId,
    );

  if (!credentials) {
    return null;
  }

  assertOAuthProvider(
    credentials.providerId,
  );

  const accessToken =
    normalizeRequiredToken(
      credentials.values
        .access_token,
      "access_token",
      MAX_ACCESS_TOKEN_LENGTH,
    );

  const refreshToken =
    normalizeOptionalToken(
      credentials.values
        .refresh_token,
      "refresh_token",
      MAX_REFRESH_TOKEN_LENGTH,
    );

  const tokenType =
    normalizeTokenType(
      credentials.values
        .token_type,
    );

  const scopes =
    normalizeScopes(
      credentials.values
        .scope,
    );

  const expiresAt =
    normalizeStoredExpiration(
      credentials.values
        .expires_at,
    );

  return {
    schemaVersion:
      INTEGRATION_OAUTH_TOKEN_SCHEMA_VERSION,
    providerId:
      credentials.providerId,
    accessToken,
    refreshToken,
    tokenType,
    scopes,
    expiresAt,
  };
}

export async function storeIntegrationOAuthTokenSet(
  supabase:
    SupabaseClient,
  userId:
    string,
  connectionId:
    string,
  tokenSet:
    IntegrationOAuthTokenSet,
): Promise<string> {
  assertOAuthProvider(
    tokenSet.providerId,
  );

  const accessToken =
    normalizeRequiredToken(
      tokenSet.accessToken,
      "access_token",
      MAX_ACCESS_TOKEN_LENGTH,
    );

  const refreshToken =
    normalizeOptionalToken(
      tokenSet.refreshToken,
      "refresh_token",
      MAX_REFRESH_TOKEN_LENGTH,
    );

  const tokenType =
    normalizeTokenType(
      tokenSet.tokenType,
    );

  const scopes =
    normalizeScopes(
      tokenSet.scopes,
    );

  const expiresAt =
    normalizeStoredExpiration(
      tokenSet.expiresAt,
    );

  const values:
    Record<string, string> = {
      access_token:
        accessToken,

      token_type:
        tokenType,

      scope:
        scopes.join(
          " ",
        ),
    };

  if (refreshToken) {
    values.refresh_token =
      refreshToken;
  }

  if (expiresAt) {
    values.expires_at =
      expiresAt;
  }

  try {
    return await storeIntegrationCredentials(
      supabase,
      userId,
      {
        connectionId,
        values,
      },
    );
  }
  catch (
    error
  ) {
    if (
      error instanceof
      IntegrationOAuthTokenError
    ) {
      throw error;
    }

    throw new IntegrationOAuthTokenError(
      "INTEGRATION_OAUTH_STORAGE_ERROR",
      "J10 could not securely store the OAuth token set.",
      500,
    );
  }
}

export async function rotateIntegrationOAuthTokenSet(
  supabase:
    SupabaseClient,
  userId:
    string,
  connectionId:
    string,
  currentTokenSet:
    IntegrationOAuthTokenSet,
  providerResponse:
    unknown,
  now:
    Date = new Date(),
): Promise<IntegrationOAuthTokenSet> {
  const rotatedTokenSet =
    parseIntegrationOAuthTokenResponse(
      providerResponse,
      {
        providerId:
          currentTokenSet.providerId,

        previousRefreshToken:
          currentTokenSet.refreshToken,

        fallbackScopes:
          currentTokenSet.scopes,

        now,
      },
    );

  await storeIntegrationOAuthTokenSet(
    supabase,
    userId,
    connectionId,
    rotatedTokenSet,
  );

  return rotatedTokenSet;
}

export function requireIntegrationOAuthAccessToken(
  tokenSet:
    IntegrationOAuthTokenSet | null,
  now:
    Date = new Date(),
): string {
  const lifecycle =
    evaluateIntegrationOAuthTokenLifecycle(
      tokenSet,
      now,
    );

  if (
    !tokenSet ||
    !lifecycle.usable
  ) {
    throw new IntegrationOAuthTokenError(
      lifecycle.status ===
        "expired"
        ? "INTEGRATION_OAUTH_TOKEN_EXPIRED"
        : "INTEGRATION_OAUTH_TOKEN_MISSING",
      lifecycle.status ===
        "expired"
        ? "The OAuth access token expired and must be refreshed."
        : "OAuth authorization is required for this integration.",
      401,
      {
        status:
          lifecycle.status,

        refreshRequired:
          lifecycle.refreshRequired,

        reauthorizationRequired:
          lifecycle
            .reauthorizationRequired,
      },
    );
  }

  return tokenSet.accessToken;
}

export function getIntegrationOAuthTokenMetadata(
  tokenSet:
    IntegrationOAuthTokenSet | null,
  now:
    Date = new Date(),
): IntegrationOAuthTokenMetadata | null {
  if (!tokenSet) {
    return null;
  }

  const lifecycle =
    evaluateIntegrationOAuthTokenLifecycle(
      tokenSet,
      now,
    );

  return {
    providerId:
      tokenSet.providerId,

    tokenType:
      tokenSet.tokenType,

    scopes:
      tokenSet.scopes,

    expiresAt:
      tokenSet.expiresAt,

    hasAccessToken:
      Boolean(
        tokenSet.accessToken,
      ),

    hasRefreshToken:
      Boolean(
        tokenSet.refreshToken,
      ),

    status:
      lifecycle.status,

    refreshRequired:
      lifecycle.refreshRequired,

    reauthorizationRequired:
      lifecycle
        .reauthorizationRequired,
  };
}