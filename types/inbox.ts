export type InboxChannel =
  | "whatsapp"
  | "website"
  | "crm"
  | "email"
  | "sms"
  | "webchat"
  | "instagram"
  | "messenger"
  | "whatsapp_group";

export type InboxPriority = "low" | "medium" | "high" | "urgent";

export type InboxDealStage = "lead" | "qualified" | "proposal" | "won" | "churned";

export type SlaStatus = "healthy" | "warning" | "breached";

export interface ActiveViewerPresence {
  userId: string;
  userName: string;
  action: "viewing" | "typing";
  lastSeenAt: string;
}

export interface ThreadLockState {
  isLocked: boolean;
  lockedByUserId?: string;
  lockedByUserName?: string;
  lockedAt?: string;
  expiresAt?: string;
  isHeldByMe?: boolean;
}

export interface InboxMessage {
  id: string;
  threadId: string;
  direction: "inbound" | "outbound";
  sender: string;
  senderName: string;
  body: string;
  timestamp: string;
  status: "sent" | "delivered" | "read" | "pending";
  channel?: InboxChannel;
  metadata?: {
    stripeCheckoutUrl?: string;
    amount?: number;
    currency?: string;
    productName?: string;
    leadFormDetails?: Record<string, string>;
    subject?: string;
    groupName?: string;
    provider?: string;
    externalMessageId?: string;
  };
}

export interface InboxThread {
  id: string;
  workspaceId?: string;
  contactName: string;
  contactIdentifier: string;
  company?: string;
  channel: InboxChannel;
  priority: InboxPriority;
  dealStage: InboxDealStage;
  estimatedValue: number;
  unreadCount: number;
  assignedSpecialist: string;
  assignedAgentId?: string;
  assignedTeam?: string;
  assignedAt?: string;
  lastMessageSnippet: string;
  lastMessageTimestamp: string;
  messages: InboxMessage[];
  // Tier 3 SLA attributes
  slaStatus?: SlaStatus;
  slaPolicyId?: string;
  slaFirstResponseDueAt?: string;
  slaResolutionDueAt?: string;
  slaFirstRespondedAt?: string;
  slaResolvedAt?: string;
  slaMinutesRemaining?: number;
  // Tier 3 Collision attributes
  lock?: ThreadLockState;
  activeViewers?: ActiveViewerPresence[];
}

export interface InboxFilterOptions {
  channel: "all" | InboxChannel;
  stage: "all" | InboxDealStage;
  search: string;
  priorityOnly?: boolean;
  slaOnly?: "all" | "breached" | "warning";
}

export interface SendReplyInput {
  threadId: string;
  body: string;
  agentName?: string;
  channel?: InboxChannel;
  stripePayment?: {
    amount: number;
    productName: string;
    checkoutUrl: string;
  };
  forceLockOverride?: boolean;
}

export interface OmnichannelRoutingRule {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  channel: "all" | InboxChannel;
  conditions: Array<{
    field: "channel" | "priority" | "keyword" | "vip" | "language";
    operator: "equals" | "contains" | "greater_than";
    value: string;
  }>;
  routingStrategy:
    | "round_robin"
    | "least_loaded"
    | "skill_based"
    | "ai_specialist"
    | "direct_assignment";
  targetUserId?: string;
  targetAgentId?: string;
  targetTeam: string;
  priorityOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OmnichannelSlaPolicy {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  priority: "all" | InboxPriority;
  channel: "all" | InboxChannel;
  firstResponseTargetMinutes: number;
  resolutionTargetMinutes: number;
  warningThresholdPercent: number;
  escalationAction?: {
    notifyManager?: boolean;
    reassignTeam?: string;
    webhookUrl?: string;
  };
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}
