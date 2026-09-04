import type {
  CreateWorkspaceInput,
  Workspace,
  WorkspacePlan,
} from "@/types/workspace";

export const PLAN_PRICING: Record<WorkspacePlan, number> = {
  starter: 299,
  growth: 499,
  enterprise: 999,
};

export const SEED_WORKSPACES: Workspace[] = [
  {
    id: "ws-master-agency",
    name: "J10 NEXUS Master Agency",
    slug: "j10-master",
    type: "agency_master",
    plan: "enterprise",
    monthlySubscriptionPrice: 0,
    status: "active",
    brandName: "J10 NEXUS Master",
    accentColor: "#3B82F6",
    clientContactName: "CEO & Founder",
    clientContactEmail: "founder@j10nexus.com",
    createdAt: new Date(Date.now() - 86400000 * 60).toISOString(),
  },
  {
    id: "ws-client-apex",
    name: "Apex Solar Dynamics",
    slug: "apex-solar",
    type: "client",
    plan: "enterprise",
    monthlySubscriptionPrice: 999,
    status: "active",
    brandName: "Apex Solar AI OS",
    accentColor: "#F59E0B",
    clientContactName: "Julian Hayes",
    clientContactEmail: "julian@apexsolar.com",
    createdAt: new Date(Date.now() - 86400000 * 25).toISOString(),
  },
  {
    id: "ws-client-lumina",
    name: "Lumina Health & Aesthetics",
    slug: "lumina-health",
    type: "client",
    plan: "growth",
    monthlySubscriptionPrice: 499,
    status: "active",
    brandName: "Lumina Intelligence",
    accentColor: "#10B981",
    clientContactName: "Dr. Clara Chen",
    clientContactEmail: "clara@luminahealth.com",
    createdAt: new Date(Date.now() - 86400000 * 14).toISOString(),
  },
  {
    id: "ws-client-vanguard",
    name: "Vanguard Legal Group",
    slug: "vanguard-legal",
    type: "client",
    plan: "growth",
    monthlySubscriptionPrice: 499,
    status: "active",
    brandName: "Vanguard Legal AI",
    accentColor: "#8B5CF6",
    clientContactName: "Thomas Sterling, Esq.",
    clientContactEmail: "tsterling@vanguardlegal.com",
    createdAt: new Date(Date.now() - 86400000 * 7).toISOString(),
  },
];

export function calculateAgencySubscriptionRevenue(
  workspaces: Workspace[],
): {
  totalMonthlyRevenue: number;
  activeClientCount: number;
  averageRevenuePerClient: number;
} {
  const clientWorkspaces = workspaces.filter(
    (w) => w.type === "client" && w.status === "active",
  );

  const totalMonthlyRevenue = clientWorkspaces.reduce(
    (sum, w) => sum + w.monthlySubscriptionPrice,
    0,
  );

  const activeClientCount = clientWorkspaces.length;
  const averageRevenuePerClient =
    activeClientCount > 0
      ? Math.round(totalMonthlyRevenue / activeClientCount)
      : 0;

  return {
    totalMonthlyRevenue,
    activeClientCount,
    averageRevenuePerClient,
  };
}

export function createClientWorkspace(
  input: CreateWorkspaceInput,
  existingWorkspaces: Workspace[],
): Workspace {
  const slug = input.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  const newWorkspace: Workspace = {
    id: `ws-client-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: input.name,
    slug,
    type: "client",
    plan: input.plan,
    monthlySubscriptionPrice: input.monthlySubscriptionPrice,
    status: "active",
    brandName: input.brandName || input.name,
    accentColor: input.accentColor || "#3B82F6",
    clientContactName: input.clientContactName,
    clientContactEmail: input.clientContactEmail,
    createdAt: new Date().toISOString(),
  };

  return newWorkspace;
}
