"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Inbox,
  LoaderCircle,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  UserCheck,
  UserPlus,
} from "lucide-react";

type CRMContactInfo = {
  id: string;
  status: string;
  type: string;
  company?: string | null;
  estimatedValue?: number;
};

type Conversation = {
  sender: string;
  name: string;
  lastMessage: string;
  messageType: string;
  lastReceivedAt: string;
  messageCount: number;
  status: string;
  escalated?: boolean;
  escalationReason?: string;
  crmContact?: CRMContactInfo | null;
};

type ThreadMessage = {
  id: string;
  direction: "inbound" | "outbound";
  sender: string;
  recipient?: string;
  body: string;
  messageType: string;
  timestamp: string;
  status: "received" | "sent" | "delivered" | "failed" | "pending";
  actorName?: string;
};

type Response = {
  success: boolean;
  conversations?: Conversation[];
  error?: string;
};

type MessagesResponse = {
  success: boolean;
  messages?: ThreadMessage[];
  error?: string;
};

type Approval = {
  approvalToken: string;
  expiresAt: string;
  idempotencyKey: string;
  capabilityId: string;
  input: Record<string, unknown>;
  preview: { recipient: string; message: string; externalSideEffect: boolean };
};

type FilterType = "all" | "needs_reply" | "leads" | "escalated";

