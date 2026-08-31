import { NextResponse } from "next/server";

import {
  INTEGRATION_CONNECTION_STATUSES,
} from "../../../../types/integration";

import type {
  IntegrationConnectionStatus,
} from "../../../../types/integration";

import {
  createIntegrationApiClient,
  getAuthenticatedIntegrationUser,
  integrationApiErrorResponse,
  parseRequestObject,
  parseEnabledCapabilities,
  parsePublicConfiguration,
  serializeIntegrationConnection,
  validateProviderPublicConfiguration,
  writeIntegrationActivity,
} from "../../../../lib/integrations/api";

import {
  deleteIntegrationConnection,
  getIntegrationConnectionById,
  listIntegrationStatusHistory,
  updateIntegrationConnectionConfiguration,
  updateIntegrationConnectionStatus,
} from "../../../../lib/integrations/database";

import {
  getIntegrationProvider,
} from "../../../../lib/integrations/registry";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

const VALID_STATUSES =
  new Set<string>(
    INTEGRATION_CONNECTION_STATUSES,
  );

export async function GET(
  _request: Request,
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

    const statusHistory =
      await listIntegrationStatusHistory(
        supabase,
        user.id,
        connection.id,
      );

    return NextResponse.json({
      success: true,

      integration:
        serializeIntegrationConnection(
          connection,
        ),

      statusHistory,
    });
  } catch (error) {
    return integrationApiErrorResponse(
      error,
      "J10 NEXUS could not load the integration.",
    );
  }
}

export async function PATCH(
  request: Request,
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
          success: false,
          error: "Unauthorized.",
        },
        {
          status: 401,
        },
      );
    }

    const body =
      parseRequestObject(
        await request.json(),
      );

    const requestedStatus =
      typeof body.status === "string"
        ? body.status
            .trim()
            .toLowerCase()
        : "";

    if (
      !VALID_STATUSES.has(
        requestedStatus,
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid integration status.",
        },
        {
          status: 400,
        },
      );
    }

    const reason =
      typeof body.reason === "string"
        ? body.reason.trim() || null
        : null;

    const errorCode =
      typeof body.errorCode === "string"
        ? body.errorCode.trim() || null
        : null;

    const errorMessage =
      typeof body.errorMessage === "string"
        ? body.errorMessage.trim() || null
        : null;

    const metadata =
      body.metadata &&
      typeof body.metadata === "object" &&
      !Array.isArray(body.metadata)
        ? (
            body.metadata as
              Record<string, unknown>
          )
        : {};

    const previousConnection =
      await getIntegrationConnectionById(
        supabase,
        user.id,
        id,
      );

    if (!previousConnection) {
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

    const connection =
      await updateIntegrationConnectionStatus(
        supabase,
        user.id,
        id,
        {
          status:
            requestedStatus as
              IntegrationConnectionStatus,

          reason,
          metadata,
          errorCode,
          errorMessage,
        },
      );

    const provider =
      getIntegrationProvider(
        connection.providerId,
      );

    await writeIntegrationActivity(
      supabase,
      {
        userId: user.id,

        action:
          "integration_status_changed",

        entityId:
          connection.id,

        title:
          `${provider.name} status updated`,

        description:
          `${provider.name} changed from ${previousConnection.status} to ${connection.status}.`,

        metadata: {
          provider_id:
            provider.id,

          previous_status:
            previousConnection.status,

          next_status:
            connection.status,

          reason,

          source:
            "integration_api_v2",
        },
      },
    );

    return NextResponse.json({
      success: true,

      message:
        `${provider.name} status updated successfully.`,

      integration:
        serializeIntegrationConnection(
          connection,
        ),
    });
  } catch (error) {
    return integrationApiErrorResponse(
      error,
      "J10 NEXUS could not update integration status.",
    );
  }
}

export async function PUT(
  request: Request,
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
          success: false,
          error: "Unauthorized.",
        },
        {
          status: 401,
        },
      );
    }

    const body =
      parseRequestObject(
        await request.json(),
      );

    const previousConnection =
      await getIntegrationConnectionById(
        supabase,
        user.id,
        id,
      );

    if (!previousConnection) {
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

    const publicConfiguration =
      parsePublicConfiguration(
        body.publicConfiguration ??
        body.configuration,
      );

    validateProviderPublicConfiguration(
      previousConnection.providerId,
      publicConfiguration,
    );

    const enabledCapabilities =
      body.enabledCapabilities ===
        undefined
        ? previousConnection
            .enabledCapabilities
        : parseEnabledCapabilities(
            body.enabledCapabilities,
          );

    let connection =
      await updateIntegrationConnectionConfiguration(
        supabase,
        user.id,
        id,
        {
          publicConfiguration,
          enabledCapabilities,
        },
      );

    if (
      connection.status === "connected" ||
      connection.status === "degraded" ||
      connection.status === "error"
    ) {
      connection =
        await updateIntegrationConnectionStatus(
          supabase,
          user.id,
          id,
          {
            status: "disconnected",
            reason:
              "Public connection identifiers changed; a new health check is required.",
            metadata: {
              source:
                "integration_configuration_update",
            },
          },
        );
    }

    const provider =
      getIntegrationProvider(
        connection.providerId,
      );

    await writeIntegrationActivity(
      supabase,
      {
        userId: user.id,
        action:
          "integration_configuration_updated",
        entityId:
          connection.id,
        title:
          `${provider.name} identifiers updated`,
        description:
          `${provider.name} public identifiers were corrected. A new health check is required.`,
        metadata: {
          provider_id:
            provider.id,
          changed_fields:
            Object.keys(
              publicConfiguration,
            ),
          source:
            "integration_api_day17c",
        },
      },
    );

    return NextResponse.json({
      success: true,
      message:
        `${provider.name} identifiers updated. Run the health check again.`,
      integration:
        serializeIntegrationConnection(
          connection,
        ),
    });
  } catch (error) {
    return integrationApiErrorResponse(
      error,
      "J10 NEXUS could not update integration identifiers.",
    );
  }
}

export async function DELETE(
  _request: Request,
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
      return NextResponse.json({
        success: true,
        message:
          "Integration is already removed.",
      });
    }

    const provider =
      getIntegrationProvider(
        connection.providerId,
      );

    await deleteIntegrationConnection(
      supabase,
      user.id,
      connection.id,
    );

    await writeIntegrationActivity(
      supabase,
      {
        userId: user.id,

        action:
          "integration_removed",

        entityId: null,

        title:
          `${provider.name} removed`,

        description:
          `${provider.name} was removed from the workspace.`,

        metadata: {
          provider_id:
            provider.id,

          previous_status:
            connection.status,

          source:
            "integration_api_v2",
        },
      },
    );

    return NextResponse.json({
      success: true,

      message:
        `${provider.name} removed successfully.`,
    });
  } catch (error) {
    return integrationApiErrorResponse(
      error,
      "J10 NEXUS could not remove the integration.",
    );
  }
}
