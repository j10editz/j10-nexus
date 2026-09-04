import { describe, expect, it } from "vitest";
import { scoreCustomerIntent } from "@/lib/whatsapp/lead-qualification";

describe("WhatsApp Lead Qualification & Intent Scoring", () => {
  it("classifies high buying intent and scores accordingly", () => {
    const messages = [
      "Hi, what is your enterprise pricing?",
      "We want to purchase a license for our 50-person sales team.",
    ];
    const scoring = scoreCustomerIntent(messages);

    expect(scoring.status).toBe("Qualified");
    expect(scoring.score).toBeGreaterThanOrEqual(80);
    expect(scoring.estimatedValue).toBeGreaterThanOrEqual(2000);
    expect(scoring.intentSummary).toContain("High buying intent");
  });

  it("classifies product exploration as Interested lead", () => {
    const messages = [
      "Can you show me a demo of how the WhatsApp workflow builder works?",
      "Do you support custom CRM API integration?",
    ];
    const scoring = scoreCustomerIntent(messages);

    expect(scoring.status).toBe("Interested");
    expect(scoring.score).toBe(65);
    expect(scoring.estimatedValue).toBe(1000);
  });

  it("handles general support inquiries with appropriate lower deal estimation", () => {
    const messages = [
      "Hello, I have a question about my account login.",
    ];
    const scoring = scoreCustomerIntent(messages);

    expect(scoring.status).toBe("Contacted");
    expect(scoring.score).toBe(40);
    expect(scoring.estimatedValue).toBe(300);
  });
});
