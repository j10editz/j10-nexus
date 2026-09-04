import { NextResponse } from "next/server";

import {
  createIntegrationApiClient,
  getAuthenticatedIntegrationUser,
  integrationApiErrorResponse,
} from "@/lib/integrations/api";
import { getIntegrationConnectionById } from "@/lib/integrations/database";
import { getWhatsAppMessageThread } from "@/lib/whatsapp/inbox-service";

type RouteContext = { params: Promise<{ id: string; sender: string }> };

export async function GET(_request: Request, context: RouteContext) {
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
    const messages = await getWhatsAppMessageThread(supabase, user.id, id, decodedSender);

    return NextResponse.json(
      { success: true, sender: decodedSender, messages },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return integrationApiErrorResponse(error, "Could not load WhatsApp message thread.");
  }
}
