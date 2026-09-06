import type { SupabaseClient } from "@supabase/supabase-js";

export interface ChannelAttribution {
  channel: string;
  leads: number;
  wonCount: number;
  wonRevenue: number;
  conversionRate: number;
}

export interface FunnelStageMetric {
  stage: "lead" | "qualified" | "proposal" | "won";
  label: string;
  count: number;
  value: number;
  conversionFromPrevious: number; // percentage
}

export interface RecentLedgerEntry {
  id: string;
  checkoutId: string | null;
  amount: number;
  currency: string;
  provider: string;
  occurredAt: string;
  status: string;
}

export interface ExecutiveRevenueReport {
  workspaceId: string;
  generatedAt: string;
  summary: {
    totalVerifiedWonRevenue: number;
    activePipelineValue: number;
    totalContractValue: number;
    averageDealSize: number;
    overallWinRate: number; // percentage
    averagePipelineVelocityHours: number;
  };
  funnel: {
    totalContacts: number;
    stages: FunnelStageMetric[];
    dropoffCount: number; // lost/churned
  };
  proposals: {
    total: number;
    sent: number;
    paid: number;
    draft: number;
    expired: number;
    totalValue: number;
  };
  bookings: {
    total: number;
    scheduled: number;
    completed: number;
    canceled: number;
  };
  attribution: ChannelAttribution[];
  recentLedger: RecentLedgerEntry[];
}

/**
 * Computes comprehensive, multi-tenant executive reporting metrics for a workspace.
 */
