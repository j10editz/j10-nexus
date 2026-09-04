import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  computeKnowledgeSummary,
  estimateTokenCount,
  getWorkspaceKnowledgeGrounding,
  KNOWLEDGE_CATEGORIES,
} from "@/lib/knowledge/service";
import type { KnowledgeDocument } from "@/types/knowledge";

describe("Knowledge Hub and Company Brain Grounding", () => {
  it("estimates token counts based on standard characters heuristic", () => {
    expect(estimateTokenCount("")).toBe(0);
    expect(estimateTokenCount("Hello")).toBe(2);
    expect(estimateTokenCount("A".repeat(400))).toBe(100);
  });

  it("computes knowledge summary metrics accurately", () => {
    const docs: KnowledgeDocument[] = [
      {
        id: "1",
        user_id: "user-1",
        title: "Pricing",
        category: "pricing_terms",
        content: "Starter is $29/mo.",
        tags: ["pricing"],
        status: "published",
        is_grounding_active: true,
        token_count: 5,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: "2",
        user_id: "user-1",
        title: "Refunds",
        category: "policies_compliance",
        content: "14-day refund guarantee.",
        tags: ["refunds"],
        status: "published",
        is_grounding_active: false, // Inactive
        token_count: 6,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: "3",
        user_id: "user-1",
        title: "Product Tour",
        category: "product_service",
        content: "AI Operating System.",
        tags: ["ai"],
        status: "draft", // Draft
        is_grounding_active: true,
        token_count: 5,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    const summary = computeKnowledgeSummary(docs);
    expect(summary.totalDocuments).toBe(3);
    expect(summary.activeGroundingDocuments).toBe(1);
    expect(summary.totalTokens).toBe(5);
    expect(summary.categoryBreakdown.pricing_terms).toBe(1);
    expect(summary.categoryBreakdown.policies_compliance).toBe(1);
    expect(summary.categoryBreakdown.product_service).toBe(1);
  });

  it("handles graceful empty fallback when database table is empty", async () => {
    const mockSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                order: () => Promise.resolve({ data: [], error: null }),
              }),
            }),
          }),
        }),
      }),
    };

    const { groundingPrompt, sources } = await getWorkspaceKnowledgeGrounding(
      mockSupabase as any,
      "test-user",
    );

    expect(groundingPrompt).toBe("");
    expect(sources).toHaveLength(0);
  });

  it("formats multi-category knowledge into structured markdown for Gemini system prompt", async () => {
    const mockSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                order: () =>
                  Promise.resolve({
                    data: [
                      {
                        id: "doc-1",
                        title: "Enterprise SLA",
                        category: "policies_compliance",
                        content: "99.9% uptime guaranteed.",
                      },
                    ],
                    error: null,
                  }),
              }),
            }),
          }),
        }),
      }),
    };

    const { groundingPrompt, sources } = await getWorkspaceKnowledgeGrounding(
      mockSupabase as any,
      "test-user",
    );

    expect(groundingPrompt).toContain("POLICIES & COMPLIANCE");
    expect(groundingPrompt).toContain("Enterprise SLA");
    expect(groundingPrompt).toContain("99.9% uptime guaranteed.");
    expect(sources).toHaveLength(1);
    expect(sources[0].title).toBe("Enterprise SLA");
  });

  it("exports all 5 enterprise knowledge categories", () => {
    expect(Object.keys(KNOWLEDGE_CATEGORIES)).toHaveLength(5);
    expect(KNOWLEDGE_CATEGORIES.product_service).toBe("Products & Services");
    expect(KNOWLEDGE_CATEGORIES.pricing_terms).toBe("Pricing & Commercial");
  });

  it("verifies Knowledge Hub UI contains library, grounding simulator, and metrics", () => {
    const page = readFileSync(
      resolve(process.cwd(), "app/dashboard/knowledge/page.tsx"),
      "utf8",
    );

    expect(page).toContain("COMPANY BRAIN & GROUNDING");
    expect(page).toContain("Knowledge Hub");
    expect(page).toContain("Document Library");
    expect(page).toContain("AI Grounding Simulator");
    expect(page).toContain("Active Grounded Tokens");
    expect(page).toContain("Strict Fact Check");
  });
});
