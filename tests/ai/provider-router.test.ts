import { describe, expect, it } from "vitest";
import { getActiveAIProvider, getJ10AIMode, runJ10AI } from "@/lib/ai/runtime";
import { selectGeminiModel } from "@/lib/ai/providers/gemini";

describe("J10 AI Multi-Provider Architecture", () => {
  it("defaults safely to development mode with $0 cost and zero external calls", async () => {
    const result = await runJ10AI({
      task: "customer_support",
      input: "How do I connect my WhatsApp number?",
      instructions: "Be concise.",
    });

    expect(result.success).toBe(true);
    expect(result.provider).toBe("development");
    expect(result.executionMode).toBe("development");
    expect(result.simulated).toBe(true);
    expect(result.apiCalled).toBe(false);
    expect(result.estimatedCostUSD).toBe(0);
    expect(result.text).toBeTruthy();
  });

  it("routes complex strategic tasks to Gemini 2.5 Pro and fast tasks to Gemini 2.5 Flash", () => {
    const complex = selectGeminiModel({
      task: "sales_decision",
      input: "Analyze lead value and pipeline stage.",
    });
    expect(complex.model).toBe("gemini-2.5-pro");
    expect(complex.workload).toBe("complex");

    const fast = selectGeminiModel({
      task: "customer_support",
      input: "What are your business hours?",
    });
    expect(fast.model).toBe("gemini-2.5-flash");
    expect(fast.workload).toBe("fast");
  });

  it("provides deterministic sales intelligence in development mode", async () => {
    const crmInput = `
OPPORTUNITY 1
Name: Acme Logistics
Status: Interested
Priority: High
Priority Score: 88
Estimated Value: $45,000
Needs Follow-Up: Yes
    `.trim();

    const result = await runJ10AI({
      task: "sales_decision",
      input: crmInput,
    });

    expect(result.success).toBe(true);
    expect(result.text).toContain("STRATEGIC PRIORITY");
    expect(result.text).toContain("Acme Logistics");
    expect(result.text).toContain("$45,000");
  });
});
