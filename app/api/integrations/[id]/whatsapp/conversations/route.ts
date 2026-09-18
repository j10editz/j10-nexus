import { NextResponse } from "next/server";

import {
  integrationApiErrorResponse,
} from "@/lib/integrations/api";
import { getIntegrationConnectionById } from "@/lib/integrations/database";
import { createServerSupabaseClient } from "@/lib/auth";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";

type RouteContext = { params: Promise<{ id: string }> };



export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const auth = await requireApiWorkspaceContext("viewer");
    if (auth.error) {
      return auth.error;
    }
    const { context: wsContext } = auth;
    const supabase = createServerSupabaseClient();

    const connection = await getIntegrationConnectionById(supabase, wsContext.workspace.id, id);
    if (!connection || connection.providerId !== "whatsapp-business") {
      return NextResponse.json(
        { success: false, error: "WhatsApp Business connection was not found." },
        { status: 404 },
      );
    }

    // Query canonical inbox_threads for this workspace and integration
    const { data: canonicalThreads, error: threadsError } = await supabase
      .from("inbox_threads")
      .select(`
        id,
        workspace_id,
        contact_id,
        integration_id,
        channel,
        external_thread_id,
        status,
        priority,
        unread_count,
        last_message_at,
        created_at,
        metadata,
        contact:contacts(
          id,
          name,
          first_name,
          phone,
          company,
          type,
          status,
          estimated_value
        )
      `)
      .eq("workspace_id", wsContext.workspace.id)
      .eq("channel", "whatsapp")
      .or(`integration_id.eq.${id},metadata->>integrationId.eq.${id}`)
      .order("last_message_at", { ascending: false })
      .limit(100);

    if (threadsError) {
      console.error("[WhatsApp Conversations] Canonical threads error:", threadsError);
      return NextResponse.json(
        { success: false, error: "Failed to load conversations." },
        { status: 500 },
      );
    }

    // Query service conversion journeys for these threads
    const { data: journeys } = await supabase
      .from("service_conversion_journeys")
      .select("*")
      .eq("workspace_id", wsContext.workspace.id);

    const lifecycleMap = new Map<string, any>();
    for (const j of journeys || []) {
      if (j.thread_id) {
        lifecycleMap.set(j.thread_id, j);
      }
    }

    const conversations: Array<any> = [];

    if (canonicalThreads && canonicalThreads.length > 0) {
      for (const th of canonicalThreads) {
        const meta = (th.metadata || {}) as Record<string, any>;
        const contact = (th.contact || {}) as Record<string, any>;
        const lc = lifecycleMap.get(th.id);

        const senderPhone = th.external_thread_id;
        const displayName = contact.first_name || contact.name || meta.senderName || `WhatsApp User (${senderPhone})`;
        const isEscalated = Boolean(meta.humanHandoff || lc?.status === "human_takeover");
        const escalationReason = meta.humanTakeoverReason || lc?.human_takeover_reason || (isEscalated ? "Customer requested human representative" : undefined);

        conversations.push({
          threadId: th.id,
          sender: senderPhone,
          name: displayName,
          lastMessage: meta.lastMessageSnippet || "Message received.",
          messageType: "text",
          lastReceivedAt: th.last_message_at || th.created_at,
          messageCount: Math.max(1, th.unread_count || 1),
          status: lc?.status || th.status || "active",
          escalated: isEscalated,
          escalationReason,
          crmContact: contact.id
            ? {
                id: contact.id,
                status: contact.status || "New",
                type: contact.type || "Lead",
                company: contact.company || null,
                estimatedValue: lc?.estimated_service_value || contact.estimated_value || undefined,
              }
            : null,
          lifecycle: lc
            ? {
                status: lc.status,
                requestedService: lc.requested_service,
                preferredDate: lc.preferred_date,
                preferredTime: lc.preferred_time,
                qualificationCompleteness: lc.qualification_completeness,
              }
            : null,
        });
      }
    }

    return NextResponse.json(
      { success: true, conversations },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return integrationApiErrorResponse(error, "Could not load WhatsApp conversations.");
  }
}
