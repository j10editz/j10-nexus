import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildWhatsAppBriefingDeepLink,
  buildWhatsAppMorningBriefingText,
  computeExecutiveDigest,
} from "@/lib/autopilot/service";

describe("Founder Revenue Autopilot & Daily Executive Digest", () => {
  it("computes accurate executive digest metrics", () => {
    const digest = computeExecutiveDigest({
      overrideRevenue24h: 32000,
      overridePipeline: 180000,
    });

    expect(digest.revenue24h).toBe(32000);
    expect(digest.activePipelineValue).toBe(180000);
    expect(digest.pipelineAtRisk).toBeGreaterThan(0);
    expect(digest.staleLeadsCount).toBeGreaterThan(0);
    expect(digest.aiTasksCompleted24h).toBeGreaterThan(0);
    expect(digest.autonomousActions.length).toBeGreaterThanOrEqual(3);
  });

  it("strictly enforces zero emojis across the WhatsApp morning briefing", () => {
    const digest = computeExecutiveDigest();
    const briefing = buildWhatsAppMorningBriefingText(digest, "Chief Executive Officer");

    const emojiRegex =
      /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/u;

    expect(briefing).not.toMatch(emojiRegex);
    expect(briefing).toContain("J10 NEXUS - DAILY EXECUTIVE BRIEFING");
    expect(briefing).toContain("REVENUE & CASHFLOW");
    expect(briefing).toContain("AUTONOMOUS AI WORKFORCE");
    expect(briefing).toContain("RISK DETECTION");
    expect(briefing).toContain("AUTONOMOUS RECOMMENDATIONS");
  });

  it("builds a clean WhatsApp deep link with encoded briefing text", () => {
    const digest = computeExecutiveDigest();
    const link = buildWhatsAppBriefingDeepLink("+1 (555) 677-1423", digest, "Founder");

    expect(link).toContain("https://wa.me/15556771423?text=");
    expect(link).toContain(encodeURIComponent("J10 NEXUS - DAILY EXECUTIVE BRIEFING"));
  });

  it("verifies RevenueAutopilotCard UI structure and zero emoji compliance", () => {
    const file = readFileSync(
      resolve(process.cwd(), "components/dashboard/RevenueAutopilotCard.tsx"),
      "utf8",
    );

    expect(file).toContain("Founder Revenue Autopilot");
    expect(file).toContain("24h Verified Revenue");
    expect(file).toContain("Active Pipeline Value");
    expect(file).toContain("Pipeline At Risk");
    expect(file).toContain("Morning Executive WhatsApp Briefing");

    const emojiRegex =
      /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/u;
    expect(file).not.toMatch(emojiRegex);
  });
});
