import "server-only";

import type { IntegrationProviderId } from "@/types/integration";
import type {
  IntegrationRuntimeCredentialReader,
  IntegrationRuntimeTokenRefreshResult,
} from "@/types/integration-runtime";
import { IntegrationRuntimeError } from "@/types/integration-runtime";
import {
  IntegrationOAuthTokenError,
  parseIntegrationOAuthTokenResponse,
} from "../../oauth/token-lifecycle";

const TOKEN_ENDPOINT =
  "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const TIMEOUT_MS = 20_000;
const MAX_RESPONSE_BYTES = 64 * 1024;
const MAX_CONFIGURATION_LENGTH = 16_384;

function requireEnvironmentValue(name: string): string {
  const value = process.env[name]?.trim();

  if (!value || value.length > MAX_CONFIGURATION_LENGTH || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new IntegrationRuntimeError(
      "Microsoft OAuth credentials are not configured correctly.",
      { code: "MICROSOFT_OAUTH_CONFIGURATION_INVALID", category: "configuration", status: 503 },
    );
  }

  return value;
}

function providerSignal(signal: AbortSignal): AbortSignal {
  return AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]);
}

function parseScopes(value: string | undefined, fallback: readonly string[]): readonly string[] {
  const scopes = value?.split(/\s+/).map((scope) => scope.trim()).filter(Boolean) ?? [];
  return scopes.length > 0 ? Array.from(new Set(scopes)) : fallback;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text || Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
    throw new IntegrationRuntimeError(
      "Microsoft returned an invalid OAuth response.",
      { code: "MICROSOFT_OAUTH_RESPONSE_INVALID", category: "provider", status: 502 },
    );
  }

  try {
    return JSON.parse(text) as unknown;
  }
  catch {
    throw new IntegrationRuntimeError(
      "Microsoft returned an unreadable OAuth response.",
      { code: "MICROSOFT_OAUTH_RESPONSE_INVALID", category: "provider", status: 502 },
    );
  }
}

export async function refreshMicrosoftOAuthAuthorization(input: {
  readonly providerId: IntegrationProviderId;
  readonly credentials: IntegrationRuntimeCredentialReader;
  readonly grantedScopes: readonly string[];
  readonly signal: AbortSignal;
}): Promise<IntegrationRuntimeTokenRefreshResult> {
  const stored = await input.credentials.read(["refresh_token", "scope"]);
  const refreshToken = stored.refresh_token?.trim();

  if (!refreshToken) {
    throw new IntegrationRuntimeError(
      "Microsoft authorization must be reconnected because no refresh token is available.",
      { code: "MICROSOFT_OAUTH_REFRESH_TOKEN_MISSING", category: "authentication", status: 401 },
    );
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: requireEnvironmentValue("MICROSOFT_OAUTH_CLIENT_ID"),
    client_secret: requireEnvironmentValue("MICROSOFT_OAUTH_CLIENT_SECRET"),
    scope: input.grantedScopes.join(" "),
  });

  try {
    const response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
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
            "Microsoft rejected the OAuth refresh request.",
            { code: error.code, category: "authentication", status: error.status, retryable: response.status >= 500 },
          );
        }
      }

      throw new IntegrationRuntimeError(
        "Microsoft rejected the OAuth refresh request.",
        {
          code: "MICROSOFT_OAUTH_REFRESH_REJECTED",
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

    if (tokenSet.expiresAt) credentialValues.expires_at = tokenSet.expiresAt;

    return {
      credentialValues,
      grantedScopes: tokenSet.scopes,
      expiresAt: tokenSet.expiresAt,
      providerAccountId: null,
      providerAccountLabel: null,
    };
  }
  catch (error) {
    if (error instanceof IntegrationRuntimeError) throw error;

    throw new IntegrationRuntimeError(
      "J10 could not reach Microsoft securely to refresh authorization.",
      {
        code: "MICROSOFT_OAUTH_REFRESH_NETWORK_ERROR",
        category: error instanceof DOMException && error.name === "TimeoutError" ? "timeout" : "network",
        status: 502,
        retryable: true,
      },
    );
  }
}
