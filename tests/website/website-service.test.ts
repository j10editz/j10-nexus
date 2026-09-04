import { describe, expect, it } from "vitest";
import {
  buildWhatsAppClickToChatLink,
  getDefaultWebsiteFunnel,
} from "@/lib/website/service";

describe("J10 NEXUS AI Website & Funnel Service", () => {
  it("generates correctly formatted WhatsApp click-to-chat links", () => {
    const link = buildWhatsAppClickToChatLink("+1 (555) 019-2834", "Hello from Landing Page");
    expect(link).toContain("https://wa.me/15550192834");
    expect(link).toContain("text=Hello%20from%20Landing%20Page");
  });

  it("handles blank phone numbers gracefully", () => {
    const link = buildWhatsAppClickToChatLink(null, "Test message");
    expect(link).toContain("https://wa.me/?text=Test%20message");
  });

  it("provides comprehensive default funnel with high-converting features", () => {
    const funnel = getDefaultWebsiteFunnel("Acme Corp");

    expect(funnel.title).toContain("Acme Corp");
    expect(funnel.theme).toBe("obsidian");
    expect(funnel.isPublished).toBe(true);
    expect(funnel.features.length).toBeGreaterThanOrEqual(3);
    expect(funnel.testimonials.length).toBeGreaterThanOrEqual(2);
    expect(funnel.faqs.length).toBeGreaterThanOrEqual(2);

    const featureTitles = funnel.features.map((f) => f.title);
    expect(featureTitles.some((t) => t.includes("WhatsApp"))).toBe(true);
  });
});
