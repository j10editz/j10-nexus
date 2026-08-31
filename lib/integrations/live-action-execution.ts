import "server-only";

import type {
  SupabaseClient,
} from "@supabase/supabase-js";

import type {
  IntegrationConnection,
} from "@/types/integration";

import type {
  IntegrationActionAdapterResult,
  IntegrationActionRequest,
} from "@/types/integration-action";

import type {
  IntegrationOAuthTokenSet,
} from "@/types/integration-oauth-token";

import type {
  IntegrationRuntimeCredentialReader,
} from "@/types/integration-runtime";

import {
  IntegrationRuntimeError,
} from "@/types/integration-runtime";

import {
  getIntegrationCredentials,
  IntegrationCredentialError,
  storeIntegrationCredentials,
} from "./credentials";

import {
  IntegrationActionError,
} from "./external-action-adapter";

import {
  evaluateIntegrationOAuthTokenLifecycle,
  IntegrationOAuthTokenError,
  readIntegrationOAuthTokenSet,
  requireIntegrationOAuthAccessToken,
} from "./oauth/token-lifecycle";

import {
  requireIntegrationRuntimeAdapter,
} from "./runtime-registry";

import {
  getIntegrationProvider,
} from "./registry";

const ALLOWED_OAUTH_CREDENTIAL_KEYS =
  new Set([
    "access_token",
    "refresh_token",
    "expires_at",
    "token_type",
    "scope",
  ]);

class RestrictedOAuthCredentialReader
implements IntegrationRuntimeCredentialReader {
  private values:
  Readonly<Record<string, string>>;

  private readonly allowedKeys:
  ReadonlySet<string>;

  constructor(
    values:
      Readonly<Record<string, string>>,
    allowedKeys:
      ReadonlySet<string> = ALLOWED_OAUTH_CREDENTIAL_KEYS,
  ) {
    this.values = values;
    this.allowedKeys = allowedKeys;
  }

  replace(
    values:
      Readonly<Record<string, string>>,
  ): void {
    this.values = values;
  }

  async read(
    keys: readonly string[],
  ): Promise<Readonly<Record<string, string>>> {
    const result:
      Record<string, string> = {};

    for (const key of keys) {
      if (
        !this.allowedKeys.has(
          key,
        )
      ) {
        throw new IntegrationRuntimeError(
          "The runtime requested a forbidden credential field.",
          {
            code:
              "INTEGRATION_RUNTIME_CREDENTIAL_ACCESS_DENIED",
            category:
              "internal",
            status: 500,
          },
        );
      }

      const value =
        this.values[key];

      if (
        typeof value === "string"
      ) {
        result[key] = value;
      }
    }

    return result;
  }
}

function tokenSetToCredentialValues(
  tokenSet:
    IntegrationOAuthTokenSet,
): Readonly<Record<string, string>> {
  const values:
    Record<string, string> = {
      access_token:
        tokenSet.accessToken,
      token_type:
        tokenSet.tokenType,
      scope:
        tokenSet.scopes.join(" "),
    };

  if (tokenSet.refreshToken) {
    values.refresh_token =
      tokenSet.refreshToken;
  }

  if (tokenSet.expiresAt) {
    values.expires_at =
      tokenSet.expiresAt;
  }

  return values;
}

function assertRequiredScopes(
  requiredScopes: readonly string[],
  grantedScopes: readonly string[],
): void {
  const granted =
    new Set(grantedScopes);

  const missing =
    requiredScopes.filter(
      (scope) =>
        !granted.has(scope),
    );

  if (missing.length > 0) {
    throw new IntegrationRuntimeError(
      "The integration authorization is missing a required scope.",
      {
        code:
          "INTEGRATION_RUNTIME_SCOPE_MISSING",
        category:
          "authorization",
        status: 403,
        details: {
          missingScopes:
            missing,
        },
      },
    );
  }
}

function toActionError(
  error: unknown,
): IntegrationActionError {
  if (
    error instanceof
    IntegrationActionError
  ) {
    return error;
  }

  if (
    error instanceof
    IntegrationRuntimeError
  ) {
    return new IntegrationActionError(
      error.message,
      error.code,
      error.status,
      {
        category:
          error.category,
        retryable:
          error.retryable,
        retryAfterSeconds:
          error.retryAfterSeconds,
        runtimeDetails:
          error.details,
      },
    );
  }

  if (
    error instanceof
    IntegrationOAuthTokenError
  ) {
    return new IntegrationActionError(
      error.message,
      error.code,
      error.status,
      error.details,
    );
  }

  if (
    error instanceof
    IntegrationCredentialError
  ) {
    return new IntegrationActionError(
      error.message,
      error.code,
      500,
    );
  }

  return new IntegrationActionError(
    "The live integration runtime could not complete the action.",
    "INTEGRATION_LIVE_RUNTIME_FAILED",
    500,
  );
}

