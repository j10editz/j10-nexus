"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export interface TrialState {
  trialEndsAt: string | null;
  trialStartedAt: string | null;
  status: "active" | "expired" | "not_started" | null;
  provenance: string | null;
  remainingMs: number;
  remainingHours: number;
  remainingMinutes: number;
  isUnder12Hours: boolean;
  isExpired: boolean;
  canExecuteAI: boolean;
  serverNow: string | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

const defaultTrialState: TrialState = {
  trialEndsAt: null,
  trialStartedAt: null,
  status: null,
  provenance: null,
  remainingMs: 0,
  remainingHours: 0,
  remainingMinutes: 0,
  isUnder12Hours: false,
  isExpired: false,
  canExecuteAI: true,
  serverNow: null,
  isLoading: true,
  refresh: async () => {},
};

const TrialContext = createContext<TrialState>(defaultTrialState);

export function TrialProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<{
    trial: {
      trial_started_at: string | null;
      trial_ends_at: string | null;
      trial_status: string | null;
      provenance: string | null;
      subscription_status?: string | null;
      cancel_at_period_end?: boolean;
      current_period_end?: string | null;
    } | null;
    serverNow: string | null;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/onboarding/outcome", { credentials: "same-origin" });
      if (res.ok) {
        const json = await res.json();
        if (json?.trial) {
          setData({
            trial: json.trial,
            serverNow: json.serverNow || new Date().toISOString(),
          });
        } else {
          // If no trial data returned, explicitly clear trial data to avoid stale state
          setData({
            trial: null,
            serverNow: json?.serverNow || new Date().toISOString(),
          });
        }
      }
    } catch {
      // Non-blocking fallback
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const offset = useMemo(() => {
    if (!data?.serverNow) return 0;
    const serverTime = new Date(data.serverNow).getTime();
    return Number.isNaN(serverTime) ? 0 : serverTime - Date.now();
  }, [data?.serverNow]);

  const endsAt = data?.trial?.trial_ends_at ?? null;
  const rawStatus = data?.trial?.trial_status ?? null;
  const provenance = data?.trial?.provenance ?? null;
  const subscriptionStatus = data?.trial?.subscription_status ?? null;
  const cancelAtPeriodEnd = Boolean(data?.trial?.cancel_at_period_end);
  const currentPeriodEnd = data?.trial?.current_period_end ?? null;

  const calculateRemaining = useCallback(() => {
    if (!endsAt) return 0;
    const endMs = new Date(endsAt).getTime();
    if (Number.isNaN(endMs)) return 0;
    const nowMs = Date.now() + offset;
    return Math.max(0, endMs - nowMs);
  }, [endsAt, offset]);

  const [remainingMs, setRemainingMs] = useState<number>(calculateRemaining);

  useEffect(() => {
    const tick = () => setRemainingMs(calculateRemaining());
    tick();
    const interval = window.setInterval(tick, 1000);

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        tick();
      }
    };
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [calculateRemaining]);

  // Evaluate paid subscription entitlement:
  // 1. If subscription is active under a paid provenance ('stripe' or 'internal_grant'), the user is paid.
  // 2. If cancellation is scheduled at period end, the paid entitlement remains valid until current_period_end.
  const nowMs = Date.now() + offset;
  const isPaidPeriodValid = Boolean(
    currentPeriodEnd && new Date(currentPeriodEnd).getTime() > nowMs
  );
  const isPaidActive = Boolean(
    (provenance === "stripe" || provenance === "internal_grant") &&
    (subscriptionStatus === "active" ||
      (subscriptionStatus === "canceled_at_period_end" && isPaidPeriodValid) ||
      (cancelAtPeriodEnd && isPaidPeriodValid))
  );

  // If the user has an active paid subscription, they are NOT on a trial:
  // Stale trial_ends_at from before their upgrade must NEVER lock out a paid user.
  const isTrial = !isPaidActive && (provenance === "trial" || Boolean(endsAt));

  // Loading or missing subscription data must NEVER flash an expired lockout
  const isExpired = !isLoading && isTrial && (rawStatus === "expired" || (Boolean(endsAt) && remainingMs <= 0));
  const isUnder12Hours = !isLoading && isTrial && !isExpired && remainingMs > 0 && remainingMs < 12 * 3600 * 1000;
  const canExecuteAI = !isExpired;

  const remainingHours = Math.floor(remainingMs / 3_600_000);
  const remainingMinutes = Math.floor((remainingMs % 3_600_000) / 60_000);

  const value: TrialState = {
    trialEndsAt: isPaidActive ? null : endsAt,
    trialStartedAt: data?.trial?.trial_started_at ?? null,
    status: isPaidActive
      ? "active"
      : isExpired
      ? "expired"
      : (rawStatus as "active" | "expired" | "not_started" | null) ?? (isTrial ? "active" : null),
    provenance,
    remainingMs: isPaidActive ? 0 : remainingMs,
    remainingHours: isPaidActive ? 0 : remainingHours,
    remainingMinutes: isPaidActive ? 0 : remainingMinutes,
    isUnder12Hours: isPaidActive ? false : isUnder12Hours,
    isExpired,
    canExecuteAI,
    serverNow: data?.serverNow ?? null,
    isLoading,
    refresh,
  };

  return <TrialContext.Provider value={value}>{children}</TrialContext.Provider>;
}

export function useTrial(): TrialState {
  return useContext(TrialContext);
}
