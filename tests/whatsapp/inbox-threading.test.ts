import { describe, expect, it } from "vitest";
import {
  detectEscalationIntent,
  extractMessageContent,
} from "@/lib/whatsapp/inbox-service";

describe("WhatsApp Inbox Service & Message Threading", () => {
  it("extracts text content across various WhatsApp Cloud API message payloads", () => {
    // Standard text message
    const textMsg = extractMessageContent({
      type: "text",
      text: { body: "Hello, I want to learn more about J10 NEXUS." },
    });
    expect(textMsg.body).toBe("Hello, I want to learn more about J10 NEXUS.");
    expect(textMsg.type).toBe("text");

    // Button reply
    const buttonMsg = extractMessageContent({
      type: "button",
      button: { text: "Book a Demo" },
    });
    expect(buttonMsg.body).toBe("Book a Demo");

    // Interactive button reply
    const interactiveMsg = extractMessageContent({
      type: "interactive",
      interactive: {
        type: "button_reply",
        button_reply: { id: "btn_1", title: "Enterprise Pricing" },
      },
    });
    expect(interactiveMsg.body).toBe("Enterprise Pricing");

    // Image with caption
    const imageMsg = extractMessageContent({
      type: "image",
      image: { caption: "Here is our invoice receipt screenshot" },
    });
    expect(imageMsg.body).toBe("Here is our invoice receipt screenshot");
  });

  it("detects escalation intents accurately for human review", () => {
    // Human representative request
    const humanRequest = detectEscalationIntent("Can I speak with a human agent or manager please?");
    expect(humanRequest.escalated).toBe(true);
    expect(humanRequest.reason).toContain("human representative");

    // Refund / dispute request
    const refundRequest = detectEscalationIntent("I want a refund on my subscription payment.");
    expect(refundRequest.escalated).toBe(true);
    expect(refundRequest.reason).toContain("Billing or refund");

    // Legal threat
    const legalRequest = detectEscalationIntent("I will contact my lawyer and sue for fraud.");
    expect(legalRequest.escalated).toBe(true);
    expect(legalRequest.reason).toContain("Legal or compliance");

    // Normal safe inquiry
    const normalInquiry = detectEscalationIntent("What are your business hours and pricing packages?");
    expect(normalInquiry.escalated).toBe(false);
  });
});
