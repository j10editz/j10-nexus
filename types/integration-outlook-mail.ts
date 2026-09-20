export const INTEGRATION_OUTLOOK_MAIL_CAPABILITY_IDS = {
  messageSend: "outlook-mail.message.send",
  messageReply: "outlook-mail.message.reply",
} as const;

export interface IntegrationOutlookMailSendMessageInput {
  readonly to: string | readonly string[];
  readonly cc?: string | readonly string[];
  readonly bcc?: string | readonly string[];
  readonly subject: string;
  readonly body: string;
  readonly htmlBody?: string;
}

export interface IntegrationOutlookMailReplyMessageInput {
  readonly messageId: string;
  readonly body: string;
  readonly htmlBody?: string;
}
