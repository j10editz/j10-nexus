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

import {
  hmacSha256Hex,
  normalizeSignatureHex,
  safeStringEqual,
} from "@/lib/integrations/webhooks/crypto";

import {
  persistCanonicalWhatsAppInbound,
} from "@/lib/omnichannel/provider-contract";

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

    // 5. Handle Meta Delivery / Status Callbacks
    if (statuses.length > 0) {
      for (const st of statuses) {
        const statusWamid = typeof st.id === "string" ? st.id : null;
        const deliveryStatus = typeof st.status === "string" ? st.status : null;

        if (statusWamid && deliveryStatus) {
          await supabase
            .from("inbox_messages")
            .update({
              delivery_status: deliveryStatus,
              updated_at: new Date().toISOString(),
            })
            .eq("workspace_id", workspaceId)
            .eq("external_message_id", statusWamid);
        }
      }

      return NextResponse.json(
        { success: true, accepted: true, event: "status_callback" },
        { status: 200 },
      );
    }

    // 6. Handle Inbound WhatsApp Messages
    if (messages.length > 0) {
      const message = messages[0];
      const wamid = typeof message.id === "string" ? message.id.trim() : null;
      const fromPhone = typeof message.from === "string" ? message.from.trim() : null;
      const messageType = typeof message.type === "string" ? message.type : "unknown";
      const contactName =
        (contacts[0]?.profile?.name as string | undefined) ||
        "WhatsApp User";

      if (!wamid || !fromPhone) {
        return NextResponse.json(
          { success: true, accepted: true, ignored: true, reason: "missing_wamid_or_sender" },
          { status: 200 },
        );
      }

      // Handle unsupported message types (e.g. image, video, audio, sticker) safely
      if (messageType !== "text") {
        const fallbackContent = `[${messageType} message]`;

        const { data: existingUnsupported } = await supabase
          .from("inbox_messages")
          .select("id")
          .eq("workspace_id", workspaceId)
          .eq("external_message_id", wamid)
          .maybeSingle();

        if (!existingUnsupported) {
          const { data: existingThread } = await supabase
            .from("inbox_threads")
            .select("id, unread_count")
            .eq("workspace_id", workspaceId)
            .eq("channel", "whatsapp")
            .eq("external_thread_id", fromPhone)
            .maybeSingle();

          let threadId: string;
          if (existingThread) {
            threadId = existingThread.id;
            await supabase
              .from("inbox_threads")
              .update({
                last_message_at: new Date().toISOString(),
                unread_count: (existingThread.unread_count || 0) + 1,
                updated_at: new Date().toISOString(),
              })
              .eq("id", threadId)
              .eq("workspace_id", workspaceId);
          } else {
            const { data: newTh } = await supabase
              .from("inbox_threads")
              .insert({
                workspace_id: workspaceId,
                channel: "whatsapp",
                external_thread_id: fromPhone,
                status: "active",
                priority: "medium",
                unread_count: 1,
                last_message_at: new Date().toISOString(),
                metadata: {
                  senderName: contactName,
                  integrationId: endpoint.integrationId,
                },
              })
              .select("id")
              .single();
            threadId = newTh?.id || "";
          }

          if (threadId) {
            await supabase.from("inbox_messages").insert({
              workspace_id: workspaceId,
              thread_id: threadId,
              direction: "inbound",
              provider: "whatsapp",
              external_message_id: wamid,
              content: fallbackContent,
              delivery_status: "delivered",
              idempotency_key: `wamid_${wamid}`,
              created_at: new Date().toISOString(),
            });
          }
        }

        // Return HTTP 200 without triggering AI
        return NextResponse.json(
          {
            success: true,
            accepted: true,
            event: "unsupported_message_type_ignored",
            messageType,
          },
          { status: 200 },
        );
      }

      const textBody =
        typeof message.text?.body === "string" ? message.text.body.trim() : "";

      // 7. Idempotency Check on provider message ID (wamid)
      const { data: existingMsg } = await supabase
        .from("inbox_messages")
        .select("id, content")
        .eq("workspace_id", workspaceId)
        .eq("external_message_id", wamid)
        .maybeSingle();

      if (existingMsg) {
        // Detect payload conflicts for a reused provider message ID
        if (existingMsg.content !== textBody) {
          return NextResponse.json(
            {
              success: true,
              accepted: true,
              quarantined: true,
              reason: "wamid_payload_conflict",
            },
            { status: 200 },
          );
        }

        // Replay of identical message: return HTTP 200 idempotently
        return NextResponse.json(
          {
            success: true,
            accepted: true,
            duplicate: true,
          },
          { status: 200 },
        );
      }

      // 8. Stage 1 Lead Intake & Contact Persistence (canonical path)
      let contactId: string | null = null;
      const origin = new URL(request.url).origin;
      try {
        const intakeResult = await persistCanonicalWhatsAppInbound(supabase, {
          workspaceId,
          payload,
          origin,
        });
        contactId =
          typeof intakeResult?.contact_id === "string"
            ? intakeResult.contact_id
            : null;
      } catch (intakeErr) {
        console.warn("[WhatsApp Webhook] Canonical lead intake notice:", intakeErr);
      }

      // 9. Unified Inbox Thread & Message Persistence
      let threadId: string;
      const { data: existingThread } = await supabase
        .from("inbox_threads")
        .select("id, unread_count, metadata")
        .eq("workspace_id", workspaceId)
        .eq("channel", "whatsapp")
        .eq("external_thread_id", fromPhone)
        .maybeSingle();

      if (existingThread) {
        threadId = existingThread.id;
        await supabase
          .from("inbox_threads")
          .update({
            last_message_at: new Date().toISOString(),
            unread_count: (existingThread.unread_count || 0) + 1,
            metadata: {
              ...(existingThread.metadata || {}),
              lastMessageSnippet: textBody.slice(0, 100),
              senderName: contactName,
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", threadId)
          .eq("workspace_id", workspaceId);
      } else {
        const { data: newThread, error: thError } = await supabase
          .from("inbox_threads")
          .insert({
            workspace_id: workspaceId,
            contact_id: contactId,
            channel: "whatsapp",
            external_thread_id: fromPhone,
            status: "active",
            priority: "medium",
            unread_count: 1,
            last_message_at: new Date().toISOString(),
            metadata: {
              senderName: contactName,
              lastMessageSnippet: textBody.slice(0, 100),
              integrationId: endpoint.integrationId,
            },
          })
          .select("id")
          .single();

        if (thError || !newThread) {
          throw new Error(`Failed to create WhatsApp inbox thread: ${thError?.message}`);
        }
        threadId = newThread.id;
      }

      await supabase.from("inbox_messages").insert({
        workspace_id: workspaceId,
        thread_id: threadId,
        direction: "inbound",
        provider: "whatsapp",
        external_message_id: wamid,
        content: textBody,
        delivery_status: "delivered",
        idempotency_key: `wamid_${wamid}`,
        created_at: new Date().toISOString(),
      });

      // 10. Asynchronous AI Receptionist Invocation
      const workerSecret =
        process.env.WHATSAPP_WORKER_SECRET?.trim() ||
        process.env.TELEGRAM_WORKER_SECRET?.trim();

      if (workerSecret) {
        fetch(`${origin}/api/workers/whatsapp-ai`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${workerSecret}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            workspaceId,
            integrationId: endpoint.integrationId,
            threadId,
            recipientPhone: fromPhone,
            inboundText: textBody,
            senderName: contactName,
            inboundWamid: wamid,
          }),
        }).catch((workerErr) => {
          console.warn("[WhatsApp Webhook] Worker invocation notice:", workerErr?.message || workerErr);
        });
      }

      return NextResponse.json(
        {
          success: true,
          accepted: true,
          wamid,
          threadId,
        },
        { status: 200 },
      );
    }

    return NextResponse.json(
      { success: true, accepted: true, event: "whatsapp_generic_event" },
      { status: 200 },
    );
  } catch (error) {
    return responseFromError(error);
  }
}
