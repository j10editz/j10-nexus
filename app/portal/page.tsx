"use client";

import { useEffect, useState } from "react";
import {
  Building2,
  Users,
  TrendingUp,
  FileText,
  DollarSign,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import type { ClientPortalData } from "@/lib/agency/portal";

export default function ClientPortalPage() {
  const [portal, setPortal] = useState<ClientPortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPortal() {
      try {
        setLoading(true);
        const res = await fetch("/api/agency/portal");
        const data = await res.json();
        if (data.success && data.portal) {
          setPortal(data.portal);
        } else {
          setError(data.error || "Failed to load portal.");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Network error.");
      } finally {
        setLoading(false);
      }
    }
    fetchPortal();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
        <div className="flex items-center gap-3">
          <RefreshCw className="h-5 w-5 animate-spin text-emerald-500" />
          <span className="text-sm">Connecting to autonomous client portal...</span>
        </div>
      </div>
    );
  }

  if (error || !portal) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-300">
        <div className="max-w-md rounded-xl border border-slate-800 bg-slate-900 p-6 text-center">
          <h2 className="text-base font-bold text-white">Client Portal Offline</h2>
          <p className="mt-2 text-xs text-slate-400">{error || "Please check with your account manager."}</p>
        </div>
      </div>
    );
  }

  const { workspace, aiWorkforce, pipeline, proposals } = portal;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      {/* Client Header */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            {workspace.logoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={workspace.logoUrl} alt="Logo" className="h-8 w-auto object-contain" />
            ) : (
              <div
                className="flex h-8 w-8 items-center justify-center rounded-lg font-bold text-white"
                style={{ backgroundColor: workspace.primaryColor }}
              >
                {workspace.brandName.slice(0, 1)}
              </div>
            )}
            <div>
              <h1 className="text-sm font-bold text-white">{workspace.portalTitle}</h1>
              <span className="text-[10px] text-slate-400">Enterprise AI Client Portal</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
              <ShieldCheck className="h-3.5 w-3.5" />
              Verified Tenant
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl space-y-8 px-6 py-8">
        {/* Welcome Banner */}
        <div className="rounded-xl border border-slate-800 bg-gradient-to-r from-slate-900/80 to-slate-900/40 p-6 shadow-xl backdrop-blur-md">
          <h2 className="text-xl font-bold text-white">{workspace.portalTitle}</h2>
          <p className="mt-1 text-xs text-slate-400">{workspace.portalWelcomeMessage}</p>
        </div>

        {/* Top Level Metric Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 backdrop-blur-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-slate-400">Autonomous Agents</span>
              <Users className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-white">{aiWorkforce.activeAgents} Active</div>
            <div className="mt-1 text-[11px] text-slate-500">{aiWorkforce.totalAgents} total deployed</div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 backdrop-blur-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-slate-400">Active Deals</span>
              <TrendingUp className="h-4 w-4 text-blue-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-white">{pipeline.activeDeals} Deals</div>
            <div className="mt-1 text-[11px] text-slate-500">{pipeline.totalContacts} total contacts</div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 backdrop-blur-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-slate-400">Pipeline Value</span>
              <DollarSign className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-white">${pipeline.pipelineValue.toLocaleString()}</div>
            <div className="mt-1 text-[11px] text-slate-500">Live active pipeline</div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 backdrop-blur-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-slate-400">Deals Won</span>
              <ShieldCheck className="h-4 w-4 text-purple-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-white">{pipeline.wonDeals} Closed</div>
            <div className="mt-1 text-[11px] text-slate-500">Verified commercial wins</div>
          </div>
        </div>

        {/* Proposals Table */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 backdrop-blur-md">
          <div className="flex items-center justify-between pb-4">
            <div>
              <h3 className="text-base font-semibold text-white">Commercial Proposals & Contracts</h3>
              <p className="text-xs text-slate-400">Review open deliverables, service agreements, and activate checkout.</p>
            </div>
            <FileText className="h-4 w-4 text-slate-400" />
          </div>

          {proposals.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500">No proposals currently on file.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-slate-800">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="border-b border-slate-800 bg-slate-950/60 text-slate-400">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Proposal #</th>
                    <th className="px-4 py-2.5 font-semibold">Scope & Title</th>
                    <th className="px-4 py-2.5 font-semibold">Total Amount</th>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {proposals.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-800/30">
                      <td className="px-4 py-3 font-mono font-medium text-white">{p.proposalNumber}</td>
                      <td className="px-4 py-3 text-slate-200">{p.title}</td>
                      <td className="px-4 py-3 font-semibold text-emerald-400">${p.amount.toLocaleString()} {p.currency}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${
                            p.status === "paid"
                              ? "bg-emerald-500/10 text-emerald-400"
                              : "bg-blue-500/10 text-blue-400"
                          }`}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {p.checkoutUrl && p.status !== "paid" ? (
                          <a
                            href={p.checkoutUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded bg-emerald-600 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-500"
                          >
                            <span>Pay & Activate</span>
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="text-[11px] text-slate-500">Complete</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
