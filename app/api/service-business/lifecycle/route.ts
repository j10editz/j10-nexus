import { NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminSupabaseClient } from "@/lib/auth";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";
import {
  updateServiceJourneyLifecycleState,
  type ServiceLifecycleStatus,
} from "@/lib/service-business/conversion-service";

const ALLOWED_LIFECYCLE_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "booking_offered",
  "lost",
  "human_takeover",
] as const;

export async function GET(req: Request) {
  try {
    const auth = await requireApiWorkspaceContext("viewer");
    if (auth.error) return auth.error;

    const { context: wsContext } = auth;
    const { searchParams } = new URL(req.url);
    const threadId = searchParams.get("threadId");

    if (!threadId || !threadId.trim()) {
      return NextResponse.json(
        { success: false, error: "threadId is required" },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();
    const { data: journey, error: journeyError } = await supabase
      .from("service_conversion_journeys")
      .select("*")
      .eq("workspace_id", wsContext.workspace.id)
      .eq("thread_id", threadId.trim())
      .maybeSingle();

    if (journeyError) {
      console.error("[Service Business Lifecycle GET] Database query failed:", journeyError);
      return NextResponse.json(
        { success: false, error: journeyError.message || "Failed to load journey" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, journey: journey || null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load journey";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireApiWorkspaceContext("agent");
    if (auth.error) return auth.error;

    const { context: wsContext } = auth;
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const threadId = typeof body?.threadId === "string" ? body.threadId.trim() : null;
    if (!threadId) {
      return NextResponse.json(
        { success: false, error: "threadId is required" },
        { status: 400 }
      );
    }

    // 1. Status runtime allowlist validation
    let status: ServiceLifecycleStatus | undefined;
    if (body.status !== undefined) {
      if (typeof body.status !== "string") {
        return NextResponse.json(
          { success: false, error: "status must be a string" },
          { status: 400 }
        );
      }
      const rawStatus = body.status.trim();
      if (rawStatus === "booked") {
        return NextResponse.json(
          { success: false, error: "status=booked is forbidden on lifecycle endpoint. Bookings must be confirmed via external provider confirmation." },
          { status: 400 }
        );
      }
      if (!ALLOWED_LIFECYCLE_STATUSES.includes(rawStatus as any)) {
        return NextResponse.json(
          { success: false, error: `Invalid status '${rawStatus}'. Allowed values: ${ALLOWED_LIFECYCLE_STATUSES.join(", ")}` },
          { status: 400 }
        );
      }
      status = rawStatus as ServiceLifecycleStatus;
    }

    // 2. Reject client-supplied bookingConfirmationSource
    if (body.bookingConfirmationSource !== undefined || body.booking_confirmation_source !== undefined) {
      return NextResponse.json(
        { success: false, error: "Client-supplied bookingConfirmationSource is not allowed" },
        { status: 400 }
      );
    }

    // 3. Reject client-supplied attributed revenue
    if (body.attributedRevenue !== undefined || body.attributed_revenue !== undefined) {
      return NextResponse.json(
        { success: false, error: "Client-supplied attributed revenue is not allowed" },
        { status: 400 }
      );
    }

    // 4. Validate estimatedServiceValue: finite, non-negative, within numeric(10,2) range
    let estimatedServiceValue: number | undefined;
    if (body.estimatedServiceValue !== undefined && body.estimatedServiceValue !== null) {
      const val = Number(body.estimatedServiceValue);
      if (!Number.isFinite(val) || val < 0 || val > 99999999.99) {
        return NextResponse.json(
          { success: false, error: "estimatedServiceValue must be a finite non-negative number up to 99999999.99" },
          { status: 400 }
        );
      }
      estimatedServiceValue = Math.round(val * 100) / 100;
    }

    // 5. Validate qualificationCompleteness: between 0 and 1
    let qualificationCompleteness: number | undefined;
    if (body.qualificationCompleteness !== undefined && body.qualificationCompleteness !== null) {
      const q = Number(body.qualificationCompleteness);
      if (!Number.isFinite(q) || q < 0 || q > 1) {
        return NextResponse.json(
          { success: false, error: "qualificationCompleteness must be a number between 0 and 1" },
          { status: 400 }
        );
      }
      qualificationCompleteness = Math.round(q * 100) / 100;
    }

    // 6. Validate requestedService/date/time types and length
    let requestedService: string | undefined;
    if (body.requestedService !== undefined && body.requestedService !== null) {
      if (typeof body.requestedService !== "string" || body.requestedService.length > 255) {
        return NextResponse.json(
          { success: false, error: "requestedService must be a string up to 255 characters" },
          { status: 400 }
        );
      }
      requestedService = body.requestedService.trim();
    }

    let preferredDate: string | undefined;
    if (body.preferredDate !== undefined && body.preferredDate !== null) {
      if (typeof body.preferredDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.preferredDate.trim())) {
        return NextResponse.json(
          { success: false, error: "preferredDate must be a string in YYYY-MM-DD format" },
          { status: 400 }
        );
      }
      const parsedDate = new Date(body.preferredDate.trim());
      if (isNaN(parsedDate.getTime())) {
        return NextResponse.json(
          { success: false, error: "preferredDate must be a valid calendar date" },
          { status: 400 }
        );
      }
      preferredDate = body.preferredDate.trim();
    }

    let preferredTime: string | undefined;
    if (body.preferredTime !== undefined && body.preferredTime !== null) {
      if (typeof body.preferredTime !== "string" || body.preferredTime.length > 100) {
        return NextResponse.json(
          { success: false, error: "preferredTime must be a string up to 100 characters" },
          { status: 400 }
        );
      }
      preferredTime = body.preferredTime.trim();
    }

    let humanTakeoverReason: string | undefined;
    if (body.humanTakeoverReason !== undefined && body.humanTakeoverReason !== null) {
      if (typeof body.humanTakeoverReason !== "string" || body.humanTakeoverReason.length > 500) {
        return NextResponse.json(
          { success: false, error: "humanTakeoverReason must be a string up to 500 characters" },
          { status: 400 }
        );
      }
      humanTakeoverReason = body.humanTakeoverReason.trim();
    }

    // 7. Use admin client ONLY after workspace and agent role authorization succeeds
    const adminClient = createAdminSupabaseClient();

    const updated = await updateServiceJourneyLifecycleState(adminClient, {
      workspaceId: wsContext.workspace.id,
      threadId,
      status,
      requestedService,
      preferredDate,
      preferredTime,
      estimatedServiceValue,
      qualificationCompleteness,
      humanTakeoverReason,
      actorType: "operator",
      actorId: wsContext.user.id,
      reason: (typeof body.reason === "string" && body.reason.trim()) || "Manual operator update",
    });

    // 8. Return success only after verifying the exact workspace-scoped journey row and resulting status
    const { data: verifiedJourney, error: verifyErr } = await adminClient
      .from("service_conversion_journeys")
      .select("*")
      .eq("id", updated.id)
      .eq("workspace_id", wsContext.workspace.id)
      .single();

    if (verifyErr || !verifiedJourney) {
      console.error("[Service Business Lifecycle POST] Post-mutation verification failed:", verifyErr);
      return NextResponse.json(
        { success: false, error: "Failed to verify journey state after mutation" },
        { status: 500 }
      );
    }

    if (status && verifiedJourney.status !== status) {
      return NextResponse.json(
        { success: false, error: "Resulting journey status does not match requested transition" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, journey: verifiedJourney });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update journey";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
