import { NextResponse } from "next/server";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";
import { createServerSupabaseClient } from "@/lib/auth";
import { getIntegrationConnectionById } from "@/lib/integrations/database";
import { getWhatsAppMessageThread, type WhatsAppMessageThreadItem } from "@/lib/whatsapp/inbox-service";
import { qualifyAndSyncWhatsAppLead } from "@/lib/whatsapp/lead-qualification";
import { integrationApiErrorResponse, parseRequestObject } from "@/lib/integrations/api";

type RouteContext = { params: Promise<{ id: string; sender: string }> };

export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { id, sender } = await routeContext.params;
    const auth = await requireApiWorkspaceContext("manager");
    if (auth.error) {
      return auth.error;
    }
    const { context } = auth;
    const supabase = createServerSupabaseClient();

    const connection = await getIntegrationConnectionById(supabase, context.workspace.id, id);
    if (!connection || connection.providerId !== "whatsapp-business") {
      return NextResponse.json(
        { success: false, error: "WhatsApp Business connection was not found." },
        { status: 404 },
      );
    }

    const decodedSender = decodeURIComponent(sender);
    const body = parseRequestObject(await request.json().catch(() => ({})));
    const customerName = typeof body.customerName === "string" ? body.customerName.trim() : undefined;

    let messageTexts: string[] = [];
    const incomingMessages = Array.isArray(body.messages) ? (body.messages as unknown[]) : [];
    if (incomingMessages.length > 0) {
      messageTexts = incomingMessages.filter((m: unknown): m is string => typeof m === "string");
    } else {
      const thread = await getWhatsAppMessageThread(
        supabase,
        { workspaceId: context.workspace.id, actorUserId: context.user.id },
        id,
        decodedSender,
      );
      messageTexts = thread.filter((m: WhatsAppMessageThreadItem) => m.direction === "inbound").map((m: WhatsAppMessageThreadItem) => m.body);
    }

    if (messageTexts.length === 0) {
      messageTexts = ["Hello"];
    }

    const origin = new URL(request.url).origin;
    const result = await qualifyAndSyncWhatsAppLead(
      supabase,
      context.user.id,
      {
        senderPhone: decodedSender,
        customerName,
        messages: messageTexts,
      },
      origin,
      context.workspace.id,
    );

    return NextResponse.json(
      { success: true, lead: result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return integrationApiErrorResponse(error, "Could not qualify WhatsApp lead.");
  }
}
