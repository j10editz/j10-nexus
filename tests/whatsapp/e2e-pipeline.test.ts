import { describe, expect, it } from "vitest";
import { buildWhatsAppAgentInstructions } from "@/lib/integrations/whatsapp-agent";
import { runJ10AI } from "@/lib/ai/runtime";
import { resolvePlanLimits } from "@/lib/billing/stripe-webhook";
import { estimateTokenCount } from "@/lib/knowledge/service";

describe("End-to-End WhatsApp & AI Pipeline", () => {
  it("verifies the complete pipeline from entitlement check to grounded generation", async () => {
    // 1. Quota & Entitlement check
    const planLimits = resolvePlanLimits("starter");
    expect(planLimits.monthlyMessageLimit).toBe(1000);

    // 2. Knowledge tokenizer
    const sampleKnowledge = "J10 NEXUS is an enterprise AI Operating System.";
    const tokens = estimateTokenCount(sampleKnowledge);
    expect(tokens).toBeGreaterThan(0);

    // 3. Instruction synthesis
    const instructions = buildWhatsAppAgentInstructions({
      agentName: "J10 Support",
      businessName: "J10 NEXUS",
      role: "Support Agent",
      tone: "Concise",
      languages: "English",
      businessKnowledge: sampleKnowledge,
      instructions: "Answer concisely.",
      escalationRules: "Escalate critical bugs.",
      prohibitedTopics: "No hallucinated prices.",
      mode: "suggestions",
      active: true,
    });

    expect(instructions).toContain("J10 NEXUS");
    expect(instructions).toContain(sampleKnowledge);
    expect(instructions).toContain("No hallucinated prices.");

    // 4. Grounded AI inference
    const result = await runJ10AI({
      task: "customer_support",
      preference: "Automatic",
      maxOutputTokens: 200,
      instructions,
      input: "Customer name: Taylor\nCustomer message: Can you help me?\n\nDraft the best safe reply.",
    });

    expect(result.success).toBe(true);
    expect(result.text.length).toBeGreaterThan(10);
    expect(result.displayModel).toBeDefined();
  });
});
