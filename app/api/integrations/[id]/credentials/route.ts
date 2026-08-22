import { NextResponse } from "next/server";

import {
  createIntegrationApiClient,
  getAuthenticatedIntegrationUser,
  IntegrationApiValidationError,
  integrationApiErrorResponse,
  parseRequestObject,
  serializeIntegrationConnection,
  writeIntegrationActivity,
} from "../../../../../lib/integrations/api";

import {
  getIntegrationConnectionById,
  updateIntegrationConnectionStatus,
} from "../../../../../lib/integrations/database";

import {
  deleteIntegrationCredentials,
  storeIntegrationCredentials,
} from "../../../../../lib/integrations/credentials";

import {
  getIntegrationProvider,
} from "../../../../../lib/integrations/registry";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function parseCredentialValues(
  value: unknown,
): Record<string, string> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new IntegrationApiValidationError(
      "Credential values must be a JSON object.",
      "INVALID_CREDENTIAL_VALUES",
    );
  }

  const credentialValues:
    Record<string, string> = {};

  for (
    const [key, item] of Object.entries(
      value as Record<string, unknown>,
    )
  ) {
    if (
      !key.trim() ||
      typeof item !== "string"
    ) {
      throw new IntegrationApiValidationError(
        "Credential values must contain string values.",
        "INVALID_CREDENTIAL_VALUE",
      );
    }

    credentialValues[key] =
      item;
  }

  return credentialValues;
}

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

    const provider =
      getIntegrationProvider(
        connection.providerId,
      );

    const credentialFields =
      provider.auth
        .setupFields
        .filter(
          (field) =>
            field.storage ===
            "credential_vault",
        )
        .map(
          (field) => ({
            key:
              field.key,

            label:
              field.label,

            required:
              field.required,

            configured:
              Boolean(
                connection
                  .credentialReference,
              ),
          }),
        );

    return NextResponse.json({
      success: true,

      credentialStatus: {
        integrationId:
          connection.id,

        providerId:
          connection.providerId,

        authType:
          provider.auth.type,

        hasCredentials:
          Boolean(
            connection
              .credentialReference,
          ),

        credentialFields,
      },
    });
  } catch (error) {
    return integrationApiErrorResponse(
      error,
      "J10 NEXUS could not load credential status.",
    );
  }
}

export async function POST(
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

    const values =
      parseCredentialValues(
        body.values,
      );

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

    await storeIntegrationCredentials(
      supabase,
      user.id,
      {
        connectionId:
          connection.id,

        values,
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
          "integration_credentials_stored",

        entityId:
          connection.id,

        title:
          `${provider.name} credentials secured`,

        description:
          `${provider.name} credentials were encrypted and stored securely.`,

        metadata: {
          provider_id:
            provider.id,

          credential_fields:
            Object.keys(values),

          source:
            "integration_api_v2",
        },
      },
    );

    return NextResponse.json({
      success: true,

      message:
        `${provider.name} credentials secured successfully.`,

      integration: {
        ...serializeIntegrationConnection(
          connection,
        ),

        hasCredentials: true,
      },
    });
  } catch (error) {
    return integrationApiErrorResponse(
      error,
      "J10 NEXUS could not securely store integration credentials.",
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

    let connection =
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

    if (
      connection.status === "pending" ||
      connection.status === "connected" ||
      connection.status === "degraded" ||
      connection.status === "error"
    ) {
      connection =
        await updateIntegrationConnectionStatus(
          supabase,
          user.id,
          connection.id,
          {
            status: "disconnected",

            reason:
              "Integration credentials were removed.",

            metadata: {
              source:
                "credential_removal",
            },

            errorCode: null,
            errorMessage: null,
          },
        );
    }

    const removed =
      await deleteIntegrationCredentials(
        supabase,
        user.id,
        connection.id,
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
          "integration_credentials_removed",

        entityId:
          connection.id,

        title:
          `${provider.name} credentials removed`,

        description:
          `${provider.name} credentials were removed and the connection was disconnected.`,

        metadata: {
          provider_id:
            provider.id,

          removed,

          source:
            "integration_api_v2",
        },
      },
    );

    return NextResponse.json({
      success: true,

      message:
        removed
          ? `${provider.name} credentials removed successfully.`
          : `${provider.name} had no stored credentials.`,

      integration: {
        ...serializeIntegrationConnection(
          connection,
        ),

        hasCredentials: false,
      },
    });
  } catch (error) {
    return integrationApiErrorResponse(
      error,
      "J10 NEXUS could not remove integration credentials.",
    );
  }
}