export function WhatsAppInbox({
  integrationId,
  connected,
}: {
  integrationId: string | null;
  connected: boolean;
}) {
  const [items, setItems] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Conversation | null>(null);

  // Thread messages
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Filters & search
  const [filter, setFilter] = useState<FilterType>("all");
  const [search, setSearch] = useState("");

  // Reply state
  const [reply, setReply] = useState("");
  const [approval, setApproval] = useState<Approval | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [aiMode, setAiMode] = useState("");

  // CRM lead qualification
  const [qualifying, setQualifying] = useState(false);
  const [qualifyNotice, setQualifyNotice] = useState("");

  const load = useCallback(async () => {
    if (!integrationId || !connected) return;
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/integrations/${encodeURIComponent(integrationId)}/whatsapp/conversations`,
        { cache: "no-store" },
      );
      const data = (await response.json()) as Response;
      if (!response.ok || !data.success) throw new Error(data.error || "Could not load conversations.");
      setItems(data.conversations ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load conversations.");
    } finally {
      setLoading(false);
    }
  }, [connected, integrationId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Load message thread for selected conversation
  const loadThread = useCallback(async (sender: string) => {
    if (!integrationId) return;
    setLoadingMessages(true);
    try {
      const res = await fetch(
        `/api/integrations/${encodeURIComponent(integrationId)}/whatsapp/conversations/${encodeURIComponent(sender)}/messages`,
        { cache: "no-store" },
      );
      const data = (await res.json()) as MessagesResponse;
      if (res.ok && data.success) {
        setMessages(data.messages ?? []);
      }
    } catch (err) {
      console.warn("Could not load message thread:", err);
    } finally {
      setLoadingMessages(false);
    }
  }, [integrationId]);

  useEffect(() => {
    if (selected) {
      void loadThread(selected.sender);
    } else {
      setMessages([]);
    }
  }, [selected, loadThread]);

  async function prepareReply() {
    if (!integrationId || !selected || !reply.trim() || sending) return;
    setSending(true);
    setError("");
    setSent("");
    try {
      const response = await fetch(
        `/api/integrations/${encodeURIComponent(integrationId)}/whatsapp/replies/approval`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: selected.sender, message: reply }),
        },
      );
      const data = (await response.json()) as Approval & { success?: boolean; error?: string };
      if (!response.ok || !data.success || !data.approvalToken) throw new Error(data.error || "Could not prepare reply.");
      setApproval(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not prepare reply.");
    } finally {
      setSending(false);
    }
  }

  async function sendReply() {
    if (!integrationId || !approval || sending) return;
    setSending(true);
    setError("");
    try {
      const response = await fetch(`/api/integrations/${encodeURIComponent(integrationId)}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": approval.idempotencyKey },
        body: JSON.stringify({
          capabilityId: approval.capabilityId,
          mode: "live",
          idempotencyKey: approval.idempotencyKey,
          input: approval.input,
          operatorApprovalToken: approval.approvalToken,
        }),
      });
      const data = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !data.success) throw new Error(data.error || "WhatsApp could not send the reply.");
      setSent(`Reply sent to ${approval.preview.recipient}.`);
      setReply("");
      setApproval(null);

      // Refresh thread
      if (selected) {
        void loadThread(selected.sender);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "WhatsApp could not send the reply.");
    } finally {
      setSending(false);
    }
  }

  async function generateSuggestion() {
    if (!integrationId || !selected || suggesting) return;
    setSuggesting(true);
    setError("");
    setSent("");
    setApproval(null);
    try {
      const response = await fetch(
        `/api/integrations/${encodeURIComponent(integrationId)}/whatsapp/replies/suggest`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customerName: selected.name, customerMessage: selected.lastMessage }),
        },
      );
      const data = (await response.json()) as {
        success?: boolean;
        suggestion?: string;
        error?: string;
        ai?: { simulated?: boolean; model?: string };
      };
      if (!response.ok || !data.success || !data.suggestion) throw new Error(data.error || "J10 AI could not generate a suggestion.");
      setReply(data.suggestion);
      setAiMode(data.ai?.simulated ? "Development simulation" : data.ai?.model || "J10 AI Live");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "J10 AI could not generate a suggestion.");
    } finally {
      setSuggesting(false);
    }
  }

  async function qualifyLead() {
    if (!integrationId || !selected || qualifying) return;
    setQualifying(true);
    setQualifyNotice("");
    try {
      const res = await fetch(
        `/api/integrations/${encodeURIComponent(integrationId)}/whatsapp/conversations/${encodeURIComponent(selected.sender)}/qualify`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customerName: selected.name }),
        },
      );
      const data = (await res.json()) as {
        success?: boolean;
        error?: string;
        lead?: {
          contactId: string;
          status: string;
          type: string;
          estimatedValue: number;
          intentSummary: string;
        };
      };
      if (!res.ok || !data.success || !data.lead) throw new Error(data.error || "Could not qualify lead.");

      // Update selected conversation in-place
      const updatedCrm: CRMContactInfo = {
        id: data.lead.contactId,
        status: data.lead.status,
        type: data.lead.type,
        estimatedValue: data.lead.estimatedValue,
      };

      setSelected((prev) => (prev ? { ...prev, crmContact: updatedCrm } : null));
      setItems((prev) =>
        prev.map((item) => (item.sender === selected.sender ? { ...item, crmContact: updatedCrm } : item)),
      );

      setQualifyNotice(`Lead Qualified: ${data.lead.status} · $${data.lead.estimatedValue.toLocaleString()} estimated value`);
    } catch (err) {
      setQualifyNotice(err instanceof Error ? err.message : "Failed to qualify lead.");
    } finally {
      setQualifying(false);
    }
  }

  // Filter & search calculations
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Search
      if (search.trim()) {
        const query = search.toLowerCase();
        const matchesName = item.name.toLowerCase().includes(query);
        const matchesMessage = item.lastMessage.toLowerCase().includes(query);
        const matchesPhone = item.sender.includes(query);
        if (!matchesName && !matchesMessage && !matchesPhone) return false;
      }

      // Filter
      if (filter === "needs_reply") return item.status === "completed" || item.messageCount > 0;
      if (filter === "leads") return Boolean(item.crmContact);
      if (filter === "escalated") return Boolean(item.escalated);

      return true;
    });
  }, [items, search, filter]);

  const counts = useMemo(() => {
    return {
      all: items.length,
      needs_reply: items.length,
      leads: items.filter((i) => Boolean(i.crmContact)).length,
      escalated: items.filter((i) => Boolean(i.escalated)).length,
    };
  }, [items]);

  return (
    <section className="mt-8 rounded-2xl border border-white/[0.08] bg-[#111216] p-5 sm:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Inbox size={20} className="text-emerald-400" />
            <h2 className="text-xl font-bold tracking-tight text-white">WhatsApp AI Customer Inbox</h2>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-zinc-400">
            Real-time inbound customer messages, automated lead qualification, and grounded AI responses.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void load()}
            disabled={!connected || loading}
            className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3.5 py-2 text-xs font-medium text-zinc-300 transition hover:bg-white/[0.06] disabled:opacity-40"
            aria-label="Refresh conversations"
          >
            <RefreshCw size={14} className={loading ? "animate-spin text-emerald-400" : ""} />
            <span>Sync Inbox</span>
          </button>
        </div>
      </div>

      {!connected ? (
        <p className="mt-6 rounded-xl border border-amber-500/15 bg-amber-500/[0.04] p-4 text-sm text-amber-300">
          Connect WhatsApp Business above to launch your live customer inbox.
        </p>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          {/* Controls: Search & Filters */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative flex-1 max-w-md">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search customers, messages, phone..."
                className="w-full rounded-xl border border-white/[0.08] bg-black/40 py-2.5 pl-9 pr-4 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-500/40 focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => setFilter("all")}
                className={`rounded-lg px-3 py-1.5 font-medium transition ${
                  filter === "all"
                    ? "bg-white/[0.1] text-white"
                    : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                }`}
              >
                All ({counts.all})
              </button>
              <button
                type="button"
                onClick={() => setFilter("leads")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition ${
                  filter === "leads"
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                }`}
              >
                <UserCheck size={12} />
                CRM Leads ({counts.leads})
              </button>
              <button
                type="button"
                onClick={() => setFilter("escalated")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition ${
                  filter === "escalated"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                    : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                }`}
              >
                <AlertCircle size={12} />
                Escalated ({counts.escalated})
              </button>
            </div>
          </div>

          {/* Main Dual-Pane Workstation */}
          <div className="grid grid-cols-1 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c0d10] lg:grid-cols-12 min-h-[560px]">
            {/* Left Pane: Conversation List */}
            <div className="border-b border-white/[0.08] lg:col-span-5 lg:border-b-0 lg:border-r overflow-y-auto max-h-[680px]">
              {loading && items.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 text-zinc-500">
                  <LoaderCircle size={20} className="animate-spin text-emerald-400" />
                  <span className="mt-3 text-xs">Loading conversations…</span>
                </div>
              ) : error ? (
                <p className="m-4 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-xs text-red-300">
                  {error}
                </p>
              ) : filteredItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                  <MessageSquare size={28} className="text-zinc-700" />
                  <p className="mt-3 text-xs font-semibold text-zinc-300">No conversations found</p>
                  <p className="mt-1 text-[11px] text-zinc-600">
                    {search ? "Try adjusting your search query." : "Inbound messages will arrive here automatically."}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-white/[0.04]">
                  {filteredItems.map((item) => {
                    const isSelected = selected?.sender === item.sender;
                    return (
                      <button
                        type="button"
                        key={item.sender}
                        onClick={() => {
                          setSelected(item);
                          setApproval(null);
                          setSent("");
                          setError("");
                          setQualifyNotice("");
                        }}
                        className={`flex w-full items-start gap-3.5 p-4 text-left transition ${
                          isSelected ? "bg-emerald-500/[0.08]" : "hover:bg-white/[0.02]"
                        }`}
                      >
                        {/* Avatar */}
                        <div className="relative mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 text-sm font-bold text-emerald-300 border border-emerald-500/20">
                          {item.name.slice(0, 1).toUpperCase()}
                          {item.escalated && (
                            <span className="absolute -top-1 -right-1 flex h-3 w-3">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                            </span>
                          )}
                        </div>

                        {/* Summary Details */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-xs font-semibold text-zinc-100">{item.name}</p>
                            <time className="shrink-0 text-[10px] text-zinc-500">
                              {new Date(item.lastReceivedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </time>
                          </div>

                          <p className="mt-1 line-clamp-1 text-[11px] text-zinc-400">{item.lastMessage}</p>

                          {/* Tags & Badges */}
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {item.crmContact ? (
                              <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-300">
                                CRM {item.crmContact.status}
                              </span>
                            ) : null}

                            {item.escalated && (
                              <span className="flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-amber-300">
                                <AlertCircle size={9} />
                                Escalated
                              </span>
                            )}

                            <span className="rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[9px] text-zinc-500">
                              ••••{item.sender.slice(-4)}
                            </span>
                          </div>
                        </div>

                        <ChevronRight
                          size={14}
                          className={`mt-3 shrink-0 transition ${isSelected ? "text-emerald-400" : "text-zinc-700"}`}
                        />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right Pane: Thread & Reply Command Center */}
            <div className="flex flex-col lg:col-span-7 bg-[#0f1014]">
              {selected ? (
                <div className="flex flex-col h-full">
                  {/* Top Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] p-4 bg-[#111216]">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-xs font-bold text-emerald-300 border border-emerald-500/20">
                        {selected.name.slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-bold text-white">{selected.name}</p>
                          <span className="text-[10px] text-zinc-500">({selected.sender})</span>
                        </div>
                        <p className="text-[10px] text-zinc-400">
                          {selected.crmContact ? (
                            <span className="text-emerald-400 font-medium">
                              Linked CRM {selected.crmContact.type} · Status: {selected.crmContact.status}
                              {selected.crmContact.estimatedValue ? ` ($${selected.crmContact.estimatedValue.toLocaleString()})` : ""}
                            </span>
                          ) : (
                            <span>Unlinked customer</span>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {selected.crmContact ? (
                        <Link
                          href="/dashboard/crm"
                          className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.02] px-2.5 py-1.5 text-[10px] font-medium text-zinc-300 hover:bg-white/[0.06]"
                        >
                          <span>Open CRM</span>
                          <ExternalLink size={10} />
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void qualifyLead()}
                          disabled={qualifying}
                          className="flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-[10px] font-medium text-cyan-300 transition hover:bg-cyan-500/20 disabled:opacity-40"
                        >
                          {qualifying ? <LoaderCircle size={11} className="animate-spin" /> : <UserPlus size={11} />}
                          <span>Qualify & Sync to CRM</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Escalation Alert */}
                  {selected.escalated && (
                    <div className="flex items-start gap-2.5 border-b border-amber-500/20 bg-amber-500/[0.06] p-3 text-xs text-amber-300">
                      <ShieldAlert size={15} className="mt-0.5 shrink-0 text-amber-400" />
                      <div>
                        <p className="font-semibold text-amber-200">Attention Required: Human Operator Review</p>
                        <p className="mt-0.5 text-[11px] text-amber-300/80">
                          {selected.escalationReason || "Customer message flagged for review."}
                        </p>
                      </div>
                    </div>
                  )}

                  {qualifyNotice && (
                    <div className="border-b border-cyan-500/20 bg-cyan-500/[0.05] p-2.5 text-center text-xs text-cyan-300">
                      {qualifyNotice}
                    </div>
                  )}

                  {/* Message Stream */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[260px] max-h-[380px]">
                    {loadingMessages ? (
                      <div className="flex items-center justify-center p-8 text-zinc-500">
                        <LoaderCircle size={16} className="animate-spin text-emerald-400" />
                        <span className="ml-2 text-xs">Loading thread history…</span>
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="p-4 rounded-xl border border-white/[0.04] bg-black/20 text-center">
                        <p className="text-xs text-zinc-400">{selected.lastMessage}</p>
                        <time className="mt-1 block text-[10px] text-zinc-600">
                          {new Date(selected.lastReceivedAt).toLocaleString()}
                        </time>
                      </div>
                    ) : (
                      messages.map((msg) => {
                        const isInbound = msg.direction === "inbound";
                        return (
                          <div
                            key={msg.id}
                            className={`flex flex-col ${isInbound ? "items-start" : "items-end"}`}
                          >
                            <div
                              className={`max-w-[85%] rounded-2xl p-3.5 text-xs ${
                                isInbound
                                  ? "rounded-tl-sm border border-white/[0.06] bg-[#17181e] text-zinc-200"
                                  : "rounded-tr-sm border border-emerald-500/25 bg-emerald-500/10 text-emerald-100"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-3 text-[10px] text-zinc-500 mb-1">
                                <span className={isInbound ? "text-zinc-400 font-semibold" : "text-emerald-400 font-semibold"}>
                                  {isInbound ? msg.actorName || selected.name : "J10 Operator (Approved)"}
                                </span>
                                <time>{new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
                              </div>
                              <p className="whitespace-pre-wrap leading-relaxed">{msg.body}</p>
                            </div>
                            <span className="mt-1 text-[9px] text-zinc-600 px-1">
                              {isInbound ? "Received" : msg.status === "delivered" ? "Delivered" : "Sent"}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* AI & Reply Composer */}
                  <div className="border-t border-white/[0.08] p-4 bg-[#111216]">
                    {/* Action buttons */}
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <button
                        type="button"
                        onClick={() => void generateSuggestion()}
                        disabled={suggesting}
                        className="flex items-center gap-1.5 rounded-xl border border-violet-500/25 bg-violet-500/10 px-3.5 py-2 text-xs font-semibold text-violet-300 transition hover:bg-violet-500/20 disabled:opacity-40"
                      >
                        {suggesting ? <LoaderCircle size={13} className="animate-spin" /> : <Sparkles size={13} />}
                        <span>{suggesting ? "J10 AI Drafting…" : "Generate AI Suggestion"}</span>
                      </button>

                      {aiMode && (
                        <span className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                          <Bot size={11} className="text-violet-400" />
                          <span>{aiMode}</span>
                        </span>
                      )}
                    </div>

                    {/* Text Input */}
                    <textarea
                      value={reply}
                      onChange={(e) => {
                        setReply(e.target.value);
                        setApproval(null);
                        setSent("");
                        setAiMode("");
                      }}
                      maxLength={4096}
                      rows={3}
                      placeholder="Write your WhatsApp reply (or click Generate AI Suggestion)..."
                      className="w-full resize-none rounded-xl border border-white/[0.08] bg-black/40 px-3.5 py-2.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500/40 focus:outline-none"
                    />

                    {error && <p className="mt-2 text-[11px] text-red-400">{error}</p>}
                    {sent && (
                      <p className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium">
                        <CheckCircle2 size={13} />
                        <span>{sent}</span>
                      </p>
                    )}

                    {/* Approval or Prepare Button */}
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <span className="text-[10px] text-zinc-600">
                        {reply.length}/4096 characters · Outbound Cloud API
                      </span>

                      {approval ? (
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] text-amber-300 font-medium">
                            Approval valid for 5 min
                          </span>
                          <button
                            type="button"
                            onClick={() => void sendReply()}
                            disabled={sending}
                            className="flex items-center gap-1.5 rounded-xl bg-emerald-400 px-4 py-2 text-xs font-bold text-black transition hover:bg-emerald-300 disabled:opacity-50"
                          >
                            {sending ? <LoaderCircle size={13} className="animate-spin" /> : <Send size={13} />}
                            <span>Approve and send once</span>
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void prepareReply()}
                          disabled={!reply.trim() || sending}
                          className="flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-40"
                        >
                          <Send size={13} />
                          <span>{sending ? "Preparing…" : "Prepare Reply"}</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full p-12 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.02] border border-white/[0.06] text-zinc-600 mb-3">
                    <MessageSquare size={24} />
                  </div>
                  <p className="text-sm font-semibold text-zinc-300">Select a conversation</p>
                  <p className="mt-1 max-w-xs text-xs text-zinc-500">
                    Choose a WhatsApp customer from the left to view the complete message history, qualify leads, and send replies.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
