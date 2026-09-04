import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CHANNEL_LABELS,
  computeMarketingSummary,
  generateMarketingCopy,
  SEGMENT_LABELS,
} from "@/lib/marketing/service";
import type { MarketingCampaign } from "@/types/marketing";

describe("Marketing and Campaign Broadcast Engine", () => {
  it("exports valid labels for channels and CRM segments", () => {
    expect(CHANNEL_LABELS.whatsapp).toBe("WhatsApp Broadcast");
    expect(CHANNEL_LABELS.email).toBe("Email Campaign");
    expect(CHANNEL_LABELS.sms).toBe("Direct SMS");
    expect(CHANNEL_LABELS.social).toBe("Social Post");

    expect(SEGMENT_LABELS.all).toBe("All CRM Contacts");
    expect(SEGMENT_LABELS.leads).toBe("New Leads");
    expect(SEGMENT_LABELS.prospects).toBe("Qualified Prospects");
    expect(SEGMENT_LABELS.customers).toBe("Active Customers");
  });

  it("accurately computes marketing summary metrics", () => {
    const campaigns: MarketingCampaign[] = [
      {
        id: "c-1",
        user_id: "user-1",
        name: "Flash Offer",
        channel: "whatsapp",
        audience_segment: "leads",
        status: "completed",
        target_count: 100,
        sent_count: 100,
        delivered_count: 95,
        read_count: 70,
        replied_count: 19,
        message_template: "Save 20%",
        scheduled_at: null,
        completed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: "c-2",
        user_id: "user-1",
        name: "Scheduled Webinar",
        channel: "email",
        audience_segment: "prospects",
        status: "scheduled",
        target_count: 50,
        sent_count: 0,
        delivered_count: 0,
        read_count: 0,
        replied_count: 0,
        message_template: "Join us",
        scheduled_at: new Date().toISOString(),
        completed_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    const audienceCounts = { all: 200, leads: 100, prospects: 50, customers: 50 };
    const summary = computeMarketingSummary(campaigns, audienceCounts);

    expect(summary.totalCampaigns).toBe(2);
    expect(summary.activeBroadcasts).toBe(1); // "scheduled" is active
    expect(summary.totalAudienceReached).toBe(100);
    // 19 replied / 95 delivered = 20%
    expect(summary.avgEngagementRate).toBe(20);
    expect(summary.audienceCounts.all).toBe(200);
  });

  it("generates structured marketing copy variations grounded in facts", async () => {
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
                        title: "Product Overview",
                        category: "product_service",
                        content: "J10 NEXUS offers enterprise automation.",
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

    const result = await generateMarketingCopy({
      supabase: mockSupabase as any,
      userId: "test-user",
      objective: "Announce holiday pricing discount",
      channel: "whatsapp",
      tone: "Direct & High Value",
      targetAudience: "leads",
    });

    expect(result.objective).toBe("Announce holiday pricing discount");
    expect(result.channel).toBe("whatsapp");
    expect(result.variations.length).toBeGreaterThanOrEqual(1);
    expect(result.variations[0].fullCopy.length).toBeGreaterThan(10);
    expect(result.model).toBeDefined();
  });

  it("verifies the Marketing dashboard UI structure and tabs", () => {
    const page = readFileSync(
      resolve(process.cwd(), "app/dashboard/marketing/page.tsx"),
      "utf8",
    );

    expect(page).toContain("OMNI-CHANNEL GROWTH ENGINE");
    expect(page).toContain("Marketing & Campaigns");
    expect(page).toContain("Broadcast Campaigns");
    expect(page).toContain("AI Copy Studio");
    expect(page).toContain("CRM Audience Segments");
    expect(page).toContain("Audience Reached");
  });
});