export async function getWorkspaceExecutiveRevenueReport(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<ExecutiveRevenueReport> {
  const generatedAt = new Date().toISOString();

  // 1. Fetch Contacts in Workspace
  const { data: contacts } = await supabase
    .from("contacts")
    .select("id, name, source, deal_stage, status, estimated_value, created_at, updated_at")
    .eq("workspace_id", workspaceId);

  const contactList = contacts || [];

  // 2. Fetch Verified Payments from Ledger
  const { data: ledgerEntries } = await supabase
    .from("payment_ledger")
    .select("id, checkout_id, amount, currency, provider, status, occurred_at")
    .eq("workspace_id", workspaceId)
    .eq("status", "succeeded")
    .order("occurred_at", { ascending: false });

  const ledgerList = ledgerEntries || [];

  // 3. Fetch Proposals
  const { data: proposals } = await supabase
    .from("crm_proposals")
    .select("id, status, amount, currency, created_at")
    .eq("workspace_id", workspaceId);

  const proposalList = proposals || [];

  // 4. Fetch Bookings
  const { data: bookings } = await supabase
    .from("crm_bookings")
    .select("id, status, scheduled_at, booking_type")
    .eq("workspace_id", workspaceId);

  const bookingList = bookings || [];

  // Financial Calculations
  const totalVerifiedWonRevenue = ledgerList.reduce(
    (sum, entry) => sum + (Number(entry.amount) || 0),
    0
  );

  let activePipelineValue = 0;
  let wonContactsCount = 0;
  let leadStageCount = 0;
  let qualifiedStageCount = 0;
  let proposalStageCount = 0;
  let dropoffCount = 0;

  const channelMap = new Map<string, { leads: number; wonCount: number; wonRevenue: number }>();

  for (const c of contactList) {
    const stage = c.deal_stage || "lead";
    const val = Number(c.estimated_value) || 0;
    const channel = (c.source || "other").toLowerCase();

    // Channel stats
    const currentChannel = channelMap.get(channel) || { leads: 0, wonCount: 0, wonRevenue: 0 };
    currentChannel.leads++;

    if (stage === "won" || c.status === "Won") {
      wonContactsCount++;
      currentChannel.wonCount++;
      currentChannel.wonRevenue += val;
    } else if (stage === "proposal") {
      proposalStageCount++;
      activePipelineValue += val;
    } else if (stage === "qualified" || c.status === "Qualified" || c.status === "Interested") {
      qualifiedStageCount++;
      activePipelineValue += val;
    } else if (stage === "lead") {
      leadStageCount++;
    } else if (stage === "churned" || c.status === "Lost") {
      dropoffCount++;
    }

    channelMap.set(channel, currentChannel);
  }

  const totalContractValue = totalVerifiedWonRevenue + activePipelineValue;
  const averageDealSize =
    wonContactsCount > 0 ? Math.round(totalVerifiedWonRevenue / wonContactsCount) : 0;

  const totalContacts = contactList.length;
  const overallWinRate =
    totalContacts > 0 ? Math.round((wonContactsCount / totalContacts) * 100) : 0;

  // Funnel Progression
  // Stage 1: Leads
  // Stage 2: Qualified (qualified + proposal + won)
  // Stage 3: Proposals (proposal + won)
  // Stage 4: Won
  const cumulativeLeads = totalContacts;
  const cumulativeQualified = qualifiedStageCount + proposalStageCount + wonContactsCount;
  const cumulativeProposals = proposalStageCount + wonContactsCount;
  const cumulativeWon = wonContactsCount;

  const qualConversion = cumulativeLeads > 0
    ? Math.round((cumulativeQualified / cumulativeLeads) * 100)
    : 0;

  const propConversion = cumulativeQualified > 0
    ? Math.round((cumulativeProposals / cumulativeQualified) * 100)
    : 0;

  const wonConversion = cumulativeProposals > 0
    ? Math.round((cumulativeWon / cumulativeProposals) * 100)
    : 0;

  const funnelStages: FunnelStageMetric[] = [
    {
      stage: "lead",
      label: "Inbound Leads",
      count: cumulativeLeads,
      value: totalContractValue,
      conversionFromPrevious: 100,
    },
    {
      stage: "qualified",
      label: "AI Qualified",
      count: cumulativeQualified,
      value: activePipelineValue + totalVerifiedWonRevenue,
      conversionFromPrevious: qualConversion,
    },
    {
      stage: "proposal",
      label: "Proposals & Bookings",
      count: cumulativeProposals,
      value: proposalList.reduce((acc, p) => acc + (Number(p.amount) || 0), 0),
      conversionFromPrevious: propConversion,
    },
    {
      stage: "won",
      label: "Closed & Paid (Won)",
      count: cumulativeWon,
      value: totalVerifiedWonRevenue,
      conversionFromPrevious: wonConversion,
    },
  ];

  // Pipeline Velocity (average hours from lead creation to won)
  let totalVelocityHours = 0;
  let wonWithTimestamps = 0;

  for (const c of contactList) {
    if (c.deal_stage === "won" && c.created_at && c.updated_at) {
      const created = new Date(c.created_at).getTime();
      const closed = new Date(c.updated_at).getTime();
      const diffHours = (closed - created) / (1000 * 60 * 60);
      if (diffHours >= 0) {
        totalVelocityHours += diffHours;
        wonWithTimestamps++;
      }
    }
  }

  const averagePipelineVelocityHours =
    wonWithTimestamps > 0 ? Math.round(totalVelocityHours / wonWithTimestamps) : 24;

  // Proposals Breakdown
  const proposalSummary = {
    total: proposalList.length,
    sent: proposalList.filter((p) => p.status === "sent").length,
    paid: proposalList.filter((p) => p.status === "paid" || p.status === "accepted").length,
    draft: proposalList.filter((p) => p.status === "draft").length,
    expired: proposalList.filter((p) => p.status === "expired" || p.status === "rejected").length,
    totalValue: proposalList.reduce((sum, p) => sum + (Number(p.amount) || 0), 0),
  };

  // Bookings Breakdown
  const bookingSummary = {
    total: bookingList.length,
    scheduled: bookingList.filter((b) => b.status === "scheduled").length,
    completed: bookingList.filter((b) => b.status === "completed").length,
    canceled: bookingList.filter((b) => b.status === "canceled" || b.status === "no_show").length,
  };

  // Channel Attribution
  const attribution: ChannelAttribution[] = Array.from(channelMap.entries()).map(
    ([channel, data]) => ({
      channel,
      leads: data.leads,
      wonCount: data.wonCount,
      wonRevenue: data.wonRevenue,
      conversionRate: data.leads > 0 ? Math.round((data.wonCount / data.leads) * 100) : 0,
    })
  );

  // Recent Ledger Entries
  const recentLedger: RecentLedgerEntry[] = ledgerList.slice(0, 10).map((entry) => ({
    id: entry.id,
    checkoutId: entry.checkout_id,
    amount: Number(entry.amount) || 0,
    currency: entry.currency || "USD",
    provider: entry.provider,
    occurredAt: entry.occurred_at,
    status: entry.status,
  }));

  return {
    workspaceId,
    generatedAt,
    summary: {
      totalVerifiedWonRevenue,
      activePipelineValue,
      totalContractValue,
      averageDealSize,
      overallWinRate,
      averagePipelineVelocityHours,
    },
    funnel: {
      totalContacts,
      stages: funnelStages,
      dropoffCount,
    },
    proposals: proposalSummary,
    bookings: bookingSummary,
    attribution,
    recentLedger,
  };
}
