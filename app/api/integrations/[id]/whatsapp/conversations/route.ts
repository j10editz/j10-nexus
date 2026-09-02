import { NextResponse } from "next/server";

import {
  createIntegrationApiClient,
  getAuthenticatedIntegrationUser,
  integrationApiErrorResponse,
} from "@/lib/integrations/api";
import { getIntegrationConnectionById } from "@/lib/integrations/database";

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

    const { data, error } = await supabase
      .from("integration_webhook_events")
      .select("id,normalized_event,received_at,processing_status")
      .eq("integration_id", id)
      .eq("user_id", user.id)
      .order("received_at", { ascending: false })
      .limit(100);

    if (error) throw error;

    const conversations = new Map<string, {
      sender: string;
      name: string;
      lastMessage: string;
      messageType: string;
      lastReceivedAt: string;
      messageCount: number;
      status: string;
    }>();

    for (const event of (data ?? []) as EventRow[]) {
      const normalized = record(event.normalized_event);
      if (normalized?.capabilityId !== "whatsapp.message.received") continue;

      const actor = record(normalized.actor);
      const payload = record(normalized.data);
      const message = record(payload?.message);
      const sender = text(actor?.externalId) ?? text(message?.from);
      if (!sender || !message) continue;

      const existing = conversations.get(sender);
      if (existing) {
        existing.messageCount += 1;
        continue;
      }

      conversations.set(sender, {
        sender,
        name: text(actor?.displayName) ?? `WhatsApp ••••${sender.slice(-4)}`,
        lastMessage: messagePreview(message),
        messageType: text(message.type) ?? "unknown",
        lastReceivedAt: event.received_at,
        messageCount: 1,
        status: event.processing_status,
      });
    }

    return NextResponse.json(
      { success: true, conversations: Array.from(conversations.values()) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return integrationApiErrorResponse(error, "Could not load WhatsApp conversations.");
  }
}
