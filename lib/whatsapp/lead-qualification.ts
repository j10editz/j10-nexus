import type { SupabaseClient } from "@supabase/supabase-js";

export type LeadQualificationResult = {
  success: boolean;
  contactId: string;
  isNew: boolean;
  firstName: string;
  phone: string;
  type: "Lead" | "Prospect" | "Customer";
  status: "New" | "Contacted" | "Qualified" | "Interested" | "Won" | "Lost";
  estimatedValue: number;
  qualificationScore: number;
  intentSummary: string;
  suggestedNextStep: string;
};

export type QualifyLeadInput = {
  senderPhone: string;
  customerName?: string;
  messages: string[];
};

export function scoreCustomerIntent(messages: string[]): {
  score: number;
  status: "New" | "Contacted" | "Qualified" | "Interested";
  estimatedValue: number;
  intentSummary: string;
  suggestedNextStep: string;
} {
  const combinedText = messages.join(" ").toLowerCase();

  const highBuyingSignals = /\b(pricing|price|cost|quote|enterprise|buy|purchase|contract|license|hire|custom plan)\b/i;
  const evaluationSignals = /\b(features|demo|how it works|compare|integrate|api|capabilities|trial)\b/i;
  const supportSignals = /\b(help|issue|bug|error|problem|how do i|question)\b/i;

  let score = 25; // baseline lead
  let status: "New" | "Contacted" | "Qualified" | "Interested" = "New";
  let estimatedValue = 250;
  let intentSummary = "General WhatsApp inquiry";
  let suggestedNextStep = "Reply and offer product consultation.";

  if (highBuyingSignals.test(combinedText)) {
    score = 85;
    status = "Qualified";
    estimatedValue = 2500;
    intentSummary = "High buying intent: Inquired about pricing, plans, or commercial terms.";
    suggestedNextStep = "Send tailored proposal and schedule an executive walkthrough.";
  } else if (evaluationSignals.test(combinedText)) {
    score = 65;
    status = "Interested";
    estimatedValue = 1000;
    intentSummary = "Product evaluation: Interested in capabilities, demo, or integrations.";
    suggestedNextStep = "Provide interactive demo link and feature breakdown.";
  } else if (supportSignals.test(combinedText)) {
    score = 40;
    status = "Contacted";
    estimatedValue = 300;
    intentSummary = "Support / usage inquiry: Needs guidance on specific capability.";
    suggestedNextStep = "Address question promptly using verified Knowledge Hub documentation.";
  }

  return {
    score,
    status,
    estimatedValue,
    intentSummary,
    suggestedNextStep,
  };
}

/**
 * Qualifies a WhatsApp sender and safely links or creates a CRM contact record in Supabase.
 */
export async function qualifyAndSyncWhatsAppLead(
  supabase: SupabaseClient,
  userId: string,
  input: QualifyLeadInput,
  origin = "http://localhost:3000",
): Promise<LeadQualificationResult> {
  const cleanPhone = input.senderPhone.replace(/[\s()+.-]/g, "");
  const fallbackName = input.customerName?.trim() || `WhatsApp ••••${cleanPhone.slice(-4)}`;

  const scoring = scoreCustomerIntent(input.messages);

  // 1. Look for existing contact with this phone number
  const { data: existingContacts } = await supabase
    .from("crm_contacts")
    .select("id,first_name,last_name,type,status,estimated_value,notes")
    .eq("user_id", userId)
    .ilike("phone", `%${cleanPhone.slice(-8)}%`)
    .limit(1);

  const existing = existingContacts?.[0];

  if (existing) {
    // Update existing contact
    const updatedStatus = existing.status === "New" ? scoring.status : existing.status;
    const updatedValue = Math.max(Number(existing.estimated_value || 0), scoring.estimatedValue);
    const updatedNotes = [
      existing.notes,
      `[WhatsApp AI Qualification ${new Date().toLocaleDateString()}]: ${scoring.intentSummary} (Score: ${scoring.score}/100)`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const { error: updateError } = await supabase
      .from("crm_contacts")
      .update({
        status: updatedStatus,
        estimated_value: updatedValue,
        notes: updatedNotes,
        last_contacted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .eq("user_id", userId);

    if (updateError) {
      console.warn("Could not update CRM contact from WhatsApp lead:", updateError);
    }

    return {
      success: true,
      contactId: existing.id,
      isNew: false,
      firstName: existing.first_name,
      phone: cleanPhone,
      type: existing.type as "Lead" | "Prospect" | "Customer",
      status: updatedStatus as "New" | "Contacted" | "Qualified" | "Interested" | "Won" | "Lost",
      estimatedValue: updatedValue,
      qualificationScore: scoring.score,
      intentSummary: scoring.intentSummary,
      suggestedNextStep: scoring.suggestedNextStep,
    };
  }

  // 2. Create new contact
  const { data: newContact, error: insertError } = await supabase
    .from("crm_contacts")
    .insert({
      user_id: userId,
      first_name: fallbackName,
      last_name: null,
      phone: cleanPhone,
      company: null,
      type: "Lead",
      status: scoring.status,
      source: "WhatsApp",
      estimated_value: scoring.estimatedValue,
      notes: `[WhatsApp AI Lead Capture]: ${scoring.intentSummary} (Score: ${scoring.score}/100)\nNext step: ${scoring.suggestedNextStep}`,
      last_contacted_at: new Date().toISOString(),
    })
    .select("id,first_name,phone,type,status,estimated_value")
    .single();

  if (insertError || !newContact) {
    throw new Error(`Failed to create CRM contact from WhatsApp lead: ${insertError?.message || "Unknown error"}`);
  }

  // 3. Dispatch automation trigger for downstream workflows
  try {
    const { dispatchAutomationEvent } = await import("@/lib/automation/event-trigger-engine");
    await dispatchAutomationEvent({
      supabase,
      userId,
      origin,
      cookieHeader: "",
      triggerType: "new_crm_contact",
      payload: {
        contactId: newContact.id,
        name: newContact.first_name,
        phone: cleanPhone,
        source: "WhatsApp",
        status: scoring.status,
        estimatedValue: scoring.estimatedValue,
        qualificationScore: scoring.score,
      },
      originAutomationId: null,
      parentDepth: 0,
      eventId: `wa-lead-${newContact.id}-${Date.now()}`,
      dedupeKey: `wa-crm-contact-${newContact.id}`,
    });
  } catch (eventError) {
    console.warn("Workflow dispatch for new_crm_contact failed non-blockingly:", eventError);
  }

  return {
    success: true,
    contactId: newContact.id,
    isNew: true,
    firstName: newContact.first_name,
    phone: cleanPhone,
    type: "Lead",
    status: scoring.status,
    estimatedValue: scoring.estimatedValue,
    qualificationScore: scoring.score,
    intentSummary: scoring.intentSummary,
    suggestedNextStep: scoring.suggestedNextStep,
  };
}
