import { NextResponse } from "next/server";
import { createWebhookServiceClient } from "@/lib/integrations/webhooks/service-client";
import { getIntegrationWebhookEndpointByConnection } from "@/lib/integrations/webhooks/database";
import {
  INTEGRATION_DATABASE_SELECT,
  type IntegrationDatabaseRow,
  mapIntegrationDatabaseRow,
} from "@/lib/integrations/database";
import {
  hmacSha256Hex,
  normalizeSignatureHex,
  safeStringEqual,
} from "@/lib/integrations/webhooks/crypto";
import { processWhatsAppPayload } from "@/lib/whatsapp/webhook-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Meta Webhook Challenge Verification (GET)
 * Validates Meta's webhook subscription request against the server verify token.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const expectedToken =
    process.env.META_WHATSAPP_VERIFY_TOKEN?.trim() ||
    process.env.META_VERIFY_TOKEN?.trim() ||
    "";

  if (
    mode === "subscribe" &&
    challenge &&
    token &&
    expectedToken &&
    safeStringEqual(token, expectedToken)
  ) {
    return new Response(challenge, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }

  return NextResponse.json(
    { success: false, error: "WhatsApp webhook verification failed." },
    { status: 403, headers: { "Cache-Control": "no-store" } }
  );
}

/**
 * Canonical Multi-Tenant Meta WhatsApp Webhook Callback (POST)
 *
 * Security & Routing Invariants:
 * 1. Verifies X-Hub-Signature-256 with META_WHATSAPP_APP_SECRET BEFORE parsing or resolving tenants.
 * 2. Extracts metadata.phone_number_id from payload.
 * 3. Resolves exactly one integration via canonical phone expression:
 *    COALESCE(external_account_id, public_configuration->>'phone_number_id').
 * 4. Strictly requires:
 *    - provider: 'whatsapp-business'
 *    - status: 'connected'
 *    - webhook_subscribed: true
 *    - active canonical webhook endpoint
 * 5. Rejects unknown, ambiguous, disconnected, degraded, or cross-workspace bindings.
 * 6. Never trusts workspace ID from request.
 * 7. Never logs message bodies, full phone numbers, tokens, signatures, or secrets.
 * 8. Reuses durable Inbox -> CRM -> AI queue pipeline.
 */
