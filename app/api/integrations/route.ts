import {
  NextResponse,
} from "next/server";

import {
  createIntegrationApiClient,
  getAuthenticatedIntegrationUser,
  integrationApiErrorResponse,
  normalizeRequestedProviderId,
  parseEnabledCapabilities,
  parseIntegrationEnvironment,
  parsePublicConfiguration,
  parseRequestObject,
  serializeIntegrationConnection,
  validateProviderPublicConfiguration,
  writeIntegrationActivity,
} from "../../../lib/integrations/api";

import {
  createIntegrationConnection,
  deleteIntegrationConnection,
  getIntegrationConnectionById,
  getIntegrationConnectionByProvider,
  listIntegrationConnections,
} from "../../../lib/integrations/database";

import {
  getIntegrationProvider,
  listIntegrationProviders,
} from "../../../lib/integrations/registry";

/*
============================================================
GET INTEGRATION REGISTRY + CONNECTION STATUS
============================================================
*/

export async function GET() {
  try {
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
        },
      );
    }

    const connections =
      await listIntegrationConnections(
        supabase,
        user.id,
      );

    const connectionByProvider =
      new Map(
        connections.map(
          (connection) => [
            connection.providerId,
            connection,
          ],
        ),
      );

    const providers =
      listIntegrationProviders();

    const integrations =
      providers.map(
        (provider) => {
          const connection =
            connectionByProvider.get(
              provider.id,
            ) ?? null;

          const safeConnection =
            connection
              ? serializeIntegrationConnection(
                  connection,
                )
              : null;

          return {
            provider:
              provider.id,

            providerId:
              provider.id,

            name:
              provider.name,

            category:
              provider.category,

            description:
              provider.shortDescription,

            availability:
              provider.availability,

            iconKey:
              provider.iconKey,

            accentColor:
              provider.accentColor,

            auth: {
              type:
                provider.auth.type,

              requiredScopes:
                provider.auth
                  .requiredScopes,

              supportsRefreshTokens:
                provider.auth
                  .supportsRefreshTokens,

              setupFields:
                provider.auth
                  .setupFields.map(
                    (field) => ({
                      key:
                        field.key,

                      label:
                        field.label,

                      kind:
                        field.kind,

                      required:
                        field.required,

                      storage:
                        field.storage,

                      placeholder:
                        field.placeholder ??
                        null,

                      helpText:
                        field.helpText ??
                        null,
                    }),
                  ),
            },

            environments:
              provider.environments,

            webhookSupport:
              provider.webhookSupport,

            supportsHealthChecks:
              provider.supportsHealthChecks,

            capabilities:
              provider.capabilities,

            connection:
              safeConnection,

            id:
              safeConnection?.id ??
              null,

            status:
              safeConnection?.status ??
              "not_configured",

            accountLabel:
              safeConnection?.name ??
              null,

            externalAccountId:
              safeConnection
                ?.externalAccountId ??
              null,

            connectedAt:
              safeConnection
                ?.lastConnectedAt ??
              null,

            metadata:
              safeConnection
                ?.publicConfiguration ??
              {},

            hasCredentials:
              safeConnection
                ?.hasCredentials ??
              false,

            registered:
              Boolean(
                safeConnection,
              ),
          };
        },
      );

    const registered =
      integrations.filter(
        (integration) =>
          integration.registered,
      ).length;

    const connected =
      integrations.filter(
        (integration) =>
          integration.status ===
          "connected",
      ).length;

    const pending =
      integrations.filter(
        (integration) =>
          integration.status ===
          "pending",
      ).length;

    const degraded =
      integrations.filter(
        (integration) =>
          integration.status ===
          "degraded",
      ).length;

    const disconnected =
      integrations.filter(
        (integration) =>
          integration.status ===
            "disconnected" ||
          integration.status ===
            "not_configured",
      ).length;

    const errors =
      integrations.filter(
        (integration) =>
          integration.status ===
          "error",
      ).length;

    const needsAttention =
      integrations.filter(
        (integration) =>
          integration.status ===
            "degraded" ||
          integration.status ===
            "disconnected" ||
          integration.status ===
            "error" ||
          integration.status ===
            "revoked",
      ).length;

    return NextResponse.json({
      success:
        true,

      integrations,

      connections:
        connections.map(
          serializeIntegrationConnection,
        ),

      summary: {
        total:
          integrations.length,

        totalProviders:
          integrations.length,

        registered,

        connected,

        pending,

        degraded,

        disconnected,

        errors,

        needsAttention,
      },
    });
  } catch (error) {
    return integrationApiErrorResponse(
      error,

      "J10 NEXUS could not load integrations.",
    );
  }
}

