import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { IntegrationConnection } from "@/types/integration";
import type {
  IntegrationRuntimeCredentialReader,
  IntegrationRuntimeHealthResult,
} from "@/types/integration-runtime";
import { IntegrationRuntimeError } from "@/types/integration-runtime";
import { getIntegrationCredentials } from "./credentials";
import { getIntegrationProvider } from "./registry";
import { getIntegrationRuntimeAdapter } from "./runtime-registry";

const OAUTH_CREDENTIAL_KEYS = [
  "access_token",
  "refresh_token",
  "expires_at",
  "token_type",
  "scope",
] as const;

class HealthCredentialReader implements IntegrationRuntimeCredentialReader {
  constructor(
    private readonly values: Readonly<Record<string, string>>,
    private readonly allowedKeys: ReadonlySet<string>,
  ) {}

  async read(
    keys: readonly string[],
  ): Promise<Readonly<Record<string, string>>> {
    const result: Record<string, string> = {};

    for (const key of keys) {
      if (!this.allowedKeys.has(key)) {
        throw new IntegrationRuntimeError(
          "The health runtime requested a forbidden credential field.",
          {
            code: "INTEGRATION_RUNTIME_CREDENTIAL_ACCESS_DENIED",
            category: "internal",
            status: 500,
          },
        );
      }

      const value = this.values[key];

      if (typeof value === "string") {
        result[key] = value;
      }
    }

    return result;
  }
}

export async function executeIntegrationRuntimeHealthCheck(input: {
  readonly supabase: SupabaseClient;
  readonly userId: string;
  readonly connection: IntegrationConnection;
  readonly requestId: string;
  readonly signal: AbortSignal;
}): Promise<IntegrationRuntimeHealthResult> {
  const adapter = getIntegrationRuntimeAdapter(input.connection.providerId);

  if (!adapter || !adapter.manifest.supportsHealthChecks || !adapter.healthCheck) {
    throw new IntegrationRuntimeError(
      "The provider does not have an installed health-check runtime.",
      {
        code: "INTEGRATION_RUNTIME_HEALTH_NOT_INSTALLED",
        category: "configuration",
        status: 501,
      },
    );
  }

  const stored = await getIntegrationCredentials(
    input.supabase,
    input.userId,
    input.connection.id,
  );

  if (!stored) {
    throw new IntegrationRuntimeError("Secure integration credentials are required.", {
      code: "INTEGRATION_CREDENTIALS_MISSING",
      category: "authentication",
      status: 401,
    });
  }

  const provider = getIntegrationProvider(input.connection.providerId);
  const allowedKeys = new Set<string>(
    provider.auth.type === "oauth2" ? OAUTH_CREDENTIAL_KEYS : [],
  );

  for (const field of provider.auth.setupFields) {
    if (field.storage === "credential_vault") {
      allowedKeys.add(field.key);
    }
  }

  return adapter.healthCheck({
    requestId: input.requestId,
    correlationId: input.requestId,
    userId: input.userId,
    connection: input.connection,
    environment: input.connection.environment,
    signal: input.signal,
    credentials: new HealthCredentialReader(stored.values, allowedKeys),
  });
}
