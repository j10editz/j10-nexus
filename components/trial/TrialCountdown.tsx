"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, AlertTriangle, ArrowRight, Clock } from "lucide-react";

export type TrialBannerState = "active" | "under_12h" | "expired";

export interface TrialCountdownProps {
  endsAt: string | null;
  serverNow?: string | null;
  status?: string | null;
  className?: string;
  checkoutHref?: string;
  isDemoMode?: boolean;
  demoLabel?: string;
  onStateChange?: (state: TrialBannerState) => void;
}

export function TrialCountdown({
  endsAt,
  serverNow,
  status,
  className = "",
  checkoutHref = "/pricing",
  isDemoMode = false,
  demoLabel,
  onStateChange,
}: TrialCountdownProps) {
  // Sync client time with authoritative server-provided timestamp (UTC safe)
  const offset = useMemo(() => {
    if (!serverNow) return 0;
    const serverTime = new Date(serverNow).getTime();
    return Number.isNaN(serverTime) ? 0 : serverTime - Date.now();
  }, [serverNow]);

  const calculateRemaining = () => {
    if (!endsAt) return 0;
    const endMs = new Date(endsAt).getTime();
    if (Number.isNaN(endMs)) return 0;
    const nowMs = Date.now() + offset;
    return Math.max(0, endMs - nowMs);
  };

  const [remaining, setRemaining] = useState<number>(calculateRemaining);
  const [mounted, setMounted] = useState<boolean>(false);

  useEffect(() => {
    setMounted(true);
    const tick = () => {
      setRemaining(calculateRemaining());
    };
    tick();

    // Regular 1-second tick
    const timer = window.setInterval(tick, 1000);

    // Resync immediately on tab wake-up or window focus (handles tab suspension)
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        tick();
      }
    };
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [endsAt, offset]);

  const isExpired = status === "expired" || (Boolean(endsAt) && remaining <= 0);
  const isUnder12Hours = !isExpired && remaining > 0 && remaining < 12 * 3600 * 1000;
  const bannerState: TrialBannerState = isExpired ? "expired" : isUnder12Hours ? "under_12h" : "active";

  useEffect(() => {
    onStateChange?.(bannerState);
  }, [bannerState, onStateChange]);

  // If there is no trial end date and status is not expired, do not render a trial banner
  if (!endsAt && status !== "expired") {
    return null;
  }

  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);

  // 1. EXPIRED STATE: Red upgrade state; execution controls disabled
  if (isExpired) {
    return (
      <div
        data-testid="trial-countdown"
        data-trial-state="expired"
        className={`mx-auto mb-4 max-w-6xl rounded-2xl border border-rose-500/40 bg-gradient-to-r from-rose-950/80 via-rose-900/40 to-black/80 px-4 py-3.5 sm:px-6 sm:py-4 shadow-[0_0_25px_rgba(244,63,94,0.18)] backdrop-blur-md ${className}`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-rose-500/40 bg-rose-500/20 text-rose-300">
              <AlertCircle size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded-md border border-rose-500/40 bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-200">
                  Trial Expired
                </span>
                <span className="text-xs font-semibold text-rose-300">Execution Paused</span>
              </div>
              <p className="mt-1 text-xs text-rose-100/90 leading-relaxed">
                Your 72-hour trial has ended. This workspace is read-only. AI and automation execution controls are disabled to protect data integrity.
                Workspace navigation, settings, and billing remain fully available.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            <Link
              href={checkoutHref}
              data-testid="trial-checkout-cta"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-rose-600/30 transition hover:brightness-110 active:scale-95"
            >
              Upgrade to resume AI, automations, messages, and lead processing.
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 2. UNDER 12 HOURS: Amber urgency banner with checkout CTA
  if (isUnder12Hours) {
    return (
      <div
        data-testid="trial-countdown"
        data-trial-state="under_12h"
        className={`mx-auto mb-4 max-w-6xl rounded-2xl border border-amber-500/50 bg-gradient-to-r from-amber-950/80 via-amber-900/35 to-black/80 px-4 py-3.5 sm:px-6 sm:py-4 shadow-[0_0_25px_rgba(245,158,11,0.18)] backdrop-blur-md ${className}`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-500/40 bg-amber-500/20 text-amber-300">
              <AlertTriangle size={18} className="animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded-md border border-amber-500/40 bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-200">
                  Ending Soon
                </span>
                <span className="text-xs font-mono font-bold text-amber-300">
                  {hours}h {minutes}m remaining
                </span>
              </div>
              <p className="mt-1 text-xs text-amber-100/90 leading-relaxed">
                Urgent: Your 72-hour trial concludes in less than 12 hours. Connect a commercial plan to prevent interruption of your autonomous AI workforce.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            <Link
              href={checkoutHref}
              data-testid="trial-checkout-cta"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 px-4 py-2 text-xs font-bold text-black shadow-lg shadow-amber-500/30 transition hover:brightness-110 active:scale-95"
            >
              Select Plan &amp; Keep AI Active
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 3. ACTIVE STATE: Normal 72-hour trial operating state
  // Only display demo wording when an explicit demo state exists (Requirement 1)
  const activeDetailCopy = isDemoMode
    ? (demoLabel || "Interactive demo mode. AI and automations are fully enabled for testing.")
    : "Autonomous AI workforce active. AI and automations are fully enabled for testing.";

  return (
    <div
      data-testid="trial-countdown"
      data-trial-state="active"
      className={`mx-auto mb-4 max-w-6xl rounded-2xl border border-cyan-500/30 bg-gradient-to-r from-[#0b1020]/90 via-[#0e172a]/80 to-black/80 px-4 py-3 sm:px-6 sm:py-3.5 shadow-[0_0_20px_rgba(6,182,212,0.12)] backdrop-blur-md ${className}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-cyan-400/30 bg-cyan-500/10 text-cyan-300">
            <Clock size={16} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-md border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-cyan-300">
                72-Hour Trial
              </span>
              {isDemoMode && (
                <span className="rounded-md border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300">
                  Demo
                </span>
              )}
              <span className="text-xs font-mono font-bold text-white">
                {hours}h {minutes}m remaining
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-[#8d96a8]">
              {activeDetailCopy}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
          <Link
            href={checkoutHref}
            data-testid="trial-checkout-cta"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-300 hover:text-cyan-100 underline decoration-cyan-400/40 hover:decoration-cyan-200 transition"
          >
            View Plans &amp; Pricing
            <ArrowRight size={12} />
          </Link>
        </div>
      </div>
    </div>
  );
}
