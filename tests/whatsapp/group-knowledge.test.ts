import { describe, expect, it } from "vitest";

import {
  FALLBACK_WORKSPACE_SHARDS,
  generateGroundedGroupAnswer,
  matchKnowledgeShards,
} from "../../lib/whatsapp/group-knowledge";

describe("WhatsApp Group Knowledge Vector Grounding", () => {
  it("matches appropriate knowledge shards based on query topic", () => {
    const pricingMatch = matchKnowledgeShards("how much does growth cost?");
    expect(pricingMatch.length).toBeGreaterThan(0);
    expect(pricingMatch[0].category).toBe("pricing_terms");

    const refundMatch = matchKnowledgeShards("what is your cancellation and refund policy?");
    expect(refundMatch.length).toBeGreaterThan(0);
    expect(refundMatch[0].category).toBe("policies_compliance");
  });

  it("generates grounded pricing answers with exact subscription plan tiers", () => {
    const result = generateGroundedGroupAnswer({ query: "!ai what are your pricing tiers?" });
    expect(result.grounded).toBe(true);
    expect(result.answer).toContain("Starter ($29/mo)");
    expect(result.answer).toContain("Growth ($99/mo)");
    expect(result.answer).toContain("Enterprise ($299/mo)");
    expect(result.answer).toContain("Verified Knowledge Sources");
    expect(result.sources.length).toBeGreaterThan(0);
  });

  it("cites verified refund policy for cancellation and guarantee questions", () => {
    const result = generateGroundedGroupAnswer({ query: "!ai can I get a refund if not satisfied?" });
    expect(result.grounded).toBe(true);
    expect(result.answer).toContain("14-day money-back guarantee");
    expect(result.answer).toContain("Refund Policy & Cancellation Terms");
  });

  it("provides operational support hours for help inquiries", () => {
    const result = generateGroundedGroupAnswer({ query: "!ai when can I speak to a human representative?" });
    expect(result.grounded).toBe(true);
    expect(result.answer).toContain("Monday through Friday from 8:00 AM to 8:00 PM EST");
  });

  it("uses custom business facts when provided in configuration", () => {
    const result = generateGroundedGroupAnswer({
      query: "where are you located?",
      businessKnowledge: "Our flagship headquarters is in San Francisco, California.",
    });
    expect(result.grounded).toBe(true);
    expect(result.answer).toContain("San Francisco, California");
  });
});
