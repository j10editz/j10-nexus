import type { SupabaseClient } from "@supabase/supabase-js";

export type BookingType =
  | "executive_walkthrough"
  | "discovery_call"
  | "technical_demo"
  | "closing_call"
  | "onboarding"
  | "service_appointment"
  | "consultation";

export type BookingStatus =
  | "requested"
  | "scheduled"
  | "completed"
  | "canceled"
  | "rescheduled"
  | "no_show";

export type ExternalReservationStatus =
  | "unlinked"
  | "pending_confirmation"
  | "confirmed_external_calendar"
  | "failed_to_reserve";

export interface BookingRecord {
  id: string;
  workspace_id: string;
  contact_id: string | null;
  thread_id: string | null;
  proposal_id: string | null;
  title: string;
  booking_type: BookingType;
  scheduled_at: string;
  duration_minutes: number;
  meeting_url: string | null;
  status: BookingStatus;
  external_reservation_status?: ExternalReservationStatus;
  external_calendar_provider?: string | null;
  external_calendar_event_id?: string | null;
  notes: string | null;
  host_user_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CreateBookingInput {
  workspaceId: string;
  contactId?: string | null;
  threadId?: string | null;
  proposalId?: string | null;
  title: string;
  bookingType?: BookingType;
  scheduledAt: string;
  durationMinutes?: number;
  meetingUrl?: string | null;
  confirmationSource?: string | null;
  notes?: string;
  hostUserId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Creates a booking record for a contact and workspace.
 * Never invents synthetic conference URLs. Distinguishes tentative requests from confirmed bookings.
 */
export async function createWorkspaceBooking(
  supabase: SupabaseClient,
  input: CreateBookingInput
): Promise<BookingRecord> {
  const duration = input.durationMinutes || 30;
  const meetingUrl = input.meetingUrl?.trim() || null;
  const bookingType: BookingType = input.bookingType || "executive_walkthrough";

  // Newly requested bookings MUST remain requested / pending_confirmation.
  // Caller-provided text alone (like confirmationSource) does NOT prove external confirmation.
  // Only a verified provider callback handled by trusted server path can set external confirmation.
  const { data: booking, error } = await supabase
    .from("crm_bookings")
    .insert({
      workspace_id: input.workspaceId,
      contact_id: input.contactId || null,
      thread_id: input.threadId || null,
      proposal_id: input.proposalId || null,
      title: input.title.trim(),
      booking_type: bookingType,
      scheduled_at: input.scheduledAt,
      duration_minutes: duration,
      meeting_url: meetingUrl,
      status: "requested",
      notes: input.notes?.trim() || null,
      host_user_id: input.hostUserId || null,
      metadata: {
        ...(input.metadata || {}),
        external_reservation_status: "pending_confirmation",
        is_external_calendar_confirmed: false,
        booking_request_source: input.confirmationSource || "system",
        display_status: "Booking requested (Awaiting confirmation)",
      },
    })
    .select("*")
    .single();

  if (error || !booking) {
    throw new Error(`Failed to create booking: ${error?.message || "Unknown error"}`);
  }

  return {
    ...(booking as BookingRecord),
    status: "requested",
    external_reservation_status: "pending_confirmation",
  };
}

/**
 * Retrieves all bookings for a workspace.
 */
export async function getWorkspaceBookings(
  supabase: SupabaseClient,
  workspaceId: string,
  filter?: { status?: BookingStatus; contactId?: string }
): Promise<BookingRecord[]> {
  let query = supabase
    .from("crm_bookings")
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
    .order("scheduled_at", { ascending: true });

  if (filter?.status) {
    query = query.eq("status", filter.status);
  }

  if (filter?.contactId) {
    query = query.eq("contact_id", filter.contactId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to fetch workspace bookings: ${error.message}`);
  }

  return (data || []) as BookingRecord[];
}

/**
 * Updates a booking's status.
 */
export async function updateBookingStatus(
  supabase: SupabaseClient,
  workspaceId: string,
  bookingId: string,
  status: BookingStatus,
  notes?: string
): Promise<BookingRecord> {
  const updates: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (notes !== undefined) {
    updates.notes = notes;
  }

  const { data, error } = await supabase
    .from("crm_bookings")
    .update(updates)
    .eq("id", bookingId)
    .eq("workspace_id", workspaceId)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Failed to update booking ${bookingId}: ${error?.message || "Not found"}`);
  }

  return data as BookingRecord;
}

/**
 * Transactionally confirms a booking via trusted provider callback,
 * updating the booking status to scheduled, transitioning the associated conversion journey to booked,
 * logging an immutable audit event, and safely attributing confirmed revenue.
 */
export async function confirmWorkspaceBookingAtomic(
  supabase: SupabaseClient,
  input: {
    workspaceId: string;
    bookingId: string;
    calendarProvider: string;
    externalEventId: string;
    confirmedRevenue?: number | null;
    confirmedMeetingUrl?: string | null;
    actorId?: string;
  }
): Promise<{ success: boolean; bookingId: string; status: string; confirmedRevenue?: number | null }> {
  if (!input.calendarProvider || !input.externalEventId) {
    throw new Error("External calendar provider and provider event ID are strictly required for confirmation.");
  }

  // Call the atomic RPC which performs locking, journey transition, audit event, and revenue attribution
  const { data, error } = await supabase.rpc("confirm_workspace_booking_atomic", {
    p_workspace_id: input.workspaceId,
    p_booking_id: input.bookingId,
    p_provider: input.calendarProvider,
    p_provider_event_id: input.externalEventId,
    p_confirmed_revenue: input.confirmedRevenue !== undefined && input.confirmedRevenue !== null ? input.confirmedRevenue : 0,
    p_actor_id: input.actorId || "booking_provider_callback",
  });

  if (error) {
    throw new Error(`Failed to confirm workspace booking atomically: ${error.message}`);
  }

  const result = typeof data === "string" ? JSON.parse(data) : data;
  if (!result?.success) {
    throw new Error(`Atomic booking confirmation failed: ${result?.error || "Unknown error"}`);
  }

  if (input.confirmedMeetingUrl) {
    await supabase
      .from("crm_bookings")
      .update({ meeting_url: input.confirmedMeetingUrl })
      .eq("id", input.bookingId)
      .eq("workspace_id", input.workspaceId);
  }

  return result;
}

/**
 * Confirms an external calendar reservation (Google Calendar, Outlook, Cal.com)
 * explicitly distinguishing internal CRM booking records from confirmed external reservations.
 */
export async function confirmExternalCalendarReservation(
  supabase: SupabaseClient,
  input: {
    workspaceId: string;
    bookingId: string;
    calendarProvider: "google_calendar" | "cal_com" | "outlook";
    externalEventId: string;
    confirmedMeetingUrl?: string;
    confirmedRevenue?: number | null;
  }
): Promise<BookingRecord> {
  await confirmWorkspaceBookingAtomic(supabase, {
    workspaceId: input.workspaceId,
    bookingId: input.bookingId,
    calendarProvider: input.calendarProvider,
    externalEventId: input.externalEventId,
    confirmedRevenue: input.confirmedRevenue,
    confirmedMeetingUrl: input.confirmedMeetingUrl,
  });

  const { data: updated, error } = await supabase
    .from("crm_bookings")
    .select("*")
    .eq("id", input.bookingId)
    .eq("workspace_id", input.workspaceId)
    .single();

  if (error || !updated) {
    throw new Error(`Failed to retrieve confirmed booking ${input.bookingId}`);
  }

  return {
    ...(updated as BookingRecord),
    external_reservation_status: "confirmed_external_calendar",
    external_calendar_provider: input.calendarProvider,
    external_calendar_event_id: input.externalEventId,
  };
}

export const createBooking = createWorkspaceBooking;
export const getBookings = getWorkspaceBookings;
