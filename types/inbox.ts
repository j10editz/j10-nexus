export type InboxChannel = "whatsapp" | "website" | "crm";

export type InboxPriority = "low" | "medium" | "high" | "urgent";

export type InboxDealStage = "lead" | "qualified" | "proposal" | "won" | "churned";

export interface InboxMessage {
  id: string;
  threadId: string;
  direction: "inbound" | "outbound";
  sender: string;
  senderName: string;
  body: string;
  timestamp: string;
  status: "sent" | "delivered" | "read" | "pending";
  metadata?: {
    stripeCheckoutUrl?: string;
    amount?: number;
    currency?: string;
    productName?: string;
    leadFormDetails?: Record<string, string>;
  };
}

export interface InboxThread {
  id: string;
  contactName: string;
  contactIdentifier: string;
  company?: string;
  channel: InboxChannel;
  priority: InboxPriority;
  dealStage: InboxDealStage;
  estimatedValue: number;
  unreadCount: number;
  assignedSpecialist: string;
  lastMessageSnippet: string;
  lastMessageTimestamp: string;
  messages: InboxMessage[];
}

export interface InboxFilterOptions {
  channel: "all" | InboxChannel;
  stage: "all" | InboxDealStage;
  search: string;
  priorityOnly?: boolean;
}

export interface SendReplyInput {
  threadId: string;
  body: string;
  agentName?: string;
  stripePayment?: {
    amount: number;
    productName: string;
    checkoutUrl: string;
  };
}
