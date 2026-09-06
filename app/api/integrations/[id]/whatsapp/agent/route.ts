import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/auth";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";
import { integrationApiErrorResponse, parseRequestObject } from "@/lib/integrations/api";
import {
  getIntegrationConnectionById,
  updateIntegrationConnectionConfiguration,
} from "@/lib/integrations/database";
import {
  getWhatsAppAgentConfig,
  getWhatsAppAgentReadiness,
  parseWhatsAppAgentConfig,
  WHATSAPP_AGENT_CONFIG_KEY,
} from "@/lib/integrations/whatsapp-agent";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const auth = await requireApiWorkspaceContext("viewer");
    if (auth.error) {
      return auth.error;
    }
    const { context: wsContext } = auth;
    const user = wsContext.user;
    const supabase = createServerSupabaseClient();

    const connection = await getIntegrationConnectionById(
      supabase,
      { workspaceId: wsContext.workspace.id, actorUserId: user!.id },
      id,
    );
    if (!connection || connection.providerId !== "whatsapp-business") {
      return NextResponse.json(
        { success: false, error: "WhatsApp Business connection was not found." },
        { status: 404 },
      );
    }

    const config = getWhatsAppAgentConfig(connection);
    return NextResponse.json({
      success: true,
      config,
      readiness: getWhatsAppAgentReadiness(config),
    });
  } catch (error) {
    return integrationApiErrorResponse(error, "Could not load the WhatsApp AI agent.");
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const auth = await requireApiWorkspaceContext("admin");
    if (auth.error) {
      return auth.error;
    }
    const { context: wsContext } = auth;
    const user = wsContext.user;
    const supabase = createServerSupabaseClient();

    const connection = await getIntegrationConnectionById(
      supabase,
      { workspaceId: wsContext.workspace.id, actorUserId: user!.id },
      id,
    );
    if (!connection || connection.providerId !== "whatsapp-business") {
      return NextResponse.json(
        { success: false, error: "WhatsApp Business connection was not found." },
        { status: 404 },
      );
    }

    const body = parseRequestObject(await request.json());
    if (body.mode === "automatic") {
      return NextResponse.json(
        { success: false, error: "Autonomous sending is locked until production safety approval is complete." },
        { status: 409 },
      );
    }

    const config = parseWhatsAppAgentConfig(body);
    const readiness = getWhatsAppAgentReadiness(config);
    if (config.active && !readiness.ready) {
      return NextResponse.json(
        { success: false, error: `Complete: ${readiness.missing.join(", ")}.` },
        { status: 400 },
      );
    }

    await updateIntegrationConnectionConfiguration(
      supabase,
      { workspaceId: wsContext.workspace.id, actorUserId: user!.id },
      id,
      {
        publicConfiguration: {
          ...connection.publicConfiguration,
          [WHATSAPP_AGENT_CONFIG_KEY]: JSON.stringify(config),
        },
        enabledCapabilities: connection.enabledCapabilities,
      },
    );

    return NextResponse.json({ success: true, config, readiness });
  } catch (error) {
    return integrationApiErrorResponse(error, "Could not save the WhatsApp AI agent.");
  }
}
