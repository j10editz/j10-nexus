import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { scoreCustomerIntent } from "@/lib/whatsapp/lead-qualification";
import { createWorkspaceProposal, type ProposalRecord } from "@/lib/revenue/proposals";
import { createWorkspaceBooking, type BookingRecord } from "@/lib/revenue/bookings";

export interface ProcessLeadInput {
  workspaceId: string;
  senderPhone: string;
  customerName?: string;
  company?: string;
  message: string;
  origin?: string;
  actorUserId?: string;
  autoProposalThreshold?: number; // default 60
}

export interface RevenueLoopResult {
  success: boolean;
  contactId: string;
  threadId: string;
  inboundMessageId: string;
  qualification: {
    score: number;
    status: string;
    estimatedValue: number;
    intentSummary: string;
    suggestedNextStep: string;
    dealStage: "lead" | "qualified" | "proposal" | "won";
  };
  proposal?: ProposalRecord;
  booking?: BookingRecord;
  outboundMessageId?: string;
}

export interface ReconcilePaymentInput {
  workspaceId: string;
  checkoutId: string;
  providerEventId?: string;
  amount?: number;
  currency?: string;
}

export interface ReconcilePaymentResult {
  success: boolean;
  ledgerId: string;
  checkoutId: string;
  proposalId?: string;
  contactId?: string;
  threadId?: string;
  dealStage: "won";
  confirmationMessageId?: string;
}

/**
 * Executes the complete inbound WhatsApp revenue loop:
 * Inbound lead -> Inbox thread & message -> AI qualification -> CRM update -> Proposal & Booking generation -> Outbound response.
 */
