import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createIntegrationApiClient,
  getAuthenticatedIntegrationUser,
  integrationApiErrorResponse,
  writeIntegrationActivity,
} from "@/lib/integrations/api";

import {
  canTransitionIntegrationStatus,
} from "@/lib/integrations/connection-status";

import {
  getIntegrationConnectionById,
  updateIntegrationConnectionStatus,
} from "@/lib/integrations/database";

import {
  IntegrationOAuthError,
  isIntegrationOAuthError,
} from "@/lib/integrations/oauth/errors";

import {
  createIntegrationOAuthPkcePair,
  createIntegrationOAuthStateNonce,
} from "@/lib/integrations/oauth/pkce";

import {
  buildIntegrationOAuthAuthorizationUrl,
  resolveIntegrationOAuthProviderRuntime,
} from "@/lib/integrations/oauth/provider-client";

import {
  createIntegrationOAuthTransaction,
  createIntegrationOAuthTransactionCookie,
  sealIntegrationOAuthTransaction,
} from "@/lib/integrations/oauth/state";

import {
  IntegrationOAuthTokenError,
} from "@/lib/integrations/oauth/token-lifecycle";

import {
  getIntegrationProvider,
} from "@/lib/integrations/registry";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export const dynamic =
  "force-dynamic";

function oauthErrorResponse(
  error: unknown,
): NextResponse {
  if (
    isIntegrationOAuthError(
      error,
    )
  ) {
    return NextResponse.json(
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
        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  }

  if (
    error instanceof
    IntegrationOAuthTokenError
  ) {
    return NextResponse.json(
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
        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  }

  return integrationApiErrorResponse(
    error,
    "J10 NEXUS could not start OAuth authorization.",
  );
}

export async function GET(
  request: NextRequest,
  context: RouteContext,
) {
  try {
    const { id } =
      await context.params;

    const supabase =
      await createIntegrationApiClient();

    const user =
      await getAuthenticatedIntegrationUser(
        supabase,
      );

    if (!user) {
      return NextResponse.json(
        {
          success:
            false,
          error:
            "Unauthorized.",
        },
        {
          status:
            401,
          headers: {
            "Cache-Control":
              "no-store",
          },
        },
      );
    }

    const connection =
      await getIntegrationConnectionById(
        supabase,
        user.id,
        id,
      );

    if (!connection) {
      return NextResponse.json(
        {
          success:
            false,
          error:
            "Integration connection was not found.",
        },
        {
          status:
            404,
          headers: {
            "Cache-Control":
              "no-store",
          },
        },
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

    /*
     * Provider credentials are resolved before any database
     * status change. A missing provider configuration therefore
     * cannot leave a connection stranded in pending state.
     */
    const runtime =
      resolveIntegrationOAuthProviderRuntime(
        request,
        connection.providerId,
      );

    const pkce =
      createIntegrationOAuthPkcePair();

    const state =
      createIntegrationOAuthStateNonce();

    const transaction =
      createIntegrationOAuthTransaction(
        {
          userId:
            user.id,
          connectionId:
            connection.id,
          providerId:
            connection.providerId,
          state,
          codeVerifier:
            pkce.codeVerifier,
          returnTo:
            request.nextUrl
              .searchParams
              .get(
                "returnTo",
              ) ??
            undefined,
        },
      );

    const sealedTransaction =
      sealIntegrationOAuthTransaction(
        transaction,
      );

    const transactionCookie =
      createIntegrationOAuthTransactionCookie(
        sealedTransaction,
      );

    const authorizationUrl =
      buildIntegrationOAuthAuthorizationUrl(
        {
          runtime,
          state,
          codeChallenge:
            pkce.codeChallenge,
        },
      );

    if (
      canTransitionIntegrationStatus(
        connection.status,
        "pending",
      )
    ) {
      await updateIntegrationConnectionStatus(
        supabase,
        user.id,
        connection.id,
        {
          status:
            "pending",
          reason:
            "OAuth authorization started.",
          metadata: {
            provider_id:
              provider.id,
            source:
              "integration_oauth_authorize",
          },
        },
      );
    }

    await writeIntegrationActivity(
      supabase,
      {
        userId:
          user.id,
        action:
          "integration_oauth_authorization_started",
        entityId:
          connection.id,
        title:
          `${provider.name} authorization started`,
        description:
          `Secure OAuth authorization started for ${provider.name}.`,
        metadata: {
          provider_id:
            provider.id,
          pkce:
            "S256",
          source:
            "integration_oauth_authorize",
        },
      },
    );

    const response =
      NextResponse.redirect(
        authorizationUrl,
        302,
      );

    response.cookies.set(
      transactionCookie.name,
      transactionCookie.value,
      {
        httpOnly:
          transactionCookie.httpOnly,
        secure:
          transactionCookie.secure,
        sameSite:
          transactionCookie.sameSite,
        path:
          transactionCookie.path,
        maxAge:
          transactionCookie.maxAge,
      },
    );

    response.headers.set(
      "Cache-Control",
      "no-store",
    );

    return response;
  }
  catch (
    error
  ) {
    return oauthErrorResponse(
      error,
    );
  }
}