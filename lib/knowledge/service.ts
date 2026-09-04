import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  GroundingSimulationResult,
  KnowledgeCategory,
  KnowledgeDocument,
  KnowledgeGroundingSource,
  KnowledgeSummary,
} from "@/types/knowledge";
import { runJ10AI } from "@/lib/ai/runtime";

export const KNOWLEDGE_CATEGORIES: Record<KnowledgeCategory, string> = {
  product_service: "Products & Services",
  pricing_terms: "Pricing & Commercial",
  faq_support: "Support FAQs",
  policies_compliance: "Policies & Compliance",
  internal_sop: "Standard Operating Procedures",
};

export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  // Standard heuristic: ~4 characters per token in English / markdown
  return Math.max(1, Math.ceil(text.trim().length / 4));
}

export async function getWorkspaceKnowledgeGrounding(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ groundingPrompt: string; sources: KnowledgeGroundingSource[] }> {
  try {
    const { data, error } = await supabase
      .from("company_knowledge_documents")
      .select("id, title, category, content, status, is_grounding_active")
      .eq("user_id", userId)
      .eq("status", "published")
      .eq("is_grounding_active", true)
      .order("created_at", { ascending: true });

    if (error || !data || data.length === 0) {
      return { groundingPrompt: "", sources: [] };
    }

    const docs = data as Array<{
      id: string;
      title: string;
      category: KnowledgeCategory;
      content: string;
    }>;

    const sections: Record<string, string[]> = {};
    const sources: KnowledgeGroundingSource[] = [];

    for (const doc of docs) {
      const categoryLabel = KNOWLEDGE_CATEGORIES[doc.category] || "General Knowledge";
      if (!sections[categoryLabel]) {
        sections[categoryLabel] = [];
      }
      sections[categoryLabel].push(`- ${doc.title}:\n  ${doc.content.trim()}`);
      sources.push({
        id: doc.id,
        title: doc.title,
        category: doc.category,
        snippet: doc.content.slice(0, 150) + (doc.content.length > 150 ? "..." : ""),
      });
    }

    const groundingPrompt = Object.entries(sections)
      .map(([section, items]) => `### [${section.toUpperCase()}]\n${items.join("\n\n")}`)
      .join("\n\n");

    return { groundingPrompt, sources };
  } catch (err) {
    console.warn("Could not retrieve workspace knowledge grounding:", err);
    return { groundingPrompt: "", sources: [] };
  }
}

export async function simulateKnowledgeGrounding(
  supabase: SupabaseClient,
  userId: string,
  question: string,
): Promise<GroundingSimulationResult> {
  const startedAt = performance.now();
  const cleanQuestion = question.trim();

  const { groundingPrompt, sources } = await getWorkspaceKnowledgeGrounding(
    supabase,
    userId,
  );

  const matchedSources = sources.filter((s) => {
    const q = cleanQuestion.toLowerCase();
    return (
      q.includes(s.title.toLowerCase()) ||
      s.title.toLowerCase().includes(q) ||
      s.snippet.toLowerCase().includes(q)
    );
  });

  const effectiveSources = matchedSources.length > 0 ? matchedSources : sources.slice(0, 3);

  const instructions = `You are the J10 NEXUS Company Brain grounding engine.
Answer the user's question using ONLY the verified business knowledge supplied below.
If the answer is not present in the verified business knowledge, politely state that you do not have verified company information on that topic, and do not speculate.

=== VERIFIED COMPANY KNOWLEDGE BASE ===
${groundingPrompt || "No verified documents currently published in the Knowledge Hub."}
=======================================

Format your answer cleanly, concisely, and professionally. Avoid robotic filler.`;

  const aiResult = await runJ10AI({
    task: "customer_support",
    preference: "Automatic",
    maxOutputTokens: 500,
    instructions,
    input: cleanQuestion,
  });

  const durationMs = Math.max(1, Math.round(performance.now() - startedAt));

  return {
    question: cleanQuestion,
    answer: aiResult.text,
    matchedSources: effectiveSources,
    model: aiResult.displayModel,
    latencyMs: durationMs,
    tokensUsed: aiResult.usage?.totalTokens || estimateTokenCount(cleanQuestion + aiResult.text),
    simulated: aiResult.simulated,
    groundingConfidence: groundingPrompt ? 0.96 : 0.4,
  };
}

export function computeKnowledgeSummary(
  documents: KnowledgeDocument[],
): KnowledgeSummary {
  const initialCategoryBreakdown: Record<KnowledgeCategory, number> = {
    product_service: 0,
    pricing_terms: 0,
    faq_support: 0,
    policies_compliance: 0,
    internal_sop: 0,
  };

  let activeGrounding = 0;
  let totalTokens = 0;

  for (const doc of documents) {
    if (doc.is_grounding_active && doc.status === "published") {
      activeGrounding++;
      totalTokens += doc.token_count || estimateTokenCount(doc.content);
    }
    if (doc.category in initialCategoryBreakdown) {
      initialCategoryBreakdown[doc.category]++;
    }
  }

  return {
    totalDocuments: documents.length,
    activeGroundingDocuments: activeGrounding,
    totalTokens,
    categoryBreakdown: initialCategoryBreakdown,
  };
}
