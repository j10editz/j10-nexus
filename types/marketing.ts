export type CampaignChannel = "whatsapp" | "email" | "sms" | "social";

export type CampaignStatus =
  | "draft"
  | "scheduled"
  | "sending"
  | "completed"
  | "paused";

export type AudienceSegment = "all" | "leads" | "prospects" | "customers";

export interface MarketingCampaign {
  id: string;
  user_id: string;
  name: string;
  channel: CampaignChannel;
  audience_segment: AudienceSegment;
  status: CampaignStatus;
  target_count: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  replied_count: number;
  message_template: string;
  scheduled_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MarketingSummary {
  totalCampaigns: number;
  activeBroadcasts: number;
  totalAudienceReached: number;
  avgEngagementRate: number; // percentage (e.g. 24.5%)
  audienceCounts: {
    all: number;
    leads: number;
    prospects: number;
    customers: number;
  };
}

export interface CopyVariation {
  id: string;
  title: string;
  hook: string;
  body: string;
  callToAction: string;
  fullCopy: string;
}

export interface GenerateCopyResult {
  objective: string;
  channel: CampaignChannel;
  tone: string;
  variations: CopyVariation[];
  model: string;
  latencyMs: number;
  tokensUsed: number;
}

export interface ABTestMetrics {
  variantA: {
    id: string;
    name: string;
    sent: number;
    delivered: number;
    read: number;
    replied: number;
    readRate: number;
    replyRate: number;
  };
  variantB: {
    id: string;
    name: string;
    sent: number;
    delivered: number;
    read: number;
    replied: number;
    readRate: number;
    replyRate: number;
  };
  winner: "A" | "B" | "Tied";
  upliftPercent: number;
}