export async function executeLiveIntegrationAction(
  input: {
    readonly supabase:
      SupabaseClient;
    readonly userId:
      string;
    readonly connection:
      IntegrationConnection;
    readonly request:
      IntegrationActionRequest;
    readonly executionId:
      string;
    readonly correlationId:
      string;
    readonly signal:
      AbortSignal;
  },
): Promise<IntegrationActionAdapterResult> {
  try {
    if (
      input.request.mode !==
      "live"
    ) {
      throw new IntegrationRuntimeError(
        "The live runtime only accepts live actions.",
        {
          code:
            "INTEGRATION_LIVE_MODE_REQUIRED",
          category:
            "configuration",
          status: 409,
        },
      );
    }

    const adapter =
      requireIntegrationRuntimeAdapter(
        input.connection.providerId,
        "live",
        input.connection.environment,
        input.request.capabilityId,
      );

    if (!adapter.executeAction) {
      throw new IntegrationRuntimeError(
        "The provider runtime does not implement actions.",
        {
          code:
            "INTEGRATION_RUNTIME_ACTION_NOT_INSTALLED",
          category:
            "configuration",
          status: 501,
        },
      );
    }

    const capability =
      adapter.manifest.capabilities.find(
        (item) =>
          item.capabilityId ===
          input.request.capabilityId,
      );

    if (!capability) {
      throw new IntegrationRuntimeError(
        "The provider runtime capability is not installed.",
        {
          code:
            "INTEGRATION_RUNTIME_CAPABILITY_NOT_INSTALLED",
          category:
            "configuration",
          status: 501,
        },
      );
    }

    if (adapter.manifest.authType !== "oauth2") {
      const storedCredentials =
        await getIntegrationCredentials(
          input.supabase,
          input.userId,
          input.connection.id,
        );

      if (!storedCredentials) {
        throw new IntegrationRuntimeError(
          "Secure integration credentials are required.",
          {
            code: "INTEGRATION_CREDENTIALS_MISSING",
            category: "authentication",
            status: 401,
          },
        );
      }

      const provider = getIntegrationProvider(
        input.connection.providerId,
      );
      const allowedCredentialKeys = new Set(
        provider.auth.setupFields
          .filter((field) => field.storage === "credential_vault")
          .map((field) => field.key),
      );
      const credentialReader = new RestrictedOAuthCredentialReader(
        storedCredentials.values,
        allowedCredentialKeys,
      );

      assertRequiredScopes(
        capability.requiredScopes,
        input.connection.grantedScopes,
      );

      const result = await adapter.executeAction({
        requestId: input.executionId,
        correlationId: input.correlationId,
        userId: input.userId,
        connection: input.connection,
        environment: input.connection.environment,
        signal: input.signal,
        credentials: credentialReader,
        capabilityId: input.request.capabilityId,
        mode: "live",
        idempotencyKey: input.request.idempotencyKey,
        input: input.request.input,
      });

      return {
        success: result.success,
        responseStatus: result.responseStatus,
        metadata: {
          ...result.metadata,
          runtimeAdapterId: adapter.manifest.adapterId,
          runtimeAdapterVersion: adapter.manifest.adapterVersion,
          providerRequestId: result.providerRequestId,
          rateLimit: result.rateLimit,
        },
      };
    }

    const tokenSet =
      await readIntegrationOAuthTokenSet(
        input.supabase,
        input.userId,
        input.connection.id,
      );

    if (!tokenSet) {
      requireIntegrationOAuthAccessToken(
        tokenSet,
      );

      throw new IntegrationRuntimeError(
        "OAuth authorization is required.",
        {
          code:
            "INTEGRATION_OAUTH_TOKEN_MISSING",
          category:
            "authentication",
          status: 401,
        },
      );
    }

    let credentialValues =
      tokenSetToCredentialValues(
        tokenSet,
      );

    const credentialReader =
      new RestrictedOAuthCredentialReader(
        credentialValues,
      );

    let grantedScopes =
      tokenSet.scopes.length > 0
        ? tokenSet.scopes
        : input.connection.grantedScopes;

    const context = {
      requestId:
        input.executionId,
      correlationId:
        input.correlationId,
      userId:
        input.userId,
      connection:
        input.connection,
      environment:
        input.connection.environment,
      signal:
        input.signal,
      credentials:
        credentialReader,
    } as const;

    const lifecycle =
      evaluateIntegrationOAuthTokenLifecycle(
        tokenSet,
      );

    if (lifecycle.refreshRequired) {
      if (!adapter.refreshAuthorization) {
        throw new IntegrationRuntimeError(
          "The provider runtime cannot refresh OAuth authorization.",
          {
            code:
              "INTEGRATION_RUNTIME_REFRESH_NOT_INSTALLED",
            category:
              "configuration",
            status: 503,
          },
        );
      }

      const refreshed =
        await adapter.refreshAuthorization({
          ...context,
          grantedScopes,
        });

      await storeIntegrationCredentials(
        input.supabase,
        input.userId,
        {
          connectionId:
            input.connection.id,
          values:
            refreshed.credentialValues,
        },
      );

      credentialValues =
        refreshed.credentialValues;

      credentialReader.replace(
        credentialValues,
      );

      grantedScopes =
        refreshed.grantedScopes;
    }
    else {
      requireIntegrationOAuthAccessToken(
        tokenSet,
      );
    }

    assertRequiredScopes(
      capability.requiredScopes,
      grantedScopes,
    );

    const result =
      await adapter.executeAction({
        ...context,
        capabilityId:
          input.request.capabilityId,
        mode:
          "live",
        idempotencyKey:
          input.request.idempotencyKey,
        input:
          input.request.input,
      });

    return {
      success:
        result.success,
      responseStatus:
        result.responseStatus,
      metadata: {
        ...result.metadata,
        runtimeAdapterId:
          adapter.manifest.adapterId,
        runtimeAdapterVersion:
          adapter.manifest.adapterVersion,
        providerRequestId:
          result.providerRequestId,
        rateLimit:
          result.rateLimit,
      },
    };
  }
  catch (error) {
    throw toActionError(error);
  }
}
