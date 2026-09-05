import { NextResponse } from "next/server";

import {
  POST as processIntegrationWebhook,
} from "@/app/api/webhooks/integrations/[endpointKey]/route";

import {
  INTEGRATION_DATABASE_SELECT,
  type IntegrationDatabaseRow,
  mapIntegrationDatabaseRow,
} from "@/lib/integrations/database";

import {
  getIntegrationCredentials,
} from "@/lib/integrations/credentials";

import {
  createWebhookServiceClient,
} from "@/lib/integrations/webhooks/service-client";

import {
  getIntegrationWebhookEndpointByKey,
} from "@/lib/integrations/webhooks/database";

import {
  IntegrationWebhookError,
} from "@/lib/integrations/webhooks/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    endpointKey: string;
  }>;
};

function responseFromError(error: unknown) {
  if (error instanceof IntegrationWebhookError) {
    return NextResponse.json(
      {
        success: false,
        error: error.expose
          ? error.message
          : "J10 NEXUS could not route this WhatsApp webhook.",
        code: error.code,
      },
      {
        status: error.status,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  console.error(
    "J10 WhatsApp webhook routing error:",
    error,
  );

  return NextResponse.json(
    {
      success: false,
      error: "J10 NEXUS could not route this WhatsApp webhook.",
      code: "WHATSAPP_WEBHOOK_ROUTING_FAILED",
    },
    {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

/**
 * Resolves: endpointKey -> exact webhook endpoint -> exact integration -> exact workspace_id
 * Strict multi-tenant isolation: Never selects the newest global integration.
 */
async function resolveExactTenantWhatsAppBinding(endpointKey: string) {
  const cleanKey = endpointKey?.trim();
  if (!cleanKey) {
    throw new IntegrationWebhookError(
      "WhatsApp webhook endpoint key was not provided.",
      "WHATSAPP_WEBHOOK_ENDPOINT_NOT_FOUND",
      404,
      true,
    );
  }

  const supabase = createWebhookServiceClient();

  // 1. Resolve exact endpoint by key
  const endpoint = await getIntegrationWebhookEndpointByKey(supabase, cleanKey);
  if (!endpoint || endpoint.status !== "active") {
    throw new IntegrationWebhookError(
      "Unknown or inactive WhatsApp webhook endpoint.",
      "WHATSAPP_WEBHOOK_ENDPOINT_NOT_FOUND",
      404,
      true,
    );
  }

  if (
    endpoint.providerId !== "whatsapp-business"
  ) {
    throw new IntegrationWebhookError(
      "Endpoint is not configured for WhatsApp provider.",
      "WHATSAPP_PROVIDER_MISMATCH",
      400,
      true,
    );
  }

  // 2. Resolve exact integration by endpoint.integrationId
  const { data: integrationRow, error: intError } = await supabase
    .from("integrations")
    .select(INTEGRATION_DATABASE_SELECT)
    .eq("id", endpoint.integrationId)
    .maybeSingle();

  if (intError || !integrationRow) {
    throw new IntegrationWebhookError(
      "WhatsApp integration connection not found for this endpoint.",
      "WHATSAPP_INTEGRATION_NOT_FOUND",
      404,
      true,
    );
  }

  const connection = mapIntegrationDatabaseRow(integrationRow as IntegrationDatabaseRow);
  if (!connection || !connection.workspaceId) {
    throw new IntegrationWebhookError(
      "Invalid WhatsApp integration tenant association.",
      "WHATSAPP_INTEGRATION_INVALID",
      500,
      false,
    );
  }

  return {
    supabase,
    endpoint,
    connection,
    workspaceId: connection.workspaceId,
  };
}

export async function GET(
  request: Request,
  context: RouteContext,
) {
  try {
    const { endpointKey } = await context.params;
    const { supabase, connection } = await resolveExactTenantWhatsAppBinding(endpointKey);

    const url = new URL(request.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    // Load integration credentials scoped by workspaceId and connectionId
    let expectedToken = process.env.META_WHATSAPP_VERIFY_TOKEN?.trim() || "";
    try {
      const credentials = await getIntegrationCredentials(
        supabase,
        connection.workspaceId,
        connection.id,
      );
      if (credentials?.values?.webhookVerifyToken) {
        expectedToken = credentials.values.webhookVerifyToken;
      } else if (credentials?.values?.verifyToken) {
        expectedToken = credentials.values.verifyToken;
      }
    } catch {
      // Fallback to environment verify token
    }

    if (
      mode !== "subscribe" ||
      !token ||
      token !== expectedToken ||
      !challenge
    ) {
      throw new IntegrationWebhookError(
        "WhatsApp webhook verification failed.",
        "WHATSAPP_WEBHOOK_CHALLENGE_INVALID",
        403,
        true,
      );
    }

    return new Response(challenge, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  } catch (error) {
    return responseFromError(error);
  }
}

export async function POST(
  request: Request,
  context: RouteContext,
) {
  try {
    const { endpointKey } = await context.params;
    const { endpoint } = await resolveExactTenantWhatsAppBinding(endpointKey);

    // Forward to general integration webhook processor with the exact verified endpointKey
    return processIntegrationWebhook(
      request,
      {
        params: Promise.resolve({
          endpointKey: endpoint.endpointKey,
        }),
      },
    );
  } catch (error) {
    return responseFromError(error);
  }
}