export async function POST(request: Request) {
  try {
    // 1. Read raw body text before parsing
    const rawBody = await request.text();

    // 2. Server-side Meta App Secret
    const appSecret =
      process.env.META_WHATSAPP_APP_SECRET?.trim() ||
      process.env.META_APP_SECRET?.trim() ||
      "";

    if (!appSecret) {
      console.error("[WhatsApp Meta Webhook] Meta App Secret is not configured.");
      return NextResponse.json(
        {
          success: false,
          error: "WhatsApp webhook verification is not configured.",
          code: "WEBHOOK_SIGNATURE_SECRET_MISSING",
        },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }

    // 3. Cryptographic Signature Validation BEFORE trusting or parsing tenant identifiers
    const receivedSignature = normalizeSignatureHex(
      request.headers.get("x-hub-signature-256")
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
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }

    // 4. Parse JSON payload
    let payload: Record<string, any>;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "Webhook payload contains invalid JSON.",
          code: "WEBHOOK_PAYLOAD_JSON_INVALID",
        },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    // 5. Extract metadata.phone_number_id
    const entry = Array.isArray(payload.entry) ? payload.entry[0] : null;
    const changes = Array.isArray(entry?.changes) ? entry.changes[0] : null;
    const value = changes?.value || {};
    const rawPhoneId = value?.metadata?.phone_number_id;
    const phoneNumberId = typeof rawPhoneId === "string" ? rawPhoneId.trim() : null;

    if (!phoneNumberId) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing phone number identifier in webhook payload.",
          code: "PHONE_NUMBER_ID_MISSING",
        },
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }

    const supabase = createWebhookServiceClient();

    // 6. Resolve integration through canonical phone identifier:
    // COALESCE(external_account_id, public_configuration->>'phone_number_id')
    const { data: rows1, error: err1 } = await supabase
      .from("integrations")
      .select(INTEGRATION_DATABASE_SELECT)
      .eq("provider", "whatsapp-business")
      .eq("external_account_id", phoneNumberId);

    const { data: rows2, error: err2 } = await supabase
      .from("integrations")
      .select(INTEGRATION_DATABASE_SELECT)
      .eq("provider", "whatsapp-business")
      .eq("public_configuration->>phone_number_id", phoneNumberId);

    if (err1 || err2) {
      console.error("[WhatsApp Meta Webhook] db_error stage: resolve_phone code: DB_ERROR");
      return NextResponse.json(
        { success: false, error: "Database error resolving WhatsApp integration.", code: "DB_ERROR" },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }

    const combinedMap = new Map<string, IntegrationDatabaseRow>();
    for (const r of (rows1 || [])) combinedMap.set(r.id, r);
    for (const r of (rows2 || [])) combinedMap.set(r.id, r);
    const matchingRows = Array.from(combinedMap.values());

    if (matchingRows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "WhatsApp phone number is not registered to any integration.",
          code: "WHATSAPP_INTEGRATION_NOT_FOUND",
        },
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }

    // Check for cross-workspace ambiguity
    const distinctWorkspaces = new Set(matchingRows.map((r) => r.workspace_id));
    if (distinctWorkspaces.size > 1) {
      console.error("[WhatsApp Meta Webhook] ambiguous_binding stage: resolve_tenant code: WHATSAPP_BINDING_AMBIGUOUS");
      return NextResponse.json(
        {
          success: false,
          error: "Ambiguous WhatsApp phone number binding across multiple workspaces.",
          code: "WHATSAPP_BINDING_AMBIGUOUS",
        },
        { status: 409, headers: { "Cache-Control": "no-store" } }
      );
    }

    const row = matchingRows[0];
    const connection = mapIntegrationDatabaseRow(row as IntegrationDatabaseRow);

    if (!connection || !connection.workspaceId) {
      return NextResponse.json(
        { success: false, error: "Invalid WhatsApp integration binding.", code: "WHATSAPP_INTEGRATION_INVALID" },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }

    // Require provider = whatsapp-business
    if (connection.providerId !== "whatsapp-business") {
      return NextResponse.json(
        { success: false, error: "Integration provider mismatch.", code: "WHATSAPP_PROVIDER_MISMATCH" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    // Require status = connected (reject degraded, disconnected, pending, error)
    if (connection.status !== "connected") {
      return NextResponse.json(
        {
          success: false,
          error: "WhatsApp integration is not connected.",
          code: "WHATSAPP_INTEGRATION_NOT_CONNECTED",
        },
        { status: 403, headers: { "Cache-Control": "no-store" } }
      );
    }

    // Require webhook_subscribed = true
    const pubConfig = (connection.publicConfiguration || {}) as Record<string, any>;
    if (pubConfig.webhook_subscribed !== true) {
      return NextResponse.json(
        {
          success: false,
          error: "WhatsApp integration webhook is not subscribed.",
          code: "WHATSAPP_WEBHOOK_NOT_SUBSCRIBED",
        },
        { status: 403, headers: { "Cache-Control": "no-store" } }
      );
    }

    // Require active canonical webhook endpoint
    const endpoint = await getIntegrationWebhookEndpointByConnection(
      supabase,
      connection.workspaceId,
      connection.id
    );

    if (!endpoint || endpoint.status !== "active") {
      return NextResponse.json(
        {
          success: false,
          error: "Active webhook endpoint not found for this WhatsApp integration.",
          code: "WHATSAPP_ENDPOINT_INACTIVE",
        },
        { status: 403, headers: { "Cache-Control": "no-store" } }
      );
    }

    // 7. Reuse existing durable Inbox -> CRM -> AI job queue pipeline
    return await processWhatsAppPayload({
      supabase,
      connection,
      endpoint,
      payload,
      requestUrl: request.url,
    });
  } catch (err: any) {
    console.error("[WhatsApp Meta Webhook] unhandled_error stage: route_dispatch code:", err?.code || "UNHANDLED_ERROR");
    return NextResponse.json(
      {
        success: false,
        error: "J10 NEXUS could not route this WhatsApp webhook.",
        code: "WHATSAPP_WEBHOOK_ROUTING_FAILED",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
