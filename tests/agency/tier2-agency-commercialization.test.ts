import { describe, expect, it, vi } from "vitest";
import {
  isValidHexColor,
  getWorkspaceBranding,
  updateWorkspaceBranding,
} from "@/lib/agency/branding";
import {
  normalizeDomain,
  isValidDomain,
  registerCustomDomain,
  verifyCustomDomainDns,
  removeCustomDomain,
  resolveWorkspaceByHostname,
} from "@/lib/agency/domains";
import {
  getAvailableTemplates,
  applyWorkspaceTemplate,
} from "@/lib/agency/templates";
import {
  onboardAgencyClientWorkspace,
  getAgencyClientWorkspaces,
} from "@/lib/agency/client-onboarding";
import {
  getClientPortalData,
} from "@/lib/agency/portal";

describe("Tier 2: Agency & Client Commercialization Engine", () => {
  describe("White-Label Branding & Hex Color Validation", () => {
    it("validates 3- and 6-character hex colors strictly", () => {
      expect(isValidHexColor("#10B981")).toBe(true);
      expect(isValidHexColor("#3b82f6")).toBe(true);
      expect(isValidHexColor("#FFF")).toBe(true);
      expect(isValidHexColor("#000000")).toBe(true);

      expect(isValidHexColor("emerald")).toBe(false);
      expect(isValidHexColor("rgb(0,0,0)")).toBe(false);
      expect(isValidHexColor("#12345")).toBe(false);
      expect(isValidHexColor("#1234567")).toBe(false);
    });

    it("rejects white-label watermark removal on Starter plan", async () => {
      const mockSupabase: any = { from: vi.fn() };
      await expect(
        updateWorkspaceBranding(
          mockSupabase,
          "ws-starter",
          { whiteLabelEnabled: true },
          "starter"
        )
      ).rejects.toThrow("Growth or Enterprise");
    });
  });

  describe("Custom Domain Lifecycle & Normalization", () => {
    it("normalizes and validates fully-qualified domain names (FQDN)", () => {
      expect(normalizeDomain("https://Portal.ApexSolar.com/login")).toBe("portal.apexsolar.com");
      expect(normalizeDomain("HTTP://AI.AGENCY.CO/")).toBe("ai.agency.co");

      expect(isValidDomain("portal.apexsolar.com")).toBe(true);
      expect(isValidDomain("ai.agency.co")).toBe(true);
      expect(isValidDomain("localhost")).toBe(false);
      expect(isValidDomain("not a domain")).toBe(false);
    });

    it("rejects custom domain registration on Starter plan", async () => {
      const mockSupabase: any = { from: vi.fn() };
      await expect(
        registerCustomDomain(mockSupabase, "ws-starter", "portal.client.com", "starter")
      ).rejects.toThrow("Growth or Enterprise");
    });
  });

  describe("Mock Client Commercialization Suite Integration", () => {
    function createMockAgencySupabase() {
      const state = {
        workspaces: [] as any[],
        workspace_memberships: [] as any[],
        workspace_domains: [] as any[],
        workspace_templates: [
          {
            id: "tmpl-solar",
            slug: "solar-energy-residential",
            name: "Solar Energy Blueprint",
            vertical: "solar_energy",
            description: "Turnkey residential solar consultation.",
            system_prompt_blueprint: "You are the Clean Energy Specialist.",
            default_ai_employees: [
              { name: "Julian Hayes", role: "Solar Engineer", department: "Sales" },
            ],
            default_pipeline_stages: ["lead", "utility_bill", "installed"],
            default_knowledge_topics: ["Net Metering FAQ", "Tax Credits"],
            is_public: true,
          },
        ] as any[],
        workspace_invitations: [] as any[],
        workforce_agents: [] as any[],
        knowledge_articles: [] as any[],
        contacts: [] as any[],
        crm_proposals: [] as any[],
        marketing_campaigns: [] as any[],
      };

      const mockClient: any = {
        from: vi.fn((table: string) => {
          let currentTable = state[table as keyof typeof state] || [];
          let filters: Array<(row: any) => boolean> = [];
          let limitCount: number | null = null;
          let isCountQuery = false;

          const queryBuilder: any = {
            select: vi.fn((fields = "*", options?: any) => {
              if (options?.count === "exact" && options?.head) {
                isCountQuery = true;
              }
              return queryBuilder;
            }),
            insert: vi.fn((data: any) => {
              const rows = Array.isArray(data) ? data : [data];
              const inserted = rows.map((r) => ({
                id: r.id || `mock_${table}_${Math.random().toString(36).substring(2, 9)}`,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                ...r,
              }));
              currentTable.push(...inserted);

              return {
                select: vi.fn(() => ({
                  single: vi.fn(() => Promise.resolve({ data: inserted[0], error: null })),
                  maybeSingle: vi.fn(() => Promise.resolve({ data: inserted[0], error: null })),
                  then: (resolve: any) => resolve({ data: inserted, error: null }),
                })),
                single: vi.fn(() => Promise.resolve({ data: inserted[0], error: null })),
                then: (resolve: any) => resolve({ data: inserted, error: null }),
              };
            }),
            update: vi.fn((updates: any) => {
              return {
                eq: vi.fn((field: string, val: any) => {
                  filters.push((row) => row[field] === val);
                  return {
                    eq: vi.fn((f2: string, v2: any) => {
                      filters.push((row) => row[f2] === v2);
                      const matching = currentTable.filter((r) => filters.every((fn) => fn(r)));
                      matching.forEach((r) => Object.assign(r, updates));
                      return {
                        select: vi.fn(() => ({
                          single: vi.fn(() => Promise.resolve({ data: matching[0] || null, error: null })),
                          then: (res: any) => res({ data: matching, error: null }),
                        })),
                        then: (res: any) => res({ data: matching, error: null }),
                      };
                    }),
                    select: vi.fn(() => ({
                      single: vi.fn(() => {
                        const matching = currentTable.filter((r) => filters.every((fn) => fn(r)));
                        matching.forEach((r) => Object.assign(r, updates));
                        return Promise.resolve({ data: matching[0] || null, error: null });
                      }),
                      then: (res: any) => {
                        const matching = currentTable.filter((r) => filters.every((fn) => fn(r)));
                        matching.forEach((r) => Object.assign(r, updates));
                        return res({ data: matching, error: null });
                      },
                    })),
                    then: (res: any) => {
                      const matching = currentTable.filter((r) => filters.every((fn) => fn(r)));
                      matching.forEach((r) => Object.assign(r, updates));
                      return res({ data: matching, error: null });
                    },
                  };
                }),
              };
            }),
            delete: vi.fn(() => ({
              eq: vi.fn((f1: string, v1: any) => ({
                eq: vi.fn((f2: string, v2: any) => {
                  const idx = currentTable.findIndex((r) => r[f1] === v1 && r[f2] === v2);
                  if (idx >= 0) currentTable.splice(idx, 1);
                  return Promise.resolve({ error: null });
                }),
              })),
            })),
            eq: vi.fn((field: string, val: any) => {
              filters.push((row) => row[field] === val);
              return queryBuilder;
            }),
            order: vi.fn(() => queryBuilder),
            limit: vi.fn((num: number) => {
              limitCount = num;
              return queryBuilder;
            }),
            single: vi.fn(() => {
              const filtered = currentTable.filter((r) => filters.every((fn) => fn(r)));
              return Promise.resolve({ data: filtered[0] || null, error: null });
            }),
            maybeSingle: vi.fn(() => {
              const filtered = currentTable.filter((r) => filters.every((fn) => fn(r)));
              return Promise.resolve({ data: filtered[0] || null, error: null });
            }),
            then: (resolve: any) => {
              let res = currentTable.filter((r) => filters.every((fn) => fn(r)));
              if (limitCount) res = res.slice(0, limitCount);
              if (isCountQuery) {
                return resolve({ count: res.length, data: null, error: null });
              }
              resolve({ count: res.length, data: res, error: null });
            },
          };

          return queryBuilder;
        }),
      };

      return { mockClient, state };
    }

    it("registers and verifies a custom domain, and resolves workspace by custom hostname", async () => {
      const { mockClient, state } = createMockAgencySupabase();

      // Seed agency workspace
      state.workspaces.push({
        id: "ws-agency-1",
        name: "Omni Media Agency",
        slug: "omni-media",
        brand_name: "Omni Media AI",
        plan: "enterprise",
      });

      // 1. Register custom domain
      const regResult = await registerCustomDomain(
        mockClient,
        "ws-agency-1",
        "https://portal.omnimedia.com",
        "enterprise"
      );

      expect(regResult.success).toBe(true);
      expect(regResult.domain.domain).toBe("portal.omnimedia.com");
      expect(regResult.domain.status).toBe("pending");
      expect(regResult.dnsInstructions.length).toBe(2);
      expect(regResult.dnsInstructions[0].type).toBe("CNAME");
      expect(regResult.dnsInstructions[1].type).toBe("TXT");

      // Verify workspace updated
      expect(state.workspaces[0].custom_domain).toBe("portal.omnimedia.com");
      expect(state.workspaces[0].custom_domain_status).toBe("pending_verification");

      // 2a. Honest DNS verification: when DNS records are unconfigured, retains pending status
      const pendingCheck = await verifyCustomDomainDns(
        mockClient,
        "ws-agency-1",
        regResult.domain.id,
        {
          dnsChecker: async () => ({ txtVerified: false, cnameVerified: false }),
        }
      );
      expect(pendingCheck.status).toBe("pending");
      expect(pendingCheck.ssl_status).toBe("pending");
      expect(state.workspaces[0].custom_domain_status).toBe("pending_verification");

      // 2b. When genuine DNS TXT ownership challenge and CNAME target match: advance to active & SSL issued
      const verified = await verifyCustomDomainDns(
        mockClient,
        "ws-agency-1",
        regResult.domain.id,
        {
          dnsChecker: async () => ({ txtVerified: true, cnameVerified: true }),
        }
      );

      expect(verified.status).toBe("active");
      expect(verified.ssl_status).toBe("issued");
      expect(state.workspaces[0].custom_domain_status).toBe("verified");

      // 3. Resolve workspace by custom domain
      const resolved = await resolveWorkspaceByHostname(mockClient, "portal.omnimedia.com");
      expect(resolved).not.toBeNull();
      expect(resolved?.id).toBe("ws-agency-1");
      expect(resolved?.name).toBe("Omni Media Agency");
    });

    it("onboards an agency client workspace, applies vertical blueprint, and seeds AI employees", async () => {
      const { mockClient, state } = createMockAgencySupabase();

      // 1. Onboard client workspace under agency master
      const onboardResult = await onboardAgencyClientWorkspace(mockClient, {
        agencyWorkspaceId: "ws-master-agency",
        clientName: "SunPeak Clean Energy",
        clientContactName: "Nathan Vance",
        clientContactEmail: "nathan@sunpeak.com",
        templateSlug: "solar-energy-residential",
        billingMode: "agency_funded",
        actorUserId: "usr-agency-admin",
      });

      expect(onboardResult.success).toBe(true);
      expect(onboardResult.workspace.name).toBe("SunPeak Clean Energy");
      expect(onboardResult.workspace.billingMode).toBe("agency_funded");
      expect(onboardResult.invitationUrl).toContain("/onboarding?invitation=");
      expect(onboardResult.templateResult?.agentsCreated).toBe(1);
      expect(onboardResult.templateResult?.knowledgeTopicsCreated).toBe(2);

      // Verify workspace seeded in state
      expect(state.workspaces.length).toBe(1);
      expect(state.workspaces[0].agency_master_id).toBe("ws-master-agency");
      expect(state.workspaces[0].white_label_enabled).toBe(true);

      // Verify AI Employee seeded from blueprint
      expect(state.workforce_agents.length).toBe(1);
      expect(state.workforce_agents[0].name).toBe("Julian Hayes");
      expect(state.workforce_agents[0].role).toBe("Solar Engineer");

      // Verify Knowledge Hub seeded
      expect(state.knowledge_articles.length).toBe(2);

      // 2. Retrieve client portfolio under agency master
      const agencyClients = await getAgencyClientWorkspaces(mockClient, "ws-master-agency");
      expect(agencyClients.length).toBe(1);
      expect(agencyClients[0].name).toBe("SunPeak Clean Energy");
    });

    it("retrieves client portal data scoped to client tenant without data leakage", async () => {
      const { mockClient, state } = createMockAgencySupabase();
      const clientId = "ws-client-sunpeak";

      state.workspaces.push({
        id: clientId,
        name: "SunPeak Clean Energy",
        brand_name: "SunPeak AI OS",
        logo_url: "https://sunpeak.com/logo.png",
        primary_color: "#10B981",
        accent_color: "#F59E0B",
        portal_title: "SunPeak Client Portal",
        portal_welcome_message: "Welcome to SunPeak Autonomous Intelligence.",
        white_label_enabled: true,
      });

      state.workforce_agents.push({
        id: "agt-1",
        workspace_id: clientId,
        name: "Julian Hayes",
        status: "active",
      });

      state.contacts.push(
        { id: "c1", workspace_id: clientId, deal_stage: "won", estimated_value: 5000 },
        { id: "c2", workspace_id: clientId, deal_stage: "qualified", estimated_value: 2500 }
      );

      state.crm_proposals.push({
        id: "prop-1",
        workspace_id: clientId,
        proposal_number: "PROP-2026-0001",
        title: "Commercial Solar System Proposal",
        amount: 5000,
        currency: "USD",
        status: "paid",
        checkout_url: null,
      });

      const portalData = await getClientPortalData(mockClient, clientId);

      expect(portalData.workspace.brandName).toBe("SunPeak AI OS");
      expect(portalData.workspace.whiteLabelEnabled).toBe(true);
      expect(portalData.aiWorkforce.activeAgents).toBe(1);
      expect(portalData.pipeline.activeDeals).toBe(1);
      expect(portalData.pipeline.wonDeals).toBe(1);
      expect(portalData.pipeline.pipelineValue).toBe(2500);
      expect(portalData.proposals.length).toBe(1);
      expect(portalData.proposals[0].proposalNumber).toBe("PROP-2026-0001");
    });
  });
});
