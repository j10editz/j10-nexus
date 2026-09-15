export type DateRangeFilter = "today" | "7d" | "30d" | "all";

export interface MetricTrend {
  value: number | string;
  changePercentage?: number;
  changeLabel?: string;
  isPositive?: boolean;
  previousPeriodValue?: number | string;
  explanation: string;
  destinationHref: string;
}

export interface RevenueSnapshot {
  newLeads: MetricTrend;
  qualifiedLeads: MetricTrend;
  appointmentsBooked: MetricTrend;
  pipelineValue: MetricTrend;
  revenueWon: MetricTrend;
  averageFirstResponseSeconds: MetricTrend;
}

export interface FunnelStage {
  id: "new" | "contacted" | "qualified" | "appointment" | "proposal" | "won";
  label: string;
  count: number;
  conversionFromPrevious: number; // percentage (e.g. 89.4)
  conversionFromTotal: number; // percentage from top (e.g. 55.3)
  pipelineValue: number; // in USD
  dropOffCount: number;
  crmFilterHref: string;
}

export interface LeadToRevenueFunnel {
  totalInbound: number;
  stages: FunnelStage[];
  overallConversionRate: number; // from New to Won
  averageTimeToWinDays: number;
}

export interface ChannelHealth {
  channel: "telegram" | "whatsapp" | "webchat" | "email";
  label: string;
  isConnected: boolean;
  status: "active" | "standby" | "unconfigured";
  accountIdentifier?: string;
}

export interface AIReceptionistStatus {
  status: "active" | "paused" | "needs_attention";
  statusReason?: string;
  conversationsHandled: number;
  totalMessagesExchanged: number;
  aiResolutionRate: number; // percentage (e.g. 72.3)
  humanHandoffCount: number;
  humanHandoffRate: number; // percentage (e.g. 10.6)
  averageResponseTimeSeconds: number;
  lastSuccessfulResponse: {
    contactName: string;
    channel: string;
    timestamp: string;
  } | null;
  knowledgeBaseHealth: {
    isHealthy: boolean;
    servicesCount: number;
    hasPricing: boolean;
    hasBusinessHours: boolean;
    hasBookingLink: boolean;
    lastUpdated: string;
  };
  channels: ChannelHealth[];
}

export interface PriorityLead {
  id: string;
  contactId: string;
  threadId?: string;
  name: string;
  avatarUrl?: string;
  email?: string;
  phone?: string;
  source: "telegram" | "whatsapp" | "website" | "manual";
  qualificationScore: number; // 0 - 100
  intent: string; // e.g. "Commercial Office Cleaning", "Enterprise Automation"
  lastMessageSnippet: string;
  lastMessageTimestamp: string;
  assignedOwner: "AI Receptionist" | "Human Operator";
  slaTimerText: string; // e.g. "8m left", "Responded", "Breached"
  slaStatus: "healthy" | "warning" | "breached";
  dealStage: "lead" | "contacted" | "qualified" | "appointment" | "proposal" | "won" | "lost";
  estimatedValue: number;
  recommendedNextAction: string;
  isUrgent: boolean;
}

export interface ConversationActivityItem {
  id: string;
  threadId: string;
  contactName: string;
  contactIdentifier: string;
  channel: "telegram" | "whatsapp" | "webchat" | "email";
  latestMessage: string;
  isAiHandled: boolean;
  sentiment?: "positive" | "neutral" | "urgent" | "question";
  isUnread: boolean;
  timestamp: string;
  handoffStatus?: "none" | "requested" | "transferred" | "resolved";
}

export interface AppointmentItem {
  id: string;
  contactId?: string;
  clientName: string;
  serviceRequested: string;
  dateTimeFormatted: string;
  timeFormatted: string;
  dateISO: string;
  status: "confirmed" | "pending" | "completed" | "cancelled";
  isToday: boolean;
  estimatedValue: number;
}

export interface RevenueAttributionSource {
  source: string;
  label: string;
  leadsCount: number;
  wonCount: number;
  wonRevenue: number;
  pipelineValue: number;
  conversionRate: number;
}

export interface WonDealItem {
  id: string;
  clientName: string;
  serviceName: string;
  amount: number;
  wonDate: string;
  leadSource: string;
  verifiedInLedger: boolean;
}

export interface RevenueAttribution {
  revenueWon: number;
  openPipelineValue: number;
  aiInfluencedRevenue: number;
  aiInfluencePercentage: number;
  bySource: RevenueAttributionSource[];
  recentWonDeals: WonDealItem[];
  topPerformingService: {
    name: string;
    revenue: number;
    dealCount: number;
  };
}

export interface RecommendedAction {
  id: string;
  priority: "high" | "medium" | "low";
  category: "lead" | "appointment" | "handoff" | "setup";
  title: string;
  reason: string;
  expectedValue?: string;
  actionLabel: string;
  actionHref: string;
  dismissible: boolean;
}

export interface PlanUsage {
  planTier: "starter" | "growth" | "scale" | "enterprise";
  planName: string;
  priceMonthly: number;
  status: "active" | "trial" | "past_due";
  trialDaysRemaining?: number;
  aiConversationsUsed: number;
  aiConversationsLimit: number;
  leadsUsed: number;
  leadsLimit: number;
  channelsConnected: number;
  channelsLimit: number;
  renewsAt: string;
}

export interface RevenueCommandDashboardData {
  workspaceId: string;
  workspaceName: string;
  brandName: string;
  isDemoMode: boolean;
  isEmptyWorkspace?: boolean;
  dateRange: DateRangeFilter;
  lastUpdated: string;
  snapshot: RevenueSnapshot;
  funnel: LeadToRevenueFunnel;
  aiReceptionist: AIReceptionistStatus;
  priorityLeads: PriorityLead[];
  recentActivity: ConversationActivityItem[];
  appointments: {
    today: AppointmentItem[];
    upcoming: AppointmentItem[];
    leadsAwaitingFollowupCount: number;
    missedOverdueActionsCount: number;
    bookingConversionRate: number; // percentage
  };
  revenueAttribution: RevenueAttribution;
  recommendedActions: RecommendedAction[];
  planUsage: PlanUsage;
}
