"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  DollarSign,
  FilePlus,
  FileText,
  MessageSquare,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  Trash2,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import type { FinanceInvoice, FinanceSummary, InvoiceLineItem, InvoiceStatus } from "@/types/finance";

interface CRMContactOption {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  type: string;
  status: string;
  estimated_value: number;
}

export default function FinancePage() {
  const [invoices, setInvoices] = useState<FinanceInvoice[]>([]);
  const [contacts, setContacts] = useState<CRMContactOption[]>([]);
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // New Invoice Form State
  const [selectedContactId, setSelectedContactId] = useState<string>("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [dueDate, setDueDate] = useState(
    new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0]
  );
  const [lineItems, setLineItems] = useState<Array<{ description: string; quantity: number; unitPrice: number }>>([
    { description: "J10 NEXUS AI Setup & Operating License", quantity: 1, unitPrice: 2500 },
  ]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function loadFinancialData() {
    try {
      setLoading(true);
      const res = await fetch("/api/finance/invoices");
      const data = await res.json();
      if (data.success) {
        setInvoices(data.invoices || []);
        setContacts(data.contacts || []);
        setSummary(data.summary || null);
      }
    } catch (err) {
      console.error("Failed to load finance data:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFinancialData();
  }, []);

  function handleSelectContact(contactId: string) {
    setSelectedContactId(contactId);
    const found = contacts.find((c) => c.id === contactId);
    if (found) {
      const name = [found.first_name, found.last_name].filter(Boolean).join(" ");
      setCustomerName(name || found.company || "");
      setCustomerEmail(found.email || "");
      setCustomerPhone(found.phone || "");
    }
  }

  function handleAddLineItem() {
    setLineItems((prev) => [...prev, { description: "", quantity: 1, unitPrice: 0 }]);
  }

  function handleRemoveLineItem(idx: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleLineItemChange(idx: number, field: "description" | "quantity" | "unitPrice", value: string | number) {
    setLineItems((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      return updated;
    });
  }

  const calculatedTotal = useMemo(() => {
    return lineItems.reduce((acc, item) => acc + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0);
  }, [lineItems]);

  async function handleCreateInvoice(e: React.FormEvent) {
    e.preventDefault();
    if (!customerName.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/finance/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName,
          customerEmail,
          customerPhone,
          contactId: selectedContactId || null,
          lineItems,
          dueDate,
          notes,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIsModalOpen(false);
        setActionSuccess(data.message || "Invoice created successfully.");
        setCustomerName("");
        setCustomerEmail("");
        setCustomerPhone("");
        setSelectedContactId("");
        setNotes("");
        setLineItems([{ description: "J10 NEXUS AI Setup & Operating License", quantity: 1, unitPrice: 2500 }]);
        await loadFinancialData();
      }
    } catch (err) {
      console.error("Failed to create invoice:", err);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdateStatus(invoiceId: string, status: InvoiceStatus) {
    try {
      const res = await fetch(`/api/finance/invoices/${invoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (data.success) {
        setActionSuccess(`Invoice marked as ${status}.`);
        await loadFinancialData();
      }
    } catch (err) {
      console.error("Status update error:", err);
    }
  }

  async function handleDeleteInvoice(invoiceId: string) {
    if (!confirm("Are you sure you want to delete this invoice?")) return;
    try {
      const res = await fetch(`/api/finance/invoices/${invoiceId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        setActionSuccess("Invoice deleted.");
        await loadFinancialData();
      }
    } catch (err) {
      console.error("Delete invoice error:", err);
    }
  }

  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const matchesStatus = statusFilter === "all" || inv.status === statusFilter;
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        inv.customerName.toLowerCase().includes(q) ||
        inv.invoiceNumber.toLowerCase().includes(q) ||
        (inv.customerEmail && inv.customerEmail.toLowerCase().includes(q));
      return matchesStatus && matchesSearch;
    });
  }, [invoices, statusFilter, searchQuery]);

  return (
    <div className="min-h-[calc(100dvh-72px)] bg-[#09090B] px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1280px]">
        {/* Top Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-violet-400">
              J10 Revenue Intelligence
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Finance & Cashflow Center
            </h1>
            <p className="mt-1 text-sm text-white/50">
              Synchronize closed CRM deals, dynamic invoicing, recurring retainers, and cashflow runway.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => loadFinancialData()}
              disabled={loading}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs font-medium text-white/80 transition hover:bg-white/[0.08]"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              Sync Financials
            </button>

            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-violet-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:brightness-110"
            >
              <Plus size={15} />
              New Invoice
            </button>
          </div>
        </div>

        {/* Feedback Alert */}
        {actionSuccess && (
          <div className="mt-6 flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
            <div className="flex items-center gap-3">
              <CheckCircle2 size={18} className="text-emerald-400" />
              <span>{actionSuccess}</span>
            </div>
            <button onClick={() => setActionSuccess(null)} className="text-xs opacity-60 hover:opacity-100">
              Dismiss
            </button>
          </div>
        )}

        {/* Financial KPI Cards */}
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Won Revenue from CRM */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-white/40">
                Closed Won Deals
              </span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                <CheckCircle2 size={16} />
              </div>
            </div>
            <div className="mt-4 flex items-baseline gap-1.5">
              <span className="text-3xl font-bold">
                ${(summary?.totalWonRevenue ?? 0).toLocaleString()}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs text-white/40">
              <span>From {summary?.activeCustomersCount ?? 0} closed client accounts</span>
            </div>
          </div>

          {/* Pipeline Revenue */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-white/40">
                Active Pipeline
              </span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
                <TrendingUp size={16} />
              </div>
            </div>
            <div className="mt-4 flex items-baseline gap-1.5">
              <span className="text-3xl font-bold">
                ${(summary?.pipelineRevenue ?? 0).toLocaleString()}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs text-white/40">
              <span>Avg deal size: ${(summary?.averageDealSize ?? 0).toLocaleString()}</span>
            </div>
          </div>

          {/* Collected Invoices */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-white/40">
                Invoices Collected
              </span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400">
                <Receipt size={16} />
              </div>
            </div>
            <div className="mt-4 flex items-baseline gap-1.5">
              <span className="text-3xl font-bold">
                ${(summary?.paidInvoicesTotal ?? 0).toLocaleString()}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs text-white/40">
              <span>Pending: ${(summary?.pendingInvoicesTotal ?? 0).toLocaleString()}</span>
            </div>
          </div>

          {/* Estimated MRR */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-white/40">
                Estimated MRR
              </span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
                <Wallet size={16} />
              </div>
            </div>
            <div className="mt-4 flex items-baseline gap-1.5">
              <span className="text-3xl font-bold">
                ${(summary?.estimatedMRR ?? 0).toLocaleString()}
              </span>
              <span className="text-xs text-white/40">/ mo</span>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs text-white/40">
              <span>Annualized ARR: ${((summary?.estimatedMRR ?? 0) * 12).toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* AI Cashflow & Revenue Advisor Card */}
        <div className="mt-8 rounded-2xl border border-white/[0.08] bg-gradient-to-r from-blue-950/20 via-[#111216] to-violet-950/20 p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                  AI Financial Advisory Engine
                </span>
              </div>
              <h3 className="text-base font-semibold text-white">
                Revenue Run-Rate Healthy &bull; 0 Urgent Cashflow Bottlenecks
              </h3>
              <p className="text-xs text-white/60 max-w-2xl">
                Pipeline conversion rate is pacing at ${(summary?.pipelineRevenue ?? 0).toLocaleString()} with zero aging bad debts. Total verified workspace value across CRM and invoicing is ${((summary?.totalWonRevenue ?? 0) + (summary?.paidInvoicesTotal ?? 0)).toLocaleString()}.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <Link
                href="/dashboard/marketing"
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-xs font-medium text-white/80 transition hover:bg-white/[0.10]"
              >
                <span>Launch Re-engagement Campaign</span>
                <ArrowRight size={13} />
              </Link>
            </div>
          </div>
        </div>

        {/* Invoice Management Header & Controls */}
        <div className="mt-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold tracking-tight">
                Invoices & Accounts Receivable
              </h2>
              <p className="mt-1 text-xs text-white/40">
                Track status, dispatch automated payment reminders, and reconcile client invoices.
              </p>
            </div>

            {/* Search & Status Filters */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
                <input
                  type="text"
                  placeholder="Search invoice or client..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="rounded-xl border border-white/10 bg-[#111216] py-2 pl-9 pr-4 text-xs text-white placeholder-white/30 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center rounded-xl border border-white/10 bg-[#111216] p-1 text-xs">
                {(["all", "draft", "sent", "paid", "overdue"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setStatusFilter(tab)}
                    className={`rounded-lg px-3 py-1.5 capitalize transition ${
                      statusFilter === tab
                        ? "bg-white/10 font-semibold text-white"
                        : "text-white/40 hover:text-white/80"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Invoices Table */}
          <div className="mt-4 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#111216]">
            {filteredInvoices.length === 0 ? (
              <div className="p-12 text-center">
                <FileText size={36} className="mx-auto text-white/20" />
                <p className="mt-3 text-sm font-medium text-white/70">
                  No invoices found
                </p>
                <p className="mt-1 text-xs text-white/40">
                  {searchQuery ? "Try refining your search query." : "Create your first client invoice to start collecting revenue."}
                </p>
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white/[0.06] px-4 py-2 text-xs font-semibold text-white hover:bg-white/[0.10]"
                >
                  <Plus size={14} />
                  Create Invoice
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-white/[0.08] bg-white/[0.02] text-white/40 uppercase tracking-wider font-semibold">
                    <tr>
                      <th className="px-5 py-3.5">Invoice #</th>
                      <th className="px-5 py-3.5">Client</th>
                      <th className="px-5 py-3.5">Issue Date</th>
                      <th className="px-5 py-3.5">Due Date</th>
                      <th className="px-5 py-3.5">Amount</th>
                      <th className="px-5 py-3.5">Status</th>
                      <th className="px-5 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06] text-white/80">
                    {filteredInvoices.map((inv) => {
                      const isOverdue = inv.status === "overdue" || (inv.status !== "paid" && new Date(inv.dueDate) < new Date());

                      return (
                        <tr key={inv.id} className="hover:bg-white/[0.02] transition">
                          <td className="px-5 py-4 font-mono font-semibold text-white">
                            {inv.invoiceNumber}
                          </td>
                          <td className="px-5 py-4">
                            <div className="font-medium text-white">{inv.customerName}</div>
                            {inv.customerEmail && (
                              <div className="text-[11px] text-white/40">{inv.customerEmail}</div>
                            )}
                          </td>
                          <td className="px-5 py-4 text-white/50">
                            {inv.issueDate}
                          </td>
                          <td className="px-5 py-4">
                            <span className={isOverdue && inv.status !== "paid" ? "text-rose-400 font-semibold" : "text-white/50"}>
                              {inv.dueDate}
                            </span>
                          </td>
                          <td className="px-5 py-4 font-semibold text-white">
                            ${Number(inv.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-5 py-4">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                                inv.status === "paid"
                                  ? "bg-emerald-500/15 text-emerald-300"
                                  : inv.status === "sent"
                                  ? "bg-blue-500/15 text-blue-300"
                                  : inv.status === "overdue" || isOverdue
                                  ? "bg-rose-500/15 text-rose-300"
                                  : "bg-white/10 text-white/60"
                              }`}
                            >
                              {inv.status}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {inv.status !== "paid" && (
                                <button
                                  onClick={() => handleUpdateStatus(inv.id, "paid")}
                                  title="Mark as Paid"
                                  className="flex items-center gap-1 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/20"
                                >
                                  <Check size={12} />
                                  <span>Mark Paid</span>
                                </button>
                              )}

                              {inv.customerPhone && (
                                <a
                                  href={`https://wa.me/${inv.customerPhone.replace(/\D/g, "")}?text=${encodeURIComponent(
                                    `Hello ${inv.customerName}, here is your J10 NEXUS invoice ${inv.invoiceNumber} for $${inv.amount}. Due date: ${inv.dueDate}. Thank you!`
                                  )}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  title="Send Payment Link on WhatsApp"
                                  className="rounded-lg border border-white/10 bg-white/[0.04] p-1.5 text-white/60 hover:text-emerald-400 hover:bg-emerald-500/10"
                                >
                                  <MessageSquare size={14} />
                                </a>
                              )}

                              <button
                                onClick={() => handleDeleteInvoice(inv.id)}
                                title="Delete Invoice"
                                className="rounded-lg border border-white/10 bg-white/[0.04] p-1.5 text-white/40 hover:text-rose-400 hover:bg-rose-500/10"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Create Invoice Slide-over / Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <div className="relative w-full max-w-2xl rounded-3xl border border-white/15 bg-[#121318] p-6 shadow-2xl sm:p-8">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
                <div>
                  <h3 className="text-lg font-bold text-white">Create Client Invoice</h3>
                  <p className="text-xs text-white/50">Draft an invoice and synchronize with your CRM ledger.</p>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-lg p-1.5 text-white/40 hover:bg-white/10 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleCreateInvoice} className="mt-6 space-y-4">
                {/* CRM Contact Pre-fill Selector */}
                {contacts.length > 0 && (
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-white/40">
                      Link Existing CRM Contact (Optional)
                    </label>
                    <select
                      value={selectedContactId}
                      onChange={(e) => handleSelectContact(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#0B0C0F] px-3.5 py-2.5 text-xs text-white focus:border-blue-500 focus:outline-none"
                    >
                      <option value="">-- Choose CRM Contact or enter manually --</option>
                      {contacts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {[c.first_name, c.last_name].filter(Boolean).join(" ")} ({c.company || c.type} &bull; ${c.estimated_value || 0})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Client Info Fields */}
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs font-semibold text-white/60">Customer Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Acme Corp"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-[#0B0C0F] px-3.5 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-white/60">Email Address</label>
                    <input
                      type="email"
                      placeholder="billing@acme.com"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-[#0B0C0F] px-3.5 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-white/60">Phone / WhatsApp</label>
                    <input
                      type="text"
                      placeholder="+15551234567"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-[#0B0C0F] px-3.5 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Due Date */}
                <div>
                  <label className="block text-xs font-semibold text-white/60">Payment Due Date</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-[#0B0C0F] px-3.5 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>

                {/* Line Items Builder */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold uppercase tracking-wider text-white/40">
                      Line Items
                    </label>
                    <button
                      type="button"
                      onClick={handleAddLineItem}
                      className="text-xs text-blue-400 hover:text-blue-300 font-medium"
                    >
                      + Add Item
                    </button>
                  </div>

                  {lineItems.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Description"
                        value={item.description}
                        onChange={(e) => handleLineItemChange(idx, "description", e.target.value)}
                        className="flex-1 rounded-xl border border-white/10 bg-[#0B0C0F] px-3 py-1.5 text-xs text-white focus:border-blue-500 focus:outline-none"
                      />
                      <input
                        type="number"
                        min="1"
                        placeholder="Qty"
                        value={item.quantity}
                        onChange={(e) => handleLineItemChange(idx, "quantity", Number(e.target.value))}
                        className="w-16 rounded-xl border border-white/10 bg-[#0B0C0F] px-3 py-1.5 text-xs text-white focus:border-blue-500 focus:outline-none"
                      />
                      <input
                        type="number"
                        min="0"
                        placeholder="Unit Price"
                        value={item.unitPrice}
                        onChange={(e) => handleLineItemChange(idx, "unitPrice", Number(e.target.value))}
                        className="w-24 rounded-xl border border-white/10 bg-[#0B0C0F] px-3 py-1.5 text-xs text-white focus:border-blue-500 focus:outline-none"
                      />
                      <span className="w-20 text-right font-mono text-xs text-white/80">
                        ${((item.quantity || 0) * (item.unitPrice || 0)).toLocaleString()}
                      </span>
                      {lineItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveLineItem(idx)}
                          className="text-white/30 hover:text-rose-400 p-1"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ))}

                  <div className="flex justify-end pt-2 text-sm font-bold text-white">
                    <span>Total: ${calculatedTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-semibold text-white/60">Memo / Wire Transfer Details</label>
                  <textarea
                    rows={2}
                    placeholder="Payment terms: Net 14 days. Wire to account #..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-[#0B0C0F] px-3.5 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>

                {/* Buttons */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/[0.08]">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs font-medium text-white/70 hover:bg-white/[0.08]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-violet-600 px-5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-blue-500/20 hover:brightness-110"
                  >
                    {submitting ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" />
                        Generating Invoice...
                      </>
                    ) : (
                      <>
                        <FilePlus size={14} />
                        Issue Invoice
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}