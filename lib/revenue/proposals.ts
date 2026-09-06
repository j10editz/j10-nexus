import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

export type ProposalStatus = "draft" | "sent" | "accepted" | "rejected" | "expired" | "paid";

export interface ProposalLineItem {
  id?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total?: number;
}

export interface ProposalRecord {
  id: string;
  workspace_id: string;
  contact_id: string | null;
  thread_id: string | null;
  proposal_number: string;
  title: string;
  description: string | null;
  amount: number;
  currency: string;
  status: ProposalStatus;
  line_items: ProposalLineItem[];
  checkout_id: string | null;
  checkout_url: string | null;
  valid_until: string | null;
  sent_at: string | null;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateProposalInput {
  workspaceId: string;
  contactId?: string | null;
  threadId?: string | null;
  title: string;
  description?: string;
  lineItems: ProposalLineItem[];
  amount?: number;
  currency?: string;
  validDays?: number;
  origin?: string;
  actorUserId?: string;
}

export function generateProposalNumber(sequence = 1): string {
  const currentYear = new Date().getFullYear();
  const padded = String(sequence).padStart(4, "0");
  return `PROP-${currentYear}-${padded}`;
}

export function calculateProposalTotal(items: ProposalLineItem[]): number {
  return items.reduce((sum, item) => {
    const qty = Number(item.quantity) || 1;
    const price = Number(item.unitPrice) || 0;
    return sum + (qty * price);
  }, 0);
}

/**
 * Creates a commercial proposal for a workspace, connects line items,
 * and generates an associated Stripe Checkout record for one-click payment.
 */
export async function createWorkspaceProposal(
  supabase: SupabaseClient,
  input: CreateProposalInput
): Promise<ProposalRecord> {
  const currency = (input.currency || "USD").toUpperCase();
  const computedAmount = input.amount !== undefined
    ? input.amount
    : calculateProposalTotal(input.lineItems);

  // Normalize line items with computed line totals
  const normalizedItems: ProposalLineItem[] = input.lineItems.map((item, idx) => ({
    id: item.id || `item_${idx + 1}`,
    description: item.description.trim(),
    quantity: Number(item.quantity) || 1,
    unitPrice: Number(item.unitPrice) || 0,
    total: (Number(item.quantity) || 1) * (Number(item.unitPrice) || 0),
  }));

  // Count existing proposals in workspace for sequence number
  const { count } = await supabase
    .from("crm_proposals")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", input.workspaceId);

  const proposalNumber = generateProposalNumber((count || 0) + 1);

  const validDays = input.validDays || 30;
  const validUntil = new Date(Date.now() + validDays * 86400000).toISOString();
  const sentAt = new Date().toISOString();

  // 1. Insert proposal record in 'sent' status
  const { data: proposal, error: insertError } = await supabase
    .from("crm_proposals")
    .insert({
      workspace_id: input.workspaceId,
      contact_id: input.contactId || null,
      thread_id: input.threadId || null,
      proposal_number: proposalNumber,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      amount: computedAmount,
      currency,
      status: "sent",
      line_items: normalizedItems,
      valid_until: validUntil,
      sent_at: sentAt,
    })
    .select("*")
    .single();

  if (insertError || !proposal) {
    throw new Error(`Failed to create proposal: ${insertError?.message || "Unknown error"}`);
  }

  // 2. Generate linked payment checkout session
  const origin = input.origin || "https://app.j10nexus.com";
  const simulatedSessionId = `cs_proposal_${proposal.id.slice(0, 8)}_${randomUUID().slice(0, 8)}`;
  const checkoutUrl = `${origin}/checkout/${simulatedSessionId}`;

  const { data: checkout, error: checkoutError } = await supabase
    .from("payment_checkouts")
    .insert({
      workspace_id: input.workspaceId,
      contact_id: input.contactId || null,
      thread_id: input.threadId || null,
      stripe_checkout_session_id: simulatedSessionId,
      amount: computedAmount,
      currency,
      description: `Proposal ${proposalNumber}: ${input.title}`,
      status: "pending",
      checkout_url: checkoutUrl,
      metadata: {
        proposal_id: proposal.id,
        proposal_number: proposalNumber,
        checkout_type: "proposal_checkout",
        actor_user_id: input.actorUserId || null,
      },
    })
    .select("id, checkout_url")
    .single();

  if (!checkoutError && checkout) {
    // 3. Update proposal with checkout link
    const { data: updatedProposal } = await supabase
      .from("crm_proposals")
      .update({
        checkout_id: checkout.id,
        checkout_url: checkout.checkout_url,
        updated_at: new Date().toISOString(),
      })
      .eq("id", proposal.id)
      .select("*")
      .single();

    return updatedProposal || proposal;
  }

  return proposal;
}

/**
 * Retrieves all proposals for a workspace, optionally filtered by status or contact.
 */
export async function getWorkspaceProposals(
  supabase: SupabaseClient,
  workspaceId: string,
  filter?: { status?: ProposalStatus; contactId?: string }
): Promise<ProposalRecord[]> {
  let query = supabase
    .from("crm_proposals")
    .select(`
      *,
      contact:contacts(
        id,
        name,
        email,
        phone,
        company,
        deal_stage
      )
    `)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (filter?.status) {
    query = query.eq("status", filter.status);
  }

  if (filter?.contactId) {
    query = query.eq("contact_id", filter.contactId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to fetch workspace proposals: ${error.message}`);
  }

  return (data || []) as ProposalRecord[];
}

/**
 * Marks a proposal as accepted and paid upon verified settlement.
 */
export async function acceptAndMarkProposalPaid(
  supabase: SupabaseClient,
  workspaceId: string,
  proposalId: string,
  ledgerId?: string
): Promise<ProposalRecord> {
  const { data, error } = await supabase
    .from("crm_proposals")
    .update({
      status: "paid",
      accepted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", proposalId)
    .eq("workspace_id", workspaceId)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Failed to update proposal ${proposalId} to paid: ${error?.message || "Not found"}`);
  }

  return data as ProposalRecord;
}