/*
============================================================
POST — REGISTER INTEGRATION
============================================================
*/

export async function POST(
  request:
    Request,
) {
  try {
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
        },
      );
    }

    const body =
      parseRequestObject(
        await request.json(),
      );

    const providerId =
      normalizeRequestedProviderId(
        body.providerId ??
        body.provider,
      );

    if (!providerId) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            "Unsupported integration provider.",
        },

        {
          status:
            400,
        },
      );
    }

    const provider =
      getIntegrationProvider(
        providerId,
      );

    const name =
      typeof body.name ===
        "string"
        ? body.name.trim()
        : typeof body.accountLabel ===
            "string"
          ? body.accountLabel.trim()
          : "";

    const environment =
      parseIntegrationEnvironment(
        body.environment,
      );

    if (
      !provider.environments.includes(
        environment,
      )
    ) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            `${provider.name} does not support the ${environment} environment.`,
        },

        {
          status:
            400,
        },
      );
    }

    const publicConfiguration =
      parsePublicConfiguration(
        body.publicConfiguration ??
        body.configuration,
      );

    validateProviderPublicConfiguration(
      providerId,
      publicConfiguration,
    );

    const enabledCapabilities =
      parseEnabledCapabilities(
        body.enabledCapabilities,
      );

    const connection =
      await createIntegrationConnection(
        supabase,
        user.id,
        {
          providerId,

          name:
            name ||
            provider.name,

          environment,

          publicConfiguration,

          enabledCapabilities,
        },
      );

    await writeIntegrationActivity(
      supabase,
      {
        userId:
          user.id,

        action:
          "integration_registered",

        entityId:
          connection.id,

        title:
          `${provider.name} added`,

        description:
          `${provider.name} was registered and is awaiting connection readiness.`,

        metadata: {
          provider_id:
            providerId,

          environment,

          status:
            connection.status,

          source:
            "integration_api_v2",
        },
      },
    );

    return NextResponse.json(
      {
        success:
          true,

        message:
          `${provider.name} registered successfully.`,

        integration:
          serializeIntegrationConnection(
            connection,
          ),
      },

      {
        status:
          201,
      },
    );
  } catch (error) {
    return integrationApiErrorResponse(
      error,

      "J10 NEXUS could not register the integration.",
    );
  }
}

/*
============================================================
DELETE — COMPATIBILITY REMOVAL ENDPOINT
============================================================
*/

export async function DELETE(
  request:
    Request,
) {
  try {
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
        },
      );
    }

    const url =
      new URL(
        request.url,
      );

    const connectionId =
      url.searchParams
        .get("id")
        ?.trim() ??
      "";

    const providerId =
      normalizeRequestedProviderId(
        url.searchParams.get(
          "providerId",
        ) ??
        url.searchParams.get(
          "provider",
        ),
      );

    const connection =
      connectionId
        ? await getIntegrationConnectionById(
            supabase,
            user.id,
            connectionId,
          )
        : providerId
          ? await getIntegrationConnectionByProvider(
              supabase,
              user.id,
              providerId,
            )
          : null;

    if (!connection) {
      return NextResponse.json({
        success:
          true,

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
        userId:
          user.id,

        action:
          "integration_removed",

        entityId:
          null,

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
      success:
        true,

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