"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ArrowRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  FileText,
  MessageSquare,
  Play,
  RefreshCw,
  TrendingUp,
  Users,
  ShieldCheck,
  ExternalLink,
} from "lucide-react";
import type { ExecutiveRevenueReport } from "@/lib/revenue/executive-reporting";

export default function ExecutiveRevenueDashboard() {
  const [report, setReport] = useState<ExecutiveRevenueReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Simulation State
  const [simulating, setSimulating] = useState(false);
  const [simPhone, setSimPhone] = useState("+1 (555) 982-4110");
  const [simName, setSimName] = useState("David Vance");
  const [simCompany, setSimCompany] = useState("Apex Global Trading");
  const [simMsg, setSimMsg] = useState(
    "Hi J10 team, we need enterprise pricing for your autonomous workforce to automate 15,000 monthly WhatsApp client workflows."
  );
  const [simResult, setSimResult] = useState<any>(null);

  const fetchReport = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const res = await fetch("/api/revenue/reporting");
      const data = await res.json();
      if (data.success && data.report) {
        setReport(data.report);
      } else {
        setError(data.error || "Failed to load executive report.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error fetching reporting data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  async function handleSimulateLead() {
    try {
      setSimulating(true);
      setSimResult(null);

      const res = await fetch("/api/revenue/loop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "inbound_lead",
          senderPhone: simPhone,
          customerName: simName,
          company: simCompany,
          message: simMsg,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSimResult(data.result);
        await fetchReport(true);
      } else {
        alert(`Simulation error: ${data.error}`);
      }
    } catch (err) {
      alert(`Simulation failed: ${err instanceof Error ? err.message : "Network failure"}`);
    } finally {
      setSimulating(false);
    }
  }

  async function handleSettlePayment(checkoutId: string, amount: number) {
    try {
      setRefreshing(true);
      const res = await fetch("/api/revenue/loop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reconcile_payment",
          checkoutId,
          amount,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert("Payment settled and recorded in payment_ledger! Deal stage advanced to Won.");
        await fetchReport(true);
      } else {
        alert(`Payment settlement error: ${data.error}`);
      }
    } catch (err) {
      alert(`Payment settlement failed: ${err instanceof Error ? err.message : "Error"}`);
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400">
          <RefreshCw className="h-5 w-5 animate-spin text-emerald-500" />
          <span className="text-sm font-medium">Aggregating real-time executive revenue telemetry...</span>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-950/20 p-6 text-red-400">
        <h3 className="font-semibold">Executive Telemetry Offline</h3>
        <p className="mt-1 text-sm">{error || "No report available."}</p>
        <button
          onClick={() => fetchReport(true)}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-red-900/50 px-3 py-1.5 text-xs font-medium text-red-200 hover:bg-red-800/50"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Retry Connection
        </button>
      </div>
    );
  }

  const { summary, funnel, proposals, bookings, attribution, recentLedger } = report;

  return (
    <div className="space-y-8">
      {/* Header Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Executive Revenue Loop & Funnel
            </h1>
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
              Tier 1 Certified
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            End-to-end telemetry: WhatsApp lead → Inbox → AI qualification → CRM → proposal/booking → Stripe payment → ledger.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchReport(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/80 px-3.5 py-2 text-xs font-semibold text-slate-300 transition-colors hover:border-slate-700 hover:bg-slate-800 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin text-emerald-400" : ""}`} />
            Sync Telemetry
          </button>
        </div>
      </div>

      {/* Top Level Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Verified Won Revenue */}
        <div className="relative overflow-hidden rounded-xl border border-emerald-500/20 bg-slate-900/60 p-5 shadow-xl backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
              Verified Won Revenue
            </span>
            <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-400">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-white">
            ${summary.totalVerifiedWonRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-400">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Audited via immutable payment_ledger</span>
          </div>
        </div>

        {/* Active Pipeline Value */}
        <div className="relative overflow-hidden rounded-xl border border-blue-500/20 bg-slate-900/60 p-5 shadow-xl backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
              Active Pipeline Value
            </span>
            <div className="rounded-lg bg-blue-500/10 p-2 text-blue-400">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-white">
            ${summary.activePipelineValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="mt-2 text-xs text-slate-400">
            Across qualified leads & open proposals
          </div>
        </div>

        {/* End-to-End Win Rate */}
        <div className="relative overflow-hidden rounded-xl border border-purple-500/20 bg-slate-900/60 p-5 shadow-xl backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
              Funnel Win Rate
            </span>
            <div className="rounded-lg bg-purple-500/10 p-2 text-purple-400">
              <BarChart3 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-white">
            {summary.overallWinRate}%
          </div>
          <div className="mt-2 text-xs text-slate-400">
            Average deal size: ${summary.averageDealSize.toLocaleString()}
          </div>
        </div>

        {/* Pipeline Velocity */}
        <div className="relative overflow-hidden rounded-xl border border-amber-500/20 bg-slate-900/60 p-5 shadow-xl backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
              Pipeline Velocity
            </span>
            <div className="rounded-lg bg-amber-500/10 p-2 text-amber-400">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-white">
            {summary.averagePipelineVelocityHours} Hours
          </div>
          <div className="mt-2 text-xs text-slate-400">
            Lead inception to verified payment
          </div>
        </div>
      </div>

      {/* 5-Stage Live Visual Funnel */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 backdrop-blur-md">
        <div className="flex items-center justify-between pb-4">
          <div>
            <h2 className="text-base font-semibold text-white">5-Stage Revenue Funnel</h2>
            <p className="text-xs text-slate-400">Stage progression from inbound WhatsApp hook to payment settlement.</p>
          </div>
          <span className="text-xs font-medium text-slate-400">
            Total Inbound Contacts: <strong className="text-white">{funnel.totalContacts}</strong>
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          {funnel.stages.map((stage, idx) => (
            <div
              key={stage.stage}
              className="relative flex flex-col justify-between rounded-lg border border-slate-800/80 bg-slate-950/60 p-4 transition-all hover:border-slate-700"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-emerald-400">
                    Stage {idx + 1}
                  </span>
                  <span className="text-xs font-medium text-slate-400">
                    {stage.conversionFromPrevious}% Conv
                  </span>
                </div>
                <div className="mt-2 text-sm font-semibold text-white">
                  {stage.label}
                </div>
                <div className="mt-1 text-xl font-bold text-slate-200">
                  {stage.count}
                </div>
              </div>

              <div className="mt-4 border-t border-slate-800/60 pt-2 text-xs text-slate-400">
                Pipeline: <strong className="text-white">${stage.value.toLocaleString()}</strong>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Live Revenue Loop Interactive Simulator */}
      <div className="rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/20 via-slate-900/60 to-slate-900/40 p-6 shadow-xl backdrop-blur-md">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Interactive WhatsApp Revenue Loop Simulator</h2>
            <p className="text-xs text-slate-400">
              Fire a simulated high-intent inbound WhatsApp message to test the autonomous qualification, proposal, and checkout generator.
            </p>
          </div>
          <button
            onClick={handleSimulateLead}
            disabled={simulating}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-lg transition hover:bg-emerald-500 disabled:opacity-50"
          >
            {simulating ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5 fill-current" />
            )}
            Run Inbound Lead Loop
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-slate-400">Prospect Phone</label>
            <input
              type="text"
              value={simPhone}
              onChange={(e) => setSimPhone(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400">Prospect Name</label>
            <input
              type="text"
              value={simName}
              onChange={(e) => setSimName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400">Company</label>
            <input
              type="text"
              value={simCompany}
              onChange={(e) => setSimCompany(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="mt-3">
          <label className="block text-xs font-medium text-slate-400">Inbound WhatsApp Message Body</label>
          <textarea
            rows={2}
            value={simMsg}
            onChange={(e) => setSimMsg(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
          />
        </div>

        {simResult && (
          <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-950/40 p-4 text-xs text-emerald-200">
            <div className="flex items-center gap-2 font-semibold">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span>Revenue Loop Executed Successfully</span>
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-4">
              <div>
                Score: <strong>{simResult.qualification?.score}/100</strong>
              </div>
              <div>
                Stage: <strong>{simResult.qualification?.dealStage}</strong>
              </div>
              <div>
                Est. Value: <strong>${simResult.qualification?.estimatedValue}</strong>
              </div>
              <div>
                Proposal: <strong>{simResult.proposal?.proposal_number || "None"}</strong>
              </div>
            </div>
            {simResult.proposal && (
              <div className="mt-3 flex items-center justify-between border-t border-emerald-500/20 pt-2">
                <span>Checkout Link: <code className="text-emerald-300">{simResult.proposal.checkout_url}</code></span>
                {simResult.proposal.checkout_id && (
                  <button
                    onClick={() => handleSettlePayment(simResult.proposal.checkout_id, simResult.proposal.amount)}
                    className="rounded bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-emerald-500"
                  >
                    Simulate Stripe Payment Settlement
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Two Column Section: Proposals & Verified Payment Ledger */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Active Proposals */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 backdrop-blur-md">
          <div className="flex items-center justify-between pb-4">
            <div>
              <h2 className="text-base font-semibold text-white">Active Proposals</h2>
              <p className="text-xs text-slate-400">{proposals.total} total proposals generated.</p>
            </div>
            <div className="flex gap-2 text-xs">
              <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-emerald-400">
                {proposals.paid} Paid
              </span>
              <span className="rounded bg-blue-500/10 px-2 py-0.5 text-blue-400">
                {proposals.sent} Sent
              </span>
            </div>
          </div>

          <div className="space-y-3">
            {proposals.total === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">No proposals generated yet.</p>
            ) : (
              <div className="divide-y divide-slate-800">
                <div className="py-2 text-xs text-slate-400">
                  Total Active Value: <strong className="text-white">${proposals.totalValue.toLocaleString()}</strong>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Verified Payment Ledger */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 backdrop-blur-md">
          <div className="flex items-center justify-between pb-4">
            <div>
              <h2 className="text-base font-semibold text-white">Verified Payment Ledger</h2>
              <p className="text-xs text-slate-400">Immutable ledger entries verified via Stripe.</p>
            </div>
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
              {recentLedger.length} Verified
            </span>
          </div>

          <div className="space-y-2">
            {recentLedger.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">No payments verified in ledger yet.</p>
            ) : (
              recentLedger.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between rounded-lg border border-slate-800/60 bg-slate-950/40 p-3 text-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white">
                        ${entry.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} {entry.currency}
                      </span>
                      <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400 uppercase">
                        {entry.status}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      ID: {entry.id.slice(0, 12)}... • {new Date(entry.occurredAt).toLocaleString()}
                    </div>
                  </div>
                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Channel Attribution Breakdown */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 backdrop-blur-md">
        <h2 className="text-base font-semibold text-white">Revenue Attribution by Inbound Channel</h2>
        <p className="text-xs text-slate-400">Conversion efficiency across WhatsApp, email, and web chat.</p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {attribution.map((attr) => (
            <div
              key={attr.channel}
              className="rounded-lg border border-slate-800 bg-slate-950/60 p-4"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white uppercase">{attr.channel}</span>
                <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
                  {attr.conversionRate}% Win Rate
                </span>
              </div>
              <div className="mt-3 text-lg font-bold text-emerald-400">
                ${attr.wonRevenue.toLocaleString()}
              </div>
              <div className="mt-1 text-xs text-slate-400">
                {attr.wonCount} won of {attr.leads} leads
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
