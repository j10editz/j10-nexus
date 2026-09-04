export type KnowledgeCategory =
  | "product_service"
  | "pricing_terms"
  | "faq_support"
  | "policies_compliance"
  | "internal_sop";

export type KnowledgeDocumentStatus = "published" | "draft" | "archived";

export interface KnowledgeDocument {
  id: string;
  user_id: string;
  title: string;
  category: KnowledgeCategory;
  content: string;
  tags: string[];
  status: KnowledgeDocumentStatus;
  is_grounding_active: boolean;
  token_count: number;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeSummary {
  totalDocuments: number;
  activeGroundingDocuments: number;
  totalTokens: number;
  categoryBreakdown: Record<KnowledgeCategory, number>;
}

export interface KnowledgeGroundingSource {
  id: string;
  title: string;
  category: KnowledgeCategory;
  snippet: string;
}

export interface GroundingSimulationResult {
  question: string;
  answer: string;
  matchedSources: KnowledgeGroundingSource[];
  model: string;
  latencyMs: number;
  tokensUsed: number;
  simulated: boolean;
  groundingConfidence: number; // 0.0 - 1.0
}
