export type WorkspaceType = "agency_master" | "client";

export type WorkspacePlan = "starter" | "growth" | "enterprise";

export type WorkspaceStatus = "active" | "trial" | "past_due";

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  type: WorkspaceType;
  plan: WorkspacePlan;
  monthlySubscriptionPrice: number;
  status: WorkspaceStatus;
  brandName: string;
  accentColor: string;
  clientContactName: string;
  clientContactEmail: string;
  logoUrl?: string;
  customDomain?: string;
  createdAt: string;
}

export interface CreateWorkspaceInput {
  name: string;
  brandName?: string;
  plan: WorkspacePlan;
  monthlySubscriptionPrice: number;
  clientContactName: string;
  clientContactEmail: string;
  accentColor?: string;
}
