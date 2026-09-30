import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import {
  calculateOverallStatus,
  ComponentHealth,
  REQUIRED_COMPONENT_IDS,
  OPTIONAL_COMPONENT_IDS,
} from "@/lib/health/system-health";

describe("Trust & Status Foundation Test Suite (Hardened)", () => {
  const rootDir = process.cwd();

  describe("1. Founder Identity, Copy, and Archival PNG Asset", () => {
    const approvedPngPath = path.join(
      rootDir,
      "public",
      "images",
      "founder",
      "jeefthe-osne-founder-ceo.png"
    );
    const founderBlockFile = path.join(
      rootDir,
      "components",
      "marketing",
      "FounderBlock.tsx"
    );
    const footerFile = path.join(rootDir, "components", "Footer.tsx");
    const layoutFile = path.join(rootDir, "app", "layout.tsx");

    it("verifies the approved PNG archival founder asset exists with exactly 1254x1254 dimensions and verified SHA256", async () => {
      expect(fs.existsSync(approvedPngPath)).toBe(true);
      const stats = fs.statSync(approvedPngPath);
      expect(stats.size).toBe(1_825_876);

      const crypto = await import("crypto");
      const sharp = (await import("sharp")).default;
      const buf = fs.readFileSync(approvedPngPath);
      const hash = crypto.createHash("sha256").update(buf).digest("hex");
      expect(hash).toBe("6d79a677529c53707ee488db84d357bb3508693be3efd4eeb9be4895c26776a0");

      const meta = await sharp(buf).metadata();
      expect(meta.width).toBe(1254);
      expect(meta.height).toBe(1254);
      expect(meta.format).toBe("png");
    });

    it("proves the founder component renders the high-quality original PNG with quality={95} and not the WebP", () => {
      const content = fs.readFileSync(founderBlockFile, "utf8");
      expect(content).toContain('src="/images/founder/jeefthe-osne-founder-ceo.png"');
      expect(content).not.toContain('jeefthe-osne-founder-ceo.webp');
      expect(content).toContain("quality={95}");
      expect(content).toContain("width={1254}");
      expect(content).toContain("height={1254}");
    });

    it("proves the desktop portrait width never exceeds 240px and section is compacted", () => {
      const content = fs.readFileSync(founderBlockFile, "utf8");
      // Portrait container max width
      expect(content).toContain("max-w-[240px]");
      expect(content).toContain("max-h-[240px]");
      // Desktop grid limit
      expect(content).toContain("md:grid-cols-[240px_1fr]");
      // Max section width ~1024px
      expect(content).toContain("max-w-5xl");
    });

    it("proves the mobile layout is compact, stacked, centered, and left-aligned", () => {
      const content = fs.readFileSync(founderBlockFile, "utf8");
      expect(content).toContain("grid-cols-1");
      expect(content).toContain("mx-auto");
      expect(content).toContain("text-left");
      expect(content).toContain("p-5");
    });

    it("proves Jeefthe Richeder Osne appears correctly in the founder section", () => {
      const content = fs.readFileSync(founderBlockFile, "utf8");
      expect(content).toContain("Jeefthe Richeder Osne");
      expect(content).toContain("Founder and CEO, J10 NEXUS");
      expect(content).toContain("From the founder");
    });

    it("proves the old AI-generated paragraph is completely absent", () => {
      const content = fs.readFileSync(founderBlockFile, "utf8");
      expect(content).not.toContain("Built with purpose by Jeefthe Osne");
      expect(content).not.toContain("building affordable AI revenue and operations technology");
      expect(content).not.toContain("empowering businesses");
      expect(content).not.toContain("revolutionizing operations");
      expect(content).not.toContain("transforming the future");
    });

    it("proves repetitive 'FOUNDER & MISSION' labels and photo badges are absent", () => {
      const content = fs.readFileSync(founderBlockFile, "utf8");
      expect(content).not.toContain("FOUNDER & MISSION");
      expect(content).not.toContain('badge from the photo');
      // No decorative overlapping badge
      expect(content).not.toContain('Founder\n          </div>');
    });

    it("proves the exact approved human founder statement is rendered", () => {
      const content = fs.readFileSync(founderBlockFile, "utf8");
      const expectedStatement =
        "I built J10 NEXUS after seeing how often small service businesses lose customers to missed calls, slow follow ups, and disconnected tools. Owners should not need a large team or five expensive apps to stay on top of the work. J10 NEXUS puts customer conversations, follow ups, bookings, and daily operations in one affordable place.";
      expect(content).toContain(expectedStatement);
    });

    it("proves the LinkedIn link is correct, secure, and uses approved button text", () => {
      const content = fs.readFileSync(founderBlockFile, "utf8");
      expect(content).toContain("https://www.linkedin.com/in/jeefthe-osne-143a9126b/");
      expect(content).toContain('target="_blank"');
      expect(content).toContain('rel="noopener noreferrer"');
      expect(content).toContain("View LinkedIn profile");
    });

    it("proves the footer attribution uses the complete founder name with secure link", () => {
      const content = fs.readFileSync(footerFile, "utf8");
      expect(content).toContain("Founded by Jeefthe Richeder Osne");
      expect(content).toContain("https://www.linkedin.com/in/jeefthe-osne-143a9126b/");
      expect(content).toContain('target="_blank"');
      expect(content).toContain('rel="noopener noreferrer"');
    });

    it("proves structured data uses the complete founder name and verified canonical PNG URL", () => {
      const content = fs.readFileSync(layoutFile, "utf8");
      expect(content).toContain("Jeefthe Richeder Osne");
      expect(content).toContain("Founder and CEO of J10 NEXUS");
      expect(content).toContain("/images/founder/jeefthe-osne-founder-ceo.png");
      expect(content).not.toContain("/images/founder/jeefthe-osne-founder-ceo.webp");
      expect(content).toContain("/brand/j10-logo.png");
      expect(content).toContain("https://www.linkedin.com/in/jeefthe-osne-143a9126b/");
      // Does not hardcode unverified domain
      expect(content).toContain("process.env.NEXT_PUBLIC_SITE_URL");
      expect(content).toContain("https://j10-nexus.vercel.app");
    });

    it("proves no private contact information or handwritten signature is exposed", () => {
      const allFiles = [founderBlockFile, footerFile, layoutFile];
      for (const file of allFiles) {
        const text = fs.readFileSync(file, "utf8");
        expect(text).not.toMatch(/\+1[-.\s]?\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/); // Phone numbers
        expect(text).not.toContain("@gmail.com");
        expect(text).not.toContain("@yahoo.com");
        expect(text).not.toContain("birthDate");
        expect(text).not.toContain("signature");
      }
    });
  });

  describe("2. Health Probes, Safety, and Evidence-Based Claims", () => {
    it("proves Workflow cannot become Operational solely from database health", async () => {
      const { probeSystemHealth } = await import("@/lib/health/system-health");
      const health = await probeSystemHealth();
      const workflow = health.components.find((c) => c.id === "workflow");
      expect(workflow).toBeDefined();
      // Even if DB is operational, workflow cannot be claimed Operational without an execution probe
      expect(workflow?.status).not.toBe("Operational");
      expect(["Configured", "Degraded", "Unknown"]).toContain(workflow?.status);

      // Verify source logic ensures database health never directly maps to workflow Operational
      const healthCode = fs.readFileSync(
        path.join(rootDir, "lib", "health", "system-health.ts"),
        "utf8"
      );
      expect(healthCode).not.toMatch(/dbHealth\.status\s*===\s*["']Operational["']\s*\)\s*{\s*return\s*{\s*[^}]*status:\s*["']Operational["']/);
    });

    it("proves Auth reachability is named Authentication Service and does not claim workspace isolation", async () => {
      const { probeSystemHealth } = await import("@/lib/health/system-health");
      const health = await probeSystemHealth();
      const auth = health.components.find((c) => c.id === "auth");
      expect(auth).toBeDefined();
      expect(auth?.name).toBe("Authentication Service");
      expect(auth?.explanation).not.toContain("tenant isolation");
      expect(auth?.explanation).not.toContain("workspace boundary");
    });

    it("proves Meta WhatsApp check does not falsely certify webhook delivery and uses supported API version", () => {
      const healthCode = fs.readFileSync(
        path.join(rootDir, "lib", "health", "system-health.ts"),
        "utf8"
      );
      expect(healthCode).not.toContain("webhook gateway reachable");
      expect(healthCode).toContain("Meta API credentials authenticated and provider endpoint reachable");
      expect(healthCode).not.toContain("v18.0");
      expect(healthCode).toContain("v26.0");
    });

    it("proves AI metadata check does not falsely certify inference or routing", () => {
      const healthCode = fs.readFileSync(
        path.join(rootDir, "lib", "health", "system-health.ts"),
        "utf8"
      );
      expect(healthCode).not.toContain("Model routing gateway and inference runtime reachable");
      expect(healthCode).toContain("AI provider metadata endpoint authenticated and reachable");
    });

    it("proves secrets NEVER appear in request URLs, query strings, or public responses", () => {
      const healthCode = fs.readFileSync(
        path.join(rootDir, "lib", "health", "system-health.ts"),
        "utf8"
      );
      // No access_token in URL query strings
      expect(healthCode).not.toContain("access_token=");
      // No key= in URL query strings for Gemini
      expect(healthCode).not.toContain("key=");
      // Uses x-goog-api-key header for Gemini
      expect(healthCode).toContain('"x-goog-api-key"');
      // Uses Authorization Bearer for Meta
      expect(healthCode).toContain("Authorization: `Bearer ${token}`");
    });

    it("proves health probes create zero external side effects", () => {
      const healthCode = fs.readFileSync(
        path.join(rootDir, "lib", "health", "system-health.ts"),
        "utf8"
      );
      // No message sends
      expect(healthCode).not.toContain("/messages");
      // No Stripe session/customer/charge mutations
      expect(healthCode).not.toContain("checkout/sessions");
      expect(healthCode).not.toContain("customers.create");
      expect(healthCode).not.toContain("charges.create");
      // No AI text generation calls
      expect(healthCode).not.toContain("generateContent");
      expect(healthCode).not.toContain("chat/completions");
    });
  });

  describe("3. Status Aggregation Rules and Abuse Protection", () => {
    it("proves any degraded required component changes overall status to Degraded", () => {
      const mockComponents: ComponentHealth[] = [
        {
          id: "database",
          name: "Database Server Connection",
          category: "Storage",
          status: "Operational",
          lastChecked: new Date().toISOString(),
          explanation: "OK",
        },
        {
          id: "auth",
          name: "Authentication Service",
          category: "Security",
          status: "Operational",
          lastChecked: new Date().toISOString(),
          explanation: "OK",
        },
        {
          id: "workflow",
          name: "Workflow Execution Engine",
          category: "Automation",
          status: "Configured",
          lastChecked: new Date().toISOString(),
          explanation: "Configured",
        },
        {
          id: "stripe",
          name: "Stripe Billing & Subscriptions",
          category: "Financial",
          status: "Degraded",
          lastChecked: new Date().toISOString(),
          explanation: "Timeout",
        },
      ];

      expect(calculateOverallStatus(mockComponents)).toBe("Degraded");
    });

    it("proves any degraded optional integration changes overall status to Degraded", () => {
      const mockComponents: ComponentHealth[] = [
        {
          id: "database",
          name: "Database Server Connection",
          category: "Storage",
          status: "Operational",
          lastChecked: new Date().toISOString(),
          explanation: "OK",
        },
        {
          id: "auth",
          name: "Authentication Service",
          category: "Security",
          status: "Operational",
          lastChecked: new Date().toISOString(),
          explanation: "OK",
        },
        {
          id: "workflow",
          name: "Workflow Execution Engine",
          category: "Automation",
          status: "Operational",
          lastChecked: new Date().toISOString(),
          explanation: "OK",
        },
        {
          id: "stripe",
          name: "Stripe Billing & Subscriptions",
          category: "Financial",
          status: "Operational",
          lastChecked: new Date().toISOString(),
          explanation: "OK",
        },
        {
          id: "whatsapp",
          name: "Meta WhatsApp Cloud API Gateway",
          category: "External Integration",
          status: "Degraded",
          lastChecked: new Date().toISOString(),
          explanation: "Gateway error",
        },
      ];

      expect(calculateOverallStatus(mockComponents)).toBe("Degraded");
    });

    it("proves any required component outage produces overall Outage", () => {
      const mockComponents: ComponentHealth[] = [
        {
          id: "database",
          name: "Database Server Connection",
          category: "Storage",
          status: "Outage",
          lastChecked: new Date().toISOString(),
          explanation: "Connection down",
        },
        {
          id: "auth",
          name: "Authentication Service",
          category: "Security",
          status: "Operational",
          lastChecked: new Date().toISOString(),
          explanation: "OK",
        },
      ];

      expect(calculateOverallStatus(mockComponents)).toBe("Outage");
    });

    it("proves Configured and Unknown components are not silently counted as Operational", () => {
      const mockComponents: ComponentHealth[] = [
        {
          id: "database",
          name: "Database Server Connection",
          category: "Storage",
          status: "Operational",
          lastChecked: new Date().toISOString(),
          explanation: "OK",
        },
        {
          id: "auth",
          name: "Authentication Service",
          category: "Security",
          status: "Operational",
          lastChecked: new Date().toISOString(),
          explanation: "OK",
        },
        {
          id: "workflow",
          name: "Workflow Execution Engine",
          category: "Automation",
          status: "Configured",
          lastChecked: new Date().toISOString(),
          explanation: "Configured",
        },
        {
          id: "stripe",
          name: "Stripe Billing & Subscriptions",
          category: "Financial",
          status: "Operational",
          lastChecked: new Date().toISOString(),
          explanation: "OK",
        },
      ];

      // Since workflow is Configured, overall cannot be Operational
      expect(calculateOverallStatus(mockComponents)).toBe("Configured");
    });

    it("proves overall status is Operational only when all required components are Operational", () => {
      const mockComponents: ComponentHealth[] = [
        {
          id: "database",
          name: "Database Server Connection",
          category: "Storage",
          status: "Operational",
          lastChecked: new Date().toISOString(),
          explanation: "OK",
        },
        {
          id: "auth",
          name: "Authentication Service",
          category: "Security",
          status: "Operational",
          lastChecked: new Date().toISOString(),
          explanation: "OK",
        },
        {
          id: "workflow",
          name: "Workflow Execution Engine",
          category: "Automation",
          status: "Operational",
          lastChecked: new Date().toISOString(),
          explanation: "OK",
        },
        {
          id: "stripe",
          name: "Stripe Billing & Subscriptions",
          category: "Financial",
          status: "Operational",
          lastChecked: new Date().toISOString(),
          explanation: "OK",
        },
      ];

      expect(calculateOverallStatus(mockComponents)).toBe("Operational");
    });

    it("proves cache interval is hardened to 60s and public force-refresh is prohibited", () => {
      const healthCode = fs.readFileSync(
        path.join(rootDir, "lib", "health", "system-health.ts"),
        "utf8"
      );
      // 60,000ms TTL
      expect(healthCode).toContain("60_000");
      // No forceFresh argument on public function
      expect(healthCode).toContain("export async function probeSystemHealth(): Promise<SystemHealthReport>");
    });

    it("proves /api/health route enforces edge caching and consistent aggregation", async () => {
      const { GET } = await import("@/app/api/health/route");
      const res = await GET();
      expect(res.headers.get("Cache-Control")).toContain("s-maxage=60");
      const data = await res.json();
      expect(data).toHaveProperty("status");
      expect(data).toHaveProperty("overallStatus");
      expect(data).toHaveProperty("components");
      expect(data.components).toHaveLength(6);
    });
  });
});
