import type { SupabaseClient } from "@supabase/supabase-js";

export interface ClientPortalProposal {
  id: string;
  proposalNumber: string;
  title: string;
  amount: number;
  currency: string;
  status: string;
  checkoutUrl: string | null;
  validUntil: string | null;
}

export interface ClientPortalData {
  workspace: {
    id: string;
    name: string;
    brandName: string;
    logoUrl: string | null;
    faviconUrl: string | null;
    primaryColor: string;
    accentColor: string;
    portalTitle: string;
    portalWelcomeMessage: string;
    whiteLabelEnabled: boolean;
  };
  aiWorkforce: {
    totalAgents: number;
    activeAgents: number;
  };
  pipeline: {
    totalContacts: number;
    activeDeals: number;
    wonDeals: number;
    pipelineValue: number;
  };
  proposals: ClientPortalProposal[];
  campaigns: {
    totalCampaigns: number;
    totalBroadcastsSent: number;
  };
}

/**
 * Retrieves client-safe scoped portal telemetry without exposing
 * internal administrative configs or cross-tenant data.
 */
export async function getClientPortalData(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<ClientPortalData> {
  // 1. Workspace white-label branding
  const { data: ws, error: wsError } = await supabase
    .from("workspaces")
    .select("id, name, brand_name, logo_url, favicon_url, primary_color, accent_color, portal_title, portal_welcome_message, white_label_enabled")
    .eq("id", workspaceId)
    .single();

  if (wsError || !ws) {
    throw new Error(`Workspace not found.`);
  }

  // 2. AI Workforce Agents
  const { count: totalAgents } = await supabase
    .from("workforce_agents")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);

  const { count: activeAgents } = await supabase
    .from("workforce_agents")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("status", "active");

  // 3. CRM Pipeline
  const { data: contacts } = await supabase
    .from("contacts")
    .select("id, deal_stage, estimated_value")
    .eq("workspace_id", workspaceId);

  const contactList = contacts || [];
  let pipelineValue = 0;
  let activeDeals = 0;
  let wonDeals = 0;

  for (const c of contactList) {
    const val = Number(c.estimated_value) || 0;
    if (c.deal_stage === "won") {
      wonDeals++;
    } else if (c.deal_stage === "qualified" || c.deal_stage === "proposal") {
      activeDeals++;
      pipelineValue += val;
    }
  }

  // 4. Proposals
  const { data: proposals } = await supabase
    .from("crm_proposals")
    .select("id, proposal_number, title, amount, currency, status, checkout_url, valid_until")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(5);

  const portalProposals: ClientPortalProposal[] = (proposals || []).map((p: any) => ({
    id: p.id,
    proposalNumber: p.proposal_number,
    title: p.title,
    amount: Number(p.amount) || 0,
    currency: p.currency || "USD",
    status: p.status,
    checkoutUrl: p.checkout_url || null,
    validUntil: p.valid_until || null,
  }));

  // 5. Marketing Campaigns
  const { count: totalCampaigns } = await supabase
    .from("marketing_campaigns")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);

  return {
    workspace: {
      id: ws.id,
      name: ws.name,
      brandName: ws.brand_name || ws.name,
      logoUrl: ws.logo_url || null,
      faviconUrl: ws.favicon_url || null,
      primaryColor: ws.primary_color || "#10B981",
      accentColor: ws.accent_color || "#3B82F6",
      portalTitle: ws.portal_title || `${ws.brand_name || ws.name} Portal`,
      portalWelcomeMessage: ws.portal_welcome_message || `Welcome to your autonomous client portal.`,
      whiteLabelEnabled: Boolean(ws.white_label_enabled),
    },
    aiWorkforce: {
      totalAgents: totalAgents || 0,
      activeAgents: activeAgents || 0,
    },
    pipeline: {
      totalContacts: contactList.length,
      activeDeals,
      wonDeals,
      pipelineValue,
    },
    proposals: portalProposals,
    campaigns: {
      totalCampaigns: totalCampaigns || 0,
      totalBroadcastsSent: 0,
    },
  };
}
