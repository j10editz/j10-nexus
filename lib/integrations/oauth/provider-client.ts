import "server-only";

import type {
  IntegrationProviderId,
} from "@/types/integration";

import type {
  IntegrationOAuthAuthorizationCodeExchangeInput,
  IntegrationOAuthAuthorizationUrlInput,
  IntegrationOAuthProviderRuntime,
} from "@/types/integration-oauth-provider";

import type {
  IntegrationOAuthTokenSet,
} from "@/types/integration-oauth-token";

import {
  IntegrationOAuthError,
} from "./errors";

import {
  isValidIntegrationOAuthCodeVerifier,
  isValidIntegrationOAuthState,
} from "./pkce";

import {
  requireIntegrationOAuthProviderDefinition,
} from "./provider-registry";

import {
  IntegrationOAuthTokenError,
  parseIntegrationOAuthTokenResponse,
} from "./token-lifecycle";

const MAX_OAUTH_CLIENT_VALUE_LENGTH =
  16_384;

const MAX_AUTHORIZATION_CODE_LENGTH =
  16_384;

const MAX_TOKEN_RESPONSE_BYTES =
  64 * 1024;

const PROVIDER_REQUEST_TIMEOUT_MS =
  20_000;

function configurationError(
  message: string,
): IntegrationOAuthError {
  return new IntegrationOAuthError(
    "INTEGRATION_OAUTH_CONFIGURATION_ERROR",
    message,
    503,
  );
}

function requireEnvironmentValue(
  variableName: string,
): string {
  const value =
    process.env[
      variableName
    ]?.trim();

  if (
    !value ||
    value.length >
      MAX_OAUTH_CLIENT_VALUE_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(
      value,
    )
  ) {
    throw configurationError(
      "OAuth provider credentials are not configured correctly.",
    );
  }

  return value;
}

function isDevelopmentLoopback(
  url: URL,
): boolean {
  return (
    process.env.NODE_ENV !==
      "production" &&
    (
      url.hostname ===
        "localhost" ||
      url.hostname ===
        "127.0.0.1" ||
      url.hostname ===
        "::1"
    )
  );
}

export function resolveIntegrationOAuthApplicationOrigin(
  request: Request,
): string {
  const configuredApplicationUrl =
    process.env
      .J10_APP_URL
      ?.trim() ||
    process.env
      .NEXT_PUBLIC_APP_URL
      ?.trim();

  let applicationUrl: URL;

  try {
    applicationUrl =
      new URL(
        configuredApplicationUrl ||
        (
          process.env.NODE_ENV !==
            "production"
            ? new URL(
                request.url,
              ).origin
            : ""
        ),
      );
  }
  catch {
    throw configurationError(
      "J10 application URL is not configured correctly.",
    );
  }

  if (
    (
      applicationUrl.protocol !==
        "https:" &&
      !isDevelopmentLoopback(
        applicationUrl,
      )
    ) ||
    applicationUrl.username ||
    applicationUrl.password ||
    (
      applicationUrl.pathname !==
        "/" &&
      applicationUrl.pathname !==
        ""
    ) ||
    applicationUrl.search ||
    applicationUrl.hash
  ) {
    throw configurationError(
      "J10 application URL must be a secure origin.",
    );
  }

  return applicationUrl.origin;
}

export function resolveIntegrationOAuthRedirectUri(
  request: Request,
): string {
  return new URL(
    "/api/integrations/oauth/callback",
    resolveIntegrationOAuthApplicationOrigin(
      request,
    ),
  ).toString();
}

export function resolveIntegrationOAuthProviderRuntime(
  request: Request,
  providerId:
    IntegrationProviderId,
): IntegrationOAuthProviderRuntime {
  const definition =
    requireIntegrationOAuthProviderDefinition(
      providerId,
    );

  return {
    definition,
    clientId:
      requireEnvironmentValue(
        definition
          .clientIdEnvironmentVariable,
      ),
    clientSecret:
      requireEnvironmentValue(
        definition
          .clientSecretEnvironmentVariable,
      ),
    applicationOrigin:
      resolveIntegrationOAuthApplicationOrigin(
        request,
      ),
    redirectUri:
      resolveIntegrationOAuthRedirectUri(
        request,
      ),
  };
}

export function buildIntegrationOAuthAuthorizationUrl(
  input:
    IntegrationOAuthAuthorizationUrlInput,
): URL {
  if (
    !isValidIntegrationOAuthState(
      input.state,
    ) ||
    !isValidIntegrationOAuthState(
      input.codeChallenge,
    )
  ) {
    throw new IntegrationOAuthError(
      "INTEGRATION_OAUTH_INVALID_PKCE",
      "The OAuth authorization security parameters are invalid.",
      500,
    );
  }

  const authorizationUrl =
    new URL(
      input.runtime
        .definition
        .authorizationEndpoint,
    );

  for (
    const [key, value] of
      Object.entries(
        input.runtime
          .definition
          .authorizationParameters ??
        {},
      )
  ) {
    authorizationUrl
      .searchParams
      .set(
        key,
        value,
      );
  }

  authorizationUrl
    .searchParams
    .set(
      "response_type",
      "code",
    );

  authorizationUrl
    .searchParams
    .set(
      "client_id",
      input.runtime.clientId,
    );

  authorizationUrl
    .searchParams
    .set(
      "redirect_uri",
      input.runtime.redirectUri,
    );

  authorizationUrl
    .searchParams
    .set(
      "scope",
      input.runtime
        .definition
        .scopes
        .join(
          " ",
        ),
    );

  authorizationUrl
    .searchParams
    .set(
      "state",
      input.state,
    );

  authorizationUrl
    .searchParams
    .set(
      "code_challenge",
      input.codeChallenge,
    );

  authorizationUrl
    .searchParams
    .set(
      "code_challenge_method",
      "S256",
    );

  return authorizationUrl;
}

