"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  MessageSquare,
  RefreshCw,
} from "lucide-react";

interface SubscriptionData {
  id: string;
  planId: string;
  planName: string;
  status: string;
  monthlyMessageLimit: number;
  messagesUsed: number;
  usagePercent: number;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  gracePeriodEnd: string | null;
  daysRemaining: number;
  stripeCustomerId: string | null;
}

interface PlanDefinition {
  id: string;
  name: string;
  price: number;
  interval: string;
  description: string;
  messageLimit: number;
  aiEmployees: number;
  popular?: boolean;
  features: string[];
}

export default function BillingPage() {
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [plans, setPlans] = useState<PlanDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [upgradingId, setUpgradingId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function loadBillingData() {
    try {
      setLoading(true);
      const res = await fetch("/api/billing/subscription");
      const data = await res.json();
      if (data.success) {
        setSubscription(data.subscription);
        setPlans(data.plans || []);
      }
    } catch (err) {
      console.error("Failed to load billing:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBillingData();
  }, []);

  async function handlePlanSwitch(planId: string) {
    if (subscription?.planId === planId) return;

    setUpgradingId(planId);
    setStatusMessage(null);

    try {
      const res = await fetch("/api/billing/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      const data = await res.json();

      if (data.success) {
        setStatusMessage({ type: "success", text: data.message });
        await loadBillingData();
      } else {
        setStatusMessage({ type: "error", text: data.error || "Failed to switch plan." });
      }
    } catch {
      setStatusMessage({ type: "error", text: "Network error during plan update." });
    } finally {
      setUpgradingId(null);
    }
  }

  const currentPlan = plans.find((p) => p.id === subscription?.planId) || plans[0];
  const usagePercent = subscription?.usagePercent ?? 0;

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
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
                Billing & Quota
              </span>
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Subscription & Entitlements
            </h1>
            <p className="mt-1 text-sm text-white/50">
              Manage your J10 NEXUS subscription tier, automated message quotas, and Stripe billing.
            </p>
          </div>

          <button
            onClick={() => loadBillingData()}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-medium text-white/80 transition hover:bg-white/[0.08]"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Sync Entitlements
          </button>
        </div>

        {/* Feedback Alert */}
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

        {/* Top Metric Cards */}
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Current Tier */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-white/40">
                Active Plan
              </span>
              <span className="rounded-full bg-violet-500/20 px-2.5 py-0.5 text-[11px] font-bold text-violet-300">
                {subscription?.planName?.toUpperCase() ?? "STARTER"}
              </span>
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-3xl font-bold">
                ${currentPlan?.price ?? 49}
              </span>
              <span className="text-xs text-white/40">/ month</span>
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-400">
              <CheckCircle2 size={13} />
              <span>Status: {subscription?.status ?? "active"}</span>
            </div>
          </div>

          {/* Monthly Message Quota */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-white/40">
                Message Quota
              </span>
              <MessageSquare size={16} className="text-blue-400" />
            </div>
            <div className="mt-4 flex items-baseline gap-1.5">
              <span className="text-3xl font-bold">
                {subscription?.messagesUsed.toLocaleString() ?? 0}
              </span>
              <span className="text-sm text-white/40">
                / {subscription?.monthlyMessageLimit.toLocaleString() ?? "1,000"}
              </span>
            </div>
            {/* Progress bar */}
            <div className="mt-3">
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    usagePercent > 90
                      ? "bg-rose-500"
                      : usagePercent > 70
                      ? "bg-amber-400"
                      : "bg-blue-500"
                  }`}
                  style={{ width: `${Math.max(4, usagePercent)}%` }}
                />
              </div>
              <div className="mt-1.5 flex justify-between text-[11px] text-white/40">
                <span>{usagePercent}% utilized</span>
                <span>
                  {((subscription?.monthlyMessageLimit ?? 1000) - (subscription?.messagesUsed ?? 0)).toLocaleString()} msgs left
                </span>
              </div>
            </div>
          </div>

          {/* AI Employee Slots */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-white/40">
                AI Workforce Slots
              </span>
              <Bot size={16} className="text-emerald-400" />
            </div>
            <div className="mt-4 flex items-baseline gap-1.5">
              <span className="text-3xl font-bold">
                {currentPlan?.aiEmployees === 999 ? "Unlimited" : currentPlan?.aiEmployees ?? 2}
              </span>
              <span className="text-xs text-white/40">active agents</span>
            </div>
            <p className="mt-3 text-xs text-white/40">
              Autonomous agents running 24/7
            </p>
          </div>

          {/* Cycle Renewal */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-white/40">
                Cycle Renewal
              </span>
              <Clock size={16} className="text-amber-400" />
            </div>
            <div className="mt-4 flex items-baseline gap-1.5">
              <span className="text-3xl font-bold">
                {subscription?.daysRemaining ?? 30}
              </span>
              <span className="text-xs text-white/40">days remaining</span>
            </div>
            <p className="mt-3 text-xs text-white/40">
              Resets quota on{" "}
              {subscription?.currentPeriodEnd
                ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
                : "next cycle"}
            </p>
          </div>
        </div>

        {/* Tier Comparison & Upgrade Grid */}
        <div className="mt-12">
          <div className="text-center">
            <h2 className="text-2xl font-bold tracking-tight">
              Choose your J10 NEXUS Operating Tier
            </h2>
            <p className="mt-2 text-sm text-white/50">
              Scale autonomous capacity, WhatsApp message throughput, and multi-agent coordination seamlessly.
            </p>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-3">
            {plans.map((plan) => {
              const isCurrent = subscription?.planId === plan.id;
              const isPopular = plan.popular;

              return (
                <div
                  key={plan.id}
                  className={`relative flex flex-col justify-between rounded-3xl border p-6 transition-all sm:p-8 ${
                    isCurrent
                      ? "border-violet-500/50 bg-[#12131b] shadow-xl shadow-violet-950/30"
                      : isPopular
                      ? "border-blue-500/30 bg-[#11131a] hover:border-blue-500/50"
                      : "border-white/[0.08] bg-[#111216] hover:border-white/20"
                  }`}
                >
                  {isPopular && (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-blue-500 to-violet-600 px-3.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white shadow-lg shadow-blue-500/20">
                      Most Popular
                    </div>
                  )}

                  <div>
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-bold text-white">
                        {plan.name}
                      </h3>
                      {isCurrent && (
                        <span className="rounded-full bg-violet-500/20 px-2.5 py-0.5 text-xs font-semibold text-violet-300">
                          Current Tier
                        </span>
                      )}
                    </div>

                    <p className="mt-2 text-xs leading-5 text-white/50">
                      {plan.description}
                    </p>

                    <div className="mt-6 flex items-baseline gap-1">
                      <span className="text-4xl font-extrabold tracking-tight">
                        ${plan.price}
                      </span>
                      <span className="text-sm font-medium text-white/40">
                        / month
                      </span>
                    </div>

                    <div className="my-6 border-t border-white/[0.08]" />

                    <div className="space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-wider text-white/40">
                        Included Features
                      </p>
                      {plan.features.map((feature, idx) => (
                        <div key={idx} className="flex items-start gap-2.5 text-xs text-white/80">
                          <Check size={15} className="text-emerald-400 shrink-0 mt-0.5" />
                          <span>{feature}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-8 pt-4">
                    {isCurrent ? (
                      <button
                        disabled
                        className="w-full rounded-xl border border-white/10 bg-white/[0.05] py-3 text-center text-xs font-semibold text-white/40 cursor-default"
                      >
                        Active Plan
                      </button>
                    ) : (
                      <button
                        onClick={() => handlePlanSwitch(plan.id)}
                        disabled={upgradingId === plan.id}
                        className={`w-full flex items-center justify-center gap-2 rounded-xl py-3 text-xs font-semibold transition ${
                          isPopular
                            ? "bg-gradient-to-r from-blue-500 to-violet-600 text-white hover:brightness-110 shadow-lg shadow-blue-500/20"
                            : "border border-white/15 bg-white/[0.08] text-white hover:bg-white/[0.14]"
                        }`}
                      >
                        {upgradingId === plan.id ? (
                          <>
                            <RefreshCw size={14} className="animate-spin" />
                            Updating Tier...
                          </>
                        ) : (
                          <>
                            <span>Switch to {plan.name}</span>
                            <ArrowRight size={14} />
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Enterprise & Payment Security Note */}
        <div className="mt-12 rounded-2xl border border-white/[0.08] bg-[#111216] p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3.5">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400 shrink-0">
                <CreditCard size={20} />
              </div>
              <div>
                <h3 className="font-semibold">
                  Secured by Stripe & Meta Certified Graph API
                </h3>
                <p className="mt-1 text-xs text-white/50 max-w-xl">
                  J10 NEXUS processes payments through PCI DSS Level 1 certified Stripe infrastructure. Automated rate-limiting enforces zero-overage surprise charges.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Link
                href="/dashboard/finance"
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs font-medium text-white/80 transition hover:bg-white/[0.08]"
              >
                <span>View Revenue & Invoices</span>
                <ArrowRight size={13} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
