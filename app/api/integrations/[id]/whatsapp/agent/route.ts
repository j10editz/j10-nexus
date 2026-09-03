import { NextResponse } from "next/server";

import { createIntegrationApiClient, getAuthenticatedIntegrationUser, integrationApiErrorResponse, parseRequestObject } from "@/lib/integrations/api";
import { getIntegrationConnectionById, updateIntegrationConnectionConfiguration } from "@/lib/integrations/database";
import { getWhatsAppAgentConfig, getWhatsAppAgentReadiness, parseWhatsAppAgentConfig, WHATSAPP_AGENT_CONFIG_KEY } from "@/lib/integrations/whatsapp-agent";

type RouteContext = { params: Promise<{ id: string }> };

async function load(context: RouteContext) {
  const { id } = await context.params;
  const supabase = await createIntegrationApiClient();
  const user = await getAuthenticatedIntegrationUser(supabase);
  if (!user) return { response: NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 }) };
  const connection = await getIntegrationConnectionById(supabase, user.id, id);
  if (!connection || connection.providerId !== "whatsapp-business") return { response: NextResponse.json({ success: false, error: "WhatsApp Business connection was not found." }, { status: 404 }) };
  return { id, supabase, user, connection };
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const result = await load(context);
    if (result.response) return result.response;
    const config = getWhatsAppAgentConfig(result.connection!);
    return NextResponse.json({ success: true, config, readiness: getWhatsAppAgentReadiness(config) });
  } catch (error) {
    return integrationApiErrorResponse(error, "Could not load the WhatsApp AI agent.");
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const result = await load(context);
    if (result.response) return result.response;
    const body = parseRequestObject(await request.json());
    if (body.mode === "automatic") return NextResponse.json({ success: false, error: "Autonomous sending is locked until production safety approval is complete." }, { status: 409 });
    const config = parseWhatsAppAgentConfig(body);
    const readiness = getWhatsAppAgentReadiness(config);
    if (config.active && !readiness.ready) return NextResponse.json({ success: false, error: `Complete: ${readiness.missing.join(", ")}.` }, { status: 400 });
    await updateIntegrationConnectionConfiguration(result.supabase!, result.user!.id, result.id!, {
      publicConfiguration: { ...result.connection!.publicConfiguration, [WHATSAPP_AGENT_CONFIG_KEY]: JSON.stringify(config) },
      enabledCapabilities: result.connection!.enabledCapabilities,
    });
    return NextResponse.json({ success: true, config, readiness });
  } catch (error) {
    return integrationApiErrorResponse(error, "Could not save the WhatsApp AI agent.");
  }
}
