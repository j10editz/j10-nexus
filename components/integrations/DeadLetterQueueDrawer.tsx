"use client";

import { useEffect, useState, useCallback } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Inbox,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import IntegrationBrandLogo from "./IntegrationBrandLogo";
import type { DeadLetterEventItem, DeadLetterSummary } from "@/lib/integrations/dlq";

interface DeadLetterQueueDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onReplayComplete?: () => void;
}

export default function DeadLetterQueueDrawer({
  isOpen,
  onClose,
  onReplayComplete,
}: DeadLetterQueueDrawerProps) {
  const [items, setItems] = useState<DeadLetterEventItem[]>([]);
  const [summary, setSummary] = useState<DeadLetterSummary>({
    totalFailed: 0,
    totalRetryable: 0,
    totalProcessed: 0,
    totalDuplicates: 0,
    queueHealthPercent: 100,
  });
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<"all" | "failed" | "retryable" | "processed">("all");
  const [filterProvider, setFilterProvider] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [replayingId, setReplayingId] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ id: string; success: boolean; message: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const fetchDLQ = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus !== "all") params.set("status", filterStatus);
      if (filterProvider !== "all") params.set("provider", filterProvider);

      const res = await fetch(`/api/integrations/dlq?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setItems(data.items || []);
        if (data.summary) setSummary(data.summary);
      }
    } catch (err) {
      console.error("[DLQ Drawer] Fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterProvider]);

  useEffect(() => {
    if (isOpen) {
      fetchDLQ();
    }
  }, [isOpen, fetchDLQ]);

  async function handleReplay(eventId: string) {
    setReplayingId(eventId);
    setActionFeedback(null);
    try {
      const res = await fetch(`/api/integrations/dlq/${eventId}/replay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (data.success) {
        setActionFeedback({
          id: eventId,
          success: true,
          message: data.result?.message || "Event replayed and processed successfully!",
        });
        fetchDLQ();
        onReplayComplete?.();
      } else {
        setActionFeedback({
          id: eventId,
          success: false,
          message: data.error || data.result?.message || "Replay failed.",
        });
      }
    } catch (err: any) {
      setActionFeedback({
        id: eventId,
        success: false,
        message: err.message || "Replay network error.",
      });
    } finally {
      setReplayingId(null);
    }
  }

  async function handleResolve(eventId: string) {
    setResolvingId(eventId);
    setActionFeedback(null);
    try {
      const res = await fetch(`/api/integrations/dlq/${eventId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: "Acknowledged via Command Center DLQ" }),
      });
      const data = await res.json();
      if (data.success) {
        setActionFeedback({
          id: eventId,
          success: true,
          message: "Event marked as resolved.",
        });
        fetchDLQ();
        onReplayComplete?.();
      } else {
        setActionFeedback({
          id: eventId,
          success: false,
          message: data.error || "Failed to resolve event.",
        });
      }
    } catch (err: any) {
      setActionFeedback({
        id: eventId,
        success: false,
        message: err.message || "Resolve network error.",
      });
    } finally {
      setResolvingId(null);
    }
  }

  function copyText(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }

  if (!isOpen) return null;

  const filteredItems = items.filter((item) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.provider.toLowerCase().includes(q) ||
      item.eventType.toLowerCase().includes(q) ||
      (item.failureMessage || "").toLowerCase().includes(q) ||
      (item.failureCode || "").toLowerCase().includes(q) ||
      item.id.toLowerCase().includes(q)
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm transition-opacity">
      <div className="relative flex h-full w-full max-w-2xl flex-col bg-[#0b0c10] border-l border-white/[0.08] text-white shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] px-6 py-5 bg-[#101218]/90">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20 text-[#e2c16c]">
              <ShieldAlert size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-wide">
                  Dead-Letter Queue (DLQ) & Ingress Inspector
                </h3>
                <span className="rounded-full bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                  Self-Healing Engine
                </span>
              </div>
              <p className="text-xs text-white/50 mt-0.5">
                Inspect failed webhook events, replay adapted payloads, and resolve ingestion errors across all 42 providers.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-white/40 hover:bg-white/[0.06] hover:text-white transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Telemetry KPI Badges */}
        <div className="grid grid-cols-4 gap-2 px-6 py-4 border-b border-white/[0.06] bg-[#0c0d12]">
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Queue Health</div>
            <div className="mt-1 flex items-center gap-1.5 text-base font-bold text-emerald-400">
              <ShieldCheck size={16} />
              <span>{summary.queueHealthPercent}%</span>
            </div>
          </div>

          <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-rose-300/60">Failed / Dead</div>
            <div className="mt-1 flex items-center gap-1.5 text-base font-bold text-rose-400">
              <AlertTriangle size={16} />
              <span>{summary.totalFailed}</span>
            </div>
          </div>

          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-300/60">Retryable</div>
            <div className="mt-1 flex items-center gap-1.5 text-base font-bold text-amber-400">
              <RotateCcw size={16} />
              <span>{summary.totalRetryable}</span>
            </div>
          </div>

          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-300/60">Processed</div>
            <div className="mt-1 flex items-center gap-1.5 text-base font-bold text-emerald-400">
              <CheckCircle2 size={16} />
              <span>{summary.totalProcessed}</span>
            </div>
          </div>
        </div>

        {/* Filters Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 border-b border-white/[0.06] bg-[#0e1017]">
          <div className="flex items-center gap-1.5 bg-black/40 p-1 rounded-lg border border-white/[0.06] text-xs">
            {(["all", "failed", "retryable", "processed"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setFilterStatus(tab)}
                className={`px-3 py-1 rounded-md capitalize font-medium transition ${
                  filterStatus === tab
                    ? "bg-[#e2c16c] text-[#160f05] font-semibold shadow-sm"
                    : "text-white/60 hover:text-white"
                }`}
              >
                {tab === "all" ? "All Ingress" : tab}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-2.5 text-white/40" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search event, code, error..."
                className="h-8 rounded-lg border border-white/[0.08] bg-white/[0.03] pl-8 pr-3 text-xs text-white placeholder:text-white/30 focus:border-[#e2c16c]/50 focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={fetchDLQ}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 text-xs text-white/70 hover:bg-white/[0.08] hover:text-white transition"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* Action Feedback Banner */}
        {actionFeedback && (
          <div
            className={`flex items-center justify-between px-6 py-2.5 text-xs border-b ${
              actionFeedback.success
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                : "bg-rose-500/10 border-rose-500/30 text-rose-300"
            }`}
          >
            <div className="flex items-center gap-2">
              {actionFeedback.success ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
              <span>{actionFeedback.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setActionFeedback(null)}
              className="text-white/40 hover:text-white"
            >
              <X size={13} />
            </button>
          </div>
        )}

        {/* Dead Letter Items List */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {loading && items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-white/40">
              <RefreshCw size={24} className="animate-spin text-[#e2c16c] mb-3" />
              <p className="text-xs font-medium">Scanning dead-letter queue records...</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mb-4 shadow-lg shadow-emerald-500/10">
                <CheckCircle2 size={32} />
              </div>
              <h4 className="text-sm font-bold text-white tracking-wide">
                Zero Dead Letters Detected
              </h4>
              <p className="mt-1 text-xs text-white/50 max-w-sm">
                All 42 provider webhooks and lead ingress streams are operating normally with 100% successful delivery.
              </p>
            </div>
          ) : (
            filteredItems.map((item) => {
              const isExpanded = expandedId === item.id;
              const isReplaying = replayingId === item.id;
              const isResolving = resolvingId === item.id;

              return (
                <div
                  key={item.id}
                  className="rounded-xl border border-white/[0.08] bg-[#12141c] hover:border-white/[0.14] transition overflow-hidden"
                >
                  {/* Item Main Row */}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-black/40 border border-white/10 p-1.5">
                          <IntegrationBrandLogo slug={item.provider} name={item.provider} size={20} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-xs text-white capitalize">{item.provider}</span>
                            <span className="rounded-md bg-white/[0.06] border border-white/[0.08] px-2 py-0.5 text-[10px] font-mono text-white/70">
                              {item.eventType}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                                item.processingStatus === "processed"
                                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                  : item.retryable
                                  ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                                  : "bg-rose-500/10 border-rose-500/30 text-rose-400"
                              }`}
                            >
                              {item.processingStatus === "processed"
                                ? "Processed"
                                : item.retryable
                                ? "Retryable"
                                : "Dead Letter"}
                            </span>
                            <span className="text-[11px] text-white/40">
                              Attempt {item.attemptCount}/{item.maxAttempts}
                            </span>
                          </div>

                          {/* Failure Description */}
                          {item.failureMessage && (
                            <p className="mt-1.5 text-xs text-rose-300/90 font-mono bg-rose-500/5 border border-rose-500/20 rounded-md px-2 py-1 max-w-lg truncate">
                              {item.failureCode ? `[${item.failureCode}] ` : ""}
                              {item.failureMessage}
                            </p>
                          )}

                          <div className="mt-2 flex items-center gap-4 text-[11px] text-white/40">
                            <span>Received: {new Date(item.receivedAt).toLocaleTimeString()}</span>
                            {item.lastErrorAt && (
                              <span>Last Error: {new Date(item.lastErrorAt).toLocaleTimeString()}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          disabled={isReplaying || item.processingStatus === "processed"}
                          onClick={() => handleReplay(item.id)}
                          className={`flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold shadow-sm transition ${
                            item.processingStatus === "processed"
                              ? "bg-white/[0.04] text-white/30 cursor-not-allowed border border-white/[0.06]"
                              : "bg-gradient-to-r from-[#e2c16c] to-[#a97a27] text-[#160f05] hover:brightness-110"
                          }`}
                        >
                          <Zap size={13} className={isReplaying ? "animate-spin" : ""} />
                          <span>{isReplaying ? "Replaying..." : "Replay"}</span>
                        </button>

                        {item.processingStatus !== "processed" && (
                          <button
                            type="button"
                            disabled={isResolving}
                            onClick={() => handleResolve(item.id)}
                            className="flex h-8 items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 text-xs text-white/70 hover:bg-white/[0.08] hover:text-white transition"
                            title="Mark Resolved"
                          >
                            <CheckCircle2 size={13} />
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => setExpandedId(isExpanded ? null : item.id)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-white/60 hover:text-white transition"
                        >
                          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Payload & Headers Inspector */}
                  {isExpanded && (
                    <div className="border-t border-white/[0.06] bg-black/50 p-4 space-y-3">
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#e2c16c]">
                            Inbound Payload (JSON)
                          </span>
                          <button
                            type="button"
                            onClick={() => copyText(JSON.stringify(item.payload, null, 2), `payload_${item.id}`)}
                            className="flex items-center gap-1 text-[10px] text-white/50 hover:text-white"
                          >
                            <Copy size={11} />
                            <span>{copiedKey === `payload_${item.id}` ? "Copied!" : "Copy Payload"}</span>
                          </button>
                        </div>
                        <pre className="max-h-48 overflow-y-auto rounded-lg bg-[#07080b] p-3 text-[11px] font-mono text-white/80 border border-white/[0.06]">
                          {JSON.stringify(item.payload, null, 2)}
                        </pre>
                      </div>

                      {item.headers && Object.keys(item.headers).length > 0 && (
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">
                              HTTP Ingress Headers
                            </span>
                            <button
                              type="button"
                              onClick={() => copyText(JSON.stringify(item.headers, null, 2), `hdr_${item.id}`)}
                              className="flex items-center gap-1 text-[10px] text-white/50 hover:text-white"
                            >
                              <Copy size={11} />
                              <span>{copiedKey === `hdr_${item.id}` ? "Copied!" : "Copy Headers"}</span>
                            </button>
                          </div>
                          <pre className="max-h-32 overflow-y-auto rounded-lg bg-[#07080b] p-3 text-[11px] font-mono text-white/60 border border-white/[0.06]">
                            {JSON.stringify(item.headers, null, 2)}
                          </pre>
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-1 text-[10px] text-white/40">
                        <span>Event ID: {item.id}</span>
                        <span>Replay Key: {item.replayKey}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Drawer Footer */}
        <div className="border-t border-white/[0.08] px-6 py-4 bg-[#101218] flex items-center justify-between text-xs text-white/50">
          <span>Continuous DLQ Ingress Engine • J10 Omnichannel Subsystem</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-xs font-semibold text-white hover:bg-white/[0.08] transition"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
}
