import { describe, expect, it } from "vitest";
import {
  buildContextualWhatsAppLink,
  formatUSD,
  getStalenessInfo,
  groupContactsByStage,
  SEED_CRM_CONTACTS,
} from "@/lib/crm/service";
import type { ContactStatus, CRMContact } from "@/types/crm";

describe("CRM Intelligence & Pipeline Service", () => {
  it("builds status-tailored WhatsApp quick action links without emojis", () => {
    const statuses: ContactStatus[] = [
      "New",
      "Contacted",
      "Qualified",
      "Interested",
      "Won",
      "Lost",
    ];

    for (const status of statuses) {
      const link = buildContextualWhatsAppLink({
        phone: "+1 (555) 789-0123",
        first_name: "Alexander",
        status,
        company: "Vanguard Tech",
      });

      expect(link).toContain("https://wa.me/15557890123?text=");
      const decoded = decodeURIComponent(link);
      expect(decoded).toContain("Alexander");

      // Verify zero emojis
      const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}]/u;
      expect(emojiRegex.test(decoded)).toBe(false);
    }
  });

  it("calculates staleness accurately based on timestamp", () => {
    const never = getStalenessInfo(null);
    expect(never.isStale).toBe(true);
    expect(never.label).toBe("Never contacted");

    const today = getStalenessInfo(new Date().toISOString());
    expect(today.isStale).toBe(false);
    expect(today.label).toBe("Contacted today");

    const staleDate = new Date(Date.now() - 86400000 * 10).toISOString();
    const stale = getStalenessInfo(staleDate);
    expect(stale.isStale).toBe(true);
    expect(stale.label).toContain("10 days ago (Stale)");
  });

  it("groups contacts into Kanban columns with summed pipeline values", () => {
    const mockContacts: CRMContact[] = [
      {
        id: "c1",
        user_id: "u1",
        first_name: "Alice",
        last_name: "Smith",
        email: "alice@test.com",
        phone: "123",
        company: "Acme",
        job_title: "CEO",
        type: "Lead",
        status: "New",
        source: "Web",
        estimated_value: 10000,
        notes: null,
        last_contacted_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: "c2",
        user_id: "u1",
        first_name: "Bob",
        last_name: "Jones",
        email: "bob@test.com",
        phone: "456",
        company: "Beta Corp",
        job_title: "CTO",
        type: "Prospect",
        status: "Qualified",
        source: "Outbound",
        estimated_value: 25000,
        notes: null,
        last_contacted_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: "c3",
        user_id: "u1",
        first_name: "Charlie",
        last_name: "Brown",
        email: "charlie@test.com",
        phone: "789",
        company: "Gamma Ltd",
        job_title: "COO",
        type: "Prospect",
        status: "Qualified",
        source: "Referral",
        estimated_value: 15000,
        notes: null,
        last_contacted_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: "c4",
        user_id: "u1",
        first_name: "Diana",
        last_name: "Prince",
        email: "diana@test.com",
        phone: "999",
        company: "Themyscira",
        job_title: "Founder",
        type: "Customer",
        status: "Won",
        source: "Direct",
        estimated_value: 50000,
        notes: null,
        last_contacted_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    const columns = groupContactsByStage(mockContacts);
    expect(columns).toHaveLength(6);

    const newCol = columns.find((c) => c.stage === "New");
    expect(newCol?.contacts).toHaveLength(1);
    expect(newCol?.totalValue).toBe(10000);

    const qualCol = columns.find((c) => c.stage === "Qualified");
    expect(qualCol?.contacts).toHaveLength(2);
    expect(qualCol?.totalValue).toBe(40000);

    const wonCol = columns.find((c) => c.stage === "Won");
    expect(wonCol?.contacts).toHaveLength(1);
    expect(wonCol?.totalValue).toBe(50000);

    const lostCol = columns.find((c) => c.stage === "Lost");
    expect(lostCol?.contacts).toHaveLength(0);
    expect(lostCol?.totalValue).toBe(0);
  });

  it("formats USD currency without decimals", () => {
    expect(formatUSD(12500)).toBe("$12,500");
    expect(formatUSD(0)).toBe("$0");
  });
});
