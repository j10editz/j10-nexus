import type { SupabaseClient } from "@supabase/supabase-js";

export interface WorkspaceBranding {
  brandName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  accentColor: string;
  whiteLabelEnabled: boolean;
  portalTitle: string | null;
  portalWelcomeMessage: string | null;
  customDomain: string | null;
  customDomainStatus: string;
}

export interface UpdateBrandingInput {
  brandName?: string;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  primaryColor?: string;
  accentColor?: string;
  whiteLabelEnabled?: boolean;
  portalTitle?: string | null;
  portalWelcomeMessage?: string | null;
}

const HEX_COLOR_REGEX = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;

export function isValidHexColor(color: string): boolean {
  return HEX_COLOR_REGEX.test(color.trim());
}

/**
 * Retrieves white-label branding configuration for a workspace.
 */
export async function getWorkspaceBranding(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<WorkspaceBranding> {
  const { data, error } = await supabase
    .from("workspaces")
    .select("brand_name, logo_url, favicon_url, primary_color, accent_color, white_label_enabled, portal_title, portal_welcome_message, custom_domain, custom_domain_status")
    .eq("id", workspaceId)
    .single();

  if (error || !data) {
    throw new Error(`Failed to fetch workspace branding: ${error?.message || "Not found"}`);
  }

  return {
    brandName: data.brand_name || "J10 NEXUS",
    logoUrl: data.logo_url || null,
    faviconUrl: data.favicon_url || null,
    primaryColor: data.primary_color || "#10B981",
    accentColor: data.accent_color || "#3B82F6",
    whiteLabelEnabled: Boolean(data.white_label_enabled),
    portalTitle: data.portal_title || null,
    portalWelcomeMessage: data.portal_welcome_message || null,
    customDomain: data.custom_domain || null,
    customDomainStatus: data.custom_domain_status || "unconfigured",
  };
}

/**
 * Updates white-label branding settings with validation and entitlement enforcement.
 */
export async function updateWorkspaceBranding(
  supabase: SupabaseClient,
  workspaceId: string,
  input: UpdateBrandingInput,
  plan = "growth"
): Promise<WorkspaceBranding> {
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (input.brandName !== undefined) {
    updates.brand_name = input.brandName.trim();
  }

  if (input.logoUrl !== undefined) {
    updates.logo_url = input.logoUrl?.trim() || null;
  }

  if (input.faviconUrl !== undefined) {
    updates.favicon_url = input.faviconUrl?.trim() || null;
  }

  if (input.primaryColor !== undefined) {
    const clean = input.primaryColor.trim();
    if (!isValidHexColor(clean)) {
      throw new Error(`Invalid primaryColor '${input.primaryColor}'. Must be valid hex (e.g. #10B981).`);
    }
    updates.primary_color = clean;
  }

  if (input.accentColor !== undefined) {
    const clean = input.accentColor.trim();
    if (!isValidHexColor(clean)) {
      throw new Error(`Invalid accentColor '${input.accentColor}'. Must be valid hex (e.g. #3B82F6).`);
    }
    updates.accent_color = clean;
  }

  if (input.whiteLabelEnabled !== undefined) {
    // Entitlement assertion: Starter cannot remove J10 branding
    if (input.whiteLabelEnabled && plan === "starter") {
      throw new Error("Full white-label branding requires Growth or Enterprise subscription plan.");
    }
    updates.white_label_enabled = input.whiteLabelEnabled;
  }

  if (input.portalTitle !== undefined) {
    updates.portal_title = input.portalTitle?.trim() || null;
  }

  if (input.portalWelcomeMessage !== undefined) {
    updates.portal_welcome_message = input.portalWelcomeMessage?.trim() || null;
  }

  const { data, error } = await supabase
    .from("workspaces")
    .update(updates)
    .eq("id", workspaceId)
    .select("brand_name, logo_url, favicon_url, primary_color, accent_color, white_label_enabled, portal_title, portal_welcome_message, custom_domain, custom_domain_status")
    .single();

  if (error || !data) {
    throw new Error(`Failed to update workspace branding: ${error?.message || "Not found"}`);
  }

  return {
    brandName: data.brand_name,
    logoUrl: data.logo_url,
    faviconUrl: data.favicon_url,
    primaryColor: data.primary_color,
    accentColor: data.accent_color,
    whiteLabelEnabled: Boolean(data.white_label_enabled),
    portalTitle: data.portal_title,
    portalWelcomeMessage: data.portal_welcome_message,
    customDomain: data.custom_domain,
    customDomainStatus: data.custom_domain_status,
  };
}
