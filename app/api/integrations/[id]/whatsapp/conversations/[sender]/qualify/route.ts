import { NextResponse } from "next/server";

import {
  createIntegrationApiClient,
  getAuthenticatedIntegrationUser,
  integrationApiErrorResponse,
  parseRequestObject,
} from "@/lib/integrations/api";
import { getIntegrationConnectionById } from "@/lib/integrations/database";
import { getWhatsAppMessageThread } from "@/lib/whatsapp/inbox-service";
import { qualifyAndSyncWhatsAppLead } from "@/lib/whatsapp/lead-qualification";

type RouteContext = { params: Promise<{ id: string; sender: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id, sender } = await context.params;
    const supabase = await createIntegrationApiClient();
    const user = await getAuthenticatedIntegrationUser(supabase);

    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
    }

    const connection = await getIntegrationConnectionById(supabase, user.id, id);
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
    if (Array.isArray(body.messages) && body.messages.length > 0) {
      messageTexts = body.messages.filter((m): m is string => typeof m === "string");
    } else {
      const thread = await getWhatsAppMessageThread(supabase, user.id, id, decodedSender);
      messageTexts = thread.filter((m) => m.direction === "inbound").map((m) => m.body);
    }

    if (messageTexts.length === 0) {
      messageTexts = ["Hello"];
    }

    const origin = new URL(request.url).origin;
    const result = await qualifyAndSyncWhatsAppLead(
      supabase,
      user.id,
      {
        senderPhone: decodedSender,
        customerName,
        messages: messageTexts,
      },
      origin,
    );

    return NextResponse.json(
      { success: true, lead: result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return integrationApiErrorResponse(error, "Could not qualify WhatsApp lead.");
  }
}
