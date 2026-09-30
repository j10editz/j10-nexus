import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  dashboardNavigationItems,
} from "../../lib/dashboard/navigation";

const root = process.cwd();
function readCode(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

// Comprehensive Unicode Emoji regular expression covering emoticons, symbols, pictographs, and flags
const EMOJI_REGEX =
  /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}]/u;

describe("Phase 3A: Dashboard Visual Hardening", () => {
  describe("1. Zero Decorative Emojis", () => {
    it("ensures all navigation item labels and descriptions contain zero emojis", () => {
      for (const item of dashboardNavigationItems) {
        expect(item.label, `Navigation label "${item.label}" must not contain emojis`).not.toMatch(EMOJI_REGEX);
        if (item.description) {
          expect(item.description, `Navigation description for "${item.label}" must not contain emojis`).not.toMatch(EMOJI_REGEX);
        }
      }
    });

    it("ensures dashboard navigation and shell components contain zero emojis", () => {
      const filesToCheck = [
        "components/dashboard/Sidebar.tsx",
        "components/dashboard/Topbar.tsx",
        "components/dashboard/DashboardLayout.tsx",
        "components/dashboard/DashboardPrimitives.tsx",
      ];

      for (const file of filesToCheck) {
        const code = readCode(file);
        expect(code, `${file} must contain zero emojis`).not.toMatch(EMOJI_REGEX);
      }
    });

    it("ensures all primary product pages and components contain zero emojis", () => {
      const pagesToCheck = [
        "components/dashboard/J10CommandCenter.tsx",
        "app/dashboard/crm/page.tsx",
        "app/dashboard/connections/page.tsx",
        "app/dashboard/brand/page.tsx",
        "app/dashboard/pay/page.tsx",
        "app/dashboard/booking/page.tsx",
        "app/dashboard/inbox/page.tsx",
        "app/dashboard/growth/page.tsx",
        "app/dashboard/ai-operator/page.tsx",
      ];

      for (const page of pagesToCheck) {
        const code = readCode(page);
        expect(code, `${page} must contain zero emojis`).not.toMatch(EMOJI_REGEX);
      }
    });
  });

  describe("2. Single Neutral Dark Card Background & Subtle Border", () => {
    it("enforces shared neutral surface tokens on DashboardMetricTile primitive", () => {
      const primCode = readCode("components/dashboard/DashboardPrimitives.tsx");

      // Verify canonical surface and border tokens
      expect(primCode).toContain("bg-[#101319]");
      expect(primCode).toContain("border-[#242A35]");

      // Proves no per-product rainbow gradients or card backgrounds
      expect(primCode).not.toContain("from-blue-600");
      expect(primCode).not.toContain("from-purple-600");
      expect(primCode).not.toContain("from-emerald-600");
      expect(primCode).not.toContain("from-amber-600");
      expect(primCode).not.toContain("from-cyan-500");
    });

    it("ensures DashboardMetricTile has zero decorative icons inside metric tiles", () => {
      const primCode = readCode("components/dashboard/DashboardPrimitives.tsx");

      // DashboardMetricTile interface must not accept icon prop
      expect(primCode).not.toMatch(/interface\s+DashboardMetricTileProps[^{]*\{[^}]*\bicon\b/);
    });

    it("verifies J10CommandCenter uses shared DashboardMetricTile across all 8 metrics with zero decorative icons", () => {
      const ccCode = readCode("components/dashboard/J10CommandCenter.tsx");

      // Proves all 8 metric tiles use DashboardMetricTile with no decorative icons
      expect(ccCode).toContain("<DashboardMetricTile");
      expect(ccCode).not.toContain("<TrendingUp");
      expect(ccCode).not.toContain("<Users");
      expect(ccCode).not.toContain("<DollarSign");
      expect(ccCode).not.toContain("<Calendar");
      expect(ccCode).not.toContain("<CheckCircle2");
    });
  });

  describe("3. Semantic Warning & Error Colors for Real Warning/Error States", () => {
    it("only applies warning or error semantic tokens when status is error or warning", () => {
      const primCode = readCode("components/dashboard/DashboardPrimitives.tsx");

      // Neutral default text color, restrained warning and error colors
      expect(primCode).toContain('semanticStatus === "error"');
      expect(primCode).toContain('semanticStatus === "warning"');
      expect(primCode).toContain("text-[#F5F7FA]");
      expect(primCode).toContain("text-rose-400");
      expect(primCode).toContain("text-amber-400");
    });

    it("applies critical/warning semantic status only to real issues in J10CommandCenter", () => {
      const ccCode = readCode("components/dashboard/J10CommandCenter.tsx");

      // Failed automations tile triggers error only when count > 0
      expect(ccCode).toContain('metrics.failedAutomations.count > 0 ? "error" : "neutral"');
      // Needs attention tile triggers warning only when count > 0
      expect(ccCode).toContain('metrics.leadsNeedingAttention.count > 0 ? "warning" : "neutral"');
    });
  });

  describe("4. Mobile Header Layout & Compact Form Factor", () => {
    it("hides global search form on mobile header", () => {
      const topbarCode = readCode("components/dashboard/Topbar.tsx");

      // Verify search form is hidden on mobile screens
      expect(topbarCode).toMatch(/<form[^>]*className="[^"]*hidden[^"]*lg:block/);
    });

    it("hides multi-tenant workspace switcher on mobile header", () => {
      const topbarCode = readCode("components/dashboard/Topbar.tsx");

      // Workspace switcher must be hidden on mobile header to prevent crowding
      expect(topbarCode).toMatch(/<div className="hidden md:block">\s*<WorkspaceSwitcher/);
    });

    it("compacts sidebar to 228px width", () => {
      const sidebarCode = readCode("components/dashboard/Sidebar.tsx");
      const layoutCode = readCode("components/dashboard/DashboardLayout.tsx");

      expect(sidebarCode).toContain("w-[228px]");
      expect(layoutCode).toContain("lg:pl-[228px]");
    });
  });

  describe("5. Personal Avatar and Workspace Logo Separation", () => {
    it("strictly separates personal user avatar and workspace business identity in Brand settings", () => {
      const brandCode = readCode("app/dashboard/brand/page.tsx");

      // Personal user avatar section linking to account settings
      expect(brandCode).toContain("Personal User Avatar");
      expect(brandCode).toContain('href="/dashboard/settings/account"');

      // Business workspace identity section with migration contract
      expect(brandCode).toContain("Business Workspace Identity");
      expect(brandCode).toContain("Storage Migration Required");
      expect(brandCode).toContain("docs/architecture/WORKSPACE_LOGO_CONTRACT.md");
    });

    it("renders user profile avatar independently from workspace switcher in Topbar", () => {
      const topbarCode = readCode("components/dashboard/Topbar.tsx");

      expect(topbarCode).toContain("<WorkspaceSwitcher");
      expect(topbarCode).toContain("profileData.avatarUrl");
      expect(topbarCode).toContain("UserCircle2");
    });
  });
});
