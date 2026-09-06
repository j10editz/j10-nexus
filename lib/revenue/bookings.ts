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
      metadata: input.metadata || {},
    })
    .select("*")
    .single();

  if (error || !booking) {
    throw new Error(`Failed to create booking: ${error?.message || "Unknown error"}`);
  }

  return booking as BookingRecord;
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
