"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  CreditCard,
  CheckCircle2,
  Clock,
  FileText,
  ArrowRight,
} from "lucide-react";
import {
  DashboardPageHeader,
  DashboardMetricTile,
} from "@/components/dashboard/DashboardPrimitives";

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
    <div className="min-h-[calc(100dvh-56px)] bg-[#F8F7FC] px-4 py-6 sm:px-6 lg:px-8 text-[#17151F]">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Header */}
        <DashboardPageHeader
          title="J10 Pay"
          subtitle="Collect customer deposits, generate payment links, and track paid appointments and invoices."
          actions={
            <Link
              href="/dashboard/revenue"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2DEEA] bg-[#FFFFFF] px-3.5 py-1.5 text-xs font-medium text-[#6F687A] transition hover:bg-[#F3F1F8] hover:text-[#17151F]"
            >
              <span>Revenue Analytics</span>
              <ArrowRight size={12} />
            </Link>
          }
        />

        {/* Revenue Summary Tiles */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <DashboardMetricTile
            label="Paid Revenue"
            value={`$${totalRevenue.toLocaleString()}`}
            subtitle="Customer payments received"
          />
          <DashboardMetricTile
            label="Pending Invoices"
            value={`$${pendingAmount.toLocaleString()}`}
            subtitle="Awaiting settlement"
            semanticStatus={pendingAmount > 0 ? "warning" : "neutral"}
          />
          <DashboardMetricTile
            label="Payment Provider"
            value="Stripe"
            subtitle="Card, Apple Pay, & Link"
          />
        </div>

        {/* Tab Selection */}
        <div className="flex items-center gap-1.5 border-b border-[#E2DEEA] pb-2">
          <button
            type="button"
            onClick={() => setActiveTab("invoices")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
              activeTab === "invoices"
                ? "bg-[#6347E8] text-white"
                : "text-[#6F687A] hover:text-[#17151F]"
            }`}
          >
            Invoices ({invoices.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("links")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
              activeTab === "links"
                ? "bg-[#6347E8] text-white"
                : "text-[#6F687A] hover:text-[#17151F]"
            }`}
          >
            Payment Links
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("ledger")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
              activeTab === "ledger"
                ? "bg-[#6347E8] text-white"
                : "text-[#6F687A] hover:text-[#17151F]"
            }`}
          >
            Ledger & Deposits
          </button>
        </div>

        {/* Tab 1: Invoices */}
        {activeTab === "invoices" && (
          <div className="space-y-4">
            {invoices.length === 0 ? (
              <div className="rounded-xl border border-[#E2DEEA] bg-[#FFFFFF] p-8 text-center shadow-[0_4px_16px_rgba(49,32,92,0.06)]">
                <FileText className="mx-auto h-8 w-8 text-[#918A9D]" />
                <h3 className="mt-3 text-sm font-semibold text-[#17151F]">No Invoices Issued Yet</h3>
                <p className="mt-1 max-w-sm mx-auto text-xs text-[#6F687A]">
                  When appointments require deposits or proposals are accepted, invoices will appear here with live payment status.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[#E2DEEA] rounded-xl border border-[#E2DEEA] bg-[#FFFFFF] shadow-[0_4px_16px_rgba(49,32,92,0.06)]">
                {invoices.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between p-4">
                    <div>
                      <div className="text-xs font-semibold text-[#17151F]">
                        Invoice #{inv.id.slice(0, 8)}
                      </div>
                      <div className="text-[11px] text-[#6F687A]">
                        Created {new Date(inv.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-bold text-[#17151F]">
                        ${Number(inv.amount || 0).toLocaleString()}
                      </div>
                      <span className="rounded border border-[#E2DEEA] bg-[#F3F1F8] px-2 py-0.5 text-[10px] uppercase font-medium text-[#6F687A]">
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
          <div className="rounded-xl border border-[#E2DEEA] bg-[#FFFFFF] p-5 space-y-2 shadow-[0_4px_16px_rgba(49,32,92,0.06)]">
            <h3 className="text-sm font-semibold text-[#17151F]">Instant Payment Links</h3>
            <p className="text-xs text-[#6F687A]">
              Generate customer payment links for appointment deposits, invoices, and service retainers.
            </p>
          </div>
        )}

        {/* Tab 3: Ledger */}
        {activeTab === "ledger" && (
          <div className="rounded-xl border border-[#E2DEEA] bg-[#FFFFFF] p-5 space-y-2 shadow-[0_4px_16px_rgba(49,32,92,0.06)]">
            <h3 className="text-sm font-semibold text-[#17151F]">Verified Ledger & Settlement</h3>
            <p className="text-xs text-[#6F687A]">
              Workspace ledger records verified customer payments received through connected checkout providers.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
