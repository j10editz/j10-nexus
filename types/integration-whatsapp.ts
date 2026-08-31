export const WHATSAPP_CAPABILITIES = [
  "whatsapp.message.received",
  "whatsapp.message.status_updated",
  "whatsapp.message.send",
  "whatsapp.template.send",
  "whatsapp.media.send",
] as const;

export type WhatsAppCapabilityId =
  typeof WHATSAPP_CAPABILITIES[number];

export const WHATSAPP_ACTION_CAPABILITY_IDS = {
  messageSend: "whatsapp.message.send",
  templateSend: "whatsapp.template.send",
  mediaSend: "whatsapp.media.send",
} as const;

export type WhatsAppMediaType =
  | "audio"
  | "document"
  | "image"
  | "video";

export interface WhatsAppTextMessageInput {
  readonly to: string;
  readonly message: string;
  readonly previewUrl: boolean;
}

export interface WhatsAppTemplateMessageInput {
  readonly to: string;
  readonly templateName: string;
  readonly languageCode: string;
  readonly components?: readonly Readonly<Record<string, unknown>>[];
}

export interface WhatsAppMediaMessageInput {
  readonly to: string;
  readonly mediaType: WhatsAppMediaType;
  readonly mediaUrl: string;
  readonly caption?: string;
  readonly filename?: string;
}

export type WhatsAppWebhookMessage = {
  id: string | null;
  from: string | null;
  timestamp: string | null;
  type: string | null;
  text: string | null;
  contactName: string | null;
  phoneNumberId: string | null;
  displayPhoneNumber: string | null;
  raw: unknown;
};

export type WhatsAppWebhookStatus = {
  id: string | null;
  recipientId: string | null;
  status: string | null;
  timestamp: string | null;
  phoneNumberId: string | null;
  displayPhoneNumber: string | null;
  raw: unknown;
};

export type WhatsAppWebhookEvent = {
  object: string | null;
  messages: WhatsAppWebhookMessage[];
  statuses: WhatsAppWebhookStatus[];
  raw: unknown;
};
