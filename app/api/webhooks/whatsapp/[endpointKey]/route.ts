import {
  NextResponse,
} from "next/server";

import {
  POST as processIntegrationWebhook,
} from "@/app/api/webhooks/integrations/[endpointKey]/route";

import {
  INTEGRATION_DATABASE_SELECT,
  type IntegrationDatabaseRow,
  mapIntegrationDatabaseRow,
} from "@/lib/integrations/database";

import {
  createWebhookServiceClient,
} from "@/lib/integrations/webhooks/service-client";

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

type EndpointRow = {
  endpoint_key: string;
};

type ExistingEndpointRow = {
  id: string;
};

const DEFAULT_MAX_PAYLOAD_BYTES =
  256 * 1024;

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

function getExpectedAlias() {
  return (
    process.env
      .META_WHATSAPP_WEBHOOK_ENDPOINT_KEY
      ?.trim() || "meta"
  );
}

function assertExpectedAlias(endpointKey: string) {
  if (endpointKey !== getExpectedAlias()) {
    throw new IntegrationWebhookError(
      "Unknown WhatsApp webhook endpoint.",
      "WHATSAPP_WEBHOOK_ENDPOINT_NOT_FOUND",
      404,
      true,
    );
  }
}

async function findActivePipelineEndpointKey(
  integrationId: string,
  userId: string,
) {
  const supabase =
    createWebhookServiceClient();

  const { data, error } =
    await supabase
      .from("integration_webhook_endpoints")
      .select("endpoint_key")
      .eq(
        "provider",
        "whatsapp-business",
      )
      .eq(
        "integration_id",
        integrationId,
      )
      .eq(
        "user_id",
        userId,
      )
      .eq("status", "active")
      .order("updated_at", {
        ascending: false,
      })
      .limit(1);

  if (error) {
    throw new IntegrationWebhookError(
      "J10 could not load the active WhatsApp webhook endpoint.",
      "INTEGRATION_WEBHOOK_DATABASE_ERROR",
      503,
      false,
    );
  }

  const endpoint =
    ((data ?? []) as EndpointRow[])[0];

  return endpoint?.endpoint_key?.trim() || null;
}

async function loadWhatsAppConnection() {
  const supabase =
    createWebhookServiceClient();

  const { data, error } =
    await supabase
      .from("integrations")
      .select(INTEGRATION_DATABASE_SELECT)
      .in("provider", [
        "whatsapp-business",
        "whatsapp",
      ])
      .order("updated_at", {
        ascending: false,
      })
      .limit(1);

  if (error) {
    throw new IntegrationWebhookError(
      "J10 could not load the WhatsApp integration connection.",
      "INTEGRATION_CONNECTION_DATABASE_ERROR",
      503,
      false,
    );
  }

  const row =
    ((data ?? []) as IntegrationDatabaseRow[])[0];

  if (!row) {
    throw new IntegrationWebhookError(
      "WhatsApp Business is not registered in J10 integrations.",
      "WHATSAPP_INTEGRATION_NOT_REGISTERED",
      503,
      true,
    );
  }

  const connection =
    mapIntegrationDatabaseRow(row);

  if (!connection) {
    throw new IntegrationWebhookError(
      "J10 could not read the WhatsApp integration connection.",
      "WHATSAPP_INTEGRATION_INVALID",
      503,
      false,
    );
  }

  return connection;
}

async function resolvePipelineEndpointKey() {
  const connection =
    await loadWhatsAppConnection();

  const existingEndpointKey =
    await findActivePipelineEndpointKey(
      connection.id,
      connection.workspaceId,
    );

  if (existingEndpointKey) {
    return existingEndpointKey;
  }

  const supabase =
    createWebhookServiceClient();

  const { data: existingRows, error: existingError } =
    await supabase
      .from("integration_webhook_endpoints")
      .select("id")
      .eq("integration_id", connection.id)
      .eq("user_id", connection.workspaceId)
      .limit(1);

  if (existingError) {
    throw new IntegrationWebhookError(
      "J10 could not load the WhatsApp webhook endpoint.",
      "INTEGRATION_WEBHOOK_DATABASE_ERROR",
      503,
      false,
    );
  }

  const existingEndpoint =
    ((existingRows ?? []) as ExistingEndpointRow[])[0];

  if (existingEndpoint) {
    const { data, error } =
      await supabase
        .from("integration_webhook_endpoints")
        .update({
          provider:
            "whatsapp-business",
          environment:
            connection.environment,
          status:
            "active",
          max_payload_bytes:
            DEFAULT_MAX_PAYLOAD_BYTES,
          updated_at:
            new Date().toISOString(),
        })
        .eq("id", existingEndpoint.id)
        .select("endpoint_key")
        .single();

    if (error) {
      throw new IntegrationWebhookError(
        "J10 could not activate the WhatsApp webhook endpoint.",
        "INTEGRATION_WEBHOOK_DATABASE_ERROR",
        503,
        false,
      );
    }

    const endpointKey =
      (data as EndpointRow)
        .endpoint_key
        ?.trim();

    if (!endpointKey) {
      throw new IntegrationWebhookError(
        "J10 could not resolve the WhatsApp webhook endpoint.",
        "WHATSAPP_WEBHOOK_ENDPOINT_NOT_CONFIGURED",
        503,
        false,
      );
    }

    return endpointKey;
  }

  const { data, error } =
    await supabase
      .from("integration_webhook_endpoints")
      .insert({
        integration_id:
          connection.id,
        user_id:
          connection.workspaceId,
        provider:
          "whatsapp-business",
        environment:
          connection.environment,
        status:
          "active",
        max_payload_bytes:
          DEFAULT_MAX_PAYLOAD_BYTES,
      })
      .select("endpoint_key")
      .single();

  if (error) {
    throw new IntegrationWebhookError(
      "J10 could not create the WhatsApp webhook endpoint.",
      "INTEGRATION_WEBHOOK_DATABASE_ERROR",
      503,
      false,
    );
  }

  const endpointKey =
    (data as EndpointRow)
      .endpoint_key
      ?.trim();

  if (!endpointKey) {
    throw new IntegrationWebhookError(
      "J10 could not resolve the WhatsApp webhook endpoint.",
      "WHATSAPP_WEBHOOK_ENDPOINT_NOT_CONFIGURED",
      503,
      false,
    );
  }

  return endpointKey;
}

export async function GET(
  request: Request,
  context: RouteContext,
) {
  try {
    const { endpointKey } =
      await context.params;

    assertExpectedAlias(endpointKey);

    const url =
      new URL(request.url);

    const mode =
      url.searchParams.get("hub.mode");

    const token =
      url.searchParams.get(
        "hub.verify_token",
      );

    const challenge =
      url.searchParams.get(
        "hub.challenge",
      );

    const expectedToken =
      process.env
        .META_WHATSAPP_VERIFY_TOKEN
        ?.trim() || "";

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
        "Content-Type":
          "text/plain; charset=utf-8",
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
    const { endpointKey } =
      await context.params;

    assertExpectedAlias(endpointKey);

    const pipelineEndpointKey =
      await resolvePipelineEndpointKey();

    return processIntegrationWebhook(
      request,
      {
        params: Promise.resolve({
          endpointKey:
            pipelineEndpointKey,
        }),
      },
    );
  } catch (error) {
    return responseFromError(error);
  }
}
