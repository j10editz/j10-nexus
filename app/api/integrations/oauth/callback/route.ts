import {
  NextRequest,
  NextResponse,
} from "next/server";

import type {
  SupabaseClient,
} from "@supabase/supabase-js";

import type {
  IntegrationConnection,
  IntegrationProviderId,
} from "@/types/integration";

import {
  INTEGRATION_OAUTH_COOKIE_NAME,
} from "@/types/integration-oauth";

import type {
  IntegrationOAuthCookieDefinition,
  IntegrationOAuthTransaction,
} from "@/types/integration-oauth";

import {
  createIntegrationApiClient,
  getAuthenticatedIntegrationUser,
  integrationApiErrorResponse,
  writeIntegrationActivity,
} from "@/lib/integrations/api";

import {
  getIntegrationConnectionById,
  updateIntegrationConnectionStatus,
} from "@/lib/integrations/database";

import {
  IntegrationOAuthError,
  isIntegrationOAuthError,
} from "@/lib/integrations/oauth/errors";

import {
  exchangeIntegrationOAuthAuthorizationCode,
  resolveIntegrationOAuthProviderRuntime,
} from "@/lib/integrations/oauth/provider-client";

import {
  assertIntegrationOAuthState,
  createClearedIntegrationOAuthTransactionCookie,
  openIntegrationOAuthTransaction,
} from "@/lib/integrations/oauth/state";

import {
  IntegrationOAuthTokenError,
  storeIntegrationOAuthTokenSet,
} from "@/lib/integrations/oauth/token-lifecycle";

import {
  getIntegrationProvider,
} from "@/lib/integrations/registry";

export const dynamic =
  "force-dynamic";

const PROVIDER_AUTHORIZATION_ERROR_PATTERN =
  /^[A-Za-z0-9._~-]{1,160}$/;

function setOAuthCookie(
  response: NextResponse,
  cookie:
    IntegrationOAuthCookieDefinition,
): void {
  response.cookies.set(
    cookie.name,
    cookie.value,
    {
      httpOnly:
        cookie.httpOnly,
      secure:
        cookie.secure,
      sameSite:
        cookie.sameSite,
      path:
        cookie.path,
      maxAge:
        cookie.maxAge,
    },
  );
}

function clearOAuthCookie(
  response: NextResponse,
): NextResponse {
  setOAuthCookie(
    response,
    createClearedIntegrationOAuthTransactionCookie(),
  );

  response.headers.set(
    "Cache-Control",
    "no-store",
  );

  return response;
}

function createCallbackRedirect(
  request: NextRequest,
  returnTo: string,
  status:
    | "success"
    | "error",
  providerId:
    IntegrationProviderId,
  code?: string,
): NextResponse {
  const requestOrigin =
    new URL(
      request.url,
    ).origin;

  const redirectUrl =
    new URL(
      returnTo,
      requestOrigin,
    );

  if (
    redirectUrl.origin !==
    requestOrigin
  ) {
    throw new IntegrationOAuthError(
      "INTEGRATION_OAUTH_INVALID_RETURN_TO",
      "The OAuth return destination is invalid.",
      400,
    );
  }

  redirectUrl.searchParams.set(
    "integration_oauth",
    status,
  );

  redirectUrl.searchParams.set(
    "provider",
    providerId,
  );

  if (code) {
    redirectUrl.searchParams.set(
      "integration_oauth_code",
      code.slice(
        0,
        160,
      ),
    );
  }
  else {
    redirectUrl.searchParams.delete(
      "integration_oauth_code",
    );
  }

  return clearOAuthCookie(
    NextResponse.redirect(
      redirectUrl,
      302,
    ),
  );
}

