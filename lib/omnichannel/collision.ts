import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActiveViewerPresence, ThreadLockState } from "@/types/inbox";

export interface CollisionPresenceResult {
  threadId: string;
  activeViewers: ActiveViewerPresence[];
  otherTypers: ActiveViewerPresence[];
  isOtherUserTyping: boolean;
}

export interface LockAcquisitionResult {
  success: boolean;
  lockState: ThreadLockState;
  error?: string;
  conflictUser?: string;
}

/**
 * Filter out stale presence records older than ttlSeconds (default 30s)
 */
export function pruneStalePresences(
  viewers: ActiveViewerPresence[],
  ttlSeconds = 30,
  now = new Date(),
): ActiveViewerPresence[] {
  const threshold = now.getTime() - ttlSeconds * 1000;
  return (viewers || []).filter((v) => {
    const seen = new Date(v.lastSeenAt).getTime();
    return !isNaN(seen) && seen >= threshold;
  });
}

/**
 * Pure function: Update viewer heartbeat in presence array
 */
export function recordPresenceHeartbeat(
  currentViewers: ActiveViewerPresence[],
  userId: string,
  userName: string,
  action: "viewing" | "typing",
  now = new Date(),
): ActiveViewerPresence[] {
  const active = pruneStalePresences(currentViewers, 30, now);
  const existingIdx = active.findIndex((v) => v.userId === userId);

  const updatedEntry: ActiveViewerPresence = {
    userId,
    userName,
    action,
    lastSeenAt: now.toISOString(),
  };

  if (existingIdx >= 0) {
    active[existingIdx] = updatedEntry;
    return active;
  }

  return [...active, updatedEntry];
}

/**
 * Pure function: Evaluate collision lock acquisition
 */
export function evaluateLockAcquisition(params: {
  currentLock?: {
    lockedByUserId?: string | null;
    lockedByUserName?: string | null;
    lockedAt?: string | null;
    lockExpiresAt?: string | null;
  };
  requestingUserId: string;
  requestingUserName: string;
  ttlSeconds?: number;
  now?: Date;
  forceOverride?: boolean;
}): LockAcquisitionResult {
  const now = params.now || new Date();
  const ttl = params.ttlSeconds ?? 60;
  const current = params.currentLock;

  const isCurrentActive =
    Boolean(current?.lockedByUserId) &&
    Boolean(current?.lockExpiresAt) &&
    new Date(current!.lockExpiresAt!) > now;

  // Conflict exists if another user holds an active, unexpired lock
  if (
    isCurrentActive &&
    current?.lockedByUserId !== params.requestingUserId &&
    !params.forceOverride
  ) {
    return {
      success: false,
      lockState: {
        isLocked: true,
        lockedByUserId: current?.lockedByUserId || undefined,
        lockedByUserName: current?.lockedByUserName || "Another Agent",
        lockedAt: current?.lockedAt || undefined,
        expiresAt: current?.lockExpiresAt || undefined,
        isHeldByMe: false,
      },
      conflictUser: current?.lockedByUserName || "Another Operator",
      error: `Thread is locked by ${current?.lockedByUserName || "another operator"}. Collision prevented.`,
    };
  }

  // Grant or refresh lease
  const expiresAt = new Date(now.getTime() + ttl * 1000).toISOString();
  return {
    success: true,
    lockState: {
      isLocked: true,
      lockedByUserId: params.requestingUserId,
      lockedByUserName: params.requestingUserName,
      lockedAt: now.toISOString(),
      expiresAt,
      isHeldByMe: true,
    },
  };
}

/**
 * Pure function: Verify whether a user is authorized to send a message without collision
 */