function normalizeAuthorizationCode(
  value: string,
): string {
  const authorizationCode =
    value.trim();

  if (
    !authorizationCode ||
    authorizationCode.length >
      MAX_AUTHORIZATION_CODE_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(
      authorizationCode,
    )
  ) {
    throw new IntegrationOAuthTokenError(
      "INTEGRATION_OAUTH_PROVIDER_ERROR",
      "The OAuth provider returned an invalid authorization code.",
      400,
    );
  }

  return authorizationCode;
}

async function readProviderJson(
  response: Response,
): Promise<unknown> {
  const contentLengthHeader =
    response.headers.get(
      "content-length",
    );

  if (contentLengthHeader) {
    const contentLength =
      Number(
        contentLengthHeader,
      );

    if (
      Number.isFinite(
        contentLength,
      ) &&
      contentLength >
        MAX_TOKEN_RESPONSE_BYTES
    ) {
      throw new IntegrationOAuthTokenError(
        "INTEGRATION_OAUTH_TOKEN_INVALID",
        "The OAuth provider response exceeded J10 security limits.",
        502,
      );
    }
  }

  const responseText =
    await response.text();

  if (
    !responseText ||
    Buffer.byteLength(
      responseText,
      "utf8",
    ) >
      MAX_TOKEN_RESPONSE_BYTES
  ) {
    throw new IntegrationOAuthTokenError(
      "INTEGRATION_OAUTH_TOKEN_INVALID",
      "The OAuth provider returned an invalid token response.",
      502,
    );
  }

  try {
    const value: unknown =
      JSON.parse(
        responseText,
      );

    return value;
  }
  catch {
    throw new IntegrationOAuthTokenError(
      "INTEGRATION_OAUTH_TOKEN_INVALID",
      "The OAuth provider returned an unreadable token response.",
      502,
    );
  }
}

export async function exchangeIntegrationOAuthAuthorizationCode(
  input:
    IntegrationOAuthAuthorizationCodeExchangeInput,
): Promise<IntegrationOAuthTokenSet> {
  const authorizationCode =
    normalizeAuthorizationCode(
      input.authorizationCode,
    );

  if (
    !isValidIntegrationOAuthCodeVerifier(
      input.codeVerifier,
    )
  ) {
    throw new IntegrationOAuthError(
      "INTEGRATION_OAUTH_INVALID_PKCE",
      "The OAuth PKCE verifier is invalid.",
      400,
    );
  }

  const requestBody =
    new URLSearchParams();

  requestBody.set(
    "grant_type",
    "authorization_code",
  );

  requestBody.set(
    "code",
    authorizationCode,
  );

  requestBody.set(
    "client_id",
    input.runtime.clientId,
  );

  requestBody.set(
    "client_secret",
    input.runtime.clientSecret,
  );

  requestBody.set(
    "redirect_uri",
    input.runtime.redirectUri,
  );

  requestBody.set(
    "code_verifier",
    input.codeVerifier,
  );

  try {
    const response =
      await fetch(
        input.runtime
          .definition
          .tokenEndpoint,
        {
          method:
            "POST",
          headers: {
            Accept:
              "application/json",
            "Content-Type":
              "application/x-www-form-urlencoded",
          },
          body:
            requestBody.toString(),
          cache:
            "no-store",
          redirect:
            "error",
          signal:
            AbortSignal.timeout(
              PROVIDER_REQUEST_TIMEOUT_MS,
            ),
        },
      );

    const providerResponse =
      await readProviderJson(
        response,
      );

    if (
      !response.ok
    ) {
      try {
        parseIntegrationOAuthTokenResponse(
          providerResponse,
          {
            providerId:
              input.runtime
                .definition
                .providerId,
            fallbackScopes:
              input.runtime
                .definition
                .scopes,
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
      }

      throw new IntegrationOAuthTokenError(
        "INTEGRATION_OAUTH_PROVIDER_ERROR",
        "The OAuth provider rejected the token exchange.",
        502,
      );
    }

    return parseIntegrationOAuthTokenResponse(
      providerResponse,
      {
        providerId:
          input.runtime
            .definition
            .providerId,
        fallbackScopes:
          input.runtime
            .definition
            .scopes,
      },
    );
  }
  catch (
    error
  ) {
    if (
      error instanceof
        IntegrationOAuthTokenError ||
      error instanceof
        IntegrationOAuthError
    ) {
      throw error;
    }

    throw new IntegrationOAuthTokenError(
      "INTEGRATION_OAUTH_PROVIDER_ERROR",
      "J10 could not reach the OAuth provider securely.",
      502,
    );
  }
}