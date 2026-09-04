import type { SupabaseClient } from "@supabase/supabase-js";

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
 * Merges inbound webhook events and outbound action executions for a specific sender
 * into a single chronological message thread.
 */
export async function getWhatsAppMessageThread(
  supabase: SupabaseClient,
  userId: string,
  integrationId: string,
  senderPhone: string,
): Promise<WhatsAppMessageThreadItem[]> {
  const cleanSender = senderPhone.replace(/[\s()+.-]/g, "");

  // 1. Inbound messages from webhook events
  const { data: inboundRows } = await supabase
    .from("integration_webhook_events")
    .select("id,normalized_event,received_at,processing_status")
    .eq("integration_id", integrationId)
    .eq("user_id", userId)
    .order("received_at", { ascending: false })
    .limit(100);

  const messages: WhatsAppMessageThreadItem[] = [];

  for (const row of inboundRows ?? []) {
    const normalized = record(row.normalized_event);
    if (normalized?.capabilityId !== "whatsapp.message.received") continue;

    const actor = record(normalized.actor);
    const payload = record(normalized.data);
    const message = record(payload?.message);
    const from = text(actor?.externalId) ?? text(message?.from);

    if (!from) continue;
    const cleanFrom = from.replace(/[\s()+.-]/g, "");
    if (cleanFrom !== cleanSender) continue;

    if (!message) continue;
    const { body, type } = extractMessageContent(message);

    messages.push({
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

  // 2. Outbound messages from action executions
  const { data: outboundRows } = await supabase
    .from("integration_action_executions")
    .select("id,input,status,executed_at,created_at")
    .eq("integration_id", integrationId)
    .eq("user_id", userId)
    .eq("capability_id", "whatsapp.message.send")
    .order("created_at", { ascending: false })
    .limit(100);

  for (const row of outboundRows ?? []) {
    const input = record(row.input);
    const to = text(input?.to);
    if (!to) continue;
    const cleanTo = to.replace(/[\s()+.-]/g, "");
    if (cleanTo !== cleanSender) continue;

    const body = text(input?.message) ?? "[Outbound message]";
    const timestamp = row.executed_at || row.created_at || new Date().toISOString();

    messages.push({
      id: row.id,
      direction: "outbound",
      sender: "business",
      recipient: to,
      body,
      messageType: "text",
      timestamp,
      status: row.status === "completed" ? "delivered" : row.status === "failed" ? "failed" : "sent",
    });
  }

  // Sort ascending by timestamp (oldest first, newest at the bottom)
  messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return messages;
}