export async function processInboundWhatsAppRevenueLoop(
  supabase: SupabaseClient,
  input: ProcessLeadInput
): Promise<RevenueLoopResult> {
  const cleanPhone = input.senderPhone.replace(/[\s()+.-]/g, "");
  const fallbackName = input.customerName?.trim() || `WhatsApp ••••${cleanPhone.slice(-4)}`;
  const threshold = input.autoProposalThreshold ?? 60;
  const origin = input.origin || "https://app.j10nexus.com";

  // 1. Resolve or create Contact
  let contactQuery = supabase
    .from("contacts")
    .select("id, name, first_name, last_name, phone, email, company, deal_stage, status, estimated_value, notes")
    .eq("workspace_id", input.workspaceId)
    .ilike("phone", `%${cleanPhone.slice(-8)}%`)
    .limit(1);

  const { data: existingContacts } = await contactQuery;
  let contact = existingContacts?.[0];

  if (!contact) {
    const { data: newContact, error: createContactErr } = await supabase
      .from("contacts")
      .insert({
        workspace_id: input.workspaceId,
        name: fallbackName,
        first_name: fallbackName,
        phone: cleanPhone,
        company: input.company?.trim() || null,
        source: "whatsapp",
        type: "Lead",
        status: "New",
        deal_stage: "lead",
        estimated_value: 0,
      })
      .select("*")
      .single();

    if (createContactErr || !newContact) {
      throw new Error(`Failed to create contact from WhatsApp lead: ${createContactErr?.message}`);
    }
    contact = newContact;
  }

  if (!contact) {
    throw new Error("Contact could not be resolved or created.");
  }

  // 2. Resolve or create Inbox Thread
  const { data: existingThreads } = await supabase
    .from("inbox_threads")
    .select("id, status, metadata, deal_stage")
    .eq("workspace_id", input.workspaceId)
    .eq("contact_id", contact.id)
    .limit(1);

  let thread = existingThreads?.[0];
  if (!thread) {
    const { data: newThread, error: createThreadErr } = await supabase
      .from("inbox_threads")
      .insert({
        workspace_id: input.workspaceId,
        contact_id: contact.id,
        channel: "whatsapp",
        priority: "medium",
        status: "active",
        unread_count: 1,
        metadata: {
          assignedSpecialist: "Sarah Chen (AI Sales Executive)",
          lastMessageSnippet: input.message.slice(0, 160),
          dealStage: contact.deal_stage || "lead",
        },
      })
      .select("*")
      .single();

    if (createThreadErr || !newThread) {
      throw new Error(`Failed to create inbox thread: ${createThreadErr?.message}`);
    }
    thread = newThread;
  }

  if (!thread) {
    throw new Error("Thread could not be resolved or created.");
  }

  // 3. Log Inbound Message
  const { data: inboundMsg, error: msgErr } = await supabase
    .from("inbox_messages")
    .insert({
      workspace_id: input.workspaceId,
      thread_id: thread.id,
      direction: "inbound",
      provider: "whatsapp",
      content: input.message,
      delivery_status: "delivered",
      message_type: "text",
      metadata: {
        senderPhone: cleanPhone,
        senderName: contact.name,
      },
    })
    .select("id")
    .single();

  if (msgErr || !inboundMsg) {
    throw new Error(`Failed to record inbound message: ${msgErr?.message}`);
  }

  // 4. AI Lead Qualification & BANT Scoring
  const scoring = scoreCustomerIntent([input.message]);
  let newDealStage: "lead" | "qualified" | "proposal" | "won" =
    scoring.score >= threshold ? "qualified" : "lead";

  const updatedNotes = [
    contact.notes,
    `[WhatsApp AI Qualification]: ${scoring.intentSummary} (Score: ${scoring.score}/100, Est. Value: $${scoring.estimatedValue})`,
  ]
    .filter(Boolean)
    .join("\n\n");

  await supabase
    .from("contacts")
    .update({
      status: scoring.status,
      estimated_value: scoring.estimatedValue,
      deal_stage: newDealStage,
      notes: updatedNotes,
      last_contacted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", contact.id)
    .eq("workspace_id", input.workspaceId);

  await supabase
    .from("inbox_threads")
    .update({
      last_message_at: new Date().toISOString(),
      unread_count: 1,
      metadata: {
        ...(thread.metadata || {}),
        lastMessageSnippet: input.message.slice(0, 160),
        dealStage: newDealStage,
        estimatedValue: scoring.estimatedValue,
      },
    })
    .eq("id", thread.id)
    .eq("workspace_id", input.workspaceId);

  // 5. If High Commercial Intent (score >= threshold), Generate Proposal & Booking
  let proposal: ProposalRecord | undefined;
  let booking: BookingRecord | undefined;
  let outboundMessageId: string | undefined;

  if (scoring.score >= threshold) {
    newDealStage = "proposal";

    // A. Generate Proposal
    proposal = await createWorkspaceProposal(supabase, {
      workspaceId: input.workspaceId,
      contactId: contact.id,
      threadId: thread.id,
      title: `${contact.name} — Autonomous AI Enterprise Operating System`,
      description: `Tailored commercial deployment for ${contact.company || contact.name}.`,
      amount: scoring.estimatedValue,
      currency: "USD",
      lineItems: [
        {
          description: "J10 NEXUS Core Autonomous Workforce License",
          quantity: 1,
          unitPrice: Math.round(scoring.estimatedValue * 0.6),
        },
        {
          description: "Enterprise WhatsApp Business Infrastructure & AI Integration",
          quantity: 1,
          unitPrice: Math.round(scoring.estimatedValue * 0.4),
        },
      ],
      origin,
      actorUserId: input.actorUserId,
    });

    // B. Generate Executive Walkthrough Booking (2 days out at 14:00 UTC)
    const bookingDate = new Date();
    bookingDate.setDate(bookingDate.getDate() + 2);
    bookingDate.setUTCHours(14, 0, 0, 0);

    booking = await createWorkspaceBooking(supabase, {
      workspaceId: input.workspaceId,
      contactId: contact.id,
      threadId: thread.id,
      proposalId: proposal.id,
      title: `Executive Walkthrough: ${contact.name}`,
      bookingType: "executive_walkthrough",
      scheduledAt: bookingDate.toISOString(),
      durationMinutes: 45,
      notes: `AI-scheduled executive walkthrough following inbound qualification (Score: ${scoring.score}).`,
    });

    // C. Transition Contact & Thread to 'proposal'
    await supabase
      .from("contacts")
      .update({
        deal_stage: "proposal",
        updated_at: new Date().toISOString(),
      })
      .eq("id", contact.id)
      .eq("workspace_id", input.workspaceId);

    await supabase
      .from("inbox_threads")
      .update({
        metadata: {
          ...(thread.metadata || {}),
          dealStage: "proposal",
          proposalId: proposal.id,
          bookingId: booking.id,
        },
      })
      .eq("id", thread.id)
      .eq("workspace_id", input.workspaceId);

    // D. Dispatch Outbound Proposal and Booking Link into Conversation
    const formattedAmount = proposal.amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    const replyContent = `Hello ${contact.name}, thank you for contacting J10 NEXUS. Based on your inquiry, we have prepared proposal ${proposal.proposal_number} ($${formattedAmount} USD). Review terms and activate checkout here: ${proposal.checkout_url}. We have also reserved an Executive Walkthrough for you: ${booking.meeting_url}`;

    const { data: outboundMsg } = await supabase
      .from("inbox_messages")
      .insert({
        workspace_id: input.workspaceId,
        thread_id: thread.id,
        direction: "outbound",
        provider: "whatsapp",
        content: replyContent,
        delivery_status: "delivered",
        message_type: "proposal",
        metadata: {
          proposalId: proposal.id,
          proposalNumber: proposal.proposal_number,
          bookingId: booking.id,
          checkoutUrl: proposal.checkout_url,
        },
      })
      .select("id")
      .single();

    outboundMessageId = outboundMsg?.id;
  }

  return {
    success: true,
    contactId: contact.id,
    threadId: thread.id,
    inboundMessageId: inboundMsg.id,
    qualification: {
      score: scoring.score,
      status: scoring.status,
      estimatedValue: scoring.estimatedValue,
      intentSummary: scoring.intentSummary,
      suggestedNextStep: scoring.suggestedNextStep,
      dealStage: newDealStage,
    },
    proposal,
    booking,
    outboundMessageId,
  };
}

/**
 * Reconciles a completed Stripe payment with the revenue loop:
 * Records verified payment in payment_ledger, updates proposal to paid,
 * transitions deal stage to won, and logs confirmation in the inbox thread.
 */
export async function reconcileRevenueLoopPayment(
  supabase: SupabaseClient,
  input: ReconcilePaymentInput
): Promise<ReconcilePaymentResult> {
  // 1. Look up checkout record
  const { data: checkout, error: checkoutErr } = await supabase
    .from("payment_checkouts")
    .select("*")
    .eq("id", input.checkoutId)
    .eq("workspace_id", input.workspaceId)
    .single();

  if (checkoutErr || !checkout) {
    throw new Error(`Checkout ${input.checkoutId} not found in workspace: ${checkoutErr?.message}`);
  }

  const amount = input.amount !== undefined ? input.amount : Number(checkout.amount);
  const currency = (input.currency || checkout.currency || "USD").toUpperCase();
  const eventId = input.providerEventId || `evt_rev_loop_${randomUUID().slice(0, 12)}`;

  // 2. Insert immutable record into payment_ledger
  const { data: ledgerEntry, error: ledgerErr } = await supabase
    .from("payment_ledger")
    .insert({
      workspace_id: input.workspaceId,
      checkout_id: checkout.id,
      provider: "stripe",
      provider_event_id: eventId,
      event_type: "checkout.session.completed",
      amount,
      currency,
      status: "succeeded",
      occurred_at: new Date().toISOString(),
      metadata: {
        reconciled_via: "tier1_revenue_loop",
        checkout_metadata: checkout.metadata,
      },
    })
    .select("id")
    .single();

  if (ledgerErr || !ledgerEntry) {
    throw new Error(`Failed to write payment ledger entry: ${ledgerErr?.message}`);
  }

  // 3. Mark checkout paid
  await supabase
    .from("payment_checkouts")
    .update({
      status: "paid",
      updated_at: new Date().toISOString(),
    })
    .eq("id", checkout.id);

  // 4. Update linked Proposal if exists
  const proposalId = checkout.metadata?.proposal_id;
  let resolvedProposalId: string | undefined;

  if (proposalId) {
    await supabase
      .from("crm_proposals")
      .update({
        status: "paid",
        accepted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", proposalId)
      .eq("workspace_id", input.workspaceId);

    resolvedProposalId = proposalId;
  } else {
    // Check if proposal references this checkout
    const { data: prop } = await supabase
      .from("crm_proposals")
      .select("id")
      .eq("checkout_id", checkout.id)
      .eq("workspace_id", input.workspaceId)
      .maybeSingle();

    if (prop) {
      await supabase
        .from("crm_proposals")
        .update({
          status: "paid",
          accepted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", prop.id);

      resolvedProposalId = prop.id;
    }
  }

  // 5. Advance Contact to 'won' and 'Customer'
  const contactId = checkout.contact_id;
  if (contactId) {
    await supabase
      .from("contacts")
      .update({
        deal_stage: "won",
        status: "Won",
        type: "Customer",
        updated_at: new Date().toISOString(),
      })
      .eq("id", contactId)
      .eq("workspace_id", input.workspaceId);
  }

  // 6. Advance Thread to 'won' and post confirmation message
  const threadId = checkout.thread_id;
  let confirmationMessageId: string | undefined;

  if (threadId) {
    const formattedAmount = amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const confirmationText = `Payment of $${formattedAmount} ${currency} verified via Stripe. Payment ledger record ${ledgerEntry.id} logged. Deal stage advanced to Won.`;

    const { data: confMsg } = await supabase
      .from("inbox_messages")
      .insert({
        workspace_id: input.workspaceId,
        thread_id: threadId,
        direction: "outbound",
        provider: "stripe",
        external_message_id: eventId,
        content: confirmationText,
        delivery_status: "delivered",
        message_type: "system",
        metadata: {
          ledgerId: ledgerEntry.id,
          amount,
          currency,
          dealStage: "won",
          proposalId: resolvedProposalId,
        },
      })
      .select("id")
      .single();

    confirmationMessageId = confMsg?.id;

    await supabase
      .from("inbox_threads")
      .update({
        last_message_at: new Date().toISOString(),
        metadata: {
          dealStage: "won",
          lastMessageSnippet: confirmationText,
          ledgerId: ledgerEntry.id,
        },
      })
      .eq("id", threadId)
      .eq("workspace_id", input.workspaceId);
  }

  return {
    success: true,
    ledgerId: ledgerEntry.id,
    checkoutId: checkout.id,
    proposalId: resolvedProposalId,
    contactId,
    threadId,
    dealStage: "won",
    confirmationMessageId,
  };
}
