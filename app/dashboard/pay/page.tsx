"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  CreditCard,
  DollarSign,
  ArrowUpRight,
  RefreshCw,
  Plus,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
} from "lucide-react";

export default function J10PayPage() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"invoices" | "links" | "ledger">("invoices");

  const fetchInvoices = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/finance/invoices");
      if (res.ok) {
        const json = await res.json();
        setInvoices(json.invoices || []);
      }
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchInvoices();
  }, [fetchInvoices]);

  const totalRevenue = invoices
    .filter((inv) => inv.status === "paid" || inv.status === "completed")
    .reduce((sum, inv) => sum + (Number(inv.amount) || 0), 0);

  const pendingAmount = invoices
    .filter((inv) => inv.status === "pending" || inv.status === "draft")
    .reduce((sum, inv) => sum + (Number(inv.amount) || 0), 0);

  return (
    <div className="min-h-[calc(100dvh-72px)] bg-[#07090f] p-4 sm:p-6 lg:p-8 text-white">
      <div className="mx-auto max-w-[1360px] space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 border-b border-white/[0.08] pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-cyan-400">
              <span>J10 NEXUS</span>
              <span className="text-white/20">/</span>
              <span className="text-[#8d96a8]">Revenue & Transactions</span>
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              J10 Pay
            </h1>
            <p className="mt-1 text-xs text-[#8d96a8]">
              Collect customer deposits, generate payment links, and track paid appointments and invoices.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/revenue"
              className="flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-2 text-xs font-medium text-[#8d96a8] transition hover:bg-white/[0.07] hover:text-white"
            >
              <span>Revenue Analytics</span>
            </Link>
          </div>
        </div>

        {/* Revenue Summary Cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-2xl border border-white/[0.07] bg-[#111216] p-5">
            <div className="flex items-center justify-between text-[#8d96a8]">
              <span className="text-xs font-medium">Verified Paid Revenue</span>
              <CheckCircle2 size={16} className="text-emerald-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-white">
              ${totalRevenue.toLocaleString()}
            </div>
            <p className="mt-1 text-[11px] text-[#8d96a8]">
              Verified customer payments recorded in workspace ledger.
            </p>
          </div>

          <div className="rounded-2xl border border-white/[0.07] bg-[#111216] p-5">
            <div className="flex items-center justify-between text-[#8d96a8]">
              <span className="text-xs font-medium">Pending Invoices</span>
              <Clock size={16} className="text-amber-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-amber-300">
              ${pendingAmount.toLocaleString()}
            </div>
            <p className="mt-1 text-[11px] text-[#8d96a8]">
              Outstanding customer invoices awaiting settlement.
            </p>
          </div>

          <div className="rounded-2xl border border-white/[0.07] bg-[#111216] p-5 sm:col-span-2 lg:col-span-1">
            <div className="flex items-center justify-between text-[#8d96a8]">
              <span className="text-xs font-medium">Payment Provider</span>
              <CreditCard size={16} className="text-cyan-400" />
            </div>
            <div className="mt-2 text-base font-bold text-white">
              Stripe Connect / Direct
            </div>
            <p className="mt-1 text-[11px] text-[#8d96a8]">
              PCI-compliant checkout links and deposit processing.
            </p>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex items-center gap-2 border-b border-white/[0.06] pb-2">
          <button
            type="button"
            onClick={() => setActiveTab("invoices")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              activeTab === "invoices"
                ? "bg-white/10 text-white"
                : "text-[#8d96a8] hover:text-white"
            }`}
          >
            Invoices ({invoices.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("links")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              activeTab === "links"
                ? "bg-white/10 text-white"
                : "text-[#8d96a8] hover:text-white"
            }`}
          >
            Payment Links
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("ledger")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              activeTab === "ledger"
                ? "bg-white/10 text-white"
                : "text-[#8d96a8] hover:text-white"
            }`}
          >
            Ledger & Deposits
          </button>
        </div>

        {/* Tab 1: Invoices */}
        {activeTab === "invoices" && (
          <div className="space-y-4">
            {invoices.length === 0 ? (
              <div className="rounded-2xl border border-white/[0.06] bg-[#111216] p-8 text-center">
                <FileText className="mx-auto h-8 w-8 text-[#8d96a8]" />
                <h3 className="mt-3 text-sm font-semibold text-white">No Invoices Issued Yet</h3>
                <p className="mt-1 max-w-sm mx-auto text-xs text-[#8d96a8]">
                  When appointments require deposits or proposals are accepted, invoices will appear here with live payment status.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.06] rounded-2xl border border-white/[0.07] bg-[#111216]">
                {invoices.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between p-4">
                    <div>
                      <div className="text-xs font-semibold text-white">
                        Invoice #{inv.id.slice(0, 8)}
                      </div>
                      <div className="text-[11px] text-[#8d96a8]">
                        Created {new Date(inv.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-bold text-white">
                        ${Number(inv.amount || 0).toLocaleString()}
                      </div>
                      <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] uppercase font-semibold text-cyan-300">
                        {inv.status || "Pending"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Payment Links */}
        {activeTab === "links" && (
          <div className="rounded-2xl border border-white/[0.07] bg-[#111216] p-6 space-y-4">
            <h3 className="text-sm font-semibold text-white">Instant Payment Links</h3>
            <p className="text-xs text-[#8d96a8]">
              J10 AI Operator can automatically generate and text customer payment links for appointment deposits and service quotes.
            </p>
          </div>
        )}

        {/* Tab 3: Ledger */}
        {activeTab === "ledger" && (
          <div className="rounded-2xl border border-white/[0.07] bg-[#111216] p-6 space-y-4">
            <h3 className="text-sm font-semibold text-white">Verified Ledger & Settlement</h3>
            <p className="text-xs text-[#8d96a8]">
              Immutable record of all customer payments and deposits received via Stripe webhooks.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
