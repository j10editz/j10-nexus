import { NextResponse } from "next/server";

import { createAdminSupabaseClient } from "@/lib/auth";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";
import { integrationApiErrorResponse, parseRequestObject } from "@/lib/integrations/api";
import {
  assertNoCrossWorkspaceConflict,
  exchangeMetaCodeForAccessToken,
  subscribeWabaToWebhook,
  upsertWhatsAppIntegration,
  validateAndConsumeWhatsAppSession,
  verifyWabaAndPhoneNumber,
} from "@/lib/whatsapp/embedded-signup";

type RouteContext = { params: Promise<{ id: string }> };
type JsonRecord = Record<string, unknown>;

function requiredString(body: JsonRecord, key: string, pattern: RegExp, label: string) {
  const value = typeof body[key] === "string" ? (body[key] as string).trim() : "";
  if (!value || !pattern.test(value)) throw new Error(`${label} is missing or invalid.`);
  return value;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    // 1. Authorize owner/admin workspace context
    const auth = await requireApiWorkspaceContext("admin");
    if (auth.error) {
      return auth.error;
    }
    const { context: wsContext } = auth;
    const wsId = wsContext.workspace.id;
    const userId = wsContext.user.id;

    const body = parseRequestObject(await request.json().catch(() => ({})));

    // 2. Enforce strict single-use CSRF state token bound to initiating user
    const stateToken = typeof body.state === "string" ? body.state.trim() : "";
    if (!stateToken) {
      return NextResponse.json(
        { success: false, error: "Missing required CSRF state token." },
        { status: 400 }
      );
    }

    const adminSupabase = createAdminSupabaseClient();

    const stateValidation = await validateAndConsumeWhatsAppSession(
      adminSupabase,
      stateToken,
      wsId,
      userId
    );

    if (!stateValidation.valid) {
      return NextResponse.json(
        { success: false, error: stateValidation.error || "Invalid or expired session state." },
        { status: 403 }
      );
    }

    const code = requiredString(body, "code", /^[A-Za-z0-9_.#=-]{10,4096}$/, "Authorization code");
    const wabaId = requiredString(body, "wabaId", /^[A-Za-z0-9_-]{3,50}$/, "WhatsApp Business Account ID");
    const phoneNumberId = requiredString(body, "phoneNumberId", /^[A-Za-z0-9_-]{3,50}$/, "Phone number ID");

    // 3. Reject cross-workspace conflicts before token exchange or mutation
    try {
      await assertNoCrossWorkspaceConflict(adminSupabase, wsId, phoneNumberId, wabaId);
    } catch (conflictErr: any) {
      return NextResponse.json(
        { success: false, error: conflictErr.message },
        { status: 409 }
      );
    }

    // 4. Token exchange
    const appSecret =
      process.env.META_WHATSAPP_APP_SECRET?.trim() ||
      process.env.META_APP_SECRET?.trim() ||
      "";

    if (!appSecret) {
      return NextResponse.json(
        { success: false, error: "Meta App Secret is not configured on the server." },
        { status: 503 }
      );
    }

    const tokenResult = await exchangeMetaCodeForAccessToken(code, undefined, appSecret);
    const { accessToken } = tokenResult;

    // 5. Verify WABA and phone
    const verifiedDetails = await verifyWabaAndPhoneNumber(accessToken, wabaId, phoneNumberId);

    // 6. Subscribe WABA to webhook
    const subscribed = await subscribeWabaToWebhook(accessToken, wabaId);

    // 7. Upsert integration & encrypted credentials
    const { integrationId, endpointKey, isReconnect } = await upsertWhatsAppIntegration(
      adminSupabase,
      {
        workspaceId: wsId,
        userId,
        verifiedDetails,
        accessToken,
        appSecret,
        webhookSubscribed: subscribed,
      }
    );

    if (!subscribed) {
      return NextResponse.json(
        {
          success: false,
          status: "action_required",
          error: "WhatsApp account verified, but webhook subscription could not be confirmed. Reconnection is required.",
          integrationId,
          endpointKey,
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      status: "connected",
      integrationId,
      endpointKey,
      isReconnect,
      phone: {
        id: phoneNumberId,
        displayPhoneNumber: verifiedDetails.displayPhoneNumber,
        verifiedName: verifiedDetails.verifiedName,
        qualityRating: verifiedDetails.qualityRating,
      },
    });
  } catch (error) {
    return integrationApiErrorResponse(error, "Could not complete WhatsApp Embedded Signup.");
  }
}
