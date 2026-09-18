import { NextResponse } from "next/server";
import { getActiveWorkspaceContext } from "@/lib/workspaces/server";
import { createAdminSupabaseClient } from "@/lib/auth";
import {
  assertNoCrossWorkspaceConflict,
  exchangeMetaCodeForAccessToken,
  upsertWhatsAppIntegration,
  validateAndConsumeWhatsAppSession,
  verifyWabaAndPhoneNumber,
} from "@/lib/whatsapp/embedded-signup";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const context = await getActiveWorkspaceContext();
    if (!context) {
      return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
    }

    if (!["owner", "admin"].includes(context.membership.role)) {
      return NextResponse.json(
        { success: false, error: "Forbidden: Only workspace owners and admins can complete WhatsApp setup." },
        { status: 403 }
      );
    }

    const ws = context.workspace;
    const wsId = ws.id;

    if (ws.status === "past_due" || ws.status === "suspended") {
      return NextResponse.json(
        {
          success: false,
          error: "Your workspace subscription is past due or suspended. Please reactivate billing to connect WhatsApp.",
        },
        { status: 402 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { code, state, wabaId, phoneNumberId } = body;

    if (!code || typeof code !== "string") {
      return NextResponse.json(
        { success: false, error: "Missing or invalid authorization code." },
        { status: 400 }
      );
    }

    if (!state || typeof state !== "string") {
      return NextResponse.json(
        { success: false, error: "Missing required CSRF state token." },
        { status: 400 }
      );
    }

    if (!wabaId || typeof wabaId !== "string" || !phoneNumberId || typeof phoneNumberId !== "string") {
      return NextResponse.json(
        { success: false, error: "WhatsApp Business Account ID and Phone Number ID are required." },
        { status: 400 }
      );
    }

    // Privileged client used strictly after canonical owner/admin authorization
    const adminSupabase = createAdminSupabaseClient();

    // 1. Validate and atomically consume CSRF state token bound to initiating user
    const stateValidation = await validateAndConsumeWhatsAppSession(
      adminSupabase,
      state,
      wsId,
      context.user.id
    );

    if (!stateValidation.valid) {
      return NextResponse.json(
        { success: false, error: stateValidation.error || "Invalid or expired session state." },
        { status: 403 }
      );
    }

    // 2. Reject cross-workspace conflicts before token exchange or mutation
    try {
      await assertNoCrossWorkspaceConflict(adminSupabase, wsId, phoneNumberId, wabaId);
    } catch (conflictErr: any) {
      return NextResponse.json(
        { success: false, error: conflictErr.message },
        { status: 409 }
      );
    }

    // 3. Server-side token exchange using META_APP_SECRET
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

    let tokenResult;
    try {
      tokenResult = await exchangeMetaCodeForAccessToken(code, undefined, appSecret);
    } catch (exchangeErr: any) {
      return NextResponse.json(
        { success: false, error: "Failed to exchange authorization code with Meta." },
        { status: 400 }
      );
    }

    const { accessToken } = tokenResult;

    // 4. Verify WABA and phone number ownership
    let verifiedDetails;
    try {
      verifiedDetails = await verifyWabaAndPhoneNumber(accessToken, wabaId, phoneNumberId);
    } catch (verifyErr: any) {
      return NextResponse.json(
        { success: false, error: "Failed to verify WhatsApp account ownership." },
        { status: 422 }
      );
    }

    // 5. Authoritative activation via service (creates endpoint, subscribes WABA, verifies compensation)
    const { integrationId, endpointKey, isReconnect, status, callbackUrl } = await upsertWhatsAppIntegration(adminSupabase, {
      workspaceId: wsId,
      userId: context.user.id,
      verifiedDetails,
      accessToken,
      appSecret,
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://j10-nexus.vercel.app";
    const canonicalWebhookUrl = `${appUrl}/api/webhooks/whatsapp/${endpointKey}`;

    // If webhook subscription failed or degraded, return action_required with 422
    if (status !== "connected") {
      return NextResponse.json(
        {
          success: false,
          status: "action_required",
          error: "WhatsApp account verified, but webhook subscription could not be confirmed. Please click Reconnect to retry.",
          integrationId,
          endpointKey,
          isReconnect,
          callbackUrl,
          account: {
            wabaId: verifiedDetails.wabaId,
            wabaName: verifiedDetails.wabaName,
            phoneNumberId: verifiedDetails.phoneNumberId,
            displayPhoneNumber: verifiedDetails.displayPhoneNumber,
            verifiedName: verifiedDetails.verifiedName,
            qualityRating: verifiedDetails.qualityRating,
            webhookSubscribed: false,
          },
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      status: "connected",
      integrationId,
      endpointKey,
      webhookUrl: canonicalWebhookUrl,
      callbackUrl,
      isReconnect,
      account: {
        wabaId: verifiedDetails.wabaId,
        wabaName: verifiedDetails.wabaName,
        phoneNumberId: verifiedDetails.phoneNumberId,
        displayPhoneNumber: verifiedDetails.displayPhoneNumber,
        verifiedName: verifiedDetails.verifiedName,
        qualityRating: verifiedDetails.qualityRating,
        webhookSubscribed: true,
      },
    });
  } catch (err: any) {
    if (err?.message?.includes("COMPENSATION_REQUIRED")) {
      console.error("[WhatsApp Connect API] compensation_required stage: connect code: COMPENSATION_REQUIRED");
      return NextResponse.json(
        { success: false, error: "Setup failed and automatic cleanup requires manual review.", code: "COMPENSATION_REQUIRED" },
        { status: 500 }
      );
    }

    console.error("[WhatsApp Connect API] setup_failed stage: connect code:", err?.code || "CONNECT_FAILED");
    return NextResponse.json(
      { success: false, error: "Failed to connect WhatsApp account." },
      { status: 500 }
    );
  }
}