function createCallbackJsonError(
  error: unknown,
): NextResponse {
  if (
    isIntegrationOAuthError(
      error,
    )
  ) {
    return clearOAuthCookie(
      NextResponse.json(
        {
          success:
            false,
          error:
            error.message,
          code:
            error.code,
        },
        {
          status:
            error.status,
        },
      ),
    );
  }

  if (
    error instanceof
    IntegrationOAuthTokenError
  ) {
    return clearOAuthCookie(
      NextResponse.json(
        {
          success:
            false,
          error:
            error.message,
          code:
            error.code,
        },
        {
          status:
            error.status,
        },
      ),
    );
  }

  return clearOAuthCookie(
    integrationApiErrorResponse(
      error,
      "J10 NEXUS could not complete OAuth authorization.",
    ),
  );
}

function getPublicErrorCode(
  error: unknown,
): string {
  if (
    isIntegrationOAuthError(
      error,
    ) ||
    error instanceof
      IntegrationOAuthTokenError
  ) {
    return error.code;
  }

  return "INTEGRATION_OAUTH_CALLBACK_FAILED";
}

function normalizeProviderAuthorizationError(
  value: string | null,
): string | null {
  if (value === null) {
    return null;
  }

  const normalizedValue =
    value.trim();

  if (
    PROVIDER_AUTHORIZATION_ERROR_PATTERN.test(
      normalizedValue,
    )
  ) {
    return normalizedValue;
  }

  return "oauth_error";
}

async function recordProviderAuthorizationFailure(
  supabase:
    SupabaseClient,
  userId: string,
  connection:
    IntegrationConnection,
  providerError: string,
): Promise<void> {
  const provider =
    getIntegrationProvider(
      connection.providerId,
    );

  if (
    connection.status ===
    "pending"
  ) {
    await updateIntegrationConnectionStatus(
      supabase,
      userId,
      connection.id,
      {
        status:
          "error",
        reason:
          "OAuth authorization was not completed.",
        errorCode:
          "INTEGRATION_OAUTH_PROVIDER_ERROR",
        errorMessage:
          "OAuth authorization was not completed.",
        metadata: {
          provider_id:
            provider.id,
          provider_error:
            providerError,
          source:
            "integration_oauth_callback",
        },
      },
    );
  }

  await writeIntegrationActivity(
    supabase,
    {
      userId,
      action:
        "integration_oauth_authorization_failed",
      entityId:
        connection.id,
      title:
        `${provider.name} authorization not completed`,
      description:
        `OAuth authorization was not completed for ${provider.name}.`,
      metadata: {
        provider_id:
          provider.id,
        provider_error:
          providerError,
        source:
          "integration_oauth_callback",
      },
    },
  );
}

