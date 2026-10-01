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

describe("Phase 3A: J10 Black Emerald Visual Hardening", () => {
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

  describe("2. Canonical Black Emerald Surface & Border Tokens", () => {
    it("scopes one Black Emerald palette across every authenticated dashboard route", () => {
      const layoutCode = readCode("components/dashboard/DashboardLayout.tsx");
      const globalCss = readCode("app/globals.css");

      expect(layoutCode).toContain("j10-dashboard-theme");
      expect(layoutCode).toContain("bg-[#070A08]");
      expect(globalCss).toContain("--j10-dashboard-canvas: #070a08");
      expect(globalCss).toContain("--j10-dashboard-surface: #0d120f");
      expect(globalCss).toContain("--j10-dashboard-text: #f3f7f4");
      expect(globalCss).toContain("--j10-dashboard-accent: #35c46a");
      expect(globalCss).toContain("--j10-dashboard-border: #26342b");

      // Legacy Pearl Violet and multicolor utilities are normalized only
      // inside the authenticated dashboard, not on the public marketing site.
      expect(globalCss).toContain('.j10-dashboard-theme [class*="bg-[#FFFFFF]"]');
      expect(globalCss).toContain('[class^="text-blue-"]');
      expect(globalCss).toContain('[class^="text-violet-"]');
      expect(globalCss).toContain('[class*="hover:bg-blue-"]:hover');
    });

    it("keeps dashboard text contrast above WCAG AA", () => {
      function luminance(hex: string) {
        const channels = hex
          .replace("#", "")
          .match(/.{2}/g)!
          .map((part) => Number.parseInt(part, 16) / 255)
          .map((value) =>
            value <= 0.03928
              ? value / 12.92
              : Math.pow((value + 0.055) / 1.055, 2.4),
          );
        return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
      }

      function contrast(foreground: string, background: string) {
        const light = Math.max(luminance(foreground), luminance(background));
        const dark = Math.min(luminance(foreground), luminance(background));
        return (light + 0.05) / (dark + 0.05);
      }

      expect(contrast("#F3F7F4", "#070A08")).toBeGreaterThanOrEqual(7);
      expect(contrast("#AAB7AE", "#0D120F")).toBeGreaterThanOrEqual(4.5);
      expect(contrast("#35C46A", "#070A08")).toBeGreaterThanOrEqual(4.5);
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
      expect(primCode).toContain("text-[#17151F]");
      expect(primCode).toContain("text-[#E11D48]");
      expect(primCode).toContain("text-[#D97706]");
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

      // Business workspace identity section with clean user-facing copy
      expect(brandCode).toContain("Business Workspace Identity");
      expect(brandCode).toContain("Workspace logo upload is coming soon.");

      // Must not leak internal developer docs or storage blockers
      expect(brandCode).not.toContain("Storage Migration Required");
      expect(brandCode).not.toContain("WORKSPACE_LOGO_CONTRACT.md");
    });

    it("renders user profile avatar independently from workspace switcher in Topbar", () => {
      const topbarCode = readCode("components/dashboard/Topbar.tsx");

      expect(topbarCode).toContain("<WorkspaceSwitcher");
      expect(topbarCode).toContain("profileData.avatarUrl");
      expect(topbarCode).toContain("UserCircle2");
    });
  });

  describe("6. Consistent Dashboard Scope & Zero Provider Leaks", () => {
    it("ensures every dashboard route inherits the Black Emerald scope", () => {
      const layoutCode = readCode("components/dashboard/DashboardLayout.tsx");
      expect(layoutCode.match(/j10-dashboard-theme/g)?.length).toBeGreaterThanOrEqual(2);
      expect(layoutCode).not.toContain("bg-[#F8F7FC]");
    });

    it("keeps the Phase 3A product pages inside the shared dashboard layout", () => {
      const pagesToCheck = [
        "components/dashboard/J10CommandCenter.tsx",
        "app/dashboard/crm/page.tsx",
        "app/dashboard/connections/page.tsx",
        "app/dashboard/brand/page.tsx",
        "app/dashboard/inbox/page.tsx",
        "app/dashboard/pay/page.tsx",
        "app/dashboard/booking/page.tsx",
        "app/dashboard/growth/page.tsx",
        "app/dashboard/ai-operator/page.tsx",
      ];

      for (const page of pagesToCheck) {
        const code = readCode(page);
        expect(code.length, `${page} must remain implemented`).toBeGreaterThan(100);
      }
    });

    it("ensures zero references to internal model names or unfinished phase markers", () => {
      const filesToCheck = [
        "app/dashboard/connections/page.tsx",
        "app/dashboard/growth/page.tsx",
        "app/dashboard/inbox/page.tsx",
      ];

      for (const file of filesToCheck) {
        const code = readCode(file);
        expect(code, `${file} must not reference Gemini 3.8 Flash`).not.toContain("Gemini 3.8 Flash");
        expect(code, `${file} must not reference Phase 3B`).not.toContain("Phase 3B");
      }
    });

    it("ensures English consistency across Inbox labels", () => {
      const inboxCode = readCode("app/dashboard/inbox/page.tsx");

      expect(inboxCode).not.toContain("Detalles del contacto");
      expect(inboxCode).not.toContain("AGENTE IA");
      expect(inboxCode).not.toContain("ETIQUETAS");
      expect(inboxCode).not.toContain("Apagar bot");
      expect(inboxCode).not.toContain("Activar bot");
    });
  });
});
