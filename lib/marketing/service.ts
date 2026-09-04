import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AudienceSegment,
  CampaignChannel,
  CopyVariation,
  GenerateCopyResult,
  MarketingCampaign,
  MarketingSummary,
} from "@/types/marketing";
import { getWorkspaceKnowledgeGrounding } from "@/lib/knowledge/service";
import { runJ10AI } from "@/lib/ai/runtime";

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

  const instructions = `You are the J10 NEXUS Elite Copywriting Specialist.
Generate 3 distinct, high-converting marketing copy variations for the following campaign.
Channel: ${CHANNEL_LABELS[channel] || channel}
Target Audience: ${SEGMENT_LABELS[targetAudience] || targetAudience}
Tone of Voice: ${tone}

=== VERIFIED BUSINESS KNOWLEDGE (USE FACTUAL OFFERS/PRICES ONLY) ===
${groundingPrompt || "No company documents provided. Frame copy around premium AI Operating System capabilities."}
===================================================================

REQUIREMENTS:
1. Provide exactly 3 distinct variations with:
   - VARIATION 1: Direct Value & ROI focus
   - VARIATION 2: Urgency & FOMO / Limited Availability focus
   - VARIATION 3: Storytelling & Problem-Solving focus
2. Tailor length to ${channel === "whatsapp" || channel === "sms" ? "concise mobile format (under 500 characters)" : "detailed engaging copy"}.
3. Include clear Hook, Message Body, and Call To Action for each.

Format each variation clearly separated by "--- VARIATION [N]: [TITLE] ---".`;

  const inputPrompt = `Campaign Objective: ${objective}\n\nPlease generate the 3 high-converting variations now.`;

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
      const title = lines[0]?.replace(/^[-:]+\s*/, "").replace(/---$/, "").trim() || `Variation ${idx + 1}`;
      const bodyText = lines.slice(1).join("\n").trim();
      variations.push({
        id: `var-${idx + 1}`,
        title,
        hook: lines[1]?.trim() || "Attention modern businesses,",
        body: bodyText,
        callToAction: "Reply to claim your spot or visit our site.",
        fullCopy: section.trim(),
      });
    });
  } else {
    // Single chunk fallback
    variations.push({
      id: "var-1",
      title: "Direct Response Pitch",
      hook: "Boost your operations with J10 NEXUS,",
      body: text,
      callToAction: "Connect today to get started.",
      fullCopy: text,
    });
  }

  return {
    objective,
    channel,
    tone,
    variations: variations.slice(0, 3),
    model: aiResult.displayModel,
    latencyMs: durationMs,
    tokensUsed: aiResult.usage?.totalTokens || 250,
  };
}