export async function GET(
  request: NextRequest,
) {
  let transaction:
    IntegrationOAuthTransaction | null =
    null;

  try {
    const sealedTransaction =
      request.cookies.get(
        INTEGRATION_OAUTH_COOKIE_NAME,
      )?.value;

    if (!sealedTransaction) {
      throw new IntegrationOAuthError(
        "INTEGRATION_OAUTH_INVALID_TRANSACTION",
        "The OAuth authorization session is missing. Start the connection again.",
        400,
      );
    }

    transaction =
      openIntegrationOAuthTransaction(
        sealedTransaction,
      );

    assertIntegrationOAuthState(
      request.nextUrl
        .searchParams
        .get(
          "state",
        ),
      transaction,
    );

    const supabase =
      await createIntegrationApiClient();

    const user =
      await getAuthenticatedIntegrationUser(
        supabase,
      );

    if (
      !user ||
      user.id !==
        transaction.userId
    ) {
      throw new IntegrationOAuthError(
        "INTEGRATION_OAUTH_INVALID_TRANSACTION",
        "The OAuth authorization session does not match the authenticated user.",
        401,
      );
    }

    const connection =
      await getIntegrationConnectionById(
        supabase,
        user.id,
        transaction.connectionId,
      );

    if (!connection) {
      throw new IntegrationOAuthError(
        "INTEGRATION_OAUTH_INVALID_TRANSACTION",
        "The OAuth integration connection was not found.",
        404,
      );
    }

    if (
      connection.providerId !==
      transaction.providerId
    ) {
      throw new IntegrationOAuthError(
        "INTEGRATION_OAUTH_INVALID_TRANSACTION",
        "The OAuth provider does not match the integration connection.",
        400,
      );
    }

    const provider =
      getIntegrationProvider(
        connection.providerId,
      );

    if (
      provider.auth.type !==
      "oauth2"
    ) {
      throw new IntegrationOAuthError(
        "INTEGRATION_OAUTH_CONFIGURATION_ERROR",
        `${provider.name} does not use OAuth authorization.`,
        400,
      );
    }

    const providerAuthorizationError =
      normalizeProviderAuthorizationError(
        request.nextUrl
          .searchParams
          .get(
            "error",
          ),
      );

    if (
      providerAuthorizationError
    ) {
      await recordProviderAuthorizationFailure(
        supabase,
        user.id,
        connection,
        providerAuthorizationError,
      );

      return createCallbackRedirect(
        request,
        transaction.returnTo,
        "error",
        connection.providerId,
        "INTEGRATION_OAUTH_PROVIDER_ERROR",
      );
    }

    const authorizationCode =
      request.nextUrl
        .searchParams
        .get(
          "code",
        );

    if (!authorizationCode) {
      throw new IntegrationOAuthError(
        "INTEGRATION_OAUTH_INVALID_TRANSACTION",
        "The OAuth provider did not return an authorization code.",
        400,
      );
    }

    const runtime =
      resolveIntegrationOAuthProviderRuntime(
        request,
        connection.providerId,
      );

    const tokenSet =
      await exchangeIntegrationOAuthAuthorizationCode(
        {
          runtime,
          authorizationCode,
          codeVerifier:
            transaction.codeVerifier,
        },
      );

    await storeIntegrationOAuthTokenSet(
      supabase,
      user.id,
      connection.id,
      tokenSet,
    );

    const {
      error:
        scopeUpdateError,
    } =
      await supabase
        .from(
          "integrations",
        )
        .update({
          granted_scopes: [
            ...tokenSet.scopes,
          ],
        })
        .eq(
          "id",
          connection.id,
        )
        .eq(
          "user_id",
          user.id,
        );

    if (
      scopeUpdateError
    ) {
      throw new IntegrationOAuthTokenError(
        "INTEGRATION_OAUTH_STORAGE_ERROR",
        "J10 could not save the granted OAuth permissions.",
        500,
      );
    }

    await updateIntegrationConnectionStatus(
      supabase,
      user.id,
      connection.id,
      {
        status:
          "connected",
        reason:
          "OAuth authorization completed.",
        metadata: {
          provider_id:
            provider.id,
          scope_count:
            tokenSet.scopes.length,
          has_refresh_token:
            Boolean(
              tokenSet.refreshToken,
            ),
          source:
            "integration_oauth_callback",
        },
      },
    );

    await writeIntegrationActivity(
      supabase,
      {
        userId:
          user.id,
        action:
          "integration_oauth_authorization_completed",
        entityId:
          connection.id,
        title:
          `${provider.name} connected`,
        description:
          `${provider.name} OAuth authorization completed securely.`,
        metadata: {
          provider_id:
            provider.id,
          scope_count:
            tokenSet.scopes.length,
          has_refresh_token:
            Boolean(
              tokenSet.refreshToken,
            ),
          expires_at:
            tokenSet.expiresAt,
          source:
            "integration_oauth_callback",
        },
      },
    );

    return createCallbackRedirect(
      request,
      transaction.returnTo,
      "success",
      connection.providerId,
    );
  }
  catch (
    error
  ) {
    if (
      transaction
    ) {
      console.error(
        "Integration OAuth callback failed.",
        {
          code:
            getPublicErrorCode(
              error,
            ),
        },
      );

      return createCallbackRedirect(
        request,
        transaction.returnTo,
        "error",
        transaction.providerId,
        getPublicErrorCode(
          error,
        ),
      );
    }

    return createCallbackJsonError(
      error,
    );
  }
}