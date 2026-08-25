import "server-only";

import type { IntegrationProviderId } from "@/types/integration";
import type {
  IntegrationRuntimeCredentialReader,
  IntegrationRuntimeTokenRefreshResult,
  IntegrationRuntimeTokenRevocationResult,
} from "@/types/integration-runtime";
import { IntegrationRuntimeError } from "@/types/integration-runtime";
import {
  IntegrationOAuthTokenError,
  parseIntegrationOAuthTokenResponse,
} from "../../oauth/token-lifecycle";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const REVOCATION_ENDPOINT = "https://oauth2.googleapis.com/revoke";
const TIMEOUT_MS = 20_000;
const MAX_RESPONSE_BYTES = 64 * 1024;
const MAX_CONFIGURATION_LENGTH = 16_384;

function requireEnvironmentValue(name: string): string {
  const value = process.env[name]?.trim();

  if (
    !value ||
    value.length > MAX_CONFIGURATION_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new IntegrationRuntimeError(
      "Google OAuth credentials are not configured correctly.",
      {
        code: "GOOGLE_OAUTH_CONFIGURATION_INVALID",
        category: "configuration",
        status: 503,
      },
    );
  }

  return value;
}

function parseScopes(
  value: string | undefined,
  fallback: readonly string[],
): readonly string[] {
  const scopes = value
    ?.split(/\s+/)
    .map((scope) => scope.trim())
    .filter(Boolean) ?? [];

  return scopes.length > 0 ? Array.from(new Set(scopes)) : fallback;
}

async function readJson(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get("content-length"));

  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_RESPONSE_BYTES
  ) {
    throw new IntegrationRuntimeError(
      "Google returned a response larger than J10 security limits.",
      {
        code: "GOOGLE_OAUTH_RESPONSE_TOO_LARGE",
        category: "provider",
        status: 502,
      },
    );
  }

  const text = await response.text();

  if (!text || Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
    throw new IntegrationRuntimeError(
      "Google returned an invalid OAuth response.",
      {
        code: "GOOGLE_OAUTH_RESPONSE_INVALID",
        category: "provider",
        status: 502,
      },
    );
  }

  try {
    const value: unknown = JSON.parse(text);
    return value;
  }
  catch {
    throw new IntegrationRuntimeError(
      "Google returned an unreadable OAuth response.",
      {
        code: "GOOGLE_OAUTH_RESPONSE_INVALID",
        category: "provider",
        status: 502,
      },
    );
  }
}

function providerSignal(signal: AbortSignal): AbortSignal {
  return AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]);
}

export async function refreshGoogleOAuthAuthorization(input: {
  readonly providerId: IntegrationProviderId;
  readonly credentials: IntegrationRuntimeCredentialReader;
  readonly grantedScopes: readonly string[];
  readonly signal: AbortSignal;
}): Promise<IntegrationRuntimeTokenRefreshResult> {
  const stored = await input.credentials.read(["refresh_token", "scope"]);
  const refreshToken = stored.refresh_token?.trim();

  if (!refreshToken) {
    throw new IntegrationRuntimeError(
      "Google authorization must be reconnected because no refresh token is available.",
      {
        code: "GOOGLE_OAUTH_REFRESH_TOKEN_MISSING",
        category: "authentication",
        status: 401,
      },
    );
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: requireEnvironmentValue("GOOGLE_OAUTH_CLIENT_ID"),
    client_secret: requireEnvironmentValue("GOOGLE_OAUTH_CLIENT_SECRET"),
  });

  try {
    const response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
      cache: "no-store",
      redirect: "error",
      signal: providerSignal(input.signal),
    });

    const providerResponse = await readJson(response);
    const fallbackScopes = parseScopes(stored.scope, input.grantedScopes);

    if (!response.ok) {
      try {
        parseIntegrationOAuthTokenResponse(providerResponse, {
          providerId: input.providerId,
          previousRefreshToken: refreshToken,
          fallbackScopes,
        });
      }
      catch (error) {
        if (error instanceof IntegrationOAuthTokenError) {
          throw new IntegrationRuntimeError(
            "Google rejected the OAuth refresh request.",
            {
              code: error.code,
              category: "authentication",
              status: error.status,
              retryable: response.status >= 500,
            },
          );
        }
      }

      throw new IntegrationRuntimeError(
        "Google rejected the OAuth refresh request.",
        {
          code: "GOOGLE_OAUTH_REFRESH_REJECTED",
          category: response.status >= 500 ? "provider" : "authentication",
          status: response.status >= 500 ? 502 : 401,
          retryable: response.status >= 500,
        },
      );
    }

    const tokenSet = parseIntegrationOAuthTokenResponse(providerResponse, {
      providerId: input.providerId,
      previousRefreshToken: refreshToken,
      fallbackScopes,
    });

    const credentialValues: Record<string, string> = {
      access_token: tokenSet.accessToken,
      refresh_token: tokenSet.refreshToken ?? refreshToken,
      token_type: tokenSet.tokenType,
      scope: tokenSet.scopes.join(" "),
    };

    if (tokenSet.expiresAt) {
      credentialValues.expires_at = tokenSet.expiresAt;
    }

    return {
      credentialValues,
      grantedScopes: tokenSet.scopes,
      expiresAt: tokenSet.expiresAt,
      providerAccountId: null,
      providerAccountLabel: null,
    };
  }
  catch (error) {
    if (error instanceof IntegrationRuntimeError) {
      throw error;
    }

    throw new IntegrationRuntimeError(
      "J10 could not reach Google securely to refresh authorization.",
      {
        code: "GOOGLE_OAUTH_REFRESH_NETWORK_ERROR",
        category:
          error instanceof DOMException && error.name === "TimeoutError"
            ? "timeout"
            : "network",
        status: 502,
        retryable: true,
      },
    );
  }
}

export async function revokeGoogleOAuthAuthorization(input: {
  readonly credentials: IntegrationRuntimeCredentialReader;
  readonly signal: AbortSignal;
}): Promise<IntegrationRuntimeTokenRevocationResult> {
  const stored = await input.credentials.read([
    "refresh_token",
    "access_token",
  ]);

  const token =
    stored.refresh_token?.trim() ||
    stored.access_token?.trim();

  if (!token) {
    return {
      revoked: true,
      revokedAt: new Date().toISOString(),
    };
  }

  try {
    const response = await fetch(REVOCATION_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ token }).toString(),
      cache: "no-store",
      redirect: "error",
      signal: providerSignal(input.signal),
    });

    /*
     * A 400 means Google no longer recognizes the token.
     * The authorization is therefore already effectively revoked.
     */
    if (!response.ok && response.status !== 400) {
      throw new IntegrationRuntimeError(
        "Google could not revoke the OAuth authorization.",
        {
          code: "GOOGLE_OAUTH_REVOCATION_REJECTED",
          category: response.status >= 500 ? "provider" : "authentication",
          status: response.status >= 500 ? 502 : 401,
          retryable: response.status >= 500,
        },
      );
    }

    return {
      revoked: true,
      revokedAt: new Date().toISOString(),
    };
  }
  catch (error) {
    if (error instanceof IntegrationRuntimeError) {
      throw error;
    }

    throw new IntegrationRuntimeError(
      "J10 could not reach Google securely to revoke authorization.",
      {
        code: "GOOGLE_OAUTH_REVOCATION_NETWORK_ERROR",
        category: "network",
        status: 502,
        retryable: true,
      },
    );
  }
}