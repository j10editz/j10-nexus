import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ServiceLifecycleStatus,
  ServicePlaybook,
  ExtractedServiceIntent,
  ServiceConversionJourneyRecord,
  ServiceConversionMetrics,
} from "./types";

export type { ServiceLifecycleStatus, ServiceConversionMetrics, ExtractedServiceIntent, ServiceConversionJourneyRecord };
import { defaultPlaybook } from "./playbooks/registry";

/**
 * Extracts numeric price ONLY from configured service price.
 * Never invents values. Returns null if price is custom, missing, or non-numeric.
 */
export function extractConfiguredPrice(price?: string | number | null): number | null {
  if (price === null || price === undefined) return null;
  if (typeof price === "number") {
    return Number.isFinite(price) && price >= 0 ? price : null;
  }
  if (typeof price !== "string") return null;
  const trimmed = price.trim().toLowerCase();
  if (trimmed === "free" || trimmed === "complimentary") return 0;
  if (trimmed.includes("quote") || trimmed.includes("varies") || trimmed.includes("custom")) {
    return null;
  }
  const match = trimmed.match(/(?:[\$€£])?\s*(\d+(?:\.\d{1,2})?)/);
  if (match && match[1]) {
    const parsed = parseFloat(match[1]);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Deterministically extracts service intent based on the active playbook.
 * Never invents service pricing or external meeting URLs.
 */
export function extractServiceIntent(args: {
  text: string;
  playbook?: ServicePlaybook;
  bookingLink?: string | null;
  replyText?: string | null;
}): ExtractedServiceIntent {
  const { text, replyText, bookingLink } = args;
  const playbook = args.playbook || defaultPlaybook;
  const lower = text.toLowerCase();

  // 1. Identify Service from Playbook Catalog
  let requestedService: string | null = null;
  let serviceKey: string | null = null;
  let estimatedServiceValue: number | null = null;
  let isQuoteRequired = false;

  for (const s of playbook.services) {
    if (s.name && lower.includes(s.name.toLowerCase())) {
      requestedService = s.name;
      serviceKey = s.key;
      estimatedServiceValue = extractConfiguredPrice(s.price);
      isQuoteRequired = Boolean(s.requiresQuote || estimatedServiceValue === null);
      break;
    }
  }

  // 2. Identify Preferred Date
  let preferredDate: string | null = null;
  const isoDateMatch = text.match(/\b(202\d-[01]\d-[0-3]\d)\b/);
  if (isoDateMatch) {
    preferredDate = isoDateMatch[1];
  } else if (lower.includes("today")) {
    preferredDate = new Date().toISOString().split("T")[0];
  } else if (lower.includes("tomorrow")) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    preferredDate = tomorrow.toISOString().split("T")[0];
  } else {
    const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    for (let i = 0; i < days.length; i++) {
      if (lower.includes(days[i])) {
        const today = new Date();
        const currentDay = today.getDay();
        const diff = (i + 7 - currentDay) % 7 || 7;
        const target = new Date(today);
        target.setDate(today.getDate() + diff);
        preferredDate = target.toISOString().split("T")[0];
        break;
      }
    }
  }

  // 3. Identify Preferred Time / Window
  let preferredTime: string | null = null;
  const timeMatch = text.match(/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i);
  if (timeMatch) {
    preferredTime = timeMatch[1].toUpperCase();
  } else if (lower.includes("morning")) {
    preferredTime = "Morning";
  } else if (lower.includes("afternoon")) {
    preferredTime = "Afternoon";
  } else if (lower.includes("evening")) {
    preferredTime = "Evening";
  }

  // 4. Check for escalation keywords from playbook
  let humanHandoffRequested = false;
  let humanHandoffReason: string | undefined;

  const escalationKeywords = playbook.escalationKeywords || [];
  for (const kw of escalationKeywords) {
    if (lower.includes(kw.toLowerCase())) {
      humanHandoffRequested = true;
      humanHandoffReason = `Customer message triggered escalation keyword: "${kw}"`;
      break;
    }
  }

  // 5. Calculate Qualification Completeness
  let completeness = 0.0;
  const missingFields: string[] = [];

  if (requestedService) {
    completeness += 0.4;
  } else {
    missingFields.push("service");
  }

  if (preferredDate) {
    completeness += 0.3;
  } else {
    missingFields.push("date");
  }

  if (preferredTime) {
    completeness += 0.3;
  } else {
    missingFields.push("time");
  }

  // 6. Booking link offered check
  const offeredBookingLink = Boolean(
    (bookingLink && replyText?.includes(bookingLink)) ||
    (bookingLink && lower.includes("book"))
  );

  // 7. Suggested status
  let suggestedStatus: ServiceLifecycleStatus = "contacted";
  if (humanHandoffRequested) {
    suggestedStatus = "human_takeover";
  } else if (offeredBookingLink) {
    suggestedStatus = "booking_offered";
  } else if (completeness >= 0.7) {
    suggestedStatus = "qualified";
  }

  return {
    playbookKey: playbook.playbookKey,
    requestedService,
    serviceKey,
    preferredDate,
    preferredTime,
    estimatedServiceValue,
    isQuoteRequired,
    qualificationCompleteness: Math.min(1.0, parseFloat(completeness.toFixed(2))),
    missingRequiredFields: missingFields,
    offeredBookingLink,
    suggestedStatus,
    humanHandoffRequested,
    humanHandoffReason,
  };
}

/**
 * Updates service conversion journey and records auditable transition events idempotently.
 * Fails closed and is strictly workspace-scoped.
 */
export async function updateServiceJourneyLifecycleState(
  supabase: SupabaseClient,
  args: {
    workspaceId: string;
    threadId: string;
    contactId?: string | null;
    status?: ServiceLifecycleStatus;
    requestedService?: string | null;
    preferredDate?: string | null;
    preferredTime?: string | null;
    estimatedServiceValue?: number | null;
    qualificationCompleteness?: number;
    bookingOfferedAt?: string | null;
    bookingConfirmationSource?: string | null;
    humanTakeoverReason?: string | null;
    actorType: "system" | "ai_assistant" | "operator";
    actorId?: string | null;
    reason?: string;
  }
): Promise<ServiceConversionJourneyRecord | null> {
  const { workspaceId, threadId, actorType, actorId, reason } = args;

  // 1. Fetch current journey state
  const { data: current } = await supabase
    .from("service_conversion_journeys")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("thread_id", threadId)
    .maybeSingle();

  if (!current) return null;

  const newStatus = args.status || current.status;
  const statusChanged = newStatus !== current.status;

  const updateFields: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (args.status) updateFields.status = args.status;
  if (args.requestedService) updateFields.requested_service = args.requestedService;
  if (args.preferredDate) updateFields.preferred_date = args.preferredDate;
  if (args.preferredTime) updateFields.preferred_time = args.preferredTime;
  if (args.estimatedServiceValue !== undefined) {
    updateFields.estimated_service_value = args.estimatedServiceValue;
  }
  if (args.qualificationCompleteness !== undefined) {
    updateFields.qualification_completeness = args.qualificationCompleteness;
  }
  if (args.bookingOfferedAt) updateFields.booking_offered_at = args.bookingOfferedAt;
  if (args.bookingConfirmationSource) {
    updateFields.booking_confirmation_source = args.bookingConfirmationSource;
  }
  if (args.humanTakeoverReason) {
    updateFields.human_takeover_reason = args.humanTakeoverReason;
  }

  // 2. Commit journey update
  const { data: updated, error: updateError } = await supabase
    .from("service_conversion_journeys")
    .update(updateFields)
    .eq("id", current.id)
    .eq("workspace_id", workspaceId)
    .select()
    .single();

  if (updateError) {
    console.error("[Service Journey] Update failed:", updateError);
    return null;
  }

  // 3. If status changed, record auditable transition
  if (statusChanged) {
    await supabase.from("service_conversion_events").insert({
      workspace_id: workspaceId,
      journey_id: current.id,
      from_status: current.status,
      to_status: newStatus,
      reason: reason || `Transitioned to ${newStatus}`,
      actor_type: actorType,
      actor_id: actorId || null,
      metadata: {
        requested_service: updated.requested_service,
        estimated_service_value: updated.estimated_service_value,
      },
    });

    // 4. Cancel pending followups if journey enters a terminal state (booked, lost, or human_takeover)
    if (newStatus === "booked" || newStatus === "lost" || newStatus === "human_takeover") {
      await supabase
        .from("service_followups")
        .update({
          status: "cancelled",
          cancel_reason: `lifecycle_transition_to_${newStatus}`,
          updated_at: new Date().toISOString(),
        })
        .eq("workspace_id", workspaceId)
        .eq("journey_id", current.id)
        .eq("status", "scheduled");
    }
  }

  return updated as ServiceConversionJourneyRecord;
}

/**
 * Allows an authorized operator to resume AI assistance on a service thread.
 */
export async function operatorResumeJourneyAi(
  supabase: SupabaseClient,
  args: {
    workspaceId: string;
    threadId: string;
    operatorUserId: string;
  }
) {
  const { workspaceId, threadId, operatorUserId } = args;

  // 1. Verify operator membership
  const { data: member } = await supabase
    .from("workspace_memberships")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", operatorUserId)
    .maybeSingle();

  if (!member || member.role === "suspended" || member.role === "removed") {
    throw new Error("Unauthorized: operator lacks active workspace membership");
  }

  // 2. Fetch thread
  const { data: thread } = await supabase
    .from("inbox_threads")
    .select("id, metadata")
    .eq("id", threadId)
    .eq("workspace_id", workspaceId)
    .single();

  if (!thread) throw new Error("Thread not found in workspace");

  const meta = (thread.metadata || {}) as Record<string, any>;

  // 3. Update thread to re-enable AI
  await supabase
    .from("inbox_threads")
    .update({
      metadata: {
        ...meta,
        aiBotEnabled: true,
        humanHandoff: false,
        resumedByUserId: operatorUserId,
        resumedAt: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", threadId)
    .eq("workspace_id", workspaceId);

  // 4. Update journey state back to contacted or qualified
  const { data: journey } = await supabase
    .from("service_conversion_journeys")
    .select("*")
    .eq("thread_id", threadId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (journey && journey.status === "human_takeover") {
    const resumeStatus: ServiceLifecycleStatus =
      journey.qualification_completeness >= 0.7 ? "qualified" : "contacted";

    await updateServiceJourneyLifecycleState(supabase, {
      workspaceId,
      threadId,
      status: resumeStatus,
      actorType: "operator",
      actorId: operatorUserId,
      reason: "Operator manually resumed AI assistance",
    });
  }

  return { success: true, resumed: true };
}

/**
 * Calculates authentic workspace-scoped service business conversion metrics.
 * Strictly derives from real canonical rows with zero invented data.
 */
export async function calculateServiceBusinessMetrics(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<ServiceConversionMetrics> {
  const { data: rows, error } = await supabase
    .from("service_conversion_journeys")
    .select("id, status, estimated_service_value, attributed_revenue, qualification_completeness, created_at, updated_at")
    .eq("workspace_id", workspaceId);

  if (error || !rows) {
    return {
      inquiriesReceived: 0,
      contacted: 0,
      qualified: 0,
      bookingOffered: 0,
      booked: 0,
      lost: 0,
      humanTakeovers: 0,
      abandonedEligibleForFollowup: 0,
      estimatedServiceValue: 0,
      confirmedAttributedRevenue: 0,
      inquiryToQualifiedRate: 0,
      qualifiedToBookedRate: 0,
      inquiryToBookedRate: 0,
    };
  }

  let inquiriesReceived = rows.length;
  let contacted = 0;
  let qualified = 0;
  let bookingOffered = 0;
  let booked = 0;
  let lost = 0;
  let humanTakeovers = 0;
  let totalEstimatedValue = 0;
  let totalAttributedRevenue = 0;
  let abandonedEligible = 0;

  const now = Date.now();
  const twoHoursAgo = now - 2 * 60 * 60 * 1000;

  for (const r of rows) {
    if (r.estimated_service_value) {
      totalEstimatedValue += Number(r.estimated_service_value);
    }
    if (r.attributed_revenue) {
      totalAttributedRevenue += Number(r.attributed_revenue);
    }

    switch (r.status) {
      case "contacted":
        contacted++;
        if (new Date(r.updated_at).getTime() < twoHoursAgo) {
          abandonedEligible++;
        }
        break;
      case "qualified":
        contacted++;
        qualified++;
        if (new Date(r.updated_at).getTime() < twoHoursAgo) {
          abandonedEligible++;
        }
        break;
      case "booking_offered":
        contacted++;
        qualified++;
        bookingOffered++;
        if (new Date(r.updated_at).getTime() < twoHoursAgo) {
          abandonedEligible++;
        }
        break;
      case "booked":
        contacted++;
        qualified++;
        bookingOffered++;
        booked++;
        break;
      case "lost":
        lost++;
        break;
      case "human_takeover":
        humanTakeovers++;
        break;
      case "new":
      default:
        break;
    }
  }

  const inquiryToQualifiedRate = inquiriesReceived > 0 ? parseFloat((qualified / inquiriesReceived).toFixed(4)) : 0;
  const qualifiedToBookedRate = qualified > 0 ? parseFloat((booked / qualified).toFixed(4)) : 0;
  const inquiryToBookedRate = inquiriesReceived > 0 ? parseFloat((booked / inquiriesReceived).toFixed(4)) : 0;

  return {
    inquiriesReceived,
    contacted,
    qualified,
    bookingOffered,
    booked,
    lost,
    humanTakeovers,
    abandonedEligibleForFollowup: abandonedEligible,
    estimatedServiceValue: parseFloat(totalEstimatedValue.toFixed(2)),
    confirmedAttributedRevenue: parseFloat(totalAttributedRevenue.toFixed(2)),
    inquiryToQualifiedRate,
    qualifiedToBookedRate,
    inquiryToBookedRate,
  };
}
