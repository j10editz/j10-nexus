export const INTEGRATION_GMAIL_CAPABILITY_IDS = {
  messageReceived: "gmail.message.received",
  messageSend: "gmail.message.send",
  messageReply: "gmail.message.reply",
  messageAddLabel: "gmail.message.add_label",
} as const;

export interface IntegrationGmailSendMessageInput {
  readonly to: string | readonly string[];
  readonly cc?: string | readonly string[];
  readonly bcc?: string | readonly string[];
  readonly subject: string;
  readonly body: string;
  readonly htmlBody?: string;
}

export interface IntegrationGmailReplyMessageInput {
  readonly messageId: string;
  readonly body: string;
  readonly htmlBody?: string;
}

export interface IntegrationGmailAddLabelInput {
  readonly messageId: string;
  readonly labelIds: readonly string[];
}

export interface IntegrationGmailMessageResultMetadata {
  readonly messageId: string;
  readonly threadId: string | null;
}

export interface IntegrationGmailProfileMetadata {
  readonly emailAddress: string;
  readonly messagesTotal: number | null;
  readonly threadsTotal: number | null;
  readonly historyId: string | null;
}