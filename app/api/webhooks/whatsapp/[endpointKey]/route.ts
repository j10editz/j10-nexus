import { NextResponse } from "next/server";
import { processWhatsAppPayload } from "@/lib/whatsapp/webhook-handler";

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

import {
  hmacSha256Hex,
  normalizeSignatureHex,
  safeStringEqual,
} from "@/lib/integrations/webhooks/crypto";

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
export async function resolveExactTenantWhatsAppBinding(endpointKey: string) {
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

  if (endpoint.providerId !== "whatsapp-business") {
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

  // Strictly require connected status and subscribed webhook
  if (connection.status !== "connected") {
    throw new IntegrationWebhookError(
      "WhatsApp integration is not connected.",
      "WHATSAPP_INTEGRATION_NOT_CONNECTED",
      403,
      true,
    );
  }

  const pubConfig = (connection.publicConfiguration || {}) as Record<string, any>;
  if (pubConfig.webhook_subscribed !== true) {
    throw new IntegrationWebhookError(
      "WhatsApp integration webhook is not subscribed.",
      "WHATSAPP_WEBHOOK_NOT_SUBSCRIBED",
      403,
      true,
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
    const { supabase, endpoint, connection } =
      await resolveExactTenantWhatsAppBinding(endpointKey);
    const workspaceId = connection.workspaceId;

    // 1. Read raw body bytes before parsing
    const rawBody = await request.text();
    const payloadBytes = Buffer.byteLength(rawBody, "utf8");

    if (payloadBytes > endpoint.maxPayloadBytes) {
      throw new IntegrationWebhookError(
        "Webhook payload exceeds the configured size limit.",
        "WEBHOOK_PAYLOAD_TOO_LARGE",
        413,
        true,
      );
    }

    // 2. Resolve App Secret for X-Hub-Signature-256 verification
    let appSecret =
      process.env.META_WHATSAPP_APP_SECRET?.trim() ||
      process.env.META_APP_SECRET?.trim() ||
      "";

    try {
      const credentials = await getIntegrationCredentials(
        supabase,
        workspaceId,
        connection.id,
      );
      if (credentials?.values?.app_secret?.trim()) {
        appSecret = credentials.values.app_secret.trim();
      } else if (credentials?.values?.appSecret?.trim()) {
        appSecret = credentials.values.appSecret.trim();
      }
    } catch {
      // Fallback to environment secret
    }

    if (!appSecret) {
      throw new IntegrationWebhookError(
        "WhatsApp Business webhook verification is not configured.",
        "WEBHOOK_SIGNATURE_SECRET_MISSING",
        503,
        true,
      );
    }

    // 3. Cryptographic Signature Validation
    const receivedSignature = normalizeSignatureHex(
      request.headers.get("x-hub-signature-256"),
    );
    const expectedSignature = hmacSha256Hex(appSecret, rawBody);

    if (
      !receivedSignature ||
      !safeStringEqual(receivedSignature, expectedSignature)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "WhatsApp webhook signature is invalid.",
          code: "WEBHOOK_SIGNATURE_INVALID",
        },
        {
          status: 401,
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    // 4. Parse JSON payload
    let payload: Record<string, any>;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      throw new IntegrationWebhookError(
        "Webhook payload contains invalid JSON.",
        "WEBHOOK_PAYLOAD_JSON_INVALID",
        400,
        true,
      );
    }

    const entry = Array.isArray(payload.entry) ? payload.entry[0] : null;
    const changes = Array.isArray(entry?.changes) ? entry.changes[0] : null;
    const value = changes?.value || {};
    const messages = Array.isArray(value.messages) ? value.messages : [];
    const statuses = Array.isArray(value.statuses) ? value.statuses : [];
    const contacts = Array.isArray(value.contacts) ? value.contacts : [];

    // Fallback to general automation engine for non-messaging/unrecognized webhook events
    if (messages.length === 0 && statuses.length === 0) {
      return processIntegrationWebhook(request, {
        params: Promise.resolve({
          endpointKey: endpoint.endpointKey,
        }),
      });
    }

    // 5. Reuse shared durable Inbox -> CRM -> AI pipeline
    return await processWhatsAppPayload({
      supabase,
      connection,
      endpoint,
      payload,
      requestUrl: request.url,
    });
  } catch (error) {
    return responseFromError(error);
  }
}
