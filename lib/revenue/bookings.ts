import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

export type BookingType =
  | "executive_walkthrough"
  | "discovery_call"
  | "technical_demo"
  | "closing_call"
  | "onboarding";

export type BookingStatus =
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
  meetingUrl?: string;
  notes?: string;
  hostUserId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Creates a scheduled meeting/booking for a contact and workspace,
 * auto-generating a conference URL if omitted.
 */
export async function createWorkspaceBooking(
  supabase: SupabaseClient,
  input: CreateBookingInput
): Promise<BookingRecord> {
  const duration = input.durationMinutes || 30;
  const meetingUrl = input.meetingUrl?.trim() || `https://meet.j10nexus.com/exec-${randomUUID().slice(0, 8)}`;
  const bookingType: BookingType = input.bookingType || "executive_walkthrough";

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
      status: "scheduled",
      notes: input.notes?.trim() || null,
      host_user_id: input.hostUserId || null,
      metadata: {
        ...(input.metadata || {}),
        external_reservation_status: "pending_confirmation",
        is_external_calendar_confirmed: false,
      },
    })
    .select("*")
    .single();

  if (error || !booking) {
    throw new Error(`Failed to create booking: ${error?.message || "Unknown error"}`);
  }

  return {
    ...(booking as BookingRecord),
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
  }
): Promise<BookingRecord> {
  const { data: existing, error: getErr } = await supabase
    .from("crm_bookings")
    .select("*")
    .eq("id", input.bookingId)
    .eq("workspace_id", input.workspaceId)
    .single();

  if (getErr || !existing) {
    throw new Error(`Booking ${input.bookingId} not found: ${getErr?.message || "Not found"}`);
  }

  const existingMeta = (existing.metadata || {}) as Record<string, unknown>;
  const updatedMeta = {
    ...existingMeta,
    external_reservation_status: "confirmed_external_calendar",
    external_calendar_provider: input.calendarProvider,
    external_calendar_event_id: input.externalEventId,
    is_external_calendar_confirmed: true,
    confirmed_at: new Date().toISOString(),
  };

  const updates: Record<string, unknown> = {
    metadata: updatedMeta,
    updated_at: new Date().toISOString(),
  };

  if (input.confirmedMeetingUrl) {
    updates.meeting_url = input.confirmedMeetingUrl;
  }

  const { data, error } = await supabase
    .from("crm_bookings")
    .update(updates)
    .eq("id", input.bookingId)
    .eq("workspace_id", input.workspaceId)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Failed to confirm external calendar reservation: ${error?.message}`);
  }

  return {
    ...(data as BookingRecord),
    external_reservation_status: "confirmed_external_calendar",
    external_calendar_provider: input.calendarProvider,
    external_calendar_event_id: input.externalEventId,
  };
}
