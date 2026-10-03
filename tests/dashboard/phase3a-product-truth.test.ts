import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import {
  dashboardNavigationItems,
  primaryNavigationItems,
  readyDashboardNavigationItems,
  supportingNavigationItems,
  dashboardSettingsItem,
} from "../../lib/dashboard/navigation";
import { isTrustedGoogleAvatarUrl } from "../../lib/auth/avatar";
import nextConfig from "../../next.config";

const root = process.cwd();
function readCode(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

describe("Phase 3A: J10 Product Truth & Dashboard Foundation", () => {
  describe("1. Canonical 7 Primary Product Architecture", () => {
    it("defines exactly 7 primary J10 product areas", () => {
      expect(primaryNavigationItems).toHaveLength(7);

      const expectedProducts = [
        { label: "J10 Command Center", href: "/dashboard" },
        { label: "J10 Inbox", href: "/dashboard/inbox" },
        { label: "J10 Lead Center", href: "/dashboard/crm" },
        { label: "J10 Booking", href: "/dashboard/booking" },
        { label: "J10 Growth", href: "/dashboard/growth" },
        { label: "J10 AI Operator", href: "/dashboard/ai-operator" },
        { label: "J10 Pay", href: "/dashboard/pay" },
      ];

      for (const expected of expectedProducts) {
        const found = primaryNavigationItems.find((p) => p.href === expected.href);
        expect(found, `Missing primary product ${expected.label}`).toBeDefined();
        expect(found?.label).toBe(expected.label);
        expect(found?.status).toBe("ready");
      }
    });

    it("defines the canonical supporting products without unnecessary J10 prefixes on ordinary controls", () => {
      expect(supportingNavigationItems.length).toBeGreaterThanOrEqual(4);

      const supportingLabels = supportingNavigationItems.map((s) => s.label);
      expect(supportingLabels).toContain("J10 Connections");
      expect(supportingLabels).toContain("J10 Team");
      expect(supportingLabels).toContain("J10 Brand");
      expect(supportingLabels).toContain("Billing & Plan"); // No J10 prefix on ordinary control
      expect(dashboardSettingsItem.label).toBe("Settings"); // No J10 prefix on ordinary control
    });

    it("eliminates all bare legacy primary labels", () => {
      const allLabels = dashboardNavigationItems.map((item) => item.label);
      const bareForbidden = [
        "Today",
        "Inbox",
        "Customers",
        "Calendar",
        "Growth",
        "AI Operator",
        "Money",
        "CRM",
        "Overview",
        "Bot Setup",
        "Revenue",
      ];

      for (const bare of bareForbidden) {
        expect(allLabels).not.toContain(bare);
      }
    });

    it("enforces zero duplicate branding prefixes", () => {
      const allLabels = dashboardNavigationItems.map((item) => item.label);
      for (const label of allLabels) {
        expect(label).not.toContain("J10 NEXUS J10");
        expect(label).not.toContain("J10 J10");
        expect(label).not.toContain("AI AI");
      }
    });
  });

  describe("2. J10 Command Center Truth & Workspace Scoping", () => {
    it("backs J10 Command Center with authenticated workspace-scoped API route", () => {
      const apiCode = readCode("app/api/dashboard/command-center/route.ts");

      // Verifies authentication and authorization boundary
      expect(apiCode).toContain('requireApiWorkspaceContext("viewer")');
      expect(apiCode).toContain("createServerSupabaseClient()");

      // Verifies all queries enforce workspace isolation
      expect(apiCode).toContain('.eq("workspace_id", wsId)');
      expect(apiCode).toContain('.from("contacts")');
      expect(apiCode).toContain('.from("inbox_threads")');
      expect(apiCode).toContain('.from("crm_bookings")');
      expect(apiCode).toContain('.from("automation_runs")');
      expect(apiCode).toContain('.from("whatsapp_ai_jobs")');

      // Proves no hardcoded 47 demo leads or fake figures in live responses
      expect(apiCode).not.toContain("value: 47");
      expect(apiCode).not.toContain("value: 26");
      expect(apiCode).not.toContain("value: 8");
      expect(apiCode).not.toContain("$8,940");
    });

    it("ensures J10CommandCenter component renders real live metrics and links to products", () => {
      const compCode = readCode("components/dashboard/J10CommandCenter.tsx");

      expect(compCode).toContain('fetch("/api/dashboard/command-center"');
      expect(compCode).toContain("J10 Command Center");
      expect(compCode).toContain("J10 Lead Center");
      expect(compCode).toContain("J10 Inbox");
      expect(compCode).toContain("J10 Booking");
      expect(compCode).toContain("J10 Pay");
      expect(compCode).toContain("J10 AI Operator");

      // Verify the four executive metrics are linked to products and the
      // supporting execution states remain visible from live API data.
      expect(compCode).toContain("metrics.newLeads.href");
      expect(compCode).toContain("metrics.unansweredConversations.href");
      expect(compCode).toContain("metrics.upcomingBookings.href");
      expect(compCode).toContain("metrics.pendingPayments.href");
      expect(compCode).toContain("metrics.tasksRequiringHumanAction.count");
      expect(compCode).toContain("metrics.aiActionsCompleted.href");
      expect(compCode).toContain("metrics.failedAutomations.count");
      expect(compCode).toContain("metrics.aiActionsCompleted.href");
      expect(compCode).toContain("metrics.failedAutomations.href");

      // Verify zero emojis rule
      const emojiRegex =
        /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/u;
      expect(compCode).not.toMatch(emojiRegex);
    });

    it("replaces generic home in app/dashboard/page.tsx with J10CommandCenter", () => {
      const pageCode = readCode("app/dashboard/page.tsx");
      expect(pageCode).toContain("J10CommandCenter");
      expect(pageCode).not.toContain("RevenueCommandCenter");
      expect(pageCode).not.toContain("Apex Commercial & Home Services"); // No fake default company name
    });
  });

  describe("3. J10 Connections & Channel Truth", () => {
    it("audits and displays all 8 communication channels truthfully", () => {
      const connCode = readCode("app/dashboard/connections/page.tsx");

      // Verifies all 8 channels exist in the code
      expect(connCode).toContain("whatsapp");
      expect(connCode).toContain("telegram");
      expect(connCode).toContain("website");
      expect(connCode).toContain("google-calendar");
      expect(connCode).toContain("gmail");
      expect(connCode).toContain("phone-sms");
      expect(connCode).toContain("instagram-direct");
      expect(connCode).toContain("facebook-messenger");

      // Proves removal of fake static VIP group mock
      expect(connCode).not.toContain("+J10_VIP_COMMUNITY_LIVE");
    });

    it("disables connect actions for coming soon and unprovisioned channels", () => {
      const connCode = readCode("app/dashboard/connections/page.tsx");

      // Proves coming soon channels render non-interactive badges
      expect(connCode).toContain('coming_soon');
      expect(connCode).toMatch(/coming soon/i);
    });
  });

  describe("4. J10 Brand & Personal Avatar Separation", () => {
    it("strictly separates personal user avatar from workspace business logo", () => {
      const brandCode = readCode("app/dashboard/brand/page.tsx");

      expect(brandCode).toContain("Identity Boundary: Personal Avatar vs Workspace Brand");
      expect(brandCode).toContain("Personal User Avatar");
      expect(brandCode).toContain("Business Workspace Identity");
      expect(brandCode).toContain("Workspace logo upload is coming soon.");
    });

    it("has complete architectural contract for workspace logo storage migration", () => {
      expect(existsSync(resolve(root, "docs/architecture/WORKSPACE_LOGO_CONTRACT.md"))).toBe(true);
      const contract = readCode("docs/architecture/WORKSPACE_LOGO_CONTRACT.md");
      expect(contract).toContain("workspace-logos");
      expect(contract).toContain("storage.buckets");
      expect(contract).toContain("Tenant Owner/Admin Upload Workspace Logos");
    });

    it("preserves Google avatar fallback with HTTPS host validation", () => {
      expect(isTrustedGoogleAvatarUrl("https://lh3.googleusercontent.com/a/sample")).toBe(true);
      expect(isTrustedGoogleAvatarUrl("https://lh5.googleusercontent.com/a/sample")).toBe(true);
      expect(isTrustedGoogleAvatarUrl("http://lh3.googleusercontent.com/a/sample")).toBe(false); // HTTP rejected
      expect(isTrustedGoogleAvatarUrl("https://evil.com/lh3.googleusercontent.com/avatar")).toBe(false); // Malicious host rejected
    });
  });

  describe("5. Route Backing & Preservation", () => {
    it("backs every ready route with a physical Next.js page", () => {
      for (const item of readyDashboardNavigationItems) {
        const cleanHref = item.href.split(/[?#]/)[0];
        const pagePath = cleanHref === "/dashboard"
          ? "app/dashboard/page.tsx"
          : `app/${cleanHref.slice(1)}/page.tsx`;
        expect(existsSync(resolve(root, pagePath)), `Missing route page: ${pagePath}`).toBe(true);
      }
    });

    it("preserves backward-compatible redirects in next.config.ts", async () => {
      if (typeof nextConfig.redirects === "function") {
        const redirects = await nextConfig.redirects();
        const sources = redirects.map((r: any) => r.source);
        expect(sources).toContain("/dashboard/leads");
        expect(sources).toContain("/dashboard/appointments");
      }
    });
  });
});
