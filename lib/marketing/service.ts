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

import {
  CHANNEL_LABELS,
  SEGMENT_LABELS,
  computeMarketingSummary,
  computeABTestMetrics,
} from "./utils";

export {
  CHANNEL_LABELS,
  SEGMENT_LABELS,
  computeMarketingSummary,
  computeABTestMetrics,
};

export async function getCRMAudienceCounts(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<{ all: number; leads: number; prospects: number; customers: number }> {
  try {
    const { data, error } = await supabase
      .from("contacts")
      .select("type")
      .eq("workspace_id", workspaceId);

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
    name: "Enterprise AI Automation Q3 Outreach",
    channel: "whatsapp",
    audience_segment: "prospects",
    status: "completed",
    target_count: 350,
    sent_count: 340,
    delivered_count: 334,
    read_count: 298,
    replied_count: 88,
    message_template: "Hello from J10 NEXUS. We have prepared an executive demonstration showing how autonomous AI specialists cut response time by 90%. Reply DEMO to receive the private link.",
    scheduled_at: null,
    completed_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "camp-seed-2",
    user_id: "system",
    name: "J10 NEXUS Platform Launch - Priority Access",
    channel: "whatsapp",
    audience_segment: "leads",
    status: "completed",
    target_count: 530,
    sent_count: 520,
    delivered_count: 508,
    read_count: 410,
    replied_count: 142,
    message_template: "Greetings. As an early partner, your team is invited to test our autonomous CRM and Click-to-Pay checkout features today.",
    scheduled_at: null,
    completed_at: new Date(Date.now() - 86400000 * 6).toISOString(),
    created_at: new Date(Date.now() - 86400000 * 6).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "camp-seed-3",
    user_id: "system",
    name: "Autonomous Workflows Masterclass",
    channel: "email",
    audience_segment: "all",
    status: "scheduled",
    target_count: 1200,
    sent_count: 1200,
    delivered_count: 1180,
    read_count: 650,
    replied_count: 210,
    message_template: "Join J10 engineering leadership for a direct breakdown of multi-channel autonomous agents driving enterprise revenue in 2026.",
    scheduled_at: new Date(Date.now() + 86400000 * 2).toISOString(),
    completed_at: null,
    created_at: new Date(Date.now() - 86400000 * 1).toISOString(),
    updated_at: new Date().toISOString(),
  },
];

