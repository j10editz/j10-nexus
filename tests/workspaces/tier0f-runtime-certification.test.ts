import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readSource(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");
}

describe("Tier 0F Runtime Tenant Certification & Integrity", () => {
  describe("1. Migration 20260917 Schema & RPC Verification", () => {
    const migration = readSource("supabase/migrations/20260917_tier0f_runtime_tenant_certification.sql");

    it("verifies webhook RLS restricts tenant select to non-null workspace members", () => {
      expect(migration).toContain('CREATE POLICY "webhook_events_tenant_select" ON public.webhook_events FOR SELECT');
      expect(migration).toContain("workspace_id IS NOT NULL");
      expect(migration).toContain("public.is_workspace_member(workspace_id)");
    });

    it("verifies canonical CRM contacts consolidation and security-invoker view", () => {
      expect(migration).toContain("ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS first_name TEXT;");
      expect(migration).toContain("CREATE OR REPLACE VIEW public.crm_contacts");
      expect(migration).toContain("WITH (security_invoker = on)");
    });

    it("verifies subscription provenance column and J10 HQ internal_grant labeling", () => {
      expect(migration).toContain("ADD COLUMN IF NOT EXISTS provenance TEXT NOT NULL DEFAULT 'none'");
      expect(migration).toContain("CHECK (provenance IN ('stripe', 'trial', 'internal_grant', 'none'))");
      expect(migration).toContain("provenance = 'internal_grant'");
      expect(migration).toContain("platform_founder");
    });

    it("verifies hardened increment_workspace_usage RPC with row lock and quota enforcement", () => {
      expect(migration).toContain("CREATE OR REPLACE FUNCTION public.increment_workspace_usage");
      expect(migration).toContain("FOR UPDATE");
      expect(migration).toContain("p_count");
      expect(migration).toContain("(v_sub.messages_used_this_period + p_count) > v_sub.monthly_message_limit");
      expect(migration).toContain("Monthly message quota exceeded");
    });

    it("verifies atomic create_website_lead RPC binding to funnel workspace_id", () => {
      expect(migration).toContain("CREATE OR REPLACE FUNCTION public.create_website_lead");
      expect(migration).toContain("INSERT INTO public.contacts");
      expect(migration).toContain("INSERT INTO public.inbox_threads");
      expect(migration).toContain("INSERT INTO public.inbox_messages");
      expect(migration).toContain("v_funnel.workspace_id");
    });
  });

  describe("2. Lead Ingestion & 404 Boundary Certification", () => {
    const leadRoute = readSource("app/api/website/lead/route.ts");
    const sitePage = readSource("app/site/[slug]/page.tsx");

    it("verifies website lead route invokes create_website_lead RPC atomically", () => {
      expect(leadRoute).toContain('.rpc("create_website_lead"');
    });

    it("verifies website lead route has no default workspace fallback", () => {
      expect(leadRoute).not.toContain("defaultWs");
      expect(leadRoute).not.toContain(".order(\"created_at\", { ascending: true })");
    });

    it("verifies website lead route does not hardcode fallback phone numbers", () => {
      expect(leadRoute).not.toContain("+15550192834");
      expect(leadRoute).not.toContain("+15553492810");
    });

    it("verifies website lead route returns HTTP 404 when funnel is missing", () => {
      expect(leadRoute).toContain('{ status: 404 }');
      expect(leadRoute).toContain("Website funnel not found.");
    });

    it("verifies /site/[slug] invokes notFound() for missing or unpublished funnels", () => {
      expect(sitePage).toContain('import { notFound } from "next/navigation"');
      expect(sitePage).toContain("notFound()");
      expect(sitePage).not.toContain('"use client"');
    });
  });

  describe("3. Metering Fail-Closed Guard", () => {
    const aiRoute = readSource("app/api/website/ai-generate/route.ts");

    it("verifies AI generation route fails closed in production on metering failure", () => {
      expect(aiRoute).toContain('process.env.NODE_ENV === "production"');
      expect(aiRoute).toContain("Usage quota check failed. Generation halted for workspace safety.");
      expect(aiRoute).toContain("{ status: 500 }");
    });
  });

  describe("4. Honest UI State & Mock Purge", () => {
    const crmPage = readSource("app/dashboard/crm/page.tsx");
    const commercePage = readSource("app/dashboard/commerce/page.tsx");
    const statusPage = readSource("app/status/page.tsx");

    it("verifies CRM page initializes with empty contacts array and no seed mocks", () => {
      expect(crmPage).not.toContain("SEED_CRM_CONTACTS");
      expect(crmPage).toContain("useState<CRMContact[]>([])");
    });

    it("verifies CRM page does not perform optimistic mutation on stage update error", () => {
      expect(crmPage).not.toContain("Optimistic local fallback");
      expect(crmPage).not.toContain("Optimistic local update");
    });

    it("verifies Commerce page initializes with empty products and orders and no mock phones", () => {
      expect(commercePage).not.toContain("SEED_COMMERCE_PRODUCTS");
      expect(commercePage).not.toContain("SEED_COMMERCE_ORDERS");
      expect(commercePage).toContain("useState<CommerceProduct[]>([])");
      expect(commercePage).toContain("useState<CommerceOrder[]>([])");
      expect(commercePage).not.toContain("+15550192834");
      expect(commercePage).not.toContain("+15553492810");
    });

    it("verifies status page displays live operational probe metadata without fabricated uptime percentages", () => {
      expect(statusPage).not.toMatch(/99\.9\d%/);
      expect(statusPage).not.toContain("30-day verified uptime");
      expect(statusPage).toContain("Active Connection Pool & Tenant RLS Policies");
      expect(statusPage).toContain("Operational");
    });
  });
});
