"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
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
  STAGE_METADATA,
} from "@/lib/inbox/service";
import type {
  InboxChannel,
  InboxDealStage,
  InboxMessage,
  InboxThread,
} from "@/types/inbox";
import { DashboardStatusBadge } from "@/components/dashboard/DashboardPrimitives";

export default function UnifiedInboxPage() {
  const [threads, setThreads] = useState<InboxThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string>("");
  const [channelFilter, setChannelFilter] = useState<"all" | InboxChannel>("all");
  const [stageFilter, setStageFilter] = useState<"all" | InboxDealStage>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [priorityOnly, setPriorityOnly] = useState(false);
  const [isLivePersisted, setIsLivePersisted] = useState(false);
  const [isLoadingThreads, setIsLoadingThreads] = useState(true);

  // Omnichannel states
  const [slaFilter, setSlaFilter] = useState<"all" | "warning" | "breached">("all");
  const [dispatchChannel, setDispatchChannel] = useState<InboxChannel>("whatsapp");
  const [isLockOverridden, setIsLockOverridden] = useState(false);

  // Message reply composer state
  const [replyBody, setReplyBody] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [statusNotice, setStatusNotice] = useState("");

  // Contact details sidebar states (English only)
  const [aiBotEnabled, setAiBotEnabled] = useState(true);
  const [contactNotes, setContactNotes] = useState("");
  const [contactTags, setContactTags] = useState<string[]>(["Inbound Lead"]);
  const [newTagInput, setNewTagInput] = useState("");

  // Stripe checkout generator state inside drawer
  const [stripeAmount, setStripeAmount] = useState<number>(4800);
  const [stripeProduct, setStripeProduct] = useState("Enterprise AI Rollout");
  const [generatingStripe, setGeneratingStripe] = useState(false);
  const [generatingInvite, setGeneratingInvite] = useState(false);

  // Auto-scroll anchor ref for active chat stream
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const selectedThreadIdRef = useRef<string>(selectedThreadId);
  const isRealtimeHealthyRef = useRef<boolean>(false);

  useEffect(() => {
    selectedThreadIdRef.current = selectedThreadId;
  }, [selectedThreadId]);

  // Fetch full messages for active thread
  const fetchThreadMessages = useCallback(async (threadId: string) => {
    if (!threadId) return;
    try {
      const res = await fetch(`/api/inbox/threads/${threadId}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (data.success && data.thread) {
        setThreads((prev) =>
          prev.map((t) => (t.id === threadId ? { ...t, ...data.thread } : t))
        );
      }
    } catch {
      // Keep current state
    }
  }, []);

  // Fetch persistent threads from API
  const loadThreads = useCallback(async (silent = false) => {
    if (!silent) setIsLoadingThreads(true);
    try {
      const res = await fetch("/api/inbox/threads", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.threads)) {
          setThreads((prev) => {
            return data.threads.map((newThread: any) => {
              const existing = prev.find((t) => t.id === newThread.id);
              return {
                ...newThread,
                messages:
                  existing && existing.messages && existing.messages.length > 0
                    ? existing.messages
                    : newThread.messages || [],
              };
            });
          });
          setIsLivePersisted(true);
          if (data.threads.length > 0) {
            setSelectedThreadId((curr) => {
              const valid = curr && data.threads.some((t: any) => t.id === curr);
              const target = valid ? curr : data.threads[0].id;
              void fetchThreadMessages(target);
              return target;
            });
          } else {
            setSelectedThreadId("");
          }
          return;
        }
      }
    } catch {
      // Keep state
    } finally {
      if (!silent) setIsLoadingThreads(false);
    }
  }, [fetchThreadMessages]);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    if (selectedThreadId) {
      void fetchThreadMessages(selectedThreadId);
    }
  }, [selectedThreadId, fetchThreadMessages]);

  // Supabase Realtime subscription
  useEffect(() => {
    if (!isLivePersisted) return;

    const triggerSync = () => {
      void loadThreads(true);
      const currentThreadId = selectedThreadIdRef.current;
      if (currentThreadId) {
        void fetchThreadMessages(currentThreadId);
      }
    };

    const supabase = createClient();
    const channel = supabase
      .channel("inbox_live_global")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "inbox_messages",
        },
        (payload: any) => {
          const currentThreadId = selectedThreadIdRef.current;
          if (currentThreadId && (payload?.new?.thread_id === currentThreadId || !payload?.new?.thread_id)) {
            void fetchThreadMessages(currentThreadId);
          }
          void loadThreads(true);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "inbox_threads",
        },
        () => {
          void loadThreads(true);
          const currentThreadId = selectedThreadIdRef.current;
          if (currentThreadId) {
            void fetchThreadMessages(currentThreadId);
          }
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          isRealtimeHealthyRef.current = true;
        } else {
          isRealtimeHealthyRef.current = false;
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            triggerSync();
          }
        }
      });

    let pollIntervalMs = 3000;
    let fallbackTimer: NodeJS.Timeout;

    const cursorPoll = () => {
      if (!isRealtimeHealthyRef.current) {
        if (document.hidden) {
          pollIntervalMs = 15000;
        } else {
          pollIntervalMs = 3000;
          triggerSync();
        }
      } else {
        pollIntervalMs = 5000;
      }
      fallbackTimer = setTimeout(cursorPoll, pollIntervalMs);
    };

    fallbackTimer = setTimeout(cursorPoll, pollIntervalMs);

    const handleVisibilityOrFocus = () => {
      if (!document.hidden && !isRealtimeHealthyRef.current) {
        triggerSync();
      }
    };

    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);

    return () => {
      isRealtimeHealthyRef.current = false;
      void supabase.removeChannel(channel);
      clearTimeout(fallbackTimer);
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
    };
  }, [isLivePersisted, fetchThreadMessages, loadThreads]);

  const activeThread = useMemo(() => {
    return threads.find((t) => t.id === selectedThreadId) || threads[0] || null;
  }, [threads, selectedThreadId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeThread?.messages?.length, selectedThreadId]);

  useEffect(() => {
    if (activeThread?.channel) {
      setDispatchChannel(activeThread.channel);
      setIsLockOverridden(false);
    }
  }, [activeThread?.id, activeThread?.channel]);

  useEffect(() => {
    if (activeThread) {
      const meta = (activeThread as any).metadata || {};
      const isEnabled = meta.aiBotEnabled !== false && meta.humanHandoff !== true;
      setAiBotEnabled(isEnabled);
    }
  }, [activeThread?.id, (activeThread as any)?.metadata?.aiBotEnabled, (activeThread as any)?.metadata?.humanHandoff]);

  const handleToggleAiBot = async () => {
    if (!activeThread?.id) return;
    const nextState = !aiBotEnabled;
    setAiBotEnabled(nextState);
    try {
      await fetch(`/api/inbox/threads/${activeThread.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiBotEnabled: nextState }),
      });
      void loadThreads(true);
    } catch (err) {
      console.error("Failed to toggle AI status:", err);
    }
  };

  const filteredThreads = useMemo(() => {
    let result = filterInboxThreads(threads, {
      channel: channelFilter,
      stage: stageFilter,
      search: searchQuery,
      priorityOnly,
    });
    if (slaFilter === "breached") {
      result = result.filter((t) => t.slaStatus === "breached");
    } else if (slaFilter === "warning") {
      result = result.filter((t) => t.slaStatus === "warning");
    }
    return result;
  }, [threads, channelFilter, stageFilter, searchQuery, priorityOnly, slaFilter]);

  const totalUnread = useMemo(() => {
    return threads.reduce((sum, t) => sum + t.unreadCount, 0);
  }, [threads]);

  const totalPipelineValue = useMemo(() => {
    return threads.reduce((sum, t) => sum + t.estimatedValue, 0);
  }, [threads]);

  const channelCounts = useMemo(() => {
    const counts: Record<string, number> = { all: threads.length };
    for (const t of threads) {
      counts[t.channel] = (counts[t.channel] || 0) + 1;
    }
    return counts;
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

    if (
      activeThread.lock?.isLocked &&
      !activeThread.lock?.isHeldByMe &&
      !isLockOverridden
    ) {
      setStatusNotice(
        `Collision Prevented: Thread is currently locked by ${activeThread.lock.lockedByUserName || "another operator"}. Click Override Lock to proceed.`,
      );
      return;
    }

    setIsSending(true);
    const textToSend = replyBody.trim();
    const targetChannel = dispatchChannel || activeThread.channel;

    try {
      if (isLivePersisted) {
        const res = await fetch("/api/omnichannel/dispatch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            threadId: activeThread.id,
            channel: targetChannel,
            recipient: activeThread.contactIdentifier,
            content: textToSend,
            forceLockOverride: isLockOverridden,
          }),
        });

        const data = await res.json();
        if (res.status === 409) {
          setStatusNotice(data.error || "Collision lock conflict.");
          return;
        }

        if (data.success) {
          const newMsg: InboxMessage = {
            id: data.messageId || `msg-${Date.now()}`,
            threadId: activeThread.id,
            direction: "outbound",
            sender: "agent",
            senderName: "Support Operator",
            body: textToSend,
            timestamp: new Date().toISOString(),
            status: "sent",
            channel: targetChannel,
          };

          setThreads((prev) =>
            prev.map((t) =>
              t.id === activeThread.id
                ? {
                    ...t,
                    lastMessageSnippet: textToSend,
                    lastMessageTimestamp: newMsg.timestamp,
                    messages: [...t.messages, newMsg],
                    slaStatus: "healthy",
                  }
                : t,
            ),
          );
          setReplyBody("");
          setStatusNotice(
            `Message dispatched via ${CHANNEL_METADATA[targetChannel].label}`,
          );
          setTimeout(() => setStatusNotice(""), 3000);
          return;
        }
      }

      const updated = appendThreadReply(activeThread, {
        threadId: activeThread.id,
        body: textToSend,
        agentName: "Support Operator",
      });

      setThreads((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setReplyBody("");
      setStatusNotice(`Message dispatched via ${CHANNEL_METADATA[targetChannel].label}`);
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
      if (!response.ok || !data.checkoutUrl) {
        alert(data.error || "Failed to generate Stripe checkout session. Please verify Stripe configuration.");
        return;
      }

      const checkoutUrl = data.checkoutUrl;
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
            `Stripe checkout attached ($${stripeAmount.toLocaleString()})`,
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
      setStatusNotice(`Stripe checkout link generated ($${stripeAmount.toLocaleString()})`);
      setTimeout(() => setStatusNotice(""), 4000);
    } catch {
      setStatusNotice("Failed to generate checkout link");
    } finally {
      setGeneratingStripe(false);
    }
  }

  async function handleSendGroupInvite() {
    if (!activeThread) return;
    setGeneratingInvite(true);
    try {
      const res = await fetch("/api/telegram/group-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: activeThread.id,
          chatId: activeThread.contactIdentifier,
          customerName: activeThread.contactName,
          sendDirectly: true,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setStatusNotice("VIP Group join link dispatched to customer.");
        setTimeout(() => setStatusNotice(""), 4000);
        void fetchThreadMessages(activeThread.id);
      } else {
        setStatusNotice(data.error || "Failed to generate group invite.");
      }
    } catch {
      setStatusNotice("Failed to send group invite.");
    } finally {
      setGeneratingInvite(false);
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
    <div className="flex h-[calc(100dvh-56px)] flex-col bg-[#F8F7FC] text-[#17151F]">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E2DEEA] bg-[#FFFFFF] px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#E2DEEA] bg-[#F0ECFF] text-[#6347E8]">
            <InboxIcon size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-[#17151F]">
                J10 Inbox
              </h1>
            </div>
            <p className="text-xs text-[#6F687A]">
              Unified cross-channel conversations and customer communications.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden items-center gap-6 sm:flex">
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-[#918A9D]">Conversations</p>
              <p className="text-xs font-semibold text-[#17151F]">{threads.length} active</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-[#918A9D]">Unread</p>
              <p className="text-xs font-semibold text-[#D97706]">{totalUnread} urgent</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-[#918A9D]">Pipeline Value</p>
              <p className="text-xs font-semibold text-[#168A65]">
                ${totalPipelineValue.toLocaleString()} USD
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void loadThreads()}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-[#E2DEEA] bg-[#FFFFFF] px-2.5 text-xs text-[#6F687A] transition hover:bg-[#F3F1F8] hover:text-[#17151F] shadow-sm"
          >
            <RefreshCw size={13} className={isLoadingThreads ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {statusNotice && (
        <div className="flex items-center justify-between border-b border-[#A3E6D0] bg-[#E8F8F2] px-6 py-2 text-xs font-medium text-[#168A65]">
          <span className="flex items-center gap-2">
            <CheckCircle2 size={14} />
            {statusNotice}
          </span>
          <button
            type="button"
            onClick={() => setStatusNotice("")}
            className="text-[#168A65] hover:opacity-75"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main 3-Column Split Desk */}
      <div className="grid flex-1 min-h-0 grid-cols-1 overflow-hidden lg:grid-cols-12">
        {/* ========================================================================= */}
        {/* COLUMN 1: Conversation List (3 cols)                                     */}
        {/* ========================================================================= */}
        <div className="flex h-full min-h-0 flex-col overflow-hidden border-r border-[#E2DEEA] bg-[#FFFFFF] lg:col-span-4 xl:col-span-3">
          {/* Channel Selector Tabs */}
          <div className="border-b border-[#E2DEEA] p-3 space-y-2.5">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
              {(
                [
                  { id: "all", label: "All" },
                  { id: "whatsapp", label: "WhatsApp" },
                  { id: "telegram", label: "Telegram" },
                  { id: "webchat", label: "Website" },
                  { id: "crm", label: "CRM" },
                ] as const
              ).map((tab) => {
                const count = channelCounts[tab.id] ?? 0;
                const isSelected = channelFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setChannelFilter(tab.id as any)}
                    className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-center text-xs font-medium transition ${
                      isSelected
                        ? "bg-[#6347E8] text-white shadow-sm"
                        : "bg-[#F3F1F8] text-[#6F687A] hover:bg-[#E2DEEA] hover:text-[#17151F]"
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={`rounded-full px-1.5 py-0.2 text-[9px] font-bold ${
                        isSelected
                          ? "bg-white/20 text-white"
                          : count > 0
                          ? "bg-[#E2DEEA] text-[#17151F]"
                          : "text-[#918A9D]"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#918A9D]"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search conversations..."
                className="w-full rounded-lg border border-[#E2DEEA] bg-[#F8F7FC] py-1.5 pl-8 pr-3 text-xs text-[#17151F] placeholder:text-[#918A9D] focus:border-[#6347E8] focus:bg-[#FFFFFF] focus:outline-none"
              />
            </div>

            {/* Stage and SLA Quick Filters */}
            <div className="flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-1.5">
                <select
                  value={stageFilter}
                  onChange={(e) => setStageFilter(e.target.value as any)}
                  className="rounded-lg border border-[#E2DEEA] bg-[#FFFFFF] px-2 py-1 text-[11px] text-[#6F687A] focus:outline-none"
                >
                  <option value="all">All Stages</option>
                  <option value="lead">Lead</option>
                  <option value="qualified">Qualified</option>
                  <option value="proposal">Proposal</option>
                  <option value="won">Closed Won</option>
                  <option value="churned">Lost</option>
                </select>

                <select
                  value={slaFilter}
                  onChange={(e) => setSlaFilter(e.target.value as any)}
                  className="rounded-lg border border-[#E2DEEA] bg-[#FFFFFF] px-2 py-1 text-[11px] text-[#6F687A] focus:outline-none"
                >
                  <option value="all">All SLAs</option>
                  <option value="warning">Warning</option>
                  <option value="breached">Breached</option>
                </select>
              </div>

              <button
                type="button"
                onClick={() => setPriorityOnly(!priorityOnly)}
                className={`rounded-lg px-2 py-1 text-[11px] font-medium transition ${
                  priorityOnly
                    ? "border border-[#FDE68A] bg-[#FEF3C7] text-[#D97706]"
                    : "text-[#6F687A] hover:bg-[#F3F1F8] hover:text-[#17151F]"
                }`}
              >
                Priority
              </button>
            </div>
          </div>

          {/* Threads List */}
          <div className="flex-1 overflow-y-auto divide-y divide-[#E2DEEA]">
            {isLoadingThreads ? (
              <div className="flex flex-col items-center justify-center p-8 text-center text-xs text-[#6F687A]">
                <RefreshCw size={18} className="mb-2 animate-spin text-[#6347E8]" />
                <p>Loading conversations...</p>
              </div>
            ) : filteredThreads.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-6 text-center">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#F3F1F8] text-[#918A9D]">
                  <InboxIcon size={20} />
                </div>
                <p className="text-xs font-semibold text-[#17151F]">No Active Conversations</p>
                <p className="mt-1 max-w-xs text-[11px] text-[#6F687A]">
                  Inbound customer inquiries will appear here automatically.
                </p>
              </div>
            ) : (
              filteredThreads.map((thread) => {
                const isSelected = thread.id === selectedThreadId;
                const channelMeta = CHANNEL_METADATA[thread.channel] || CHANNEL_METADATA.whatsapp;
                const stageMeta = STAGE_METADATA[thread.dealStage] || STAGE_METADATA.lead;

                return (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => handleSelectThread(thread.id)}
                    className={`group flex w-full flex-col gap-1 p-3 text-left transition ${
                      isSelected
                        ? "bg-[#F0ECFF] border-l-2 border-l-[#6347E8]"
                        : "hover:bg-[#F3F1F8]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#E2DEEA] text-[11px] font-bold text-[#17151F]">
                          {thread.contactName
                            .split(" ")
                            .map((n) => n[0])
                            .slice(0, 2)
                            .join("")}
                        </div>
                        <span className="truncate text-xs font-semibold text-[#17151F]">
                          {thread.contactName}
                        </span>
                        {thread.unreadCount > 0 && (
                          <span className="h-2 w-2 shrink-0 rounded-full bg-[#D97706]" />
                        )}
                      </div>

                      <span className="shrink-0 text-[10px] text-[#918A9D]">
                        {new Date(thread.lastMessageTimestamp).toLocaleTimeString(
                          [],
                          { hour: "2-digit", minute: "2-digit" },
                        )}
                      </span>
                    </div>

                    <p className="line-clamp-2 text-xs text-[#6F687A]">
                      {thread.lastMessageSnippet}
                    </p>

                    <div className="mt-1 flex items-center justify-between gap-1 pt-0.5">
                      <div className="flex items-center gap-1">
                        <span className="rounded bg-[#FFFFFF] border border-[#E2DEEA] px-1.5 py-0.2 text-[10px] font-medium text-[#6F687A]">
                          {channelMeta.label.split(" ")[0]}
                        </span>
                        <span className="rounded bg-[#FFFFFF] border border-[#E2DEEA] px-1.5 py-0.2 text-[10px] font-medium text-[#6F687A]">
                          {stageMeta.label}
                        </span>
                      </div>

                      {thread.slaStatus === "breached" && (
                        <span className="rounded border border-[#FECDD3] bg-[#FFE4E8] px-1.5 py-0.2 text-[9px] font-semibold text-[#E11D48]">
                          SLA Breached
                        </span>
                      )}
                      {thread.slaStatus === "warning" && (
                        <span className="rounded border border-[#FDE68A] bg-[#FEF3C7] px-1.5 py-0.2 text-[9px] font-semibold text-[#D97706]">
                          Warning ({thread.slaMinutesRemaining ?? 0}m)
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* COLUMN 2: Selected Conversation & Composer (6 cols)                      */}
        {/* ========================================================================= */}
        <div className="flex h-full min-h-0 flex-col overflow-hidden border-r border-[#E2DEEA] bg-[#F8F7FC] lg:col-span-5 xl:col-span-6">
          {activeThread ? (
            <>
              {/* Header */}
              <div className="shrink-0 flex items-center justify-between border-b border-[#E2DEEA] bg-[#FFFFFF] px-5 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F0ECFF] text-xs font-bold text-[#6347E8]">
                    {activeThread.contactName
                      .split(" ")
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join("")}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-semibold text-[#17151F]">
                        {activeThread.contactName}
                      </h2>
                      <span className="rounded bg-[#F3F1F8] border border-[#E2DEEA] px-1.5 py-0.5 text-[10px] font-medium text-[#6F687A]">
                        {CHANNEL_METADATA[activeThread.channel].label}
                      </span>
                    </div>
                    <p className="text-xs text-[#6F687A]">
                      {activeThread.company || "Customer"} • {activeThread.contactIdentifier}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {activeThread.channel === "telegram" ? (
                    <a
                      href={activeThread.contactIdentifier.startsWith("@") ? `https://t.me/${activeThread.contactIdentifier.slice(1)}` : "https://t.me/"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-7 items-center gap-1 rounded-lg border border-[#E2DEEA] bg-[#FFFFFF] px-2.5 text-[11px] font-medium text-[#17151F] hover:bg-[#F3F1F8] transition shadow-sm"
                    >
                      <Send size={12} className="text-[#6347E8]" />
                      Telegram
                      <ExternalLink size={10} className="text-[#918A9D]" />
                    </a>
                  ) : (
                    <a
                      href={buildWhatsAppReplyLink(
                        activeThread.contactIdentifier,
                        `Hello ${activeThread.contactName}, following up regarding your inquiry.`,
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-7 items-center gap-1 rounded-lg border border-[#E2DEEA] bg-[#FFFFFF] px-2.5 text-[11px] font-medium text-[#17151F] hover:bg-[#F3F1F8] transition shadow-sm"
                    >
                      <Phone size={12} className="text-[#168A65]" />
                      WhatsApp
                      <ExternalLink size={10} className="text-[#918A9D]" />
                    </a>
                  )}
                </div>
              </div>

              {/* Collision Alert Banner */}
              {activeThread.lock?.isLocked && !activeThread.lock?.isHeldByMe && (
                <div className="shrink-0 flex items-center justify-between border-b border-[#FDE68A] bg-[#FEF3C7] px-5 py-2 text-xs text-[#D97706]">
                  <div className="flex items-center gap-2">
                    <ShieldAlert size={14} className="text-[#D97706] shrink-0" />
                    <span>
                      Collision Notice: Another operator is currently viewing this thread.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsLockOverridden(!isLockOverridden)}
                    className="rounded border border-[#FDE68A] bg-[#FFFFFF] px-2 py-0.5 text-[10px] font-semibold text-[#D97706]"
                  >
                    {isLockOverridden ? "Lock Overridden" : "Override Lock"}
                  </button>
                </div>
              )}

              {/* Message Stream */}
              <div className="flex-1 min-h-0 space-y-3.5 overflow-y-auto p-4 sm:p-5">
                {activeThread.messages.map((msg) => {
                  const isInbound = msg.direction === "inbound";

                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${
                        isInbound ? "items-start" : "items-end"
                      }`}
                    >
                      <div className="mb-1 flex items-center gap-2 text-[10px] text-[#918A9D]">
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
                        className={`max-w-[82%] rounded-xl p-3 text-xs leading-relaxed shadow-sm ${
                          isInbound
                            ? "border border-[#E2DEEA] bg-[#FFFFFF] text-[#17151F] rounded-tl-sm"
                            : "bg-[#6347E8] text-white rounded-tr-sm"
                        }`}
                      >
                        <p className="whitespace-pre-line">{msg.body}</p>

                        {/* Interactive Stripe Payment Card inside Message */}
                        {msg.metadata?.stripeCheckoutUrl && (
                          <div className={`mt-2.5 rounded-lg border p-2.5 text-left ${isInbound ? "border-[#A3E6D0] bg-[#E8F8F2] text-[#168A65]" : "border-white/30 bg-white/10 text-white"}`}>
                            <div className="flex items-center justify-between gap-2">
                              <span className="flex items-center gap-1.5 text-[11px] font-semibold">
                                <CreditCard size={13} />
                                Checkout Link
                              </span>
                              <span className="font-bold text-[11px]">
                                ${msg.metadata.amount?.toLocaleString()} USD
                              </span>
                            </div>
                            <div className="mt-2 flex items-center gap-2">
                              <a
                                href={msg.metadata.stripeCheckoutUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 rounded bg-[#168A65] px-2.5 py-1 text-[10px] font-semibold text-white transition hover:bg-[#137353]"
                              >
                                View Checkout
                                <ExternalLink size={10} />
                              </a>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Persistent Composer */}
              <div className="shrink-0 border-t border-[#E2DEEA] bg-[#FFFFFF] p-3">
                <div className="rounded-xl border border-[#E2DEEA] bg-[#F8F7FC] p-2 focus-within:border-[#6347E8] focus-within:bg-[#FFFFFF]">
                  <textarea
                    rows={2}
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void handleSendReply();
                      }
                    }}
                    placeholder={`Reply to ${activeThread.contactName}... (Press Enter to send)`}
                    className="w-full resize-none bg-transparent text-xs text-[#17151F] placeholder:text-[#918A9D] focus:outline-none"
                  />

                  <div className="mt-2 flex items-center justify-between border-t border-[#E2DEEA] pt-2">
                    <span className="text-[10px] text-[#918A9D]">
                      Channel: {CHANNEL_METADATA[dispatchChannel || activeThread.channel]?.label || "Omnichannel"}
                    </span>

                    <button
                      type="button"
                      onClick={handleSendReply}
                      disabled={isSending || !replyBody.trim()}
                      className="flex items-center gap-1.5 rounded-lg bg-[#6347E8] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#5136D6] disabled:opacity-40"
                    >
                      <Send size={12} />
                      {isSending ? "Sending..." : "Send Message"}
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-xs text-[#6F687A]">
              Select a conversation to view messages.
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* COLUMN 3: Contact Details, Labels, Notes, Stage (3 cols)                 */}
        {/* ========================================================================= */}
        <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-[#FFFFFF] p-4 lg:col-span-3 xl:col-span-3 space-y-4">
          {activeThread ? (
            <>
              {/* Contact Details Header */}
              <div className="rounded-xl border border-[#E2DEEA] bg-[#F8F7FC] p-4">
                <div className="flex items-center justify-between border-b border-[#E2DEEA] pb-3">
                  <span className="text-xs font-bold text-[#17151F]">
                    Contact Details
                  </span>
                  <span className="rounded border border-[#E2DEEA] bg-[#FFFFFF] px-1.5 py-0.5 text-[10px] font-medium text-[#6F687A]">
                    {CHANNEL_METADATA[activeThread.channel].label}
                  </span>
                </div>

                <div className="mt-3 flex flex-col items-center text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F0ECFF] text-sm font-bold text-[#6347E8]">
                    {activeThread.contactName
                      .split(" ")
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join("")}
                  </div>
                  <h3 className="mt-2 text-sm font-semibold text-[#17151F]">
                    {activeThread.contactName}
                  </h3>
                  <p className="text-xs text-[#6F687A]">{activeThread.contactIdentifier}</p>
                </div>

                {/* AI Receptionist Handling Toggle */}
                <div className="mt-3 rounded-lg border border-[#E2DEEA] bg-[#FFFFFF] p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#17151F]">
                      AI Receptionist
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        aiBotEnabled
                          ? "bg-[#E8F8F2] text-[#168A65]"
                          : "bg-[#F3F1F8] text-[#6F687A]"
                      }`}
                    >
                      {aiBotEnabled ? "Enabled" : "Paused"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleAiBot}
                    className="mt-2 w-full rounded-lg border border-[#E2DEEA] bg-[#FFFFFF] py-1 text-xs font-medium text-[#17151F] transition hover:bg-[#F3F1F8]"
                  >
                    {aiBotEnabled ? "Pause AI Operator" : "Resume AI Operator"}
                  </button>
                </div>

                {/* Labels / Tags */}
                <div className="mt-3 border-t border-[#E2DEEA] pt-3">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[#918A9D]">
                    Labels
                  </span>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {contactTags.map((tag) => (
                      <span
                        key={tag}
                        className="flex items-center gap-1 rounded-md bg-[#FFFFFF] border border-[#E2DEEA] px-2 py-0.5 text-[11px] text-[#17151F]"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => setContactTags(contactTags.filter((t) => t !== tag))}
                          className="text-[#918A9D] hover:text-[#17151F]"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="mt-2 flex gap-1">
                    <input
                      type="text"
                      value={newTagInput}
                      onChange={(e) => setNewTagInput(e.target.value)}
                      placeholder="New label..."
                      className="w-full rounded-lg border border-[#E2DEEA] bg-[#FFFFFF] px-2 py-1 text-[11px] text-[#17151F] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (newTagInput.trim()) {
                          setContactTags([...contactTags, newTagInput.trim()]);
                          setNewTagInput("");
                        }
                      }}
                      className="rounded-lg border border-[#E2DEEA] bg-[#FFFFFF] px-2.5 py-1 text-[11px] font-medium text-[#17151F] hover:bg-[#F3F1F8]"
                    >
                      Add
                    </button>
                  </div>
                </div>

                {/* Notes */}
                <div className="mt-3 border-t border-[#E2DEEA] pt-3">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[#918A9D]">
                    Notes
                  </span>
                  <textarea
                    rows={2}
                    value={contactNotes}
                    onChange={(e) => setContactNotes(e.target.value)}
                    placeholder="Add notes about this contact..."
                    className="mt-1.5 w-full rounded-lg border border-[#E2DEEA] bg-[#FFFFFF] p-2 text-xs text-[#17151F] placeholder:text-[#918A9D] focus:outline-none"
                  />
                </div>
              </div>

              {/* Pipeline Stage */}
              <div className="rounded-xl border border-[#E2DEEA] bg-[#F8F7FC] p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#17151F]">Pipeline Stage</span>
                  <span className="rounded bg-[#FFFFFF] border border-[#E2DEEA] px-1.5 py-0.5 text-[10px] font-medium text-[#6F687A]">
                    {STAGE_METADATA[activeThread.dealStage].label}
                  </span>
                </div>

                <div className="mt-2.5 grid grid-cols-1 gap-1">
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
                              ? "bg-[#6347E8] font-semibold text-white shadow-sm"
                              : "border border-[#E2DEEA] bg-[#FFFFFF] text-[#6F687A] hover:bg-[#F3F1F8] hover:text-[#17151F]"
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

              {/* Stripe Billing Checkout Generator */}
              <div className="rounded-xl border border-[#E2DEEA] bg-[#F8F7FC] p-3.5 space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-bold text-[#17151F]">
                  <CreditCard size={14} className="text-[#6347E8]" />
                  <span>Stripe Payment Link</span>
                </div>

                <div>
                  <input
                    type="text"
                    value={stripeProduct}
                    onChange={(e) => setStripeProduct(e.target.value)}
                    placeholder="Product or service name"
                    className="w-full rounded-lg border border-[#E2DEEA] bg-[#FFFFFF] px-2.5 py-1.5 text-xs text-[#17151F] focus:outline-none"
                  />
                </div>

                <div className="relative">
                  <DollarSign
                    size={13}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#918A9D]"
                  />
                  <input
                    type="number"
                    value={stripeAmount}
                    onChange={(e) => setStripeAmount(Number(e.target.value))}
                    className="w-full rounded-lg border border-[#E2DEEA] bg-[#FFFFFF] py-1.5 pl-7 pr-2.5 text-xs font-semibold text-[#168A65] focus:outline-none"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleGenerateStripeLink}
                  disabled={generatingStripe}
                  className="w-full rounded-lg bg-[#6347E8] py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#5136D6] disabled:opacity-50"
                >
                  {generatingStripe ? "Generating..." : "Generate Payment Link"}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
