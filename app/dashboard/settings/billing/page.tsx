"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  ExternalLink,
  HelpCircle,
  Key,
  Lock,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  Shield,
  ShieldCheck,
  Sparkles,
  Users,
  XCircle,
  Zap,
} from "lucide-react";

interface SubscriptionData {
  id: string | null;
  workspaceId: string;
  planId: string;
  planName: string;
  status: string;
  stripeStatus: string;
  entitlementState: string;
  billingHoldReason: string;
  monthlyMessageLimit: number;
  messagesUsed: number;
  usagePercent: number;
  seatsQuota: number;
  seatsUsed: number;
  channelsQuota: number;
  channelsUsed: number;
  aiConversationsQuota: number;
  aiConversationsUsed: number;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  gracePeriodEnd: string | null;
  daysRemaining: number;
  trialStart: string | null;
  trialEnd: string | null;
  trialActive: boolean;
  trialDaysRemaining: number;
  hasUsedTrial: boolean;
  dunningStatus: string;
  dunningAttemptCount: number;
  lastDunningAt: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  founderCycleCount?: number;
  founderCycleTarget?: number;
  founderStartDate?: string | null;
  expectedTransitionDate?: string | null;
  priceTransitionStatus?: string;
}

interface SlotStatus {
  maxSlots: number;
  activeEnrollments: number;
  pendingReservations: number;
  occupiedSlots: number;
  availableSlots: number;
  isFull: boolean;
  workspaceReservationStatus: string;
  hasWorkspaceReservation: boolean;
}

interface PlanDefinition {
  id: string;
  name: string;
  price: number;
  standardPrice?: number;
  introductoryCycleDuration?: number;
  interval: string;
  description: string;
  messageLimit: number;
  seatsAllowed?: number;
  connectedChannelsAllowed?: number;
  features: string[];
  badge?: string;
  popular?: boolean;
}

interface UsageAccountingData {
  quota: {
    limit: number;
    used: number;
    remaining: number;
    usagePercent: number;
  };
  metricsBreakdown: {
    whatsapp_outbound: number;
    whatsapp_inbound: number;
    ai_tokens: number;
    ai_agent_run: number;
    campaign_broadcast: number;
    workflow_execution: number;
  };
}

