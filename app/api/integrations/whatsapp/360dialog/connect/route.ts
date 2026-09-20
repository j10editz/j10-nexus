import { NextResponse } from "next/server";

import { createAdminSupabaseClient } from "@/lib/auth";
import { writeIntegrationActivity } from "@/lib/integrations/api";
import {
  createIntegrationConnection,
  getIntegrationConnectionByProvider,
  updateIntegrationConnectionConfiguration,
  updateIntegrationConnectionStatus,
} from "@/lib/integrations/database";
import {
  deleteIntegrationCredentials,
  storeIntegrationCredentials,
} from "@/lib/integrations/credentials";
import {
  createOrEnableIntegrationWebhookEndpoint,
  disableIntegrationWebhookEndpoint,
} from "@/lib/integrations/webhooks/database";
import {
  build360DialogWebhookUrl,
  generate360DialogWebhookSecret,
  register360DialogWebhook,
  type Dialog360Mode,
} from "@/lib/whatsapp/360dialog-connection";
import { getActiveWorkspaceContext } from "@/lib/workspaces/server";

export const dynamic = "force-dynamic";

const MAX_WEBHOOK_PAYLOAD_BYTES = 1_000_000;

function isDialog360Mode(value: unknown): value is Dialog360Mode {
  return value === "sandbox" || value === "production";
}

function configuredWebhookOrigin(): string | null {
  const configuredUrl = process.env.J10_APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!configuredUrl) return null;

  try {
    const url = new URL(configuredUrl);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const context = await getActiveWorkspaceContext();
  if (!context) {
    return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }

  if (!['owner', 'admin'].includes(context.membership.role)) {
    return NextResponse.json(
      { success: false, error: "Only workspace owners and admins can connect WhatsApp." },
      { status: 403 },
    );
  }

  if (["past_due", "suspended"].includes(context.workspace.status)) {
    return NextResponse.json(
      { success: false, error: "Your workspace subscription must be active to connect WhatsApp." },
      { status: 402 },
    );
  }

  const body = await request.json().catch(() => null) as {
    mode?: unknown;
    apiKey?: unknown;
  } | null;

  if (!body || !isDialog360Mode(body.mode) || typeof body.apiKey !== "string" || !body.apiKey.trim()) {
    return NextResponse.json(
      { success: false, error: "A 360dialog mode and API key are required." },
      { status: 400 },
    );
  }

  const mode = body.mode;
  const apiKey = body.apiKey.trim();
  const appUrl = configuredWebhookOrigin();
  if (!appUrl) {
    return NextResponse.json(
      { success: false, error: "A secure application URL is required before connecting 360dialog." },
      { status: 503 },
    );
  }
  const scope = {
    workspaceId: context.workspace.id,
    actorUserId: context.user.id,
  };
  const adminSupabase = createAdminSupabaseClient();

  let connectionId: string | null = null;

  try {
    const publicConfiguration = {
      transport: "360dialog" as const,
      mode,
      sandbox: mode === "sandbox",
      webhookRegistered: false,
    };
    const enabledCapabilities = [
      "whatsapp.message.received",
      "whatsapp.message.status_updated",
      "whatsapp.message.send",
      "whatsapp.template.send",
      "whatsapp.media.send",
    ];
    const existing = await getIntegrationConnectionByProvider(
      adminSupabase,
      context.workspace.id,
      "whatsapp-business",
    );
    let connection;

    if (existing) {
      // An earlier 360dialog registration can fail after its integration row
      // exists. Allow the owner/admin to retry that same row, but never turn a
      // Meta Cloud connection into a 360dialog connection implicitly.
      if (existing.publicConfiguration.transport !== "360dialog") {
        return NextResponse.json(
          { success: false, error: "A different WhatsApp connection is already registered for this workspace." },
          { status: 409 },
        );
      }

      if (!["error", "revoked", "disconnected"].includes(existing.status)) {
        return NextResponse.json(
          { success: false, error: "A 360dialog connection is already being configured for this workspace." },
          { status: 409 },
        );
      }

      connection = await updateIntegrationConnectionConfiguration(
        adminSupabase,
        scope,
        existing.id,
        { publicConfiguration, enabledCapabilities },
      );
      connection = await updateIntegrationConnectionStatus(
        adminSupabase,
        scope,
        connection.id,
        { status: "pending", reason: "Retrying verified 360dialog setup." },
      );
    } else {
      connection = await createIntegrationConnection(adminSupabase, scope, {
        providerId: "whatsapp-business",
        environment: mode === "sandbox" ? "sandbox" : "production",
        name: "360dialog",
        enabledCapabilities,
        publicConfiguration,
      });
    }
    connectionId = connection.id;

    const webhookSecret = generate360DialogWebhookSecret();
    await storeIntegrationCredentials(adminSupabase, scope, {
      connectionId: connection.id,
      values: {
        api_key: apiKey,
        webhook_secret: webhookSecret,
      },
    });

    const endpoint = await createOrEnableIntegrationWebhookEndpoint(
      adminSupabase,
      connection,
      MAX_WEBHOOK_PAYLOAD_BYTES,
    );
    const callbackUrl = build360DialogWebhookUrl(appUrl, endpoint.endpointKey);

    await register360DialogWebhook({
      apiKey,
      webhookSecret,
      callbackUrl,
      mode,
    });

    await updateIntegrationConnectionConfiguration(adminSupabase, scope, connection.id, {
      publicConfiguration: {
        transport: "360dialog",
        mode,
        sandbox: mode === "sandbox",
        webhookRegistered: true,
      },
      enabledCapabilities: connection.enabledCapabilities,
    });
    await updateIntegrationConnectionStatus(adminSupabase, scope, connection.id, {
      status: "connected",
      reason: "360dialog webhook registration verified.",
      metadata: { transport: "360dialog", mode, webhookRegistered: true },
    });

    await writeIntegrationActivity(adminSupabase, {
      userId: context.user.id,
      action: "whatsapp_360dialog_connected",
      entityId: connection.id,
      title: "360dialog connected",
      description: "Connected an official 360dialog WhatsApp transport.",
      metadata: { transport: "360dialog", mode, webhookRegistered: true },
    });

    return NextResponse.json({
      success: true,
      connection: {
        provider: "360dialog",
        mode,
        status: "connected",
        credentialState: "configured",
        readyForTest: true,
      },
    });
  } catch {
    if (connectionId) {
      // A webhook endpoint without a verified remote registration must never
      // remain enabled, and a failed setup must not retain the submitted key.
      await Promise.allSettled([
        disableIntegrationWebhookEndpoint(adminSupabase, scope, connectionId),
        deleteIntegrationCredentials(adminSupabase, scope, connectionId),
      ]);
      await updateIntegrationConnectionStatus(adminSupabase, scope, connectionId, {
        status: "error",
        reason: "360dialog setup could not be verified.",
        errorCode: "WHATSAPP_360DIALOG_SETUP_FAILED",
      }).catch(() => undefined);
    }

    return NextResponse.json(
      { success: false, error: "360dialog could not be connected. No active webhook was left enabled." },
      { status: 422 },
    );
  }
}
