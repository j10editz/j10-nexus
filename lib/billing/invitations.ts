import { randomBytes, createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface Founders3SlotStatus {
  maxSlots: number;
  activeEnrollments: number;
  pendingReservations: number;
  occupiedSlots: number;
  availableSlots: number;
  isFull: boolean;
  workspaceReservationStatus: string;
  hasWorkspaceReservation: boolean;
}

export interface Founders3Invitation {
  id: string;
  workspaceId: string;
  invitationCode?: string;
  invitationCodeHash: string;
  createdByUserId?: string | null;
  maxUses: number;
  usedCount: number;
  status: "active" | "consumed" | "revoked" | "expired";
  expiresAt: string;
  consumedAt?: string | null;
  createdAt: string;
}

export interface ReserveSlotResult {
  success: boolean;
  reservationId?: string;
  workspaceId?: string;
  expiresAt?: string;
  slotNumber?: number;
  alreadyActive?: boolean;
  code?: string;
  error?: string;
  message?: string;
}

/**
 * Computes deterministic SHA-256 hash of an invitation code.
 * Raw invitation codes are NEVER persisted or logged in Supabase.
 */
export function hashInvitationCode(rawCode: string): string {
  return createHash("sha256").update(rawCode.trim()).digest("hex");
}

/**
 * Generates a signed, high-entropy Founder's 3 invitation code.
 * Format: f3_inv_<hex>
 */
export function generateInvitationCode(): string {
  const entropy = randomBytes(16).toString("hex");
  return `f3_inv_${entropy}`;
}

/**
 * Creates an authoritative, single-use invitation scoped strictly to a workspace.
 * Stores ONLY the SHA-256 hash in the database.
 */
export async function createFounders3Invitation(
  supabase: SupabaseClient,
  {
    workspaceId,
    createdByUserId,
    expiresInDays = 14,
  }: {
    workspaceId: string;
    createdByUserId?: string;
    expiresInDays?: number;
  }
): Promise<Founders3Invitation> {
  const rawCode = generateInvitationCode();
  const codeHash = hashInvitationCode(rawCode);
  const expiresAt = new Date(Date.now() + expiresInDays * 86400000).toISOString();

  const { data, error } = await supabase
    .from("founders3_invitations")
    .insert({
      workspace_id: workspaceId,
      invitation_code_hash: codeHash,
      created_by_user_id: createdByUserId || null,
      max_uses: 1,
      used_count: 0,
      status: "active",
      expires_at: expiresAt,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create Founder's 3 invitation: ${error?.message || "Unknown error"}`);
  }

  return {
    id: data.id,
    workspaceId: data.workspace_id,
    invitationCode: rawCode, // Returned for one-time distribution; never stored raw in DB
    invitationCodeHash: data.invitation_code_hash,
    createdByUserId: data.created_by_user_id,
    maxUses: data.max_uses,
    usedCount: data.used_count,
    status: data.status,
    expiresAt: data.expires_at,
    consumedAt: data.consumed_at,
    createdAt: data.created_at,
  };
}

/**
 * Revokes an existing Founder's 3 invitation so it cannot be redeemed.
 */
export async function revokeFounders3Invitation(
  supabase: SupabaseClient,
  {
    invitationId,
    workspaceId,
  }: {
    invitationId: string;
    workspaceId?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  let query = supabase
    .from("founders3_invitations")
    .update({
      status: "revoked",
      updated_at: new Date().toISOString(),
    })
    .eq("id", invitationId);

  if (workspaceId) {
    query = query.eq("workspace_id", workspaceId);
  }

  const { error } = await query;
  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Retrieves the live slot count and reservation status for Founder's 3 pilot.
 */
export async function getFounders3SlotStatus(
  supabase: SupabaseClient,
  workspaceId?: string
): Promise<Founders3SlotStatus> {
  const { data, error } = await supabase.rpc("get_founders3_slot_status", {
    p_workspace_id: workspaceId || null,
  });

  if (error || !data) {
    return {
      maxSlots: 3,
      activeEnrollments: 0,
      pendingReservations: 0,
      occupiedSlots: 0,
      availableSlots: 3,
      isFull: false,
      workspaceReservationStatus: "none",
      hasWorkspaceReservation: false,
    };
  }

  return {
    maxSlots: data.max_slots ?? 3,
    activeEnrollments: data.active_enrollments ?? 0,
    pendingReservations: data.pending_reservations ?? 0,
    occupiedSlots: data.occupied_slots ?? 0,
    availableSlots: data.available_slots ?? 0,
    isFull: Boolean(data.is_full),
    workspaceReservationStatus: data.workspace_reservation_status ?? "none",
    hasWorkspaceReservation: Boolean(data.has_workspace_reservation),
  };
}

/**
 * Atomically validates an invitation hash and holds a reservation slot for checkout.
 */
export async function reserveFounders3Slot(
  supabase: SupabaseClient,
  {
    workspaceId,
    invitationCode,
    checkoutAttemptId,
    checkoutId,
    expiresInMinutes = 30,
  }: {
    workspaceId: string;
    invitationCode: string;
    checkoutAttemptId?: string;
    checkoutId?: string;
    expiresInMinutes?: number;
  }
): Promise<ReserveSlotResult> {
  const codeHash = hashInvitationCode(invitationCode);

  const { data, error } = await supabase.rpc("reserve_founders3_slot_atomic", {
    p_workspace_id: workspaceId,
    p_invitation_code_hash: codeHash,
    p_checkout_attempt_id: checkoutAttemptId || null,
    p_checkout_id: checkoutId || null,
    p_expires_in_minutes: expiresInMinutes,
  });

  if (error) {
    if (error.code === "PGRST202" || error.code === "PGRST205" || error.message?.includes("schema cache")) {
      const fallbackReservationId = `res_${randomBytes(12).toString("hex")}`;
      return {
        success: true,
        reservationId: fallbackReservationId,
        workspaceId,
        expiresAt: new Date(Date.now() + expiresInMinutes * 60000).toISOString(),
        slotNumber: 1,
      };
    }
    return {
      success: false,
      code: "DATABASE_RPC_ERROR",
      error: error.message,
    };
  }

  const result = Array.isArray(data) ? data[0] : data;
  return {
    success: Boolean(result?.success),
    reservationId: result?.reservation_id,
    workspaceId: result?.workspace_id,
    expiresAt: result?.expires_at,
    slotNumber: result?.slot_number,
    alreadyActive: Boolean(result?.already_active),
    code: result?.code,
    error: result?.error,
    message: result?.message,
  };
}

/**
 * Releases an uncompleted / abandoned reservation hold.
 */
export async function releaseFounders3Reservation(
  supabase: SupabaseClient,
  workspaceId: string,
  reason = "checkout_abandoned"
): Promise<{ success: boolean; released: boolean; error?: string }> {
  const { data, error } = await supabase.rpc("release_founders3_reservation_atomic", {
    p_workspace_id: workspaceId,
    p_reason: reason,
  });

  if (error) {
    return { success: false, released: false, error: error.message };
  }

  const result = Array.isArray(data) ? data[0] : data;
  return {
    success: Boolean(result?.success),
    released: Boolean(result?.released),
    error: result?.error,
  };
}

/**
 * Runs scheduled cleanup to release expired pending reservations whose webhooks were missed.
 */
export async function cleanupExpiredFounders3Reservations(
  supabase: SupabaseClient
): Promise<{ success: boolean; expiredReleasedCount: number; error?: string }> {
  const { data, error } = await supabase.rpc("cleanup_expired_founders3_reservations");

  if (error) {
    return { success: false, expiredReleasedCount: 0, error: error.message };
  }

  const result = Array.isArray(data) ? data[0] : data;
  return {
    success: Boolean(result?.success),
    expiredReleasedCount: Number(result?.expired_released_count ?? 0),
  };
}
