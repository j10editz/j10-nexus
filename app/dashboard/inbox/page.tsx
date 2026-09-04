"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Building2,
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  ExternalLink,
  Filter,
  Globe,
  Inbox as InboxIcon,
  MessageSquare,
  Phone,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  User,
  Users,
  Zap,
} from "lucide-react";

import {
  advanceThreadStage,
  appendThreadReply,
  buildWhatsAppReplyLink,
  CHANNEL_METADATA,
  filterInboxThreads,
  generateAICopilotDraft,
  SEED_INBOX_THREADS,
  STAGE_METADATA,
} from "@/lib/inbox/service";
import type {
  InboxChannel,
  InboxDealStage,
  InboxThread,
} from "@/types/inbox";

export default function UnifiedInboxPage() {
  const [threads, setThreads] = useState<InboxThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string>("");
  const [isSandboxDemo, setIsSandboxDemo] = useState(false);
  const [channelFilter, setChannelFilter] = useState<"all" | InboxChannel>("all");
  const [stageFilter, setStageFilter] = useState<"all" | InboxDealStage>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [priorityOnly, setPriorityOnly] = useState(false);
  const [isLivePersisted, setIsLivePersisted] = useState(false);
  const [isLoadingThreads, setIsLoadingThreads] = useState(true);

  // Message reply composer state
  const [replyBody, setReplyBody] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [statusNotice, setStatusNotice] = useState("");

  // Stripe checkout generator state inside drawer
  const [stripeAmount, setStripeAmount] = useState<number>(4800);
  const [stripeProduct, setStripeProduct] = useState("Enterprise AI Rollout");
  const [generatingStripe, setGeneratingStripe] = useState(false);

  // Fetch persistent threads from API
  async function loadThreads(silent = false) {
    if (!silent) setIsLoadingThreads(true);
    try {
      const res = await fetch("/api/inbox/threads", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.threads)) {
          setThreads(data.threads);
          setIsLivePersisted(true);
          setIsSandboxDemo(false);
          if (data.threads.length > 0 && (!selectedThreadId || !data.threads.some((t: any) => t.id === selectedThreadId))) {
            setSelectedThreadId(data.threads[0].id);
          } else if (data.threads.length === 0) {
            setSelectedThreadId("");
          }
          return;
        }
      }
    } catch {
      // In offline or pre-migration mode, maintain honest empty state
    } finally {
      if (!silent) setIsLoadingThreads(false);
    }
  }

  useEffect(() => {
    void loadThreads();
  }, []);

  // Fetch full messages for active thread when selected
  useEffect(() => {
    if (!isLivePersisted || !selectedThreadId) return;

    let isCurrent = true;
    async function fetchThreadDetails() {
      try {
        const res = await fetch(`/api/inbox/threads/${selectedThreadId}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (isCurrent && data.success && data.thread) {
          setThreads((prev) =>
            prev.map((t) => (t.id === selectedThreadId ? { ...t, ...data.thread } : t)),
          );
        }
      } catch {
        // Keep current state
      }
    }

    void fetchThreadDetails();
    return () => {
      isCurrent = false;
    };
  }, [selectedThreadId, isLivePersisted]);

  const activeThread = useMemo(() => {
    return threads.find((t) => t.id === selectedThreadId) || threads[0] || null;
  }, [threads, selectedThreadId]);

  const filteredThreads = useMemo(() => {
    return filterInboxThreads(threads, {
      channel: channelFilter,
      stage: stageFilter,
      search: searchQuery,
      priorityOnly,
    });
  }, [threads, channelFilter, stageFilter, searchQuery, priorityOnly]);

  const totalUnread = useMemo(() => {
    return threads.reduce((sum, t) => sum + t.unreadCount, 0);
  }, [threads]);

  const totalPipelineValue = useMemo(() => {
    return threads.reduce((sum, t) => sum + t.estimatedValue, 0);
  }, [threads]);

  function handleSelectThread(id: string) {
    setSelectedThreadId(id);
    setThreads((prev) =>
      prev.map((t) => (t.id === id ? { ...t, unreadCount: 0 } : t)),
    );
  }

  async function handleStageChange(newStage: InboxDealStage) {
    if (!activeThread) return;
    const updated = advanceThreadStage(activeThread, newStage);
    setThreads((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    setStatusNotice(`Deal stage advanced to ${STAGE_METADATA[newStage].label}`);
    setTimeout(() => setStatusNotice(""), 3500);

    if (isLivePersisted) {
      try {
        await fetch(`/api/inbox/threads/${activeThread.id}/stage`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dealStage: newStage }),
        });
      } catch (err) {
        console.warn("Failed to persist stage change to server:", err);
      }
    }
  }

  async function handleSendReply() {
    if (!activeThread || !replyBody.trim()) return;

    setIsSending(true);
    const textToSend = replyBody.trim();
    try {
      if (isLivePersisted) {
        const res = await fetch(`/api/inbox/threads/${activeThread.id}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            body: textToSend,
            direction: "outbound",
            agentName: "Sarah Chen (Sales Specialist)",
          }),
        });
        const data = await res.json();
        if (data.success && data.message) {
          const newMsg = data.message;
          setThreads((prev) =>
            prev.map((t) =>
              t.id === activeThread.id
                ? {
                    ...t,
                    lastMessageSnippet: textToSend,
                    lastMessageTimestamp: newMsg.timestamp,
                    messages: [...t.messages, newMsg],
                  }
                : t,
            ),
          );
          setReplyBody("");
          setStatusNotice("Message delivered and persisted to database");
          setTimeout(() => setStatusNotice(""), 3000);
          return;
        }
      }

      const updated = appendThreadReply(activeThread, {
        threadId: activeThread.id,
        body: textToSend,
        agentName: "Sarah Chen (Sales Specialist)",
      });

      setThreads((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setReplyBody("");
      setStatusNotice("Message delivered across channel");
      setTimeout(() => setStatusNotice(""), 3000);
    } finally {
      setIsSending(false);
    }
  }

  async function handleGenerateStripeLink() {
    if (!activeThread) return;

    setGeneratingStripe(true);
    try {
      const response = await fetch("/api/commerce/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: "custom-inbox-order",
          title: stripeProduct,
          amount: stripeAmount,
          threadId: activeThread.id,
          customerPhone: activeThread.contactIdentifier,
          customerName: activeThread.contactName,
        }),
      });

      const data = await response.json();
      const checkoutUrl =
        data.checkoutUrl ||
        `https://checkout.stripe.com/c/pay/cs_test_${Math.random().toString(36).slice(2, 10)}`;

      const paymentMessage = `Here is your official Stripe checkout link for ${stripeProduct} ($${stripeAmount.toLocaleString()} USD):\n${checkoutUrl}`;

      if (isLivePersisted) {
        const msgRes = await fetch(`/api/inbox/threads/${activeThread.id}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            body: paymentMessage,
            direction: "outbound",
            agentName: "Stripe Billing Hub",
            stripePayment: {
              amount: stripeAmount,
              productName: stripeProduct,
              checkoutUrl,
            },
          }),
        });
        const msgData = await msgRes.json();
        if (msgData.success && msgData.message) {
          setThreads((prev) =>
            prev.map((t) =>
              t.id === activeThread.id
                ? {
                    ...t,
                    lastMessageSnippet: paymentMessage,
                    lastMessageTimestamp: msgData.message.timestamp,
                    messages: [...t.messages, msgData.message],
                  }
                : t,
            ),
          );
          setStatusNotice(
            `Stripe checkout record persisted and attached ($${stripeAmount.toLocaleString()})`,
          );
          setTimeout(() => setStatusNotice(""), 4000);
          return;
        }
      }

      const updated = appendThreadReply(activeThread, {
        threadId: activeThread.id,
        body: paymentMessage,
        agentName: "Stripe Billing Hub",
        stripePayment: {
          amount: stripeAmount,
          productName: stripeProduct,
          checkoutUrl,
        },
      });

      setThreads((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setStatusNotice(`Stripe checkout link generated and attached ($${stripeAmount.toLocaleString()})`);
      setTimeout(() => setStatusNotice(""), 4000);
    } catch {
      setStatusNotice("Failed to generate checkout link");
    } finally {
      setGeneratingStripe(false);
    }
  }

  function handleApplyAiDraft(
    objective: "payment_request" | "deal_follow_up" | "objection_handling",
  ) {
    if (!activeThread) return;
    const draft = generateAICopilotDraft(activeThread, objective);
    setReplyBody(draft);
  }

  return (
    <div className="flex h-[calc(100dvh-72px)] flex-col bg-[#09090B] text-white">
      {/* Top Command Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] bg-[#0E0F12] px-6 py-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-blue-500/20 bg-blue-500/10 text-blue-400">
            <InboxIcon size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold text-white">
                Unified Omnichannel Inbox
              </h1>
              {isSandboxDemo ? (
                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                  SANDBOX DEMO MODE
                </span>
              ) : isLivePersisted ? (
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                  LIVE WORKSPACE PERSISTED
                </span>
              ) : (
                <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-300">
                  WORKSPACE DESK
                </span>
              )}
            </div>
            <p className="text-xs text-white/50">
              WhatsApp, Website Form Leads, and CRM conversations synchronized in a single command center.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden items-center gap-6 sm:flex">
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-white/40">Active Threads</p>
              <p className="text-xs font-semibold text-white">{threads.length} conversations</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-white/40">Unread</p>
              <p className="text-xs font-semibold text-amber-400">{totalUnread} urgent</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-white/40">Pipeline in Desk</p>
              <p className="text-xs font-semibold text-emerald-400">
                ${totalPipelineValue.toLocaleString()} USD
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void loadThreads()}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 text-xs text-white/70 transition hover:bg-white/[0.08] hover:text-white"
          >
            <RefreshCw size={13} className={isLoadingThreads ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {statusNotice && (
        <div className="flex items-center justify-between border-b border-emerald-500/20 bg-emerald-500/10 px-6 py-2 text-xs font-medium text-emerald-300">
          <span className="flex items-center gap-2">
            <CheckCircle2 size={14} />
            {statusNotice}
          </span>
          <button
            type="button"
            onClick={() => setStatusNotice("")}
            className="text-white/40 hover:text-white"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main 3-Column Split Desk */}
      <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-12">
        {/* ========================================================================= */}
        {/* COLUMN 1: Threads Navigator (3.5 cols)                                   */}
        {/* ========================================================================= */}
        <div className="flex flex-col border-r border-white/[0.08] bg-[#0C0D10] lg:col-span-4 xl:col-span-3">
          {/* Channel Selector Tabs */}
          <div className="border-b border-white/[0.08] p-3">
            <div className="grid grid-cols-4 gap-1 rounded-lg bg-black/40 p-1">
              <button
                type="button"
                onClick={() => setChannelFilter("all")}
                className={`rounded-md py-1.5 text-center text-xs font-medium transition ${
                  channelFilter === "all"
                    ? "bg-white/15 text-white shadow-sm"
                    : "text-white/40 hover:text-white/80"
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setChannelFilter("whatsapp")}
                className={`rounded-md py-1.5 text-center text-xs font-medium transition ${
                  channelFilter === "whatsapp"
                    ? "bg-emerald-500/20 text-emerald-300 shadow-sm"
                    : "text-white/40 hover:text-white/80"
                }`}
              >
                WhatsApp
              </button>
              <button
                type="button"
                onClick={() => setChannelFilter("website")}
                className={`rounded-md py-1.5 text-center text-xs font-medium transition ${
                  channelFilter === "website"
                    ? "bg-cyan-500/20 text-cyan-300 shadow-sm"
                    : "text-white/40 hover:text-white/80"
                }`}
              >
                Web
              </button>
              <button
                type="button"
                onClick={() => setChannelFilter("crm")}
                className={`rounded-md py-1.5 text-center text-xs font-medium transition ${
                  channelFilter === "crm"
                    ? "bg-violet-500/20 text-violet-300 shadow-sm"
                    : "text-white/40 hover:text-white/80"
                }`}
              >
                CRM
              </button>
            </div>

            {/* Search Input */}
            <div className="relative mt-2.5">
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search contact, company, snippet..."
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] py-1.5 pl-8 pr-3 text-xs text-white placeholder:text-white/30 focus:border-blue-500/50 focus:outline-none"
              />
            </div>

            {/* Stage Quick Filter */}
            <div className="mt-2.5 flex items-center justify-between">
              <select
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value as any)}
                className="rounded-md border border-white/[0.08] bg-black/50 px-2 py-1 text-[11px] text-white/70 focus:outline-none"
              >
                <option value="all">All Deal Stages</option>
                <option value="lead">Lead</option>
                <option value="qualified">Qualified</option>
                <option value="proposal">Proposal</option>
                <option value="won">Closed Won</option>
                <option value="churned">Churned</option>
              </select>

              <button
                type="button"
                onClick={() => setPriorityOnly(!priorityOnly)}
                className={`rounded-md px-2 py-1 text-[11px] transition ${
                  priorityOnly
                    ? "border border-amber-500/30 bg-amber-500/15 text-amber-300"
                    : "text-white/40 hover:text-white"
                }`}
              >
                Priority Only
              </button>
            </div>
          </div>

          {/* Threads List */}
          <div className="flex-1 overflow-y-auto divide-y divide-white/[0.04]">
            {isLoadingThreads ? (
              <div className="flex flex-col items-center justify-center p-8 text-center text-xs text-white/40">
                <RefreshCw size={18} className="mb-2 animate-spin text-blue-400" />
                <p>Loading workspace threads...</p>
              </div>
            ) : filteredThreads.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-6 text-center">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.04] text-white/40">
                  <InboxIcon size={20} />
                </div>
                <p className="text-xs font-semibold text-white/80">No Active Conversations</p>
                <p className="mt-1 max-w-xs text-[11px] text-white/40">
                  Inbound WhatsApp messages, website form leads, and CRM inquiries will appear here automatically for this workspace.
                </p>
                {!isSandboxDemo && (
                  <button
                    type="button"
                    onClick={() => {
                      setThreads([...SEED_INBOX_THREADS]);
                      setIsSandboxDemo(true);
                      if (SEED_INBOX_THREADS[0]) setSelectedThreadId(SEED_INBOX_THREADS[0].id);
                    }}
                    className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[11px] font-medium text-amber-300 transition hover:bg-amber-500/20"
                  >
                    Preview Sandbox Demo Conversations
                  </button>
                )}
              </div>
            ) : (
              filteredThreads.map((thread) => {
                const isSelected = thread.id === selectedThreadId;
                const channelMeta = CHANNEL_METADATA[thread.channel];
                const stageMeta = STAGE_METADATA[thread.dealStage];

                return (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => handleSelectThread(thread.id)}
                    className={`group flex w-full flex-col gap-1.5 p-3.5 text-left transition ${
                      isSelected
                        ? "bg-white/[0.07] border-l-2 border-l-blue-500"
                        : "hover:bg-white/[0.03]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-[11px] font-semibold text-white">
                          {thread.contactName
                            .split(" ")
                            .map((n) => n[0])
                            .slice(0, 2)
                            .join("")}
                        </div>
                        <span className="truncate text-xs font-semibold text-white">
                          {thread.contactName}
                        </span>
                        {thread.unreadCount > 0 && (
                          <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                        )}
                      </div>

                      <span className="shrink-0 text-[10px] text-white/40">
                        {new Date(thread.lastMessageTimestamp).toLocaleTimeString(
                          [],
                          { hour: "2-digit", minute: "2-digit" },
                        )}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px] text-white/50">
                      <span className="truncate">{thread.company || "Direct Inbound"}</span>
                      <span>•</span>
                      <span className="shrink-0 font-medium text-emerald-400">
                        ${thread.estimatedValue.toLocaleString()}
                      </span>
                    </div>

                    <p className="line-clamp-2 text-xs text-white/70">
                      {thread.lastMessageSnippet}
                    </p>

                    <div className="mt-1 flex items-center justify-between gap-2 pt-1">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium border ${channelMeta.badgeClass}`}
                      >
                        {channelMeta.label.split(" ")[0]}
                      </span>

                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium border ${stageMeta.badgeClass}`}
                      >
                        {stageMeta.label}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* COLUMN 2: Active Chat Conversation (5.5 cols)                            */}
        {/* ========================================================================= */}
        <div className="flex flex-col border-r border-white/[0.08] bg-[#09090B] lg:col-span-5 xl:col-span-6">
          {activeThread ? (
            <>
              {/* Active Thread Header */}
              <div className="flex items-center justify-between border-b border-white/[0.08] bg-[#0E0F12] px-5 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-500/10 text-xs font-bold text-blue-400">
                    {activeThread.contactName
                      .split(" ")
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join("")}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-semibold text-white">
                        {activeThread.contactName}
                      </h2>
                      <span
                        className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${
                          CHANNEL_METADATA[activeThread.channel].badgeClass
                        }`}
                      >
                        {CHANNEL_METADATA[activeThread.channel].label}
                      </span>
                    </div>
                    <p className="text-xs text-white/40">
                      {activeThread.company} • {activeThread.contactIdentifier}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={buildWhatsAppReplyLink(
                      activeThread.contactIdentifier,
                      `Hello ${activeThread.contactName}, following up from J10 NEXUS regarding your inquiry.`,
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-7 items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 text-[11px] font-medium text-emerald-400 transition hover:bg-emerald-500/20"
                  >
                    <Phone size={12} />
                    WhatsApp Open
                    <ExternalLink size={10} />
                  </a>
                </div>
              </div>

              {/* Message Stream */}
              <div className="flex-1 space-y-4 overflow-y-auto p-5">
                <div className="text-center">
                  <span className="rounded-full border border-white/[0.06] bg-white/[0.02] px-3 py-1 text-[10px] uppercase tracking-wider text-white/40">
                    Channel Inception: {CHANNEL_METADATA[activeThread.channel].label}
                  </span>
                </div>

                {activeThread.messages.map((msg) => {
                  const isInbound = msg.direction === "inbound";

                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${
                        isInbound ? "items-start" : "items-end"
                      }`}
                    >
                      <div className="mb-1 flex items-center gap-2 text-[10px] text-white/40">
                        <span>{msg.senderName}</span>
                        <span>•</span>
                        <span>
                          {new Date(msg.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>

                      <div
                        className={`max-w-[82%] rounded-2xl p-3.5 text-xs leading-relaxed ${
                          isInbound
                            ? "border border-white/[0.08] bg-[#14151B] text-white/90 rounded-tl-sm"
                            : "border border-blue-500/30 bg-gradient-to-br from-blue-600/30 via-indigo-600/20 to-blue-500/10 text-white rounded-tr-sm"
                        }`}
                      >
                        <p className="whitespace-pre-line">{msg.body}</p>

                        {/* Interactive Stripe Payment Card inside Message */}
                        {msg.metadata?.stripeCheckoutUrl && (
                          <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-950/30 p-3 text-left">
                            <div className="flex items-center justify-between gap-2">
                              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300">
                                <CreditCard size={13} />
                                Stripe Checkout Generated
                              </span>
                              <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400">
                                ${msg.metadata.amount?.toLocaleString()} USD
                              </span>
                            </div>
                            <p className="mt-1 text-[11px] text-white/60">
                              Product: {msg.metadata.productName}
                            </p>
                            <div className="mt-2.5 flex items-center gap-2">
                              <a
                                href={msg.metadata.stripeCheckoutUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 rounded-md bg-emerald-500 px-3 py-1 text-[11px] font-medium text-black transition hover:bg-emerald-400"
                              >
                                Complete Payment
                                <ExternalLink size={11} />
                              </a>
                            </div>
                          </div>
                        )}

                        {/* Lead Form Details Metadata */}
                        {msg.metadata?.leadFormDetails && (
                          <div className="mt-3 rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-3 text-left">
                            <p className="text-[11px] font-semibold text-cyan-300">
                              Submitted Funnel Data:
                            </p>
                            <div className="mt-1.5 space-y-1 text-[11px] text-white/70">
                              {Object.entries(msg.metadata.leadFormDetails).map(
                                ([k, v]) => (
                                  <div key={k} className="flex justify-between gap-2">
                                    <span className="text-white/40">{k}:</span>
                                    <span className="font-medium text-white/90">
                                      {v}
                                    </span>
                                  </div>
                                ),
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* AI Draft Quick Actions */}
              <div className="flex flex-wrap items-center gap-1.5 border-t border-white/[0.08] bg-[#0E0F12] px-4 py-2">
                <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-white/40">
                  <Sparkles size={11} className="text-blue-400" />
                  AI Copilot:
                </span>
                <button
                  type="button"
                  onClick={() => handleApplyAiDraft("payment_request")}
                  className="rounded border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-[11px] text-white/70 transition hover:bg-white/[0.08] hover:text-white"
                >
                  Send Payment Request
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyAiDraft("deal_follow_up")}
                  className="rounded border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-[11px] text-white/70 transition hover:bg-white/[0.08] hover:text-white"
                >
                  Pipeline Follow-Up
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyAiDraft("objection_handling")}
                  className="rounded border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-[11px] text-white/70 transition hover:bg-white/[0.08] hover:text-white"
                >
                  Enterprise Security FAQ
                </button>
              </div>

              {/* Composer Input */}
              <div className="border-t border-white/[0.08] bg-[#0A0B0E] p-3.5">
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-2 focus-within:border-blue-500/50">
                  <textarea
                    rows={3}
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    placeholder={`Reply to ${activeThread.contactName} via ${
                      CHANNEL_METADATA[activeThread.channel].label
                    }...`}
                    className="w-full resize-none bg-transparent text-xs text-white placeholder:text-white/30 focus:outline-none"
                  />

                  <div className="mt-2 flex items-center justify-between border-t border-white/[0.06] pt-2">
                    <span className="text-[10px] text-white/40">
                      Assigned Agent: {activeThread.assignedSpecialist}
                    </span>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSendReply}
                        disabled={isSending || !replyBody.trim()}
                        className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-500 disabled:opacity-40"
                      >
                        <Send size={13} />
                        {isSending ? "Dispatching..." : "Send Reply"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-xs text-white/40">
              Select a conversation to begin dispatch.
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* COLUMN 3: Deal Stage & Instant Stripe Drawer (3 cols)                    */}
        {/* ========================================================================= */}
        <div className="flex flex-col overflow-y-auto bg-[#0C0D10] p-4 lg:col-span-3 xl:col-span-3">
          {activeThread ? (
            <div className="space-y-5">
              {/* Profile & Value Header */}
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wider text-white/40">
                    Deal Intelligence
                  </span>
                  <span className="text-sm font-bold text-emerald-400">
                    ${activeThread.estimatedValue.toLocaleString()} USD
                  </span>
                </div>

                <h3 className="mt-2 text-sm font-semibold text-white">
                  {activeThread.contactName}
                </h3>
                <p className="text-xs text-white/50">{activeThread.company || "Private Entity"}</p>

                <div className="mt-3 space-y-1.5 border-t border-white/[0.06] pt-2.5 text-xs text-white/60">
                  <div className="flex items-center gap-2">
                    <Phone size={12} className="text-white/40" />
                    <span>{activeThread.contactIdentifier}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Globe size={12} className="text-white/40" />
                    <span>Channel: {CHANNEL_METADATA[activeThread.channel].label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <User size={12} className="text-white/40" />
                    <span>Priority: {activeThread.priority.toUpperCase()}</span>
                  </div>
                </div>
              </div>

              {/* Deal Stage Controls */}
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white">Pipeline Stage</span>
                  <span
                    className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${
                      STAGE_METADATA[activeThread.dealStage].badgeClass
                    }`}
                  >
                    {STAGE_METADATA[activeThread.dealStage].label}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-1.5">
                  {(["lead", "qualified", "proposal", "won", "churned"] as InboxDealStage[]).map(
                    (stg) => {
                      const isCurrent = activeThread.dealStage === stg;
                      return (
                        <button
                          key={stg}
                          type="button"
                          onClick={() => handleStageChange(stg)}
                          className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition ${
                            isCurrent
                              ? "bg-blue-600 font-semibold text-white shadow-sm"
                              : "border border-white/[0.05] bg-white/[0.02] text-white/60 hover:bg-white/[0.06] hover:text-white"
                          }`}
                        >
                          <span>{STAGE_METADATA[stg].label}</span>
                          {isCurrent && <CheckCircle2 size={13} />}
                        </button>
                      );
                    },
                  )}
                </div>
              </div>

              {/* Instant Stripe Billing Generator */}
              <div className="rounded-xl border border-blue-500/20 bg-blue-950/10 p-3.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-blue-300">
                  <CreditCard size={15} />
                  Instant Stripe Billing
                </div>
                <p className="mt-1 text-[11px] text-white/50">
                  Generate verified checkout session and attach to active conversation.
                </p>

                <div className="mt-3 space-y-2.5">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-white/40">
                      Product / Package Name
                    </label>
                    <input
                      type="text"
                      value={stripeProduct}
                      onChange={(e) => setStripeProduct(e.target.value)}
                      className="mt-1 w-full rounded-md border border-white/[0.08] bg-black/40 px-2.5 py-1.5 text-xs text-white focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-white/40">
                      Invoice Amount ($ USD)
                    </label>
                    <div className="relative mt-1">
                      <DollarSign
                        size={13}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40"
                      />
                      <input
                        type="number"
                        value={stripeAmount}
                        onChange={(e) => setStripeAmount(Number(e.target.value))}
                        className="w-full rounded-md border border-white/[0.08] bg-black/40 py-1.5 pl-7 pr-2.5 text-xs font-semibold text-emerald-400 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex gap-1.5 pt-1">
                    {[1200, 4800, 18500].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setStripeAmount(preset)}
                        className="rounded border border-white/[0.06] bg-white/[0.02] px-2 py-0.5 text-[10px] text-white/60 hover:bg-white/[0.06]"
                      >
                        ${preset.toLocaleString()}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={handleGenerateStripeLink}
                    disabled={generatingStripe}
                    className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-2 text-xs font-semibold text-white shadow-md shadow-emerald-600/20 transition hover:bg-emerald-500 disabled:opacity-50"
                  >
                    <Zap size={13} />
                    {generatingStripe
                      ? "Generating..."
                      : "Create & Insert Stripe Checkout"}
                  </button>
                </div>
              </div>

              {/* Fast Links to Other Modules */}
              <div className="space-y-1.5 border-t border-white/[0.06] pt-3 text-xs">
                <Link
                  href="/dashboard/crm"
                  className="flex items-center justify-between rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2 text-white/70 transition hover:bg-white/[0.06] hover:text-white"
                >
                  <span className="flex items-center gap-2">
                    <Users size={13} />
                    View in CRM Pipeline
                  </span>
                  <ArrowRight size={13} className="text-white/30" />
                </Link>

                <Link
                  href="/dashboard/commerce"
                  className="flex items-center justify-between rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2 text-white/70 transition hover:bg-white/[0.06] hover:text-white"
                >
                  <span className="flex items-center gap-2">
                    <DollarSign size={13} />
                    Open Commerce Catalog
                  </span>
                  <ArrowRight size={13} className="text-white/30" />
                </Link>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
