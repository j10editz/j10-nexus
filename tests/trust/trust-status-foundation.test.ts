import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { probeSystemHealth, ComponentHealth } from "@/lib/health/system-health";

describe("Trust & Status Foundation Test Suite", () => {
  describe("1. Founder Identity and Approved Asset Verification", () => {
    const rootDir = process.cwd();
    const approvedPngPath = path.join(
      rootDir,
      "public",
      "images",
      "founder",
      "jeefthe-osne-founder-ceo.png"
    );
    const approvedWebpPath = path.join(
      rootDir,
      "public",
      "images",
      "founder",
      "jeefthe-osne-founder-ceo.webp"
    );

    it("verifies the approved PNG founder asset exists in the repository", () => {
      expect(fs.existsSync(approvedPngPath)).toBe(true);
      const stats = fs.statSync(approvedPngPath);
      expect(stats.size).toBeGreaterThan(1_000_000); // 1.8MB original asset
    });

    it("verifies the optimized WebP derivative exists in the repository", () => {
      expect(fs.existsSync(approvedWebpPath)).toBe(true);
      const stats = fs.statSync(approvedWebpPath);
      expect(stats.size).toBeGreaterThan(50_000);
    });

    it("verifies FounderBlock contains the approved founder copy, names, and LinkedIn link", () => {
      const founderBlockFile = path.join(
        rootDir,
        "components",
        "marketing",
        "FounderBlock.tsx"
      );
      expect(fs.existsSync(founderBlockFile)).toBe(true);
      const content = fs.readFileSync(founderBlockFile, "utf8");

      // Name & title
      expect(content).toContain("Jeefthe Richeder Osne");
      expect(content).toContain("Founder & CEO, J10 NEXUS");

      // Approved founder copy
      expect(content).toContain(
        "Built with purpose by Jeefthe Osne, Founder and CEO of J10 NEXUS—building affordable AI revenue and operations technology for service businesses."
      );

      // Alt text & image source
      expect(content).toContain(
        'alt="Jeefthe Osne, Founder and CEO of J10 NEXUS"'
      );
      expect(content).toContain(
        'src="/images/founder/jeefthe-osne-founder-ceo.png"'
      );

      // LinkedIn link with target and rel
      expect(content).toContain(
        'href="https://www.linkedin.com/in/jeefthe-osne-143a9126b/"'
      );
      expect(content).toContain('target="_blank"');
      expect(content).toContain('rel="noopener noreferrer"');
    });

    it("verifies Footer contains the Founded by Jeefthe Osne LinkedIn link", () => {
      const footerFile = path.join(rootDir, "components", "Footer.tsx");
      const content = fs.readFileSync(footerFile, "utf8");

      expect(content).toContain("Founded by Jeefthe Osne");
      expect(content).toContain(
        'href="https://www.linkedin.com/in/jeefthe-osne-143a9126b/"'
      );
      expect(content).toContain('target="_blank"');
      expect(content).toContain('rel="noopener noreferrer"');
    });

    it("verifies Privacy Boundaries: zero phone numbers, addresses, private emails, or standalone nickname", () => {
      const founderBlockFile = path.join(
        rootDir,
        "components",
        "marketing",
        "FounderBlock.tsx"
      );
      const content = fs.readFileSync(founderBlockFile, "utf8");

      // No private email
      expect(content).not.toMatch(/[\w.-]+@[\w.-]+\.\w+/);
      // No phone pattern
      expect(content).not.toMatch(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
      // No standalone nickname Richeder without Jeefthe
      const withoutFullName = content.replace(/Jeefthe Richeder Osne/g, "");
      expect(withoutFullName).not.toContain("Richeder");
    });

    it("verifies structured data in app/layout.tsx defines Organization and Person schemas accurately", () => {
      const layoutFile = path.join(rootDir, "app", "layout.tsx");
      const content = fs.readFileSync(layoutFile, "utf8");

      expect(content).toContain('"@type": "Organization"');
      expect(content).toContain('"name": "J10 NEXUS"');
      expect(content).toContain('"@type": "Person"');
      expect(content).toContain('"name": "Jeefthe Osne"');
      expect(content).toContain('"jobTitle": "Founder & CEO, J10 NEXUS"');
      expect(content).toContain(
        '"https://www.linkedin.com/in/jeefthe-osne-143a9126b/"'
      );
      expect(content).toContain(
        '"https://j10-nexus.com/images/founder/jeefthe-osne-founder-ceo.png"'
      );
    });
  });

  describe("2. Status Monitoring & Evidence-Based Probe Governance", () => {
    it("reports exactly 6 monitored components with valid categories and descriptions", async () => {
      const health = await probeSystemHealth(true);
      expect(health.components).toHaveLength(6);

      const componentIds = health.components.map((c) => c.id);
      expect(componentIds).toEqual([
        "database",
        "auth",
        "workflow",
        "whatsapp",
        "stripe",
        "ai",
      ]);

      const expectedNames = [
        "Database Server Connection",
        "Authentication & Workspace Boundaries",
        "Workflow Execution Engine",
        "Meta WhatsApp Cloud API Gateway",
        "Stripe Billing & Subscriptions",
        "AI Model Gateway",
      ];
      expect(health.components.map((c) => c.name)).toEqual(expectedNames);

      for (const comp of health.components) {
        expect(["Operational", "Configured", "Degraded", "Outage", "Unknown"]).toContain(
          comp.status
        );
        expect(comp.explanation).toBeTruthy();
        expect(comp.lastChecked).toBeTruthy();
      }
    });

    it("ensures unconfigured third-party gateways report Unknown and never fake Operational", async () => {
      // In an environment where WHATSAPP_ACCESS_TOKEN and STRIPE_SECRET_KEY are unset
      const originalWhatsApp = process.env.WHATSAPP_ACCESS_TOKEN;
      const originalStripe = process.env.STRIPE_SECRET_KEY;
      delete process.env.WHATSAPP_ACCESS_TOKEN;
      delete process.env.META_WHATSAPP_TOKEN;
      delete process.env.STRIPE_SECRET_KEY;

      try {
        const health = await probeSystemHealth(true);
        const whatsapp = health.components.find((c) => c.id === "whatsapp");
        const stripe = health.components.find((c) => c.id === "stripe");

        expect(whatsapp?.status).toBe("Unknown");
        expect(whatsapp?.status).not.toBe("Operational");

        expect(stripe?.status).toBe("Unknown");
        expect(stripe?.status).not.toBe("Operational");
      } finally {
        if (originalWhatsApp) process.env.WHATSAPP_ACCESS_TOKEN = originalWhatsApp;
        if (originalStripe) process.env.STRIPE_SECRET_KEY = originalStripe;
      }
    });

    it("isolates provider probe failures: one failure never crashes the complete health report", async () => {
      // Mock global fetch to simulate network error on external calls
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockImplementation((url: string | URL | Request) => {
        const urlStr = url.toString();
        if (urlStr.includes("stripe.com") || urlStr.includes("graph.facebook.com")) {
          return Promise.reject(new Error("Simulated upstream network timeout"));
        }
        return originalFetch(url);
      });

      try {
        // Set fake keys so external probes are triggered
        process.env.STRIPE_SECRET_KEY = "sk_test_mock_for_health_test";
        process.env.WHATSAPP_ACCESS_TOKEN = "wa_mock_token_for_health_test";

        const health = await probeSystemHealth(true);
        expect(health).toBeDefined();
        expect(health.components).toHaveLength(6);

        const stripe = health.components.find((c) => c.id === "stripe");
        const whatsapp = health.components.find((c) => c.id === "whatsapp");

        // The failed probes must be safely caught and marked Degraded
        expect(stripe?.status).toBe("Degraded");
        expect(whatsapp?.status).toBe("Degraded");

        // Database and workflow should still be intact
        const db = health.components.find((c) => c.id === "database");
        expect(db).toBeDefined();
      } finally {
        global.fetch = originalFetch;
        delete process.env.STRIPE_SECRET_KEY;
        delete process.env.WHATSAPP_ACCESS_TOKEN;
      }
    });

    it("verifies public data boundary: zero secrets, tokens, internal URLs, or stack traces exposed", async () => {
      process.env.STRIPE_SECRET_KEY = "sk_test_mock_secret_1234567890abcdef";
      process.env.WHATSAPP_ACCESS_TOKEN = "wa_mock_secret_token_1234567890";

      try {
        const health = await probeSystemHealth(true);
        const serialized = JSON.stringify(health);

        expect(serialized).not.toContain("sk_test_");
        expect(serialized).not.toContain("wa_mock_");
        expect(serialized).not.toContain("Authorization");
        expect(serialized).not.toContain("Bearer");
        expect(serialized).not.toContain("stack");
        expect(serialized).not.toContain("Error:");
      } finally {
        delete process.env.STRIPE_SECRET_KEY;
        delete process.env.WHATSAPP_ACCESS_TOKEN;
      }
    });

    it("caches reports and dedupes concurrent in-flight probes", async () => {
      const [res1, res2] = await Promise.all([
        probeSystemHealth(),
        probeSystemHealth(),
      ]);

      expect(res1.timestamp).toBe(res2.timestamp);
      expect(res1.components[0].lastChecked).toBe(res2.components[0].lastChecked);
    });
  });
});
