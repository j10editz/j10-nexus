import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID, createHash } from "node:crypto";
import { applyWorkspaceTemplate, type ApplyTemplateResult } from "@/lib/agency/templates";

export interface OnboardClientInput {
  agencyWorkspaceId: string;
  clientName: string;
  clientContactName: string;
  clientContactEmail: string;
  brandName?: string;
  plan?: "starter" | "growth" | "enterprise";
  monthlyPrice?: number;
  billingMode?: "agency_funded" | "direct" | "revenue_share";
  clientTier?: "standard" | "pro" | "vip";
  templateSlug?: string;
  actorUserId: string;
  origin?: string;
}

export interface ClientWorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  brandName: string;
  plan: string;
  status: string;
  billingMode: string;
  clientTier: string;
  customDomain: string | null;
  createdAt: string;
}

export interface OnboardClientResult {
  success: boolean;
  workspace: ClientWorkspaceSummary;
  invitationUrl: string;
  templateResult?: ApplyTemplateResult;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Onboards and provisions a new client sub-workspace under an agency master.
 */
export async function onboardAgencyClientWorkspace(
  supabase: SupabaseClient,
  input: OnboardClientInput
): Promise<OnboardClientResult> {
  const baseSlug = slugify(input.clientName) || "client-ws";
  const uniqueSuffix = randomUUID().slice(0, 6);
  const slug = `${baseSlug}-${uniqueSuffix}`;
  const plan = input.plan || "growth";
  const billingMode = input.billingMode || "agency_funded";
  const clientTier = input.clientTier || "standard";
  const brandName = input.brandName?.trim() || `${input.clientName} AI Operating System`;
  const origin = input.origin || "https://app.j10nexus.com";

  // 1. Insert client workspace
  const { data: workspace, error: wsError } = await supabase
    .from("workspaces")
    .insert({
      name: input.clientName.trim(),
      slug,
      workspace_type: "client",
      plan,
      status: "active",
      brand_name: brandName,
      owner_user_id: input.actorUserId,
      agency_master_id: input.agencyWorkspaceId,
      billing_mode: billingMode,
      client_tier: clientTier,
      white_label_enabled: true,
      portal_title: brandName,
      portal_welcome_message: `Welcome to the ${brandName} Client Portal.`,
    })
    .select("id, name, slug, brand_name, plan, status, billing_mode, client_tier, custom_domain, created_at")
    .single();

  if (wsError || !workspace) {
    throw new Error(`Failed to provision client workspace: ${wsError?.message || "Unknown error"}`);
  }

  // 2. Add creator as workspace owner
  await supabase
    .from("workspace_memberships")
    .insert({
      workspace_id: workspace.id,
      user_id: input.actorUserId,
      role: "owner",
      status: "active",
    });

  // 3. Apply Industry Template Blueprint if specified
  let templateResult: ApplyTemplateResult | undefined;
  if (input.templateSlug) {
    try {
      templateResult = await applyWorkspaceTemplate(supabase, workspace.id, input.templateSlug);
    } catch (tmplErr) {
      console.warn(`Template application failed non-blockingly for client ${workspace.id}:`, tmplErr);
    }
  }

  // 4. Generate Single-Use Cryptographic Invitation for the Client
  const rawToken = `inv_${randomUUID()}_${randomUUID().slice(0, 8)}`;
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const normalizedEmail = input.clientContactEmail.trim().toLowerCase();

  await supabase
    .from("workspace_invitations")
    .insert({
      workspace_id: workspace.id,
      email_normalized: normalizedEmail,
      token_hash: tokenHash,
      role: "admin",
      status: "pending",
      expires_at: new Date(Date.now() + 14 * 86400000).toISOString(),
    });

  const invitationUrl = `${origin}/onboarding?invitation=${rawToken}`;

  return {
    success: true,
    workspace: {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      brandName: workspace.brand_name,
      plan: workspace.plan,
      status: workspace.status,
      billingMode: workspace.billing_mode,
      clientTier: workspace.client_tier,
      customDomain: workspace.custom_domain,
      createdAt: workspace.created_at,
    },
    invitationUrl,
    templateResult,
  };
}

/**
 * Retrieves all client sub-workspaces managed by an agency master.
 */
export async function getAgencyClientWorkspaces(
  supabase: SupabaseClient,
  agencyWorkspaceId: string
): Promise<ClientWorkspaceSummary[]> {
  const { data, error } = await supabase
    .from("workspaces")
    .select("id, name, slug, brand_name, plan, status, billing_mode, client_tier, custom_domain, created_at")
    .eq("agency_master_id", agencyWorkspaceId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch agency client workspaces: ${error.message}`);
  }

  return (data || []).map((w: any) => ({
    id: w.id,
    name: w.name,
    slug: w.slug,
    brandName: w.brand_name,
    plan: w.plan,
    status: w.status,
    billingMode: w.billing_mode,
    clientTier: w.client_tier,
    customDomain: w.custom_domain,
    createdAt: w.created_at,
  }));
}
