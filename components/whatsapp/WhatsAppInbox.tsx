"use client";

import { useCallback, useEffect, useState } from "react";
import { Inbox, LoaderCircle, MessageSquare, RefreshCw } from "lucide-react";

type Conversation = {
  sender: string;
  name: string;
  lastMessage: string;
  messageType: string;
  lastReceivedAt: string;
  messageCount: number;
  status: string;
};

type Response = {
  success: boolean;
  conversations?: Conversation[];
  error?: string;
};

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

  return (
    <section className="mt-8 rounded-2xl border border-white/[0.07] bg-[#111216] p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Inbox size={18} className="text-emerald-400" />
            <h2 className="text-lg font-semibold">Customer Inbox</h2>
          </div>
          <p className="mt-1 text-sm text-zinc-600">Real inbound customer conversations received by your connected WhatsApp number.</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={!connected || loading}
          className="rounded-xl border border-white/[0.08] p-2.5 text-zinc-400 transition hover:bg-white/[0.04] disabled:opacity-40"
          aria-label="Refresh conversations"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {!connected ? (
        <p className="mt-5 rounded-xl border border-amber-500/15 bg-amber-500/[0.04] p-4 text-sm text-amber-300">Connect WhatsApp Business to open the customer inbox.</p>
      ) : loading && items.length === 0 ? (
        <div className="mt-8 flex items-center justify-center gap-2 text-sm text-zinc-500"><LoaderCircle size={16} className="animate-spin" />Loading conversations…</div>
      ) : error ? (
        <p className="mt-5 rounded-xl border border-red-500/15 bg-red-500/[0.04] p-4 text-sm text-red-300">{error}</p>
      ) : items.length === 0 ? (
        <div className="mt-8 flex flex-col items-center py-6 text-center">
          <MessageSquare size={24} className="text-zinc-700" />
          <p className="mt-3 text-sm font-medium text-zinc-300">No customer conversations yet</p>
          <p className="mt-1 text-xs text-zinc-600">New signed inbound messages will appear here automatically.</p>
        </div>
      ) : (
        <div className="mt-5 divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/[0.06]">
          {items.map((item) => (
            <div key={item.sender} className="flex items-center gap-4 bg-black/20 px-4 py-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-sm font-semibold text-emerald-300">{item.name.slice(0, 1).toUpperCase()}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-medium text-zinc-200">{item.name}</p>
                  <time className="shrink-0 text-[11px] text-zinc-600">{new Date(item.lastReceivedAt).toLocaleString()}</time>
                </div>
                <p className="mt-1 truncate text-sm text-zinc-500">{item.lastMessage}</p>
              </div>
              <span className="rounded-full bg-zinc-800 px-2 py-1 text-[10px] text-zinc-400">{item.messageCount}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
