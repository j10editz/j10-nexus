import {
  NextResponse,
} from "next/server";

import type {
  IntegrationHealthCheckResult,
} from "../../../../../types/integration-readiness";

import {
  createIntegrationApiClient,
  getAuthenticatedIntegrationUser,
  integrationApiErrorResponse,
  serializeIntegrationConnection,
  writeIntegrationActivity,
} from "../../../../../lib/integrations/api";

import {
  getIntegrationConnectionById,
  updateIntegrationConnectionStatus,
} from "../../../../../lib/integrations/database";

import {
  recordIntegrationHealthCheck,
} from "../../../../../lib/integrations/health-database";

import {
  evaluateIntegrationReadiness,
} from "../../../../../lib/integrations/readiness";

import {
  getIntegrationProvider,
} from "../../../../../lib/integrations/registry";

import {
  executeIntegrationRuntimeHealthCheck,
} from "../../../../../lib/integrations/runtime-health-execution";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

const HEALTH_CHECK_COOLDOWN_MS =
  15_000;

async function loadAuthorizedConnection(
  context: RouteContext,
) {
  const {
    id,
  } = await context.params;

  const supabase =
    await createIntegrationApiClient();

  const user =
    await getAuthenticatedIntegrationUser(
      supabase,
    );

  if (!user) {
    return {
      response: NextResponse.json(
        {
          success: false,
          error: "Unauthorized.",
        },
        {
          status: 401,
        },
      ),
    } as const;
  }

  const connection =
    await getIntegrationConnectionById(
      supabase,
      user.id,
      id,
    );

  if (!connection) {
    return {
      response: NextResponse.json(
        {
          success: false,
          error:
            "Integration connection was not found.",
        },
        {
          status: 404,
        },
      ),
    } as const;
  }

  return {
    supabase,
    user,
    connection,
  } as const;
}

export async function GET(
  _request: Request,
  context: RouteContext,
) {
  try {
    const authorized =
      await loadAuthorizedConnection(
        context,
      );

    if ("response" in authorized) {
      return authorized.response;
    }

    return NextResponse.json({
      success: true,

      readiness:
        evaluateIntegrationReadiness(
          authorized.connection,
        ),

      integration:
        serializeIntegrationConnection(
          authorized.connection,
        ),
    });
  } catch (error) {
    return integrationApiErrorResponse(
      error,
      "J10 NEXUS could not evaluate integration readiness.",
    );
  }
}

export async function POST(
  request: Request,
  context: RouteContext,
) {
  const startedAt = Date.now();

  try {
    const authorized =
      await loadAuthorizedConnection(
        context,
      );

    if ("response" in authorized) {
      return authorized.response;
    }

    const {
      supabase,
      user,
      connection,
    } = authorized;

    const provider =
      getIntegrationProvider(
        connection.providerId,
      );

    const readiness =
      evaluateIntegrationReadiness(
        connection,
      );

    if (!provider.supportsHealthChecks) {
      const result:
        IntegrationHealthCheckResult = {
        connectionId:
          connection.id,

        providerId:
          connection.providerId,

        checkedAt:
          new Date().toISOString(),

        durationMs:
          Date.now() - startedAt,

        outcome:
          "unsupported",

        mode:
          "none",

        liveRequestPerformed:
          false,

        message:
          `${provider.name} does not currently expose a health-check adapter.`,

        readiness,
      };

      return NextResponse.json({
        success: true,
        result,

        integration:
          serializeIntegrationConnection(
            connection,
          ),
      });
    }

    if (connection.lastHealthCheckAt) {
      const elapsed =
        Date.now() -
        new Date(
          connection.lastHealthCheckAt,
        ).getTime();

      if (
        Number.isFinite(elapsed) &&
        elapsed >= 0 &&
        elapsed <
          HEALTH_CHECK_COOLDOWN_MS
      ) {
        const retryAfterSeconds =
          Math.ceil(
            (
              HEALTH_CHECK_COOLDOWN_MS -
              elapsed
            ) / 1000,
          );

        return NextResponse.json(
          {
            success: false,

            error:
              `Wait ${retryAfterSeconds} seconds before checking this connection again.`,

            code:
              "INTEGRATION_HEALTH_CHECK_COOLDOWN",

            retryAfterSeconds,
          },
          {
            status: 429,

            headers: {
              "Retry-After":
                String(
                  retryAfterSeconds,
                ),
            },
          },
        );
      }
    }

    const checkedAt = new Date().toISOString();

    const runtimeResult = readiness.canRunHealthCheck
      ? await executeIntegrationRuntimeHealthCheck({
          supabase,
          userId: user.id,
          connection,
          requestId: crypto.randomUUID(),
          signal: request.signal,
        })
      : null;

    let updatedConnection =
      await recordIntegrationHealthCheck(
        supabase,
        user.id,
        connection.id,
        checkedAt,
      );

    if (
      runtimeResult?.healthy &&
      updatedConnection.status !== "connected"
    ) {
      updatedConnection =
        await updateIntegrationConnectionStatus(
          supabase,
          user.id,
          connection.id,
          {
            status: "connected",
            reason: "Live provider health check passed.",
            metadata: {
              health_check_mode: "provider",
              external_account_id:
                runtimeResult.externalAccountId,
              external_account_label:
                runtimeResult.externalAccountLabel,
            },
          },
        );
    }

    const updatedReadiness =
      evaluateIntegrationReadiness(
        updatedConnection,
      );

    const outcome = runtimeResult?.healthy
      ? "passed"
      : "blocked";

    const message =
      outcome === "passed"
        ? `${provider.name} passed the live provider health check.`
        : updatedReadiness
              .blockers[0]
              ?.message ??
          `${provider.name} is not ready for a health check.`;

    await writeIntegrationActivity(
      supabase,
      {
        userId:
          user.id,

        action:
          "integration_health_checked",

        entityId:
          connection.id,

        title:
          `${provider.name} readiness checked`,

        description:
          message,

        metadata: {
          provider_id:
            provider.id,

          outcome,

          mode: runtimeResult ? "provider" : "configuration",

          live_request_performed:
            Boolean(runtimeResult),

          blocker_codes:
            updatedReadiness
              .blockers
              .map(
                (blocker) =>
                  blocker.code,
              ),

          source:
            "integration_readiness_api_v1",
        },
      },
    );

    const result:
      IntegrationHealthCheckResult = {
      connectionId:
        connection.id,

      providerId:
        connection.providerId,

      checkedAt,

      durationMs:
        Date.now() - startedAt,

      outcome,

      mode: runtimeResult ? "provider" : "configuration",

      liveRequestPerformed:
        Boolean(runtimeResult),

      message,

      readiness:
        updatedReadiness,
    };

    return NextResponse.json({
      success: true,
      result,

      integration:
        serializeIntegrationConnection(
          updatedConnection,
        ),
    });
  } catch (error) {
    return integrationApiErrorResponse(
      error,
      "J10 NEXUS could not run the integration health check.",
    );
  }
}
