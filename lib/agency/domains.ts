import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

export interface DomainRecord {
  id: string;
  workspace_id: string;
  domain: string;
  verification_token: string;
  dns_cname_target: string;
  status: "pending" | "verified" | "active" | "failed" | "revoked";
  ssl_status: "pending" | "issued" | "expired" | "error";
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DnsInstruction {
  type: "CNAME" | "TXT";
  name: string;
  value: string;
  purpose: string;
}

export interface RegisterDomainResult {
  success: boolean;
  domain: DomainRecord;
  dnsInstructions: DnsInstruction[];
}

const DOMAIN_REGEX = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

export function normalizeDomain(rawDomain: string): string {
  return rawDomain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "");
}

export function isValidDomain(domain: string): boolean {
  return DOMAIN_REGEX.test(domain);
}

/**
 * Registers a new custom domain for a workspace and generates DNS challenge records.
 */
export async function registerCustomDomain(
  supabase: SupabaseClient,
  workspaceId: string,
  rawDomain: string,
  plan = "growth"
): Promise<RegisterDomainResult> {
  // Plan entitlement check
  if (plan === "starter") {
    throw new Error("Custom domains require a Growth or Enterprise subscription plan.");
  }

  const domain = normalizeDomain(rawDomain);
  if (!isValidDomain(domain)) {
    throw new Error(`'${rawDomain}' is not a valid fully-qualified domain name (FQDN).`);
  }

  const verificationToken = `j10-verify-${randomUUID().slice(0, 16)}`;
  const cnameTarget = "cname.j10nexus.com";

  // 1. Insert into workspace_domains
  const { data: domainRecord, error: insertError } = await supabase
    .from("workspace_domains")
    .insert({
      workspace_id: workspaceId,
      domain,
      verification_token: verificationToken,
      dns_cname_target: cnameTarget,
      status: "pending",
      ssl_status: "pending",
    })
    .select("*")
    .single();

  if (insertError || !domainRecord) {
    if (insertError?.code === "23505") {
      throw new Error(`Domain '${domain}' is already registered.`);
    }
    throw new Error(`Failed to register custom domain: ${insertError?.message || "Unknown error"}`);
  }

  // 2. Update workspace record with domain and pending status
  await supabase
    .from("workspaces")
    .update({
      custom_domain: domain,
      custom_domain_status: "pending_verification",
      updated_at: new Date().toISOString(),
    })
    .eq("id", workspaceId);

  const dnsInstructions: DnsInstruction[] = [
    {
      type: "CNAME",
      name: domain,
      value: cnameTarget,
      purpose: "Traffic routing & CDN acceleration",
    },
    {
      type: "TXT",
      name: `_j10-challenge.${domain}`,
      value: verificationToken,
      purpose: "Domain ownership validation & SSL provisioning",
    },
  ];

  return {
    success: true,
    domain: domainRecord as DomainRecord,
    dnsInstructions,
  };
}

/**
 * Verifies DNS ownership and issues active SSL status.
 * Requires genuine DNS TXT ownership challenge and CNAME target verification.
 * If DNS records are missing or incorrect, retains pending status honestly.
 */
