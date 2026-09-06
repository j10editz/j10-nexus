import { NextResponse } from "next/server";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";
import { createServerSupabaseClient } from "@/lib/auth";
import {
  createWorkspaceBooking,
  getWorkspaceBookings,
  type BookingStatus,
} from "@/lib/revenue/bookings";

export async function GET(req: Request) {
  try {
    const auth = await requireApiWorkspaceContext("viewer");
    if (auth.error) {
      return auth.error;
    }
    const { context } = auth;
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") as BookingStatus | null;
    const contactId = searchParams.get("contactId") || undefined;

    const supabase = createServerSupabaseClient();
    const bookings = await getWorkspaceBookings(supabase, context.workspace.id, {
      status: status || undefined,
      contactId,
    });

    return NextResponse.json({ success: true, bookings });
  } catch (error) {
    console.error("GET /api/crm/bookings error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch bookings.",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireApiWorkspaceContext("agent");
    if (auth.error) {
      return auth.error;
    }
    const { context } = auth;
    const body = await req.json().catch(() => ({}));

    if (!body.title || typeof body.title !== "string") {
      return NextResponse.json(
        { success: false, error: "title is required." },
        { status: 400 }
      );
    }

    if (!body.scheduledAt || typeof body.scheduledAt !== "string") {
      return NextResponse.json(
        { success: false, error: "scheduledAt is required (ISO string)." },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();
    const booking = await createWorkspaceBooking(supabase, {
      workspaceId: context.workspace.id,
      contactId: body.contactId || null,
      threadId: body.threadId || null,
      proposalId: body.proposalId || null,
      title: body.title,
      bookingType: body.bookingType,
      scheduledAt: body.scheduledAt,
      durationMinutes: typeof body.durationMinutes === "number" ? body.durationMinutes : undefined,
      meetingUrl: body.meetingUrl,
      notes: body.notes,
      hostUserId: context.user.id,
      metadata: body.metadata,
    });

    return NextResponse.json({ success: true, booking });
  } catch (error) {
    console.error("POST /api/crm/bookings error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create booking.",
      },
      { status: 500 }
    );
  }
}
