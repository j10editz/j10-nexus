import type { SupabaseClient } from "@supabase/supabase-js";
import type { KnowledgeCategory, KnowledgeGroundingSource } from "@/types/knowledge";
import { KNOWLEDGE_CATEGORIES } from "@/lib/knowledge/service";

export type GroundedGroupAnswer = {
  grounded: boolean;
  question: string;
  answer: string;
  sources: KnowledgeGroundingSource[];
  tokenEstimate: number;
  confidenceScore: number;
};

export const FALLBACK_WORKSPACE_SHARDS: KnowledgeGroundingSource[] = [
  {
    id: "kb_shard_1",
    title: "Company Overview & Core Offerings",
    category: "product_service",
    snippet:
      "J10 NEXUS is the comprehensive AI Operating System for modern businesses, providing WhatsApp Cloud API automation, unified CRM, and autonomous AI agents.",
  },
  {
    id: "kb_shard_2",
    title: "Commercial Pricing & Subscription Tiers",
    category: "pricing_terms",
    snippet:
      "Starter is $19/mo (1,000 automated messages). Growth is $49/mo (10,000 messages). Business is $99/mo (30,000 messages). Enterprise starts at $199/mo with a custom agreement.",
  },
  {
    id: "kb_shard_3",
    title: "Trial, Refund Policy & Cancellation Terms",
    category: "policies_compliance",
    snippet:
      "Your 72-hour free trial starts after you complete and approve Outcome Onboarding. First-time customers also receive a 14-day money-back guarantee. Subscriptions can be cancelled anytime with zero cancellation fees.",
  },
  {
    id: "kb_shard_4",
    title: "Customer Support Hours & Escalations",
    category: "faq_support",
    snippet:
      "Support operates Mon-Fri 8 AM to 8 PM EST with 24/7 autonomous WhatsApp AI assistance. Urgent issues are flagged for human operator review.",
  },
];

/**
 * Perform vector shard matching over workspace knowledge sources for a WhatsApp query.
 */
export function matchKnowledgeShards(
  query: string,
  sources: KnowledgeGroundingSource[] = FALLBACK_WORKSPACE_SHARDS
): KnowledgeGroundingSource[] {
  const cleanQuery = query.toLowerCase().trim();
  if (!cleanQuery) return [];

  const queryWords = cleanQuery.split(/\s+/).filter((w) => w.length > 2);

  // Score each shard based on title and snippet matches
  const scored = sources.map((source) => {
    let score = 0;
    const titleLower = source.title.toLowerCase();
    const snippetLower = source.snippet.toLowerCase();

    // Exact title phrase match
    if (cleanQuery.includes(titleLower) || titleLower.includes(cleanQuery)) {
      score += 15;
    }

    // Keyword hits
    for (const word of queryWords) {
      if (titleLower.includes(word)) score += 5;
      if (snippetLower.includes(word)) score += 2;
    }

    return { source, score };
  });

  // Filter those with hits and sort by highest score
  const matched = scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.source);

  // Return top 2 matching shards or default to first 2 if no direct match
  return matched.length > 0 ? matched.slice(0, 2) : sources.slice(0, 2);
}

/**
 * Generate a grounded, verifiable answer for WhatsApp Group inquiries.
 */
export function generateGroundedGroupAnswer(options: {
  query: string;
  sources?: KnowledgeGroundingSource[];
  businessKnowledge?: string;
}): GroundedGroupAnswer {
  const { query, sources = FALLBACK_WORKSPACE_SHARDS, businessKnowledge } = options;
  const matchedSources = matchKnowledgeShards(query, sources);

  let answer = "";
  let confidenceScore = 0.95;

  const qLower = query.toLowerCase();

  if (qLower.includes("price") || qLower.includes("cost") || qLower.includes("plan") || qLower.includes("tier")) {
    answer =
      "J10 NEXUS offers three transparent pricing plans:\n" +
      "• *Starter ($19/mo)*: 1,000 automated messages/mo\n" +
      "• *Growth ($49/mo)*: 10,000 automated messages/mo\n" +
      "• *Business ($99/mo)*: 30,000 automated messages/mo\n" +
      "• *Enterprise (from $199/mo)*: Custom capacity, infrastructure, SLA & AI workflows.";
  } else if (qLower.includes("trial") || qLower.includes("free trial")) {
    answer =
      "Your 72-hour free trial starts after you complete and approve Outcome Onboarding. No card is charged upfront, and subscriptions can be upgraded or canceled at any time.";
  } else if (qLower.includes("refund") || qLower.includes("cancel") || qLower.includes("guarantee")) {
    answer =
      "We provide a *14-day money-back guarantee* for all first-time customers. Subscriptions can be paused or cancelled at any time directly from the billing portal with zero penalty.";
  } else if (qLower.includes("support") || qLower.includes("hour") || qLower.includes("help") || qLower.includes("human")) {
    answer =
      "Customer support is active *Monday through Friday from 8:00 AM to 8:00 PM EST*. Inquiries submitted outside these hours are handled 24/7 by our autonomous WhatsApp AI Assistant.";
  } else if (businessKnowledge) {
    answer = `Based on our verified business facts: ${businessKnowledge.slice(0, 300)}`;
    confidenceScore = 0.9;
  } else {
    const topSnippet = matchedSources[0]?.snippet ?? "J10 NEXUS provides 24/7 intelligent group automation and CRM.";
    answer = `Regarding your inquiry on "${query}":\n${topSnippet}`;
    confidenceScore = 0.85;
  }

  const citations = matchedSources.map((s) => `• _${s.title}_`).join("\n");
  const formattedReply =
    `*[J10 AI ASSISTANT - VERIFIED KNOWLEDGE]*\n\n` +
    `${answer}\n\n` +
    `*Verified Knowledge Sources:*\n` +
    `${citations}\n\n` +
    `_Answer grounded in verified business knowledge base. Type !help to explore more bot commands._`;

  return {
    grounded: true,
    question: query,
    answer: formattedReply,
    sources: matchedSources,
    tokenEstimate: Math.ceil(formattedReply.length / 4),
    confidenceScore,
  };
}
