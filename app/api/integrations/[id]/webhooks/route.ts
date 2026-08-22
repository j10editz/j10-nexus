import {
  NextResponse,
} from "next/server";

import {
  createIntegrationApiClient,
  getAuthenticatedIntegrationUser,
  integrationApiErrorResponse,
  writeIntegrationActivity,
} from "../../../../../lib/integrations/api";

import {
  getIntegrationConnectionById,
} from "../../../../../lib/integrations/database";

import {
  getIntegrationProvider,
} from "../../../../../lib/integrations/registry";

import {
  createOrEnableIntegrationWebhookEndpoint,
  disableIntegrationWebhookEndpoint,
  getIntegrationWebhookEndpointByConnection,
} from "../../../../../lib/integrations/webhooks/database";

import {
  IntegrationWebhookError,
} from "../../../../../lib/integrations/webhooks/errors";

import {
  supportsWebhookIngress,
} from "../../../../../lib/integrations/webhooks/verification";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

const DEFAULT_MAX_PAYLOAD_BYTES = 256 * 1024;
const MIN_MAX_PAYLOAD_BYTES = 1024;
const MAX_MAX_PAYLOAD_BYTES = 1024 * 1024;

function buildEndpointUrl(
  request: Request,
  endpointKey: string,
) {
  const origin = new URL(request.url).origin;

  return `${origin}/api/webhooks/integrations/${encodeURIComponent(
    endpointKey,
  )}`;
}

function parseMaxPayloadBytes(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_MAX_PAYLOAD_BYTES;
  }

  const parsed = Number(value);

  if (
    !Number.isInteger(parsed) ||
    parsed < MIN_MAX_PAYLOAD_BYTES ||
    parsed > MAX_MAX_PAYLOAD_BYTES
  ) {
    throw new IntegrationWebhookError(
      "Webhook maxPayloadBytes must be between 1 KB and 1 MB.",
      "WEBHOOK_PAYLOAD_LIMIT_INVALID",
      400,
      true,
    );
  }

  return parsed;
}

async function parseOptionalBody(request: Request) {
  const text = await request.text();

  if (!text.trim()) {
    return {} as Record<string, unknown>;
  }

  const value = JSON.parse(text) as unknown;

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new IntegrationWebhookError(
      "Request body must be a JSON object.",
      "WEBHOOK_REQUEST_BODY_INVALID",
      400,
      true,
    );
  }

  return value as Record<string, unknown>;
}

function webhookApiErrorResponse(error: unknown) {
  if (error instanceof SyntaxError) {
    return NextResponse.json(
      {
        success: false,
        error: "Request body contains invalid JSON.",
      },
      {
        status: 400,
      },
    );
  }

  if (error instanceof IntegrationWebhookError) {
    return NextResponse.json(
      {
        success: false,
        error: error.expose
          ? error.message
          : "J10 NEXUS could not manage this webhook endpoint.",
        code: error.code,
      },
      {
        status: error.status,
      },
    );
  }

  return integrationApiErrorResponse(
    error,
    "J10 NEXUS could not manage this webhook endpoint.",
  );
}

async function loadAuthorizedConnection(
  connectionId: string,
) {
  const supabase = await createIntegrationApiClient();
  const user = await getAuthenticatedIntegrationUser(supabase);

  if (!user) {
    throw new IntegrationWebhookError(
      "Unauthorized.",
      "UNAUTHORIZED",
      401,
      true,
    );
  }

  const connection = await getIntegrationConnectionById(
    supabase,
    user.id,
    connectionId,
  );

  if (!connection) {
    throw new IntegrationWebhookError(
      "Integration connection was not found.",
      "INTEGRATION_NOT_FOUND",
      404,
      true,
    );
  }

  return {
    supabase,
    user,
    connection,
  };
}

export async function GET(
  request: Request,
  context: RouteContext,
) {
  try {
    const { id } = await context.params;
    const { supabase, user, connection } =
      await loadAuthorizedConnection(id);

    const provider = getIntegrationProvider(connection.providerId);
    const endpoint = await getIntegrationWebhookEndpointByConnection(
      supabase,
      user.id,
      connection.id,
    );

    return NextResponse.json({
      success: true,
      supported: supportsWebhookIngress(connection.providerId),
      webhookSupport: provider.webhookSupport,
      endpoint: endpoint
        ? {
            ...endpoint,
            url: buildEndpointUrl(request, endpoint.endpointKey),
          }
        : null,
    });
  } catch (error) {
    return webhookApiErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  context: RouteContext,
) {
  try {
    const { id } = await context.params;
    const { supabase, user, connection } =
      await loadAuthorizedConnection(id);

    const provider = getIntegrationProvider(connection.providerId);

    if (!supportsWebhookIngress(connection.providerId)) {
      throw new IntegrationWebhookError(
        `${provider.name} inbound webhooks are planned but its adapter is not active yet.`,
        "WEBHOOK_PROVIDER_ADAPTER_PENDING",
        409,
        true,
      );
    }

    if (
      provider.webhookSupport !== "incoming" &&
      provider.webhookSupport !== "bidirectional"
    ) {
      throw new IntegrationWebhookError(
        `${provider.name} does not support inbound webhooks.`,
        "WEBHOOK_PROVIDER_NOT_SUPPORTED",
        409,
        true,
      );
    }

    const body = await parseOptionalBody(request);
    const maxPayloadBytes = parseMaxPayloadBytes(
      body.maxPayloadBytes,
    );

    const endpoint = await createOrEnableIntegrationWebhookEndpoint(
      supabase,
      connection,
      maxPayloadBytes,
    );

    await writeIntegrationActivity(supabase, {
      userId: user.id,
      action: "integration_webhook_enabled",
      entityId: connection.id,
      title: `${provider.name} webhook enabled`,
      description:
        "A protected inbound webhook endpoint is active for this integration.",
      metadata: {
        provider_id: provider.id,
        endpoint_id: endpoint.id,
        environment: endpoint.environment,
        max_payload_bytes: endpoint.maxPayloadBytes,
        source: "day14g_webhook_foundation",
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: `${provider.name} webhook endpoint is active.`,
        endpoint: {
          ...endpoint,
          url: buildEndpointUrl(request, endpoint.endpointKey),
        },
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    return webhookApiErrorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  context: RouteContext,
) {
  try {
    const { id } = await context.params;
    const { supabase, user, connection } =
      await loadAuthorizedConnection(id);

    const provider = getIntegrationProvider(connection.providerId);
    const endpoint = await disableIntegrationWebhookEndpoint(
      supabase,
      user.id,
      connection.id,
    );

    if (endpoint) {
      await writeIntegrationActivity(supabase, {
        userId: user.id,
        action: "integration_webhook_disabled",
        entityId: connection.id,
        title: `${provider.name} webhook disabled`,
        description:
          "The inbound webhook endpoint was disabled without deleting its event history.",
        metadata: {
          provider_id: provider.id,
          endpoint_id: endpoint.id,
          source: "day14g_webhook_foundation",
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: endpoint
        ? `${provider.name} webhook endpoint was disabled.`
        : "Webhook endpoint is already disabled or not configured.",
      endpoint,
    });
  } catch (error) {
    return webhookApiErrorResponse(error);
  }
}