import type { SupabaseClient } from "@supabase/supabase-js";
import type { IntegrationScope } from "@/lib/integrations/database";

export type WhatsAppMessageThreadItem = {
  id: string;
  direction: "inbound" | "outbound";
  sender: string;
  recipient?: string;
  body: string;
  messageType: string;
  timestamp: string;
  status: "received" | "sent" | "delivered" | "failed" | "pending";
  actorName?: string;
};

export type WhatsAppConversationSummary = {
  sender: string;
  name: string;
  lastMessage: string;
  messageType: string;
  lastReceivedAt: string;
  messageCount: number;
  status: string;
  escalated: boolean;
  escalationReason?: string;
  crmContact?: {
    id: string;
    status: string;
    type: string;
    company?: string | null;
    estimatedValue?: number;
  } | null;
};

const ESCALATION_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\b(human|agent|operator|person|representative|manager|speak to someone)\b/i, reason: "Customer requested human representative" },
  { pattern: /\b(refund|money back|chargeback|cancel (my )?subscription|billing error)\b/i, reason: "Billing or refund dispute" },
  { pattern: /\b(lawyer|attorney|legal|sue|court|fraud|scam)\b/i, reason: "Legal or compliance risk" },
  { pattern: /\b(unacceptable|horrible|terrible|broken|worst|complaint|angry)\b/i, reason: "Customer dissatisfaction / escalation" },
];

export function detectEscalationIntent(messageBody: string): { escalated: boolean; reason?: string } {
  if (!messageBody || typeof messageBody !== "string") {
    return { escalated: false };
  }

  for (const { pattern, reason } of ESCALATION_PATTERNS) {
    if (pattern.test(messageBody)) {
      return { escalated: true, reason };
    }
  }

  return { escalated: false };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function extractMessageContent(message: Record<string, unknown>): { body: string; type: string } {
  const type = text(message.type) ?? "text";
  const bodyText = text(record(message.text)?.body);
  const button = text(record(message.button)?.text);
  const interactive = record(message.interactive);
  const reply = record(interactive?.button_reply) ?? record(interactive?.list_reply);
  const caption =
    text(record(message.image)?.caption) ??
    text(record(message.video)?.caption) ??
    text(record(message.document)?.caption);

  const body = bodyText ?? button ?? text(reply?.title) ?? caption ?? `[${type} message]`;
  return { body, type };
}

/**
 * Reads canonical message thread for a specific sender phone within workspace.
 */
export async function getWhatsAppMessageThread(
  supabase: SupabaseClient,
  scope: IntegrationScope | string,
  integrationId: string,
  senderPhone: string,
): Promise<WhatsAppMessageThreadItem[]> {
  const workspaceId = typeof scope === "string" ? scope : scope.workspaceId;
  if (!workspaceId) return [];

  const cleanSender = senderPhone.replace(/[\s()+.-]/g, "");

  // 1. Resolve canonical thread
  const { data: thread } = await supabase
    .from("inbox_threads")
    .select("id, external_thread_id")
    .eq("workspace_id", workspaceId)
    .eq("channel", "whatsapp")
    .or(`external_thread_id.eq.${senderPhone},external_thread_id.eq.${cleanSender}`)
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (thread?.id) {
    const { data: canonicalMsgs } = await supabase
      .from("inbox_messages")
      .select("id, direction, content, metadata, delivery_status, created_at")
      .eq("workspace_id", workspaceId)
      .eq("thread_id", thread.id)
      .order("created_at", { ascending: true })
      .limit(100);

    if (canonicalMsgs && canonicalMsgs.length > 0) {
      return canonicalMsgs.map((m) => {
        const meta = (m.metadata || {}) as Record<string, any>;
        const isOutbound = m.direction === "outbound";
        return {
          id: m.id,
          direction: isOutbound ? "outbound" : "inbound",
          sender: isOutbound ? "business" : senderPhone,
          recipient: isOutbound ? senderPhone : undefined,
          body: m.content || "",
          messageType: meta.messageType || "text",
          timestamp: m.created_at,
          status: (m.delivery_status as any) || (isOutbound ? "sent" : "delivered"),
          actorName: isOutbound ? "AI Receptionist" : undefined,
        };
      });
    }
  }

  // Fallback to webhook events if migration transition is in flight
  const { data: inboundRows } = await supabase
    .from("integration_webhook_events")
    .select("id,normalized_event,received_at,processing_status")
    .eq("integration_id", integrationId)
    .order("received_at", { ascending: true })
    .limit(50);

  const fallbackMessages: WhatsAppMessageThreadItem[] = [];
  for (const row of inboundRows ?? []) {
    const normalized = record(row.normalized_event);
    if (normalized?.capabilityId !== "whatsapp.message.received") continue;
    const actor = record(normalized.actor);
    const payload = record(normalized.data);
    const message = record(payload?.message);
    const from = text(actor?.externalId) ?? text(message?.from);
    if (!from) continue;
    if (from.replace(/[\s()+.-]/g, "") !== cleanSender) continue;
    if (!message) continue;
    const { body, type } = extractMessageContent(message);
    fallbackMessages.push({
      id: row.id,
      direction: "inbound",
      sender: from,
      body,
      messageType: type,
      timestamp: row.received_at,
      status: "received",
      actorName: text(actor?.displayName) ?? undefined,
    });
  }

  return fallbackMessages;
}
