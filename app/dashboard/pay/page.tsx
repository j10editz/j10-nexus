"use client";

import { useCallback, useEffect, useState } from "react";
import {
  FileText,
  Plus,
  X,
} from "lucide-react";
import {
  DashboardPageHeader,
  DashboardMetricTile,
} from "@/components/dashboard/DashboardPrimitives";

interface InvoiceRecord {
  id: string;
  invoiceNumber: string;
  customerName: string;
  customerEmail?: string | null;
  amount: number;
  status: string;
  dueDate?: string | null;
  paymentLink?: string | null;
  createdAt: string;
}

export default function J10PayPage() {
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"invoices" | "links" | "ledger">("invoices");
  const [showCreate, setShowCreate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invoiceForm, setInvoiceForm] = useState({ customerName: "", customerEmail: "", description: "", amount: "", dueDate: "" });

  const fetchInvoices = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/finance/invoices");
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to load invoices.");
      setInvoices(json.invoices || []);
    } catch (invoiceError) {
      setError(invoiceError instanceof Error ? invoiceError.message : "Failed to load invoices.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchInvoices();
  }, [fetchInvoices]);

  async function createInvoice(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/finance/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: invoiceForm.customerName,
          customerEmail: invoiceForm.customerEmail,
          dueDate: invoiceForm.dueDate || undefined,
          lineItems: [{ description: invoiceForm.description, quantity: 1, unitPrice: Number(invoiceForm.amount) }],
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || "Invoice could not be created.");
      setInvoiceForm({ customerName: "", customerEmail: "", description: "", amount: "", dueDate: "" });
      setShowCreate(false);
      await fetchInvoices();
    } catch (creationError) {
      setError(creationError instanceof Error ? creationError.message : "Invoice could not be created.");
    } finally {
      setSubmitting(false);
    }
  }

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
            <button type="button" onClick={() => setShowCreate(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#6347E8] px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-[#5136D6]"><Plus size={13} /><span>New invoice</span></button>
          }
        />

        {error ? <div className="rounded-lg border border-[#E11D48]/30 bg-[#E11D48]/10 px-4 py-3 text-xs text-[#E11D48]">{error}</div> : null}

        {showCreate ? (
          <form onSubmit={createInvoice} className="rounded-xl border border-[#D8B565]/30 bg-[#FFFFFF] p-4 shadow-[0_4px_16px_rgba(49,32,92,0.06)]">
            <div className="mb-4 flex items-center justify-between"><div><h2 className="text-sm font-semibold text-[#17151F]">Create invoice</h2><p className="text-[11px] text-[#6F687A]">Creates a workspace-scoped draft invoice. A payment link appears only when the backend returns one.</p></div><button type="button" onClick={() => setShowCreate(false)} aria-label="Close invoice form" className="text-[#6F687A]"><X size={16} /></button></div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-[11px] text-[#6F687A]">Customer name<input required value={invoiceForm.customerName} onChange={(event) => setInvoiceForm((current) => ({ ...current, customerName: event.target.value }))} className="mt-1 w-full rounded-lg border border-[#E2DEEA] bg-[#F3F1F8] px-3 py-2 text-xs text-[#17151F]" /></label>
              <label className="text-[11px] text-[#6F687A]">Customer email<input type="email" value={invoiceForm.customerEmail} onChange={(event) => setInvoiceForm((current) => ({ ...current, customerEmail: event.target.value }))} className="mt-1 w-full rounded-lg border border-[#E2DEEA] bg-[#F3F1F8] px-3 py-2 text-xs text-[#17151F]" /></label>
              <label className="text-[11px] text-[#6F687A]">Service description<input required value={invoiceForm.description} onChange={(event) => setInvoiceForm((current) => ({ ...current, description: event.target.value }))} className="mt-1 w-full rounded-lg border border-[#E2DEEA] bg-[#F3F1F8] px-3 py-2 text-xs text-[#17151F]" /></label>
              <div className="grid grid-cols-2 gap-3"><label className="text-[11px] text-[#6F687A]">Amount<input required min="0.01" step="0.01" type="number" value={invoiceForm.amount} onChange={(event) => setInvoiceForm((current) => ({ ...current, amount: event.target.value }))} className="mt-1 w-full rounded-lg border border-[#E2DEEA] bg-[#F3F1F8] px-3 py-2 text-xs text-[#17151F]" /></label><label className="text-[11px] text-[#6F687A]">Due date<input type="date" value={invoiceForm.dueDate} onChange={(event) => setInvoiceForm((current) => ({ ...current, dueDate: event.target.value }))} className="mt-1 w-full rounded-lg border border-[#E2DEEA] bg-[#F3F1F8] px-3 py-2 text-xs text-[#17151F]" /></label></div>
            </div>
            <div className="mt-3 flex justify-end"><button disabled={submitting} className="rounded-lg bg-[#6347E8] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{submitting ? "Creating…" : "Create draft invoice"}</button></div>
          </form>
        ) : null}

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
            label="Invoices"
            value={invoices.length}
            subtitle="Workspace records"
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
            {loading ? (
              <div className="h-28 animate-pulse rounded-xl border border-[#E2DEEA] bg-[#FFFFFF]" />
            ) : invoices.length === 0 ? (
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
                        Invoice {inv.invoiceNumber || `#${inv.id.slice(0, 8)}`}
                      </div>
                      <div className="text-[11px] text-[#6F687A]">
                        {inv.customerName} · Created {new Date(inv.createdAt).toLocaleDateString()}
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
              Payment links returned by the verified invoice backend appear here. J10 does not fabricate checkout URLs.
            </p>
            <div className="mt-4 divide-y divide-[#E2DEEA] rounded-lg border border-[#E2DEEA]">
              {invoices.filter((invoice) => Boolean(invoice.paymentLink)).length === 0 ? <p className="p-4 text-xs text-[#6F687A]">No verified payment links are available.</p> : invoices.filter((invoice) => Boolean(invoice.paymentLink)).map((invoice) => <div key={invoice.id} className="flex items-center justify-between gap-3 p-3"><div><div className="text-xs font-medium text-[#17151F]">{invoice.customerName}</div><div className="text-[11px] text-[#6F687A]">{invoice.invoiceNumber}</div></div><a href={invoice.paymentLink || "#"} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-[#6347E8]">Open secure link</a></div>)}
            </div>
          </div>
        )}

        {/* Tab 3: Ledger */}
        {activeTab === "ledger" && (
          <div className="rounded-xl border border-[#E2DEEA] bg-[#FFFFFF] p-5 space-y-2 shadow-[0_4px_16px_rgba(49,32,92,0.06)]">
            <h3 className="text-sm font-semibold text-[#17151F]">Verified Ledger & Settlement</h3>
            <p className="text-xs text-[#6F687A]">
              Paid invoice records confirmed by the workspace finance backend.
            </p>
            <div className="mt-4 divide-y divide-[#E2DEEA] rounded-lg border border-[#E2DEEA]">{invoices.filter((invoice) => ["paid", "completed"].includes(invoice.status)).length === 0 ? <p className="p-4 text-xs text-[#6F687A]">No paid invoice records are available.</p> : invoices.filter((invoice) => ["paid", "completed"].includes(invoice.status)).map((invoice) => <div key={invoice.id} className="flex items-center justify-between p-3"><div><div className="text-xs font-medium text-[#17151F]">{invoice.customerName}</div><div className="text-[11px] text-[#6F687A]">{invoice.invoiceNumber}</div></div><div className="text-right"><div className="text-xs font-semibold text-[#168A65]">${Number(invoice.amount).toLocaleString()}</div><div className="text-[10px] uppercase text-[#6F687A]">{invoice.status}</div></div></div>)}</div>
          </div>
        )}
      </div>
    </div>
  );
}
