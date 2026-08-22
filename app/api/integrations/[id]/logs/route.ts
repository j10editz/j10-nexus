import {
  NextResponse,
} from "next/server";

import type {
  IntegrationLogSeverity,
  IntegrationLogSource,
  IntegrationLogStatus,
} from "../../../../../types/integration-observability";

import {
  createIntegrationApiClient,
  getAuthenticatedIntegrationUser,
  integrationApiErrorResponse,
} from "../../../../../lib/integrations/api";

import {
  getIntegrationConnectionById,
} from "../../../../../lib/integrations/database";

import {
  listIntegrationOperationLogs,
  serializeIntegrationOperationLog,
} from "../../../../../lib/integrations/observability";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

const SEVERITIES =
  new Set<IntegrationLogSeverity>([
    "debug",
    "info",
    "warning",
    "error",
  ]);

const SOURCES =
  new Set<IntegrationLogSource>([
    "action",
    "webhook",
    "system",
  ]);

const STATUSES =
  new Set<IntegrationLogStatus>([
    "received",
    "started",
    "succeeded",
    "failed",
    "blocked",
    "duplicate",
    "retry_scheduled",
    "retrying",
    "exhausted",
  ]);

function optionalFilter<
  T extends string,
>(
  value: string | null,
  allowed: ReadonlySet<T>,
): T | null | undefined {
  if (
    !value ||
    value === "all"
  ) {
    return null;
  }

  return allowed.has(
    value as T,
  )
    ? value as T
    : undefined;
}

export async function GET(
  request: Request,
  context: RouteContext,
) {
  try {
    const {
      id,
    } =
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
          success: false,
          error: "Unauthorized.",
        },
        {
          status: 401,
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
          success: false,
          error:
            "Integration connection was not found.",
        },
        {
          status: 404,
        },
      );
    }

    const url =
      new URL(request.url);

    const severity =
      optionalFilter(
        url.searchParams.get(
          "severity",
        ),
        SEVERITIES,
      );

    const source =
      optionalFilter(
        url.searchParams.get(
          "source",
        ),
        SOURCES,
      );

    const status =
      optionalFilter(
        url.searchParams.get(
          "status",
        ),
        STATUSES,
      );

    if (
      severity === undefined ||
      source === undefined ||
      status === undefined
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "One or more operation-log filters are invalid.",
        },
        {
          status: 400,
        },
      );
    }

    const requestedLimit =
      Number.parseInt(
        url.searchParams.get(
          "limit",
        ) ?? "50",
        10,
      );

    const logs =
      await listIntegrationOperationLogs(
        supabase,
        user.id,
        connection.id,
        {
          limit:
            Number.isFinite(
              requestedLimit,
            )
              ? requestedLimit
              : 50,
          severity,
          source,
          status,
        },
      );

    const summary = {
      total:
        logs.length,

      succeeded:
        logs.filter(
          (log) =>
            log.status ===
            "succeeded",
        ).length,

      failed:
        logs.filter(
          (log) =>
            log.status ===
              "failed" ||
            log.status ===
              "exhausted",
        ).length,

      retrying:
        logs.filter(
          (log) =>
            log.status ===
              "retrying" ||
            log.status ===
              "retry_scheduled",
        ).length,

      blocked:
        logs.filter(
          (log) =>
            log.status ===
            "blocked",
        ).length,
    };

    return NextResponse.json(
      {
        success: true,

        integration: {
          id:
            connection.id,

          providerId:
            connection.providerId,

          name:
            connection.name,
        },

        summary,

        logs:
          logs.map(
            serializeIntegrationOperationLog,
          ),
      },
      {
        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  } catch (error) {
    return integrationApiErrorResponse(
      error,
      "J10 NEXUS could not load integration operation history.",
    );
  }
}