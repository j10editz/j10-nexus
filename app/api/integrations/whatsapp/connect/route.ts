import { NextResponse } from "next/server";
import { getActiveWorkspaceContext } from "@/lib/workspaces/server";
import { createServerSupabaseClient } from "@/lib/auth";
import {
  assertNoCrossWorkspaceConflict,
  exchangeMetaCodeForAccessToken,
  subscribeWabaToWebhook,
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

    const supabase = createServerSupabaseClient();

    // 1. Validate and atomically consume CSRF state token
    const stateValidation = await validateAndConsumeWhatsAppSession(supabase, state, wsId);
    if (!stateValidation.valid) {
      return NextResponse.json(
        { success: false, error: stateValidation.error || "Invalid or expired session state." },
        { status: 403 }
      );
    }

    // 2. Reject cross-workspace conflicts before token exchange or mutation
    try {
      await assertNoCrossWorkspaceConflict(supabase, wsId, phoneNumberId, wabaId);
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
        { success: false, error: exchangeErr.message || "Failed to exchange authorization code with Meta." },
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
        { success: false, error: verifyErr.message || "Failed to verify WhatsApp account ownership." },
        { status: 422 }
      );
    }

    // 5. Subscribe WABA to application webhook
    const subscribed = await subscribeWabaToWebhook(accessToken, wabaId);

    // 6. Create or update integration & encrypted credentials
    const { integrationId, endpointKey, isReconnect } = await upsertWhatsAppIntegration(supabase, {
      workspaceId: wsId,
      userId: context.user.id,
      verifiedDetails,
      accessToken,
      appSecret,
      webhookSubscribed: subscribed,
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://j10-nexus.vercel.app";
    const canonicalWebhookUrl = `${appUrl}/api/webhooks/whatsapp/${endpointKey}`;

    return NextResponse.json({
      success: true,
      integrationId,
      endpointKey,
      webhookUrl: canonicalWebhookUrl,
      isReconnect,
      account: {
        wabaId: verifiedDetails.wabaId,
        wabaName: verifiedDetails.wabaName,
        phoneNumberId: verifiedDetails.phoneNumberId,
        displayPhoneNumber: verifiedDetails.displayPhoneNumber,
        verifiedName: verifiedDetails.verifiedName,
        qualityRating: verifiedDetails.qualityRating,
        webhookSubscribed: subscribed,
      },
    });
  } catch (err: any) {
    console.error("[WhatsApp Connect API] Setup failed:", err?.message || err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to connect WhatsApp account." },
      { status: 500 }
    );
  }
}
