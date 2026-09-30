import type {
  ABTestMetrics,
  AudienceSegment,
  CampaignChannel,
  MarketingCampaign,
  MarketingSummary,
} from "@/types/marketing";
import { stripEmojis } from "@/lib/website/service";

export const CHANNEL_LABELS: Record<CampaignChannel, string> = {
  whatsapp: "WhatsApp Broadcast",
  email: "Email Campaign",
  sms: "Direct SMS",
  social: "Social Post",
};

export const SEGMENT_LABELS: Record<AudienceSegment, string> = {
  all: "All CRM Contacts",
  leads: "New Leads",
  prospects: "Qualified Prospects",
  customers: "Active Customers",
};

export function computeMarketingSummary(
  campaigns: MarketingCampaign[],
  audienceCounts: { all: number; leads: number; prospects: number; customers: number },
): MarketingSummary {
  const totalCampaigns = campaigns.length;
  const activeBroadcasts = campaigns.filter(
    (c) => c.status === "sending" || c.status === "scheduled",
  ).length;

  let totalAudienceReached = 0;
  let totalDelivered = 0;
  let totalReplied = 0;

  for (const c of campaigns) {
    totalAudienceReached += c.sent_count || 0;
    totalDelivered += c.delivered_count || 0;
    totalReplied += c.replied_count || 0;
  }

  const avgEngagementRate =
    totalDelivered > 0 ? Math.round((totalReplied / totalDelivered) * 1000) / 10 : 0;

  return {
    totalCampaigns,
    activeBroadcasts,
    totalAudienceReached,
    avgEngagementRate,
    audienceCounts,
  };
}

export function computeABTestMetrics(
  campaignA: MarketingCampaign,
  campaignB: MarketingCampaign,
): ABTestMetrics {
  const sentA = Math.max(1, campaignA.sent_count || 1);
  const sentB = Math.max(1, campaignB.sent_count || 1);

  const deliveredA = campaignA.delivered_count || 0;
  const deliveredB = campaignB.delivered_count || 0;

  const readA = campaignA.read_count || 0;
  const readB = campaignB.read_count || 0;

  const repliedA = campaignA.replied_count || 0;
  const repliedB = campaignB.replied_count || 0;

  const readRateA = deliveredA > 0 ? Math.round((readA / deliveredA) * 1000) / 10 : 0;
  const readRateB = deliveredB > 0 ? Math.round((readB / deliveredB) * 1000) / 10 : 0;

  const replyRateA = deliveredA > 0 ? Math.round((repliedA / deliveredA) * 1000) / 10 : 0;
  const replyRateB = deliveredB > 0 ? Math.round((repliedB / deliveredB) * 1000) / 10 : 0;

  let winner: "A" | "B" | "Tied" = "Tied";
  let upliftPercent = 0;

  if (replyRateA > replyRateB) {
    winner = "A";
    upliftPercent = replyRateB > 0 ? Math.round(((replyRateA - replyRateB) / replyRateB) * 1000) / 10 : 100;
  } else if (replyRateB > replyRateA) {
    winner = "B";
    upliftPercent = replyRateA > 0 ? Math.round(((replyRateB - replyRateA) / replyRateA) * 1000) / 10 : 100;
  }

  return {
    variantA: {
      id: campaignA.id,
      name: stripEmojis(campaignA.name),
      sent: sentA,
      delivered: deliveredA,
      read: readA,
      replied: repliedA,
      readRate: readRateA,
      replyRate: replyRateA,
    },
    variantB: {
      id: campaignB.id,
      name: stripEmojis(campaignB.name),
      sent: sentB,
      delivered: deliveredB,
      read: readB,
      replied: repliedB,
      readRate: readRateB,
      replyRate: replyRateB,
    },
    winner,
    upliftPercent,
  };
}