export async function verifyCustomDomainDns(
  supabase: SupabaseClient,
  workspaceId: string,
  domainId: string,
  options?: {
    dnsChecker?: (
      domain: string,
      token: string,
      cname: string
    ) => Promise<{ txtVerified: boolean; cnameVerified: boolean }>;
  }
): Promise<DomainRecord> {
  const { data: existing, error: fetchError } = await supabase
    .from("workspace_domains")
    .select("*")
    .eq("id", domainId)
    .eq("workspace_id", workspaceId)
    .single();

  if (fetchError || !existing) {
    throw new Error(`Custom domain record not found in workspace.`);
  }

  let isTxtValid = false;
  let isCnameValid = false;

  if (options?.dnsChecker) {
    const res = await options.dnsChecker(
      existing.domain,
      existing.verification_token,
      existing.dns_cname_target
    );
    isTxtValid = res.txtVerified;
    isCnameValid = res.cnameVerified;
  } else {
    try {
      const { resolveTxt, resolveCname } = await import("node:dns/promises");

      try {
        const txtRecords = await resolveTxt(`_j10-challenge.${existing.domain}`);
        const flattened = txtRecords.flat().join(" ");
        if (flattened.includes(existing.verification_token)) {
          isTxtValid = true;
        }
      } catch {
        isTxtValid = false;
      }

      try {
        const cnameRecords = await resolveCname(existing.domain);
        if (
          cnameRecords.some(
            (c) => c.toLowerCase() === existing.dns_cname_target.toLowerCase()
          )
        ) {
          isCnameValid = true;
        }
      } catch {
        isCnameValid = false;
      }
    } catch {
      isTxtValid = false;
      isCnameValid = false;
    }
  }

  const now = new Date().toISOString();

  // If DNS verification fails, retain pending status honestly
  if (!isTxtValid || !isCnameValid) {
    const { data: updatedPending } = await supabase
      .from("workspace_domains")
      .update({
        status: "pending",
        ssl_status: "pending",
        updated_at: now,
      })
      .eq("id", domainId)
      .select("*")
      .single();

    await supabase
      .from("workspaces")
      .update({
        custom_domain_status: "pending_verification",
        updated_at: now,
      })
      .eq("id", workspaceId);

    return (updatedPending || existing) as DomainRecord;
  }

  // Both TXT and CNAME verified: advance to active and SSL to issued
  const { data: updated, error: updateError } = await supabase
    .from("workspace_domains")
    .update({
      status: "active",
      ssl_status: "issued",
      verified_at: now,
      updated_at: now,
    })
    .eq("id", domainId)
    .select("*")
    .single();

  if (updateError || !updated) {
    throw new Error(`Failed to verify custom domain: ${updateError?.message}`);
  }

  await supabase
    .from("workspaces")
    .update({
      custom_domain_status: "verified",
      updated_at: now,
    })
    .eq("id", workspaceId);

  return updated as DomainRecord;
}

/**
 * Removes a custom domain from a workspace.
 */
export async function removeCustomDomain(
  supabase: SupabaseClient,
  workspaceId: string,
  domainId: string
): Promise<{ success: boolean }> {
  const { data: domain } = await supabase
    .from("workspace_domains")
    .select("domain")
    .eq("id", domainId)
    .eq("workspace_id", workspaceId)
    .single();

  const { error: deleteError } = await supabase
    .from("workspace_domains")
    .delete()
    .eq("id", domainId)
    .eq("workspace_id", workspaceId);

  if (deleteError) {
    throw new Error(`Failed to remove custom domain: ${deleteError.message}`);
  }

  // Clear workspace custom_domain if it matched
  if (domain?.domain) {
    await supabase
      .from("workspaces")
      .update({
        custom_domain: null,
        custom_domain_status: "unconfigured",
        updated_at: new Date().toISOString(),
      })
      .eq("id", workspaceId)
      .eq("custom_domain", domain.domain);
  }

  return { success: true };
}

/**
 * Resolves a workspace by its custom domain or fallback slug.
 */
export async function resolveWorkspaceByHostname(
  supabase: SupabaseClient,
  hostname: string
): Promise<{ id: string; name: string; slug: string; brandName: string } | null> {
  const clean = normalizeDomain(hostname);

  // 1. Check verified custom domain
  const { data: byDomain } = await supabase
    .from("workspaces")
    .select("id, name, slug, brand_name")
    .eq("custom_domain", clean)
    .eq("custom_domain_status", "verified")
    .maybeSingle();

  if (byDomain) {
    return {
      id: byDomain.id,
      name: byDomain.name,
      slug: byDomain.slug,
      brandName: byDomain.brand_name,
    };
  }

  // 2. Check slug match
  const slugPart = clean.split(".")[0];
  const { data: bySlug } = await supabase
    .from("workspaces")
    .select("id, name, slug, brand_name")
    .eq("slug", slugPart)
    .maybeSingle();

  if (bySlug) {
    return {
      id: bySlug.id,
      name: bySlug.name,
      slug: bySlug.slug,
      brandName: bySlug.brand_name,
    };
  }

  return null;
}
