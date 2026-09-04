import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ABTestMetrics,
  AudienceSegment,
  CampaignChannel,
  CopyVariation,
  GenerateCopyResult,
  MarketingCampaign,
  MarketingSummary,
} from "@/types/marketing";
import { getWorkspaceKnowledgeGrounding } from "@/lib/knowledge/service";
import { runJ10AI } from "@/lib/ai/runtime";
import { stripEmojis } from "@/lib/website/service";
export { stripEmojis };

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

export async function getCRMAudienceCounts(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ all: number; leads: number; prospects: number; customers: number }> {
  try {
    const { data, error } = await supabase
      .from("crm_contacts")
      .select("type")
      .eq("user_id", userId);

    if (error || !data) {
      return { all: 0, leads: 0, prospects: 0, customers: 0 };
    }

    const contacts = data as Array<{ type?: string }>;
    return {
      all: contacts.length,
      leads: contacts.filter((c) => c.type === "Lead").length,
      prospects: contacts.filter((c) => c.type === "Prospect").length,
      customers: contacts.filter((c) => c.type === "Customer").length,
    };
  } catch {
    return { all: 0, leads: 0, prospects: 0, customers: 0 };
  }
}

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

export async function generateMarketingCopy({
  supabase,
  userId,
  objective,
  channel,
  tone = "High Conversion & Professional",
  targetAudience = "leads",
}: {
  supabase: SupabaseClient;
  userId: string;
  objective: string;
  channel: CampaignChannel;
  tone?: string;
  targetAudience?: AudienceSegment;
}): Promise<GenerateCopyResult> {
  const startedAt = performance.now();

  const { groundingPrompt } = await getWorkspaceKnowledgeGrounding(supabase, userId);

  const instructions = `You are the J10 NEXUS Elite Direct-Response Copywriting Specialist.
Generate exactly 3 distinct, high-converting marketing copy variations for the following campaign.
Channel: ${CHANNEL_LABELS[channel] || channel}
Target Audience: ${SEGMENT_LABELS[targetAudience] || targetAudience}
Tone of Voice: ${tone}

CRITICAL DIRECTIVE: DO NOT USE ANY EMOJIS. Maintain a sleek, modern, professional, high-converting B2B tone. Zero emojis.

=== VERIFIED BUSINESS KNOWLEDGE (USE FACTUAL OFFERS/PRICES ONLY) ===
${groundingPrompt || "No company documents provided. Frame copy around premium AI Operating System capabilities."}
===================================================================

REQUIREMENTS:
1. Provide exactly 3 distinct variations with:
   - VARIATION 1: Direct Value & ROI focus
   - VARIATION 2: Urgency & Scarcity / High Priority focus
   - VARIATION 3: Storytelling & Problem-Solving focus
2. Tailor length to ${channel === "whatsapp" || channel === "sms" ? "concise mobile format (under 400 characters)" : "detailed engaging copy"}.
3. Include clear Hook, Message Body, and Call To Action for each.
4. NO EMOJIS ANYWHERE in any variation.

Format each variation clearly separated by "--- VARIATION [N]: [TITLE] ---".`;

  const inputPrompt = `Campaign Objective: ${objective}\n\nPlease generate the 3 high-converting variations now with zero emojis.`;

  const aiResult = await runJ10AI({
    task: "content_generation",
    preference: "Automatic",
    maxOutputTokens: 1200,
    temperature: 0.7,
    instructions,
    input: inputPrompt,
  });

  const durationMs = Math.max(1, Math.round(performance.now() - startedAt));

  // Parse variations
  const text = aiResult.text;
  const rawSections = text.split(/---\s*VARIATION\s*\d+:?\s*/i).filter(Boolean);

  const variations: CopyVariation[] = [];

  if (rawSections.length >= 2) {
    rawSections.forEach((section, idx) => {
      const lines = section.trim().split("\n");
      const title = stripEmojis(lines[0]?.replace(/^[-:]+\s*/, "").replace(/---$/, "").trim() || `Variation ${idx + 1}`);
      const bodyText = stripEmojis(lines.slice(1).join("\n").trim());
      variations.push({
        id: `var-${idx + 1}`,
        title,
        hook: stripEmojis(lines[1]?.trim() || "Attention modern businesses,"),
        body: bodyText,
        callToAction: stripEmojis("Reply directly to this message or visit our site to get started."),
        fullCopy: stripEmojis(section.trim()),
      });
    });
  } else {
    // Single chunk fallback
    variations.push({
      id: "var-1",
      title: "Direct Value Pitch",
      hook: "Accelerate your operations with J10 NEXUS,",
      body: stripEmojis(text),
      callToAction: "Connect today to get started.",
      fullCopy: stripEmojis(text),
    });
  }

  return {
    objective: stripEmojis(objective),
    channel,
    tone: stripEmojis(tone),
    variations: variations.slice(0, 3),
    model: aiResult.displayModel,
    latencyMs: durationMs,
    tokensUsed: aiResult.usage?.totalTokens || 250,
  };
}

export const SEED_MARKETING_CAMPAIGNS: MarketingCampaign[] = [
  {
    id: "camp-seed-1",
    user_id: "system",
    title: "Enterprise AI Automation Q3 Outreach",
    channel: "whatsapp",
    status: "sent",
    target_segment: "prospects",
    content: "Hello from J10 NEXUS. We have prepared an executive demonstration showing how autonomous AI specialists cut response time by 90%. Reply DEMO to receive the private link.",
    scheduled_at: null,
    sent_count: 340,
    delivered_count: 334,
    read_count: 298,
    replied_count: 88,
    created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "camp-seed-2",
    user_id: "system",
    title: "J10 NEXUS Platform Launch - Priority Access",
    channel: "whatsapp",
    status: "sent",
    target_segment: "leads",
    content: "Greetings. As an early partner, your team is invited to test our autonomous CRM and Click-to-Pay checkout features today.",
    scheduled_at: null,
    sent_count: 520,
    delivered_count: 508,
    read_count: 410,
    replied_count: 142,
    created_at: new Date(Date.now() - 86400000 * 6).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "camp-seed-3",
    user_id: "system",
    title: "Autonomous Workflows Masterclass",
    channel: "email",
    status: "scheduled",
    target_segment: "all",
    content: "Join J10 engineering leadership for a direct breakdown of multi-channel autonomous agents driving enterprise revenue in 2026.",
    scheduled_at: new Date(Date.now() + 86400000 * 2).toISOString(),
    sent_count: 1200,
    delivered_count: 1180,
    read_count: 650,
    replied_count: 210,
    created_at: new Date(Date.now() - 86400000 * 1).toISOString(),
    updated_at: new Date().toISOString(),
  },
];