export function verifyReplyCollisionGuard(params: {
  currentLock?: {
    lockedByUserId?: string | null;
    lockedByUserName?: string | null;
    lockExpiresAt?: string | null;
  };
  currentUserId: string;
  now?: Date;
  forceOverride?: boolean;
}): { allowed: boolean; reason?: string } {
  if (params.forceOverride) return { allowed: true };

  const now = params.now || new Date();
  const lock = params.currentLock;

  const isLockActive =
    Boolean(lock?.lockedByUserId) &&
    Boolean(lock?.lockExpiresAt) &&
    new Date(lock!.lockExpiresAt!) > now;

  if (isLockActive && lock?.lockedByUserId !== params.currentUserId) {
    return {
      allowed: false,
      reason: `Collision Guard: Active lock held by ${lock?.lockedByUserName || "another operator"}.`,
    };
  }

  return { allowed: true };
}

/**
 * DB helper: Send presence heartbeat (viewing / typing)
 */
export async function updateThreadPresence(
  supabase: SupabaseClient,
  workspaceId: string,
  threadId: string,
  userId: string,
  userName: string,
  action: "viewing" | "typing",
): Promise<CollisionPresenceResult> {
  const { data: thread } = await supabase
    .from("inbox_threads")
    .select("active_viewers")
    .eq("id", threadId)
    .eq("workspace_id", workspaceId)
    .single();

  const currentViewers = Array.isArray(thread?.active_viewers)
    ? thread.active_viewers
    : [];

  const updatedViewers = recordPresenceHeartbeat(
    currentViewers,
    userId,
    userName,
    action,
  );

  await supabase
    .from("inbox_threads")
    .update({
      active_viewers: updatedViewers,
      updated_at: new Date().toISOString(),
    })
    .eq("id", threadId)
    .eq("workspace_id", workspaceId);

  const otherTypers = updatedViewers.filter(
    (v) => v.userId !== userId && v.action === "typing",
  );

  return {
    threadId,
    activeViewers: updatedViewers,
    otherTypers,
    isOtherUserTyping: otherTypers.length > 0,
  };
}

/**
 * DB helper: Acquire exclusive thread lock
 */
export async function acquireThreadLease(
  supabase: SupabaseClient,
  workspaceId: string,
  threadId: string,
  userId: string,
  userName: string,
  ttlSeconds = 60,
  forceOverride = false,
): Promise<LockAcquisitionResult> {
  const { data: thread, error } = await supabase
    .from("inbox_threads")
    .select("locked_by_user_id, locked_at, lock_expires_at, metadata")
    .eq("id", threadId)
    .eq("workspace_id", workspaceId)
    .single();

  if (error || !thread) {
    return {
      success: false,
      lockState: { isLocked: false },
      error: "Thread not found or inaccessible.",
    };
  }

  const evaluation = evaluateLockAcquisition({
    currentLock: {
      lockedByUserId: thread.locked_by_user_id,
      lockedByUserName: thread.metadata?.lockedByUserName,
      lockedAt: thread.locked_at,
      lockExpiresAt: thread.lock_expires_at,
    },
    requestingUserId: userId,
    requestingUserName: userName,
    ttlSeconds,
    forceOverride,
  });

  if (!evaluation.success) {
    return evaluation;
  }

  // Commit lock in DB
  const updatedMetadata = {
    ...(thread.metadata || {}),
    lockedByUserName: userName,
  };

  await supabase
    .from("inbox_threads")
    .update({
      locked_by_user_id: userId,
      locked_at: evaluation.lockState.lockedAt,
      lock_expires_at: evaluation.lockState.expiresAt,
      metadata: updatedMetadata,
      updated_at: new Date().toISOString(),
    })
    .eq("id", threadId)
    .eq("workspace_id", workspaceId);

  return evaluation;
}

/**
 * DB helper: Release thread lock
 */
export async function releaseThreadLease(
  supabase: SupabaseClient,
  workspaceId: string,
  threadId: string,
  userId: string,
  forceOverride = false,
): Promise<boolean> {
  let query = supabase
    .from("inbox_threads")
    .update({
      locked_by_user_id: null,
      locked_at: null,
      lock_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", threadId)
    .eq("workspace_id", workspaceId);

  if (!forceOverride) {
    query = query.eq("locked_by_user_id", userId);
  }

  const { error } = await query;
  return !error;
}
