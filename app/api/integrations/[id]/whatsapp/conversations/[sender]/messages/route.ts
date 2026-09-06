import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/auth";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";
import {
  integrationApiErrorResponse,
} from "@/lib/integrations/api";
import { getIntegrationConnectionById } from "@/lib/integrations/database";
import { getWhatsAppMessageThread } from "@/lib/whatsapp/inbox-service";

type RouteContext = { params: Promise<{ id: string; sender: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id, sender } = await context.params;
    const auth = await requireApiWorkspaceContext("viewer");
    if (auth.error) {
      return auth.error;
    }
    const { context: wsContext } = auth;
    const supabase = createServerSupabaseClient();

    const connection = await getIntegrationConnectionById(
      supabase,
      { workspaceId: wsContext.workspace.id, actorUserId: wsContext.user.id },
      id,
    );
    if (!connection || connection.providerId !== "whatsapp-business") {
      return NextResponse.json(
        { success: false, error: "WhatsApp Business connection was not found." },
        { status: 404 },
      );
    }

    const decodedSender = decodeURIComponent(sender);
    const messages = await getWhatsAppMessageThread(
      supabase,
      { workspaceId: wsContext.workspace.id, actorUserId: wsContext.user.id },
      id,
      decodedSender,
    );

    return NextResponse.json(
      { success: true, sender: decodedSender, messages },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return integrationApiErrorResponse(error, "Could not load WhatsApp message thread.");
  }
}
