import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ServiceLifecycleStatus,
  ServicePlaybook,
  ServiceCatalogItem,
  ExtractedServiceIntent,
  ServiceConversionJourneyRecord,
  ServiceConversionMetrics,
} from "./types";

export type {
  ServiceLifecycleStatus,
  ServiceConversionMetrics,
  ExtractedServiceIntent,
  ServiceConversionJourneyRecord,
};
import { defaultPlaybook } from "./playbooks/registry";

/**
 * Validates that a booking URL is a genuine HTTPS link.
 * Never accepts placeholders, synthetic URLs, or insecure links.
 */
export function isValidHttpsUrl(urlString?: string | null): boolean {
  if (!urlString || typeof urlString !== "string") return false;
  try {
    const parsed = new URL(urlString.trim());
    return parsed.protocol === "https:" && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

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
 * Deterministically extracts service intent.
 * Prioritizes effective workspace services/pricing over static playbook templates.
 * Never invents service pricing or external meeting URLs.
 */
export function extractServiceIntent(args: {
  text: string;
  playbook?: ServicePlaybook;
  effectiveServices?: ServiceCatalogItem[] | Array<{ name: string; price?: any; durationMinutes?: number; description?: string }>;
  workspaceServices?: ServiceCatalogItem[] | Array<{ name: string; price?: any; durationMinutes?: number; description?: string }>;
  bookingLink?: string | null;
  replyText?: string | null;
}): ExtractedServiceIntent {
  const { text, replyText, bookingLink } = args;
  const playbook = args.playbook || defaultPlaybook;
  const lower = text.toLowerCase();
  const configuredServices = args.workspaceServices || args.effectiveServices;

  // Evaluate against workspace's effective services if configured; otherwise use playbook template
  const rawServices: ServiceCatalogItem[] =
    configuredServices && configuredServices.length > 0
      ? (configuredServices as any)
      : playbook.services;

  // Sort services by name length descending so that more specific names (e.g. "Balayage Deluxe") match before shorter substrings ("Balayage")
  const servicesToEvaluate = [...rawServices].sort(
    (a, b) => (b.name?.length || 0) - (a.name?.length || 0)
  );

  // 1. Identify Service from Catalog
  let requestedService: string | null = null;
  let serviceKey: string | null = null;
  let estimatedServiceValue: number | null = null;
  let isQuoteRequired = false;

  for (const s of servicesToEvaluate) {
    if (s.name && lower.includes(s.name.toLowerCase())) {
      requestedService = s.name;
      serviceKey = s.key || s.name.toLowerCase().replace(/\s+/g, "_");
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

  // 6. Booking link offered check:
  // Strict truthfulness: ONLY true when outbound replyText actually contains a validated HTTPS booking link.
  // Missing link, placeholder link, or inbound customer queries containing "book" must NEVER transition to booking_offered!
  const hasValidBookingLink = isValidHttpsUrl(bookingLink);
  const offeredBookingLink = Boolean(
    hasValidBookingLink && bookingLink && replyText && replyText.includes(bookingLink)
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
    estimatedServiceValue,
    isQuoteRequired,
    preferredDate,
    preferredTime,
    qualificationCompleteness: parseFloat(completeness.toFixed(2)),
    missingRequiredFields: missingFields,
    humanHandoffRequested,
    humanHandoffReason,
    offeredBookingLink,
    suggestedStatus,
  };
}

/**
 * Updates service conversion journey atomically via transition_service_journey_atomic RPC.
 * Fails closed and is strictly workspace-scoped.
 */
export async function updateServiceJourneyLifecycleState(
  supabase: SupabaseClient,
  args: {
    workspaceId: string;
    threadId?: string | null;
    journeyId?: string | null;
    contactId?: string | null;
    status?: ServiceLifecycleStatus;
    toStatus?: ServiceLifecycleStatus;
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
    metadata?: Record<string, unknown>;
  }
): Promise<ServiceConversionJourneyRecord> {
  const { workspaceId, threadId, journeyId, actorType, actorId, reason } = args;

  // 1. Fetch current journey ID and status
  let query = supabase
    .from("service_conversion_journeys")
    .select("id, status")
    .eq("workspace_id", workspaceId);

  if (journeyId) {
    query = query.eq("id", journeyId);
  } else if (threadId) {
    query = query.eq("thread_id", threadId);
  } else {
    throw new Error("Either journeyId or threadId must be provided to update journey lifecycle");
  }

  const { data: current, error: findError } = await query.maybeSingle();

  if (findError || !current) {
    throw new Error(`Journey not found in workspace ${workspaceId} (journeyId: ${journeyId}, threadId: ${threadId})`);
  }

  const toStatus = args.toStatus || args.status || current.status;

  // 2. Call atomic transition RPC
  const { data: transitionResult, error: transitionError } = await supabase.rpc(
    "transition_service_journey_atomic",
    {
      p_workspace_id: workspaceId,
      p_journey_id: current.id,
      p_to_status: toStatus,
      p_actor_type: actorType,
      p_actor_id: actorId || null,
      p_reason: reason || null,
      p_metadata: args.metadata || {},
      p_requested_service: args.requestedService !== undefined ? args.requestedService : null,
      p_preferred_date: args.preferredDate !== undefined ? args.preferredDate : null,
      p_preferred_time: args.preferredTime !== undefined ? args.preferredTime : null,
      p_estimated_value: args.estimatedServiceValue !== undefined ? args.estimatedServiceValue : null,
      p_qualification_completeness: args.qualificationCompleteness !== undefined ? args.qualificationCompleteness : null,
      p_booking_confirmation_source: args.bookingConfirmationSource || null,
      p_attributed_revenue: null,
    }
  );

  if (transitionError) {
    console.error("[Service Journey RPC] Transition failed:", transitionError);
    throw new Error(transitionError.message || "Failed to transition journey");
  }

  if (!transitionResult?.success) {
    throw new Error("Journey transition was not successful");
  }

  // 3. Fetch verified updated journey record
  const { data: updated, error: fetchErr } = await supabase
    .from("service_conversion_journeys")
    .select("*")
    .eq("id", current.id)
    .eq("workspace_id", workspaceId)
    .single();

  if (fetchErr || !updated) {
    throw new Error("Failed to fetch updated journey record after transition");
  }

  return updated as ServiceConversionJourneyRecord;
}

/**
 * Allows an authorized operator to resume AI assistance on a service thread.
 * Invokes transactional resume_service_thread_atomic RPC.
 */
export async function operatorResumeJourneyAi(
  supabase: SupabaseClient,
  args: {
    workspaceId: string;
    threadId?: string | null;
    journeyId?: string | null;
    operatorUserId?: string | null;
    operatorId?: string | null;
    notes?: string;
  }
): Promise<ServiceConversionJourneyRecord> {
  const { workspaceId } = args;
  const operatorUserId = args.operatorUserId || args.operatorId;

  if (!operatorUserId) {
    throw new Error("operatorUserId is required to resume AI assistance");
  }

  // 1. Resolve thread ID
  let resolvedThreadId = args.threadId;
  if (!resolvedThreadId && args.journeyId) {
    const { data: jRow, error: jErr } = await supabase
      .from("service_conversion_journeys")
      .select("thread_id")
      .eq("id", args.journeyId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (jErr) throw new Error(`Failed to query journey: ${jErr.message}`);
    resolvedThreadId = jRow?.thread_id;
  }

  if (!resolvedThreadId) {
    throw new Error("Thread not found for journey in workspace");
  }

  // 2. Call transactional atomic RPC
  const { data: resumeResult, error: resumeError } = await supabase.rpc(
    "resume_service_thread_atomic",
    {
      p_workspace_id: workspaceId,
      p_thread_id: resolvedThreadId,
      p_operator_user_id: operatorUserId,
      p_notes: args.notes || null,
    }
  );

  if (resumeError) {
    throw new Error(`Resume transaction failed: ${resumeError.message}`);
  }

  if (!resumeResult?.success) {
    throw new Error("Failed to resume service thread AI");
  }

  // 3. Return verified journey state
  const { data: verifiedJourney, error: fetchErr } = await supabase
    .from("service_conversion_journeys")
    .select("*")
    .eq("thread_id", resolvedThreadId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (fetchErr) {
    throw new Error(`Failed to fetch verified journey after resume: ${fetchErr.message}`);
  }

  return verifiedJourney as ServiceConversionJourneyRecord;
}

/**
 * Calculates authentic workspace-scoped service business conversion metrics.
 * Strictly derives from real canonical rows with zero invented data.
 * Throws when query returns an error; returns zeros ONLY on successful query with zero rows.
 */
export async function calculateServiceBusinessMetrics(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<ServiceConversionMetrics> {
  const { data: rows, error } = await supabase
    .from("service_conversion_journeys")
    .select("id, status, estimated_service_value, attributed_revenue, qualification_completeness, created_at, updated_at")
    .eq("workspace_id", workspaceId);

  if (error) {
    throw new Error(`Database error calculating service business metrics: ${error.message}`);
  }

  if (!rows || rows.length === 0) {
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
