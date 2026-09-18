import { NextResponse } from "next/server";

import {
  integrationApiErrorResponse,
} from "@/lib/integrations/api";
import { getIntegrationConnectionById } from "@/lib/integrations/database";
import { createServerSupabaseClient } from "@/lib/auth";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";

type RouteContext = { params: Promise<{ id: string }> };

type EventRow = {
  id: string;
  normalized_event: unknown;
  received_at: string;
  processing_status: string;
};

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function messagePreview(message: Record<string, unknown>) {
  const type = text(message.type) ?? "unknown";
  const body = text(record(message.text)?.body);
  const button = text(record(message.button)?.text);
  const interactive = record(message.interactive);
  const reply = record(interactive?.button_reply) ?? record(interactive?.list_reply);
  const caption =
    text(record(message.image)?.caption) ??
    text(record(message.video)?.caption) ??
    text(record(message.document)?.caption);

  return body ?? button ?? text(reply?.title) ?? caption ?? `[${type} message]`;
}

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

    // Query canonical inbox_threads for this workspace
    const { data: canonicalThreads, error: threadsError } = await supabase
      .from("inbox_threads")
      .select(`
        id,
        workspace_id,
        contact_id,
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
      .order("last_message_at", { ascending: false })
      .limit(100);

    if (threadsError) {
      console.error("[WhatsApp Conversations] Canonical threads error:", threadsError);
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
    } else {
      // Fallback: check legacy webhook events only if no canonical threads exist
      const { data: legacyEvents } = await supabase
        .from("integration_webhook_events")
        .select("id,normalized_event,received_at,processing_status")
        .eq("integration_id", id)
        .order("received_at", { ascending: false })
        .limit(100);

      const legacyMap = new Map<string, any>();
      for (const event of (legacyEvents ?? []) as EventRow[]) {
        const normalized = record(event.normalized_event);
        if (normalized?.capabilityId !== "whatsapp.message.received") continue;

        const actor = record(normalized.actor);
        const payload = record(normalized.data);
        const message = record(payload?.message);
        const sender = text(actor?.externalId) ?? text(message?.from);
        if (!sender || !message) continue;

        if (legacyMap.has(sender)) {
          legacyMap.get(sender).messageCount += 1;
          continue;
        }

        const preview = messagePreview(message);
        legacyMap.set(sender, {
          sender,
          name: text(actor?.displayName) ?? `WhatsApp User (${sender})`,
          lastMessage: preview,
          messageType: text(message.type) ?? "unknown",
          lastReceivedAt: event.received_at,
          messageCount: 1,
          status: event.processing_status,
          escalated: false,
          crmContact: null,
        });
      }
      conversations.push(...Array.from(legacyMap.values()));
    }

    return NextResponse.json(
      { success: true, conversations },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return integrationApiErrorResponse(error, "Could not load WhatsApp conversations.");
  }
}
