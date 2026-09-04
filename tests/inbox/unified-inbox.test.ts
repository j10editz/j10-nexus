import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  advanceThreadStage,
  appendThreadReply,
  buildWhatsAppReplyLink,
  CHANNEL_METADATA,
  filterInboxThreads,
  generateAICopilotDraft,
  SEED_INBOX_THREADS,
  STAGE_METADATA,
} from "@/lib/inbox/service";
import type { InboxThread } from "@/types/inbox";

describe("Unified Omnichannel Inbox Engine", () => {
  it("provides valid metadata for all supported channels and deal stages", () => {
    expect(CHANNEL_METADATA.whatsapp.label).toBe("WhatsApp Business");
    expect(CHANNEL_METADATA.website.label).toBe("Website Lead Form");
    expect(CHANNEL_METADATA.crm.label).toBe("CRM Direct Desk");

    expect(STAGE_METADATA.lead.label).toBe("Lead");
    expect(STAGE_METADATA.qualified.label).toBe("Qualified");
    expect(STAGE_METADATA.proposal.label).toBe("Proposal");
    expect(STAGE_METADATA.won.label).toBe("Closed Won");
    expect(STAGE_METADATA.churned.label).toBe("Lost / Churned");
  });

  it("strictly enforces zero emojis across all seed inbox threads and messages", () => {
    const emojiRegex =
      /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/u;

    for (const thread of SEED_INBOX_THREADS) {
      expect(thread.contactName).not.toMatch(emojiRegex);
      expect(thread.lastMessageSnippet).not.toMatch(emojiRegex);
      for (const msg of thread.messages) {
        expect(msg.body).not.toMatch(emojiRegex);
        expect(msg.senderName).not.toMatch(emojiRegex);
      }
    }
  });

  it("filters threads accurately by channel", () => {
    const waThreads = filterInboxThreads(SEED_INBOX_THREADS, {
      channel: "whatsapp",
      stage: "all",
      search: "",
    });
    expect(waThreads.length).toBeGreaterThanOrEqual(1);
    expect(waThreads.every((t) => t.channel === "whatsapp")).toBe(true);

    const webThreads = filterInboxThreads(SEED_INBOX_THREADS, {
      channel: "website",
      stage: "all",
      search: "",
    });
    expect(webThreads.length).toBeGreaterThanOrEqual(1);
    expect(webThreads.every((t) => t.channel === "website")).toBe(true);
  });

  it("filters threads by search term across name, company, and snippet", () => {
    const sterlingResults = filterInboxThreads(SEED_INBOX_THREADS, {
      channel: "all",
      stage: "all",
      search: "Marcus",
    });
    expect(sterlingResults.length).toBe(1);
    expect(sterlingResults[0].contactName).toBe("Marcus Sterling");

    const aegisResults = filterInboxThreads(SEED_INBOX_THREADS, {
      channel: "all",
      stage: "all",
      search: "Aegis",
    });
    expect(aegisResults.length).toBe(1);
    expect(aegisResults[0].company).toBe("Aegis Capital");
  });

  it("advances deal stage and updates thread status", () => {
    const thread = SEED_INBOX_THREADS[0];
    expect(thread.dealStage).toBe("proposal");

    const updated = advanceThreadStage(thread, "won");
    expect(updated.dealStage).toBe("won");
    expect(STAGE_METADATA[updated.dealStage].label).toBe("Closed Won");
  });

  it("appends outbound replies and handles Stripe payment attachments", () => {
    const thread = SEED_INBOX_THREADS[0];
    const initialCount = thread.messages.length;

    const updated = appendThreadReply(thread, {
      threadId: thread.id,
      body: "Here is your checkout link.",
      agentName: "Sarah Chen",
      stripePayment: {
        amount: 4800,
        productName: "Enterprise AI Rollout",
        checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_123",
      },
    });

    expect(updated.messages.length).toBe(initialCount + 1);
    const lastMsg = updated.messages[updated.messages.length - 1];
    expect(lastMsg.direction).toBe("outbound");
    expect(lastMsg.body).toBe("Here is your checkout link.");
    expect(lastMsg.metadata?.stripeCheckoutUrl).toBe(
      "https://checkout.stripe.com/c/pay/cs_test_123",
    );
    expect(lastMsg.metadata?.amount).toBe(4800);
    expect(updated.lastMessageSnippet).toBe("Here is your checkout link.");
  });

  it("builds clean WhatsApp click-to-reply deep links", () => {
    const link = buildWhatsAppReplyLink("+1 (415) 555-2671", "Follow up from J10");
    expect(link).toContain("https://wa.me/14155552671?text=Follow%20up%20from%20J10");
  });

  it("generates contextual AI copilot drafts without emojis", () => {
    const thread = SEED_INBOX_THREADS[0];
    const draft = generateAICopilotDraft(thread, "payment_request");

    expect(draft).toContain("Marcus");
    expect(draft).toContain("Aegis Capital");
    expect(draft).toContain("Stripe");

    const emojiRegex =
      /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/u;
    expect(draft).not.toMatch(emojiRegex);
  });

  it("verifies Unified Inbox page component structure", () => {
    const pageContent = readFileSync(
      resolve(process.cwd(), "app/dashboard/inbox/page.tsx"),
      "utf8",
    );

    expect(pageContent).toContain("Unified Omnichannel Inbox");
    expect(pageContent).toContain("Instant Stripe Billing");
    expect(pageContent).toContain("Pipeline Stage");
    expect(pageContent).toContain("Deal Intelligence");
    expect(pageContent).toContain("CHANNEL_METADATA");
    expect(pageContent).toContain("STAGE_METADATA");
  });
});

