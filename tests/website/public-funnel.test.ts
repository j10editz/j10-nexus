import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildWhatsAppClickToChatLink,
  getDefaultWebsiteFunnel,
  stripEmojis,
} from "@/lib/website/service";

describe("Public Landing Page & Zero-Emoji Quality Enforcement", () => {
  describe("stripEmojis utility", () => {
    it("strips common robot, rocket, sparkle, and smileys from text", () => {
      const input = "🤖 Launch your business with 🚀 AI tools! ✨ Get started now 😊";
      const cleaned = stripEmojis(input);
      expect(cleaned).toBe("Launch your business with AI tools! Get started now");
      expect(cleaned).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    });

    it("strips flags, warning signs, and checks", () => {
      const input = "✅ Verified ⚠️ Warning 🚨 Emergency 🇺🇸 USA";
      const cleaned = stripEmojis(input);
      expect(cleaned).toBe("Verified Warning Emergency USA");
    });

    it("preserves alphanumeric, punctuation, currency, and quotes", () => {
      const input = "Close $45,000 in deals: \"Best ROI ever!\" - 24/7 SLA (99.9%).";
      const cleaned = stripEmojis(input);
      expect(cleaned).toBe(input);
    });

    it("handles empty or undefined inputs without throwing", () => {
      expect(stripEmojis("")).toBe("");
      expect(stripEmojis(undefined as any)).toBe("");
      expect(stripEmojis(null as any)).toBe("");
    });
  });

  describe("WhatsApp click-to-chat links with emoji sanitization", () => {
    it("automatically cleans emojis out of the prefilled WhatsApp text", () => {
      const link = buildWhatsAppClickToChatLink("+1 (555) 019-2834", "👋 Hi there! 🚀 Let's talk");
      expect(link).toContain("https://wa.me/15550192834");
      expect(link).toContain("text=Hi%20there!%20Let's%20talk");
      expect(decodeURIComponent(link)).not.toContain("👋");
      expect(decodeURIComponent(link)).not.toContain("🚀");
    });

    it("falls back to generic wa.me link if phone is not provided", () => {
      const link = buildWhatsAppClickToChatLink("", "Inquiry from website");
      expect(link).toContain("https://wa.me/?text=Inquiry%20from%20website");
    });
  });

  describe("Default Blueprint Quality & Zero Emojis", () => {
    it("ensures default funnel blueprint contains zero emojis across all fields", () => {
      const blueprint = getDefaultWebsiteFunnel("J10 NEXUS");
      const serialized = JSON.stringify(blueprint);
      expect(serialized).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/u);
      expect(blueprint.features.length).toBeGreaterThanOrEqual(3);
      expect(blueprint.testimonials.length).toBeGreaterThanOrEqual(2);
      expect(blueprint.faqs.length).toBeGreaterThanOrEqual(2);
    });
  });
});