export default function BillingPage() {
  const searchParams = useSearchParams();
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [slotStatus, setSlotStatus] = useState<SlotStatus | null>(null);
  const [plans, setPlans] = useState<PlanDefinition[]>([]);
  const [usageAccounting, setUsageAccounting] = useState<UsageAccountingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [invitationCode, setInvitationCode] = useState("");
  const [validatingInvite, setValidatingInvite] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [upgradingId, setUpgradingId] = useState<string | null>(null);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [cancelingSub, setCancelingSub] = useState(false);
  const [reactivatingSub, setReactivatingSub] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [checkingPortalReturn, setCheckingPortalReturn] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function loadBillingData(refresh = false) {
    try {
      setLoading(true);
      const subUrl = refresh ? "/api/billing/subscription?refresh=true" : "/api/billing/subscription";
      const [subRes, usageRes] = await Promise.all([
        fetch(subUrl),
        fetch("/api/billing/usage"),
      ]);

      const subData = await subRes.json();
      if (subData.success) {
        setSubscription(subData.subscription);
        setSlotStatus(subData.slotStatus || null);
        setPlans(subData.plans || []);
      }

      const usageData = await usageRes.json();
      if (usageData.success) {
        setUsageAccounting(usageData.accounting);
      }
    } catch (err) {
      console.error("Failed to load billing:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const isPortalReturn = searchParams.get("portal_return") === "true";
    if (isPortalReturn) {
      setCheckingPortalReturn(true);
      loadBillingData(true).finally(() => {
        setCheckingPortalReturn(false);
      });
    } else {
      loadBillingData();
    }
    const queryCode = searchParams.get("invite");
    if (queryCode) {
      setInvitationCode(queryCode);
    }
  }, [searchParams]);

  async function handleValidateInvite() {
    if (!invitationCode.trim()) {
      setInviteError("Please enter your single-use invitation code.");
      return;
    }

    try {
      setValidatingInvite(true);
      setInviteError(null);
      setInviteSuccess(null);

      const res = await fetch("/api/billing/invitation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invitationCode: invitationCode.trim() }),
      });

      const data = await res.json();
      if (data.success && data.valid) {
        setInviteSuccess("Invitation code verified! You can now enroll in J10 Founder’s 3.");
      } else {
        setInviteError(data.error || "Invalid or expired invitation code.");
      }
    } catch {
      setInviteError("Failed to validate invitation code. Please try again.");
    } finally {
      setValidatingInvite(false);
    }
  }

  async function handleCheckout(planId: string) {
    if (subscription?.planId === planId && subscription?.status === "active") return;

    setUpgradingId(planId);
    setStatusMessage(null);

    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId,
          invitationCode: planId === "founders3" ? invitationCode.trim() : undefined,
        }),
      });
      const data = await res.json();

      if (data.success && data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        setStatusMessage({
          type: "error",
          text: data.error || data.message || "Failed to initiate Stripe Checkout.",
        });
        setUpgradingId(null);
      }
    } catch {
      setStatusMessage({ type: "error", text: "Network error during checkout initiation." });
      setUpgradingId(null);
    }
  }

  async function handleCancelSubscription() {
    try {
      setCancelingSub(true);
      setStatusMessage(null);

      const res = await fetch("/api/billing/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "User requested period end cancellation via dashboard." }),
      });
      const data = await res.json();

      if (data.success) {
        setShowCancelModal(false);
        setStatusMessage({
          type: "success",
          text: data.message || "Subscription scheduled to cancel at period end.",
        });
        await loadBillingData();
      } else {
        setStatusMessage({ type: "error", text: data.error || "Failed to cancel subscription." });
      }
    } catch {
      setStatusMessage({ type: "error", text: "Network error processing cancellation." });
    } finally {
      setCancelingSub(false);
    }
  }

  async function handleReactivateSubscription() {
    try {
      setReactivatingSub(true);
      setStatusMessage(null);

      const res = await fetch("/api/billing/reactivate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();

      if (data.success) {
        setStatusMessage({
          type: "success",
          text: "Your subscription will continue without interruption.",
        });
        await loadBillingData(true);
      } else {
        setStatusMessage({ type: "error", text: data.error || "Failed to reactivate subscription." });
      }
    } catch {
      setStatusMessage({ type: "error", text: "Network error processing reactivation." });
    } finally {
      setReactivatingSub(false);
    }
  }

  async function handleOpenPortal() {
    try {
      setOpeningPortal(true);
      setStatusMessage(null);

      const res = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();

      if (data.success && data.url) {
        window.open(data.url, "_blank");
      } else {
        setStatusMessage({ type: "error", text: data.error || "Unable to open Stripe Customer Portal." });
      }
    } catch {
      setStatusMessage({ type: "error", text: "Failed to connect to Stripe Customer Portal." });
    } finally {
      setOpeningPortal(false);
    }
  }

  const isFounders3 = subscription?.planId === "founders3";
  const isPastDue = subscription?.status === "past_due";
  const isCanceledAtPeriodEnd = Boolean(
    subscription?.cancelAtPeriodEnd || subscription?.status === "canceled_at_period_end"
  );
  const isCanceled = subscription?.status === "canceled";
  const isActive = subscription?.status === "active";
  const isSlotFull = Boolean(slotStatus?.isFull && !slotStatus?.hasWorkspaceReservation && !isFounders3);

  const formattedPeriodEnd = subscription?.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "the end of your billing cycle";

  const aiConversationsLimit = subscription?.aiConversationsQuota || (isFounders3 ? 1000 : 1000);
  const aiConversationsUsed = subscription?.aiConversationsUsed || 0;
  const aiUsagePercent = aiConversationsLimit > 0 ? Math.round((aiConversationsUsed / aiConversationsLimit) * 100) : 0;
  const isNearLimit = aiUsagePercent >= 80 && aiUsagePercent < 100;
  const isAtLimit = aiUsagePercent >= 100;

  const seatsLimit = subscription?.seatsQuota || 3;
  const seatsUsed = subscription?.seatsUsed || 1;

  const channelsLimit = subscription?.channelsQuota || 2;
  const channelsUsed = subscription?.channelsUsed || 1;

  return (
    <div className="min-h-[calc(100dvh-72px)] bg-[#09090B] px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1280px]">
        {/* Navigation & Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-6">
          <div>
            <div className="flex items-center gap-2">
              <Link
                href="/dashboard/settings"
                className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40 hover:text-white/70"
              >
                Settings
              </Link>
              <span className="text-white/20">/</span>
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">
                Billing & Entitlements
              </span>
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
              Subscription & Plan Entitlements
            </h1>
            <p className="mt-1 text-sm text-white/50">
              Manage your workspace subscription, verified quota meters, Stripe Customer Portal, and Founder’s 3 pilot slots.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleOpenPortal}
              disabled={openingPortal}
              className="flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-xs font-medium text-cyan-200 transition hover:bg-cyan-500/20"
            >
              <CreditCard size={14} />
              <span>{openingPortal ? "Connecting..." : "Stripe Customer Portal"}</span>
              <ExternalLink size={12} className="opacity-60" />
            </button>

            <button
              onClick={() => loadBillingData()}
              disabled={loading}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-medium text-white/80 transition hover:bg-white/[0.08]"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              Sync Status
            </button>
          </div>
        </div>

        {/* Portal Return Live Checking State */}
        {checkingPortalReturn && (
          <div className="mt-6 flex items-center gap-3 rounded-2xl border border-cyan-500/40 bg-cyan-950/25 p-4 text-sm text-cyan-200">
            <RefreshCw size={18} className="animate-spin text-cyan-400 shrink-0" />
            <span>Checking billing status…</span>
          </div>
        )}

        {/* Status Alerts & Warnings */}
        {statusMessage && (
          <div
            className={`mt-6 flex items-center justify-between rounded-xl border p-4 text-sm ${
              statusMessage.type === "success"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                : "border-rose-500/30 bg-rose-500/10 text-rose-200"
            }`}
          >
            <div className="flex items-center gap-3">
              {statusMessage.type === "success" ? (
                <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle size={18} className="text-rose-400 shrink-0" />
              )}
              <span>{statusMessage.text}</span>
            </div>
            <button
              onClick={() => setStatusMessage(null)}
              className="text-xs opacity-60 hover:opacity-100"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Past Due Grace Period Alert */}
        {isPastDue && (
          <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-rose-500/40 bg-rose-950/20 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3.5">
              <div className="rounded-xl bg-rose-500/20 p-2 text-rose-400">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-rose-200">
                  Payment Past Due — 7-Day Grace Period Active
                </h3>
                <p className="mt-1 text-xs text-rose-200/70">
                  Your last subscription renewal invoice failed (Attempt #{subscription?.dunningAttemptCount ?? 1}).
                  Your workspace is currently within a 7-day grace period. Inbound leads and CRM records remain safe, but automated AI replies will be paused once grace expires.
                </p>
              </div>
            </div>
            <button
              onClick={handleOpenPortal}
              className="shrink-0 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-rose-600/30 transition hover:bg-rose-500"
            >
              Update Payment Method
            </button>
          </div>
        )}

        {/* Canceled at Period End Warning */}
        {isCanceledAtPeriodEnd && (
          <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-amber-500/40 bg-amber-950/25 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3.5">
              <div className="rounded-xl bg-amber-500/20 p-2 text-amber-400">
                <Clock size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-amber-500/20 border border-amber-500/30 px-2.5 py-0.5 text-[11px] font-bold text-amber-300">
                    Cancellation scheduled
                  </span>
                </div>
                <h3 className="mt-1.5 text-sm font-semibold text-amber-200">
                  Your plan remains active until {formattedPeriodEnd}. You will not be charged again unless you reactivate.
                </h3>
                <p className="mt-1 text-xs text-amber-200/70">
                  All Founder entitlements, AI conversation meters, and team member seats remain fully active and occupied through the end of your billing cycle.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button
                onClick={handleReactivateSubscription}
                disabled={reactivatingSub}
                className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-semibold text-black shadow-lg shadow-amber-500/20 transition hover:bg-amber-400 disabled:opacity-50"
              >
                <RotateCcw size={14} className={reactivatingSub ? "animate-spin" : ""} />
                <span>{reactivatingSub ? "Reactivating..." : "Keep my subscription"}</span>
              </button>
              <button
                onClick={handleOpenPortal}
                disabled={openingPortal}
                className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-white/5 px-4 py-2.5 text-xs font-semibold text-amber-200 transition hover:bg-white/10"
              >
                <CreditCard size={14} />
                <span>Manage billing</span>
              </button>
            </div>
          </div>
        )}

        {/* Quota Warning (80% or 100%) */}
        {(isNearLimit || isAtLimit) && (
          <div
            className={`mt-6 flex flex-col gap-3 rounded-2xl border p-5 sm:flex-row sm:items-center sm:justify-between ${
              isAtLimit
                ? "border-amber-500/40 bg-amber-950/20"
                : "border-blue-500/30 bg-blue-950/20"
            }`}
          >
            <div className="flex items-start gap-3.5">
              <div
                className={`rounded-xl p-2 ${
                  isAtLimit ? "bg-amber-500/20 text-amber-400" : "bg-blue-500/20 text-blue-400"
                }`}
              >
                <AlertCircle size={20} />
              </div>
              <div>
                <h3
                  className={`text-sm font-semibold ${
                    isAtLimit ? "text-amber-200" : "text-blue-200"
                  }`}
                >
                  {isAtLimit
                    ? "Monthly AI Conversation Allowance Reached (100%)"
                    : "Monthly AI Conversation Warning (80% Quota Used)"}
                </h3>
                <p
                  className={`mt-1 text-xs ${
                    isAtLimit ? "text-amber-200/70" : "text-blue-200/70"
                  }`}
                >
                  {isAtLimit
                    ? "Your workspace has used its 1,000 monthly AI-handled conversations. Inbound customer leads will NEVER be dropped—new messages will be saved and routed directly to human operators in your Unified Inbox."
                    : `You have consumed ${aiConversationsUsed} of your ${aiConversationsLimit} included AI conversations for this billing period.`}
                </p>
              </div>
            </div>
            <div className="shrink-0 flex items-center gap-2 text-xs font-medium text-white/60">
              <span>Resets on {subscription?.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toLocaleDateString() : "next cycle"}</span>
            </div>
          </div>
        )}

        {/* Top Metric Cards */}
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Active Plan Card */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-white/40">
                Active Plan
              </span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                  isCanceledAtPeriodEnd
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                    : isActive
                    ? "bg-cyan-500/20 text-cyan-300"
                    : isPastDue
                    ? "bg-rose-500/20 text-rose-300"
                    : isCanceled
                    ? "bg-white/10 text-white/50"
                    : "bg-white/10 text-white/50"
                }`}
              >
                {isCanceledAtPeriodEnd
                  ? "Cancellation scheduled"
                  : subscription?.planId === "founders3"
                  ? "FOUNDER’S 3"
                  : subscription?.planName?.toUpperCase() ?? "UNCONFIGURED"}
              </span>
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-3xl font-bold">
                ${subscription?.planId === "founders3"
                  ? (subscription.priceTransitionStatus === "transitioned" ? "149" : "99")
                  : "0"}
              </span>
              <span className="text-xs text-white/40">
                / month {subscription?.planId === "founders3" && (subscription.priceTransitionStatus === "transitioned" ? "(Standard)" : "(Founder's 3)")}
              </span>
            </div>
            {subscription?.planId === "founders3" && (
              <div className="mt-2 text-xs text-cyan-300/80">
                <span>
                  Paid Cycle: {subscription?.founderCycleCount ?? 1} of {subscription?.founderCycleTarget ?? 12}
                </span>
                {subscription?.expectedTransitionDate && (
                  <p className="text-[11px] text-white/40 mt-0.5">
                    {subscription?.priceTransitionStatus === "transitioned"
                      ? "Standard $149/mo pricing active"
                      : `Transitions to $149/mo on ${new Date(subscription.expectedTransitionDate).toLocaleDateString()}`}
                  </p>
                )}
              </div>
            )}
            <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-400">
              <CheckCircle2 size={13} />
              <span>
                Status: {isCanceledAtPeriodEnd ? "Active through period end" : (subscription?.status ?? "none")} (Entitlements: {subscription?.entitlementState ?? "active"})
              </span>
            </div>
          </div>

          {/* AI Conversations Meter */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-white/40">
                AI Conversations
              </span>
              <MessageSquare size={16} className="text-cyan-400" />
            </div>
            <div className="mt-4 flex items-baseline gap-1.5">
              <span className="text-3xl font-bold">
                {aiConversationsUsed.toLocaleString()}
              </span>
              <span className="text-sm text-white/40">
                / {aiConversationsLimit.toLocaleString()}
              </span>
            </div>
            <div className="mt-3">
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    aiUsagePercent >= 100
                      ? "bg-rose-500"
                      : aiUsagePercent >= 80
                      ? "bg-amber-400"
                      : "bg-cyan-500"
                  }`}
                  style={{ width: `${Math.min(100, Math.max(4, aiUsagePercent))}%` }}
                />
              </div>
              <div className="mt-1.5 flex justify-between text-[11px] text-white/40">
                <span>{aiUsagePercent}% utilized</span>
                <span>{Math.max(0, aiConversationsLimit - aiConversationsUsed).toLocaleString()} remaining</span>
              </div>
            </div>
          </div>

          {/* Team Seats */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-white/40">
                Team Member Seats
              </span>
              <Users size={16} className="text-violet-400" />
            </div>
            <div className="mt-4 flex items-baseline gap-1.5">
              <span className="text-3xl font-bold">{seatsUsed}</span>
              <span className="text-sm text-white/40">/ {seatsLimit}</span>
            </div>
            <p className="mt-3 text-xs text-white/40">
              {seatsLimit - seatsUsed} additional seat{seatsLimit - seatsUsed !== 1 ? "s" : ""} available
            </p>
          </div>

          {/* Billing Cycle / Renewal */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-white/40">
                {isCanceledAtPeriodEnd ? "Access ends" : "Next renewal"}
              </span>
              <Clock size={16} className={isCanceledAtPeriodEnd ? "text-amber-400" : "text-emerald-400"} />
            </div>
            <div className="mt-4 flex items-baseline gap-1.5">
              <span className="text-3xl font-bold">
                {subscription?.daysRemaining ?? 30}
              </span>
              <span className="text-xs text-white/40">days remaining</span>
            </div>
            <p className="mt-3 text-xs text-white/40">
              {isCanceledAtPeriodEnd
                ? `Access ends on ${formattedPeriodEnd}`
                : subscription?.currentPeriodEnd
                ? `Renews on ${formattedPeriodEnd}`
                : "No active billing cycle"}
            </p>
          </div>
        </div>

        {/* Founder's 3 Pilot Offer & Slot Reservation Section */}
        <div className="mt-12 rounded-3xl border border-cyan-500/30 bg-gradient-to-b from-[#101524] to-[#0d0f17] p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-6">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-cyan-500/20 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-cyan-300">
                  Founder’s 3
                </span>
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300">
                  $0 Setup
                </span>
                <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-0.5 text-[11px] font-medium text-violet-300">
                  Concierge Onboarding Included
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] font-medium text-white/60">
                  Invite-Only
                </span>
              </div>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-white">
                J10 Founder’s 3 — $99/month
              </h2>
              <p className="mt-1 text-sm text-white/60 max-w-2xl">
                <strong>$99/month for your first 12 paid months, then $149/month.</strong> Cancel anytime with zero setup fees or automatic overage penalties. Exactly 3 Founder business seats available.
              </p>
            </div>

            {/* Live Pilot Slot Counter */}
            <div className="rounded-2xl border border-white/10 bg-black/40 p-4 text-center min-w-[200px]">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-white/40">
                Founder Capacity
              </span>
              <div className="mt-1 flex items-center justify-center gap-1.5 text-2xl font-bold">
                <span className="text-cyan-400">{slotStatus?.occupiedSlots ?? 0}</span>
                <span className="text-white/40">/</span>
                <span className="text-white/70">{slotStatus?.maxSlots ?? 3}</span>
              </div>
              <p className="mt-1 text-[11px] text-white/50">
                {isSlotFull
                  ? "All 3 Founder seats occupied"
                  : `${slotStatus?.availableSlots ?? 3} seat${(slotStatus?.availableSlots ?? 3) !== 1 ? "s" : ""} remaining`}
              </p>
            </div>
          </div>

          <div className="mt-8 grid gap-8 lg:grid-cols-12">
            {/* Package Specifications */}
            <div className="lg:col-span-7 space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
                Included Founder Entitlements
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex items-start gap-2.5 text-xs text-white/80">
                  <Check size={16} className="text-cyan-400 shrink-0 mt-0.5" />
                  <span><strong>$99/mo for first 12 paid months</strong> (then $149/mo)</span>
                </div>
                <div className="flex items-start gap-2.5 text-xs text-white/80">
                  <Check size={16} className="text-cyan-400 shrink-0 mt-0.5" />
                  <span><strong>Tenant-grounded AI Receptionist</strong> runtime</span>
                </div>
                <div className="flex items-start gap-2.5 text-xs text-white/80">
                  <Check size={16} className="text-cyan-400 shrink-0 mt-0.5" />
                  <span><strong>Website lead capture</strong> & booking handoff</span>
                </div>
                <div className="flex items-start gap-2.5 text-xs text-white/80">
                  <Check size={16} className="text-cyan-400 shrink-0 mt-0.5" />
                  <span><strong>Telegram messaging</strong> integration</span>
                </div>
                <div className="flex items-start gap-2.5 text-xs text-white/80">
                  <Check size={16} className="text-cyan-400 shrink-0 mt-0.5" />
                  <span><strong>Unified Inbox</strong> & operator takeover</span>
                </div>
                <div className="flex items-start gap-2.5 text-xs text-white/80">
                  <Check size={16} className="text-cyan-400 shrink-0 mt-0.5" />
                  <span><strong>CRM contact & lead</strong> persistence</span>
                </div>
                <div className="flex items-start gap-2.5 text-xs text-white/80">
                  <Check size={16} className="text-cyan-400 shrink-0 mt-0.5" />
                  <span><strong>Lead qualification</strong> & booking-link handoff</span>
                </div>
                <div className="flex items-start gap-2.5 text-xs text-white/80">
                  <Check size={16} className="text-cyan-400 shrink-0 mt-0.5" />
                  <span><strong>Services, pricing, hours & FAQ</strong> grounding</span>
                </div>
                <div className="flex items-start gap-2.5 text-xs text-white/80">
                  <Check size={16} className="text-cyan-400 shrink-0 mt-0.5" />
                  <span><strong>Founder concierge setup</strong> & direct engineering support</span>
                </div>
                <div className="flex items-start gap-2.5 text-xs text-white/80">
                  <Check size={16} className="text-cyan-400 shrink-0 mt-0.5" />
                  <span><strong>1,000 AI-handled conversations</strong> / month</span>
                </div>
                <div className="flex items-start gap-2.5 text-xs text-white/80">
                  <Check size={16} className="text-cyan-400 shrink-0 mt-0.5" />
                  <span><strong>3 Team member seats</strong> included</span>
                </div>
                <div className="flex items-start gap-2.5 text-xs text-white/80">
                  <Check size={16} className="text-cyan-400 shrink-0 mt-0.5" />
                  <span><strong>No setup fee</strong> — cancel anytime</span>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-white/5 bg-white/[0.02] p-3.5 text-xs text-white/50 flex items-start gap-2.5">
                <ShieldCheck size={16} className="text-cyan-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Lead Safety Guarantee:</strong> If monthly AI conversations reach 1,000, incoming customer leads are never dropped. They are routed directly to human operators in your Unified Inbox.
                </span>
              </div>
            </div>

            {/* Invitation Code Verification & Checkout Action */}
            <div className="lg:col-span-5 rounded-2xl border border-white/10 bg-black/40 p-6 flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Key size={16} className="text-cyan-400" />
                  Founder’s 3 Access Code
                </h3>
                <p className="mt-1 text-xs text-white/50">
                  Enter your single-use invitation code to unlock the $99/mo Founder’s 3 checkout.
                </p>

                {/* Invitation input */}
                {!isFounders3 && (
                  <div className="mt-4 space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="f3_inv_..."
                        value={invitationCode}
                        onChange={(e) => setInvitationCode(e.target.value)}
                        disabled={validatingInvite || upgradingId !== null}
                        className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-xs text-white placeholder-white/30 focus:border-cyan-500 focus:outline-none"
                      />
                      <button
                        onClick={handleValidateInvite}
                        disabled={validatingInvite || !invitationCode.trim()}
                        className="rounded-xl border border-white/10 bg-white/10 px-3 py-2.5 text-xs font-semibold text-white transition hover:bg-white/15 disabled:opacity-50"
                      >
                        {validatingInvite ? "Verifying..." : "Verify"}
                      </button>
                    </div>

                    {inviteError && (
                      <p className="text-xs text-rose-400 flex items-center gap-1.5">
                        <AlertCircle size={13} />
                        {inviteError}
                      </p>
                    )}

                    {inviteSuccess && (
                      <p className="text-xs text-emerald-400 flex items-center gap-1.5">
                        <CheckCircle2 size={13} />
                        {inviteSuccess}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-6 pt-4 border-t border-white/10">
                {isFounders3 && (isActive || isCanceledAtPeriodEnd) ? (
                  <div className="space-y-3">
                    {isCanceledAtPeriodEnd ? (
                      <>
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-center text-xs font-semibold text-amber-300 flex items-center justify-center gap-2">
                          <Clock size={16} />
                          Cancellation scheduled — Active until {formattedPeriodEnd}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={handleReactivateSubscription}
                            disabled={reactivatingSub}
                            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-amber-500 py-2.5 text-xs font-semibold text-black shadow-lg shadow-amber-500/20 transition hover:bg-amber-400 disabled:opacity-50"
                          >
                            <RotateCcw size={14} className={reactivatingSub ? "animate-spin" : ""} />
                            <span>{reactivatingSub ? "Reactivating..." : "Keep my subscription"}</span>
                          </button>
                          <button
                            onClick={handleOpenPortal}
                            disabled={openingPortal}
                            className="flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs font-medium text-white/80 hover:bg-white/10"
                          >
                            <CreditCard size={13} />
                            <span>Manage billing</span>
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-center text-xs font-semibold text-emerald-300 flex items-center justify-center gap-2">
                          <CheckCircle2 size={16} />
                          Enrolled in Founder’s 3 (${subscription?.priceTransitionStatus === "transitioned" ? "149" : "99"}/mo active — Cycle {subscription?.founderCycleCount ?? 1} of 12)
                        </div>
                        <button
                          onClick={() => setShowCancelModal(true)}
                          className="w-full text-center text-xs text-white/40 hover:text-rose-400 transition underline underline-offset-4"
                        >
                          Cancel subscription at period end
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => handleCheckout("founders3")}
                    disabled={upgradingId === "founders3" || isSlotFull}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 py-3 text-xs font-semibold text-white shadow-lg shadow-cyan-500/20 transition hover:brightness-110 disabled:opacity-50"
                  >
                    {upgradingId === "founders3" ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" />
                        Redirecting to Stripe Checkout...
                      </>
                    ) : isSlotFull ? (
                      <>
                        <Lock size={14} />
                        All 3 Founder Seats Claimed
                      </>
                    ) : (
                      <>
                        <span>Enroll in Founder’s 3 ($99/mo)</span>
                        <ArrowRight size={14} />
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Cancellation Modal */}
        {showCancelModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#14161f] p-6 shadow-2xl">
              <div className="flex items-start gap-3.5">
                <div className="rounded-xl bg-amber-500/20 p-2 text-amber-400">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">
                    Cancel Subscription at Period End?
                  </h3>
                  <p className="mt-1 text-xs text-white/60">
                    Your Founder’s 3 plan will remain active until the end of your current billing period (
                    {subscription?.currentPeriodEnd
                      ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
                      : "period end"}
                    ).
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-white/5 bg-white/[0.02] p-3 text-xs text-white/60 space-y-1.5">
                <p>• <strong>Inbound Leads:</strong> Lead capture and CRM history are preserved and never lost.</p>
                <p>• <strong>AI Automation:</strong> Automated AI receptionist responses will pause after period end.</p>
                <p>• <strong>Reactivation:</strong> You can reactivate with one click anytime before the period ends.</p>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setShowCancelModal(false)}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white/80 hover:bg-white/10"
                >
                  Keep Subscription
                </button>
                <button
                  onClick={handleCancelSubscription}
                  disabled={cancelingSub}
                  className="flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
                >
                  {cancelingSub ? "Processing..." : "Confirm Cancellation"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Security and Stripe Infrastructure Note */}
        <div className="mt-12 rounded-2xl border border-white/[0.08] bg-[#111216] p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3.5">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400 shrink-0">
                <Shield size={20} />
              </div>
              <div>
                <h3 className="font-semibold text-white">
                  Secured by Stripe & Verified SaaS Entitlements
                </h3>
                <p className="mt-1 text-xs text-white/50 max-w-xl">
                  J10 NEXUS processes subscriptions through PCI DSS Level 1 certified Stripe infrastructure.
                  Atomic quota locks ensure exact message accounting with zero-surprise billing.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleOpenPortal}
                disabled={openingPortal}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs font-medium text-white/80 transition hover:bg-white/[0.08]"
              >
                <CreditCard size={13} />
                <span>Customer Portal</span>
                <ExternalLink size={12} className="opacity-60" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
