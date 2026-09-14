import "server-only";

import { createHash } from "node:crypto";

/**
 * Provider-neutral inbound envelope. Provider adapters may only populate this
 * shape after their provider-specific signature check has succeeded.
 */
export type OmnichannelProvider =
  | "website"
  | "telegram"
  | "meta"
  | "whatsapp"
  | "gmail";

export type OmnichannelChannel =
  | "website"
  | "webchat"
  | "telegram"
  | "instagram"
  | "messenger"
  | "whatsapp"
  | "email";

export type InboundMessageEnvelope = Readonly<{
  provider: OmnichannelProvider;
  channel: OmnichannelChannel;
  workspaceId: string;
  externalAccountId: string;
  externalConversationId: string;
  externalContactId: string;
  externalMessageId: string;
  direction: "inbound";
  senderIdentity: Readonly<{ id: string; displayName?: string; email?: string; phone?: string }>;
  recipientIdentity: Readonly<{ id: string; displayName?: string }>;
  text: string;
  media: readonly Readonly<{ providerMediaId: string; mimeType?: string; url?: string }> [];
  replyToExternalMessageId?: string;
  deliveryStatus: "received" | "delivered";
  receivedAt: string;
  sentAt?: string;
  rawPayloadReference: string;
}>;

function required(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required.`);
  return value.trim();
}

function stringRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

/** Converts a verified Telegram Update to the common inbound envelope. */
export function adaptVerifiedTelegramUpdate(args: {
  workspaceId: string;
  externalAccountId: string;
  update: unknown;
  rawPayloadReference: string;
  receivedAt?: string;
}): InboundMessageEnvelope {
  const update = stringRecord(args.update);
  const message = stringRecord(update.message ?? update.edited_message);
  const chat = stringRecord(message.chat);
  const sender = stringRecord(message.from);
  const messageId = required(message.message_id === undefined ? undefined : String(message.message_id), "Telegram message id");
  const conversationId = required(chat.id === undefined ? undefined : String(chat.id), "Telegram chat id");
  const contactId = required(sender.id === undefined ? undefined : String(sender.id), "Telegram sender id");
  const text = typeof message.text === "string" ? message.text.trim() : "";
  if (!text) throw new Error("Telegram message text is required.");
  const senderName = [sender.first_name, sender.last_name].filter((part) => typeof part === "string" && part.trim()).join(" ") || undefined;
  const timestamp = typeof message.date === "number" ? new Date(message.date * 1000).toISOString() : undefined;

  return {
    provider: "telegram",
    channel: "telegram",
    workspaceId: required(args.workspaceId, "Workspace"),
    externalAccountId: required(args.externalAccountId, "Telegram account"),
    externalConversationId: conversationId,
    externalContactId: contactId,
    externalMessageId: messageId,
    direction: "inbound",
    senderIdentity: { id: contactId, displayName: senderName },
    recipientIdentity: { id: required(args.externalAccountId, "Telegram account") },
    text,
    media: [],
    replyToExternalMessageId: message.reply_to_message && typeof stringRecord(message.reply_to_message).message_id === "number"
      ? String(stringRecord(message.reply_to_message).message_id)
      : undefined,
    deliveryStatus: "received",
    receivedAt: args.receivedAt ?? new Date().toISOString(),
    sentAt: timestamp,
    rawPayloadReference: required(args.rawPayloadReference, "Raw payload reference"),
  };
}

/** Stable database idempotency material; it deliberately includes tenant and provider account. */
export function inboundReceiptKey(envelope: InboundMessageEnvelope): string {
  return createHash("sha256").update(JSON.stringify({
    workspaceId: envelope.workspaceId,
    provider: envelope.provider,
    externalAccountId: envelope.externalAccountId,
    externalMessageId: envelope.externalMessageId,
  })).digest("hex");
}

/**
 * Atomically persists a verified incoming Telegram message into Stage 1 canonical records:
 * contact, contact identity (telegram), lead intake, inbox thread, inbox message, and lead.received outbox.
 */
export async function persistCanonicalTelegramInbound(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  args: {
    workspaceId: string;
    update: unknown;
    origin: string;
  }
) {
  const { recordCanonicalLeadIntake } = await import("@/lib/leads/intake");
  const update = stringRecord(args.update);
  const message = stringRecord(
    update.message ??
    update.edited_message ??
    update.business_message ??
    update.edited_business_message
  );
  const chat = stringRecord(message.chat);
  const sender = stringRecord(message.from);

  if (!message.text || typeof message.text !== "string" || !message.text.trim()) {
    return null;
  }

  const senderName = [sender.first_name, sender.last_name]
    .filter((part) => typeof part === "string" && part.trim())
    .join(" ") || (typeof sender.username === "string" ? `@${sender.username}` : "Telegram User");

  const messageId = message.message_id !== undefined ? String(message.message_id) : undefined;
  const chatId = chat.id !== undefined ? String(chat.id) : undefined;
  const senderId = sender.id !== undefined ? String(sender.id) : undefined;
  const businessConnectionId =
    (message.business_connection_id as string) ||
    (update.business_connection_id as string) ||
    undefined;

  const idempotencyKey = `tg_${args.workspaceId}_${chatId || senderId}_${messageId}`;

  return await recordCanonicalLeadIntake(
    supabase,
    {
      workspaceId: args.workspaceId,
      source: "telegram",
      channel: "telegram",
      name: senderName,
      email: null,
      phone: null,
      message: message.text.trim(),
      sourceEventId: messageId,
      idempotencyKey,
      metadata: {
        telegram_user_id: senderId,
        telegram_chat_id: chatId,
        telegram_username: sender.username,
        ...(businessConnectionId ? { business_connection_id: businessConnectionId } : {}),
      },
    },
    args.origin
  );
}

