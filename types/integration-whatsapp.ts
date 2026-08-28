export const WHATSAPP_CAPABILITIES = [
  "whatsapp.message.received",
  "whatsapp.message.status",
  "whatsapp.message.send",
  "whatsapp.template.send",
] as const;

export type WhatsAppCapabilityId =
  typeof WHATSAPP_CAPABILITIES[number];

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
