"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, CheckCircle2, Inbox, LoaderCircle, MessageSquare, RefreshCw, Send, Sparkles } from "lucide-react";

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

type Approval = {
  approvalToken: string;
  expiresAt: string;
  idempotencyKey: string;
  capabilityId: string;
  input: Record<string, unknown>;
  preview: { recipient: string; message: string; externalSideEffect: boolean };
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
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [reply, setReply] = useState("");
  const [approval, setApproval] = useState<Approval | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [aiMode, setAiMode] = useState("");

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
            <button
              type="button"
              key={item.sender}
              onClick={() => { setSelected(item); setApproval(null); setSent(""); setError(""); }}
              className={`flex w-full items-center gap-4 px-4 py-4 text-left transition ${selected?.sender === item.sender ? "bg-emerald-500/[0.07]" : "bg-black/20 hover:bg-white/[0.03]"}`}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-sm font-semibold text-emerald-300">{item.name.slice(0, 1).toUpperCase()}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-medium text-zinc-200">{item.name}</p>
                  <time className="shrink-0 text-[11px] text-zinc-600">{new Date(item.lastReceivedAt).toLocaleString()}</time>
                </div>
                <p className="mt-1 truncate text-sm text-zinc-500">{item.lastMessage}</p>
              </div>
              <span className="rounded-full bg-zinc-800 px-2 py-1 text-[10px] text-zinc-400">{item.messageCount}</span>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="mt-5 rounded-xl border border-emerald-500/15 bg-emerald-500/[0.03] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-zinc-200">Reply to {selected.name}</p>
              <p className="mt-1 text-xs text-zinc-600">J10 will never send until you approve the exact message.</p>
            </div>
            <span className="text-xs text-zinc-600">••••{selected.sender.slice(-4)}</span>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void generateSuggestion()}
              disabled={suggesting}
              className="flex items-center gap-2 rounded-xl border border-violet-500/20 bg-violet-500/[0.07] px-4 py-2.5 text-xs font-medium text-violet-300 transition hover:bg-violet-500/[0.12] disabled:opacity-40"
            >
              {suggesting ? <LoaderCircle size={13} className="animate-spin" /> : <Sparkles size={13} />}
              {suggesting ? "J10 AI is drafting…" : "Generate AI suggestion"}
            </button>
            {aiMode && <span className="flex items-center gap-1.5 text-[11px] text-zinc-600"><Bot size={12} />{aiMode}</span>}
          </div>
          <textarea
            value={reply}
            onChange={(event) => { setReply(event.target.value); setApproval(null); setSent(""); setAiMode(""); }}
            maxLength={4096}
            rows={4}
            placeholder="Write your WhatsApp reply…"
            className="mt-4 w-full resize-y rounded-xl border border-white/[0.08] bg-black/30 px-4 py-3 text-sm text-zinc-200 outline-none transition placeholder:text-zinc-700 focus:border-emerald-500/30"
          />
          {error && <p className="mt-3 text-xs text-red-300">{error}</p>}
          {sent && <p className="mt-3 flex items-center gap-2 text-xs text-emerald-300"><CheckCircle2 size={13} />{sent}</p>}
          {approval ? (
            <div className="mt-4 flex flex-col gap-3 rounded-xl border border-amber-500/15 bg-amber-500/[0.04] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-medium text-amber-300">Final approval required</p>
                <p className="mt-1 text-xs text-zinc-500">This sends one external WhatsApp message to {approval.preview.recipient}.</p>
              </div>
              <button type="button" onClick={() => void sendReply()} disabled={sending} className="rounded-xl bg-emerald-400 px-4 py-2.5 text-xs font-semibold text-black transition hover:bg-emerald-300 disabled:opacity-50">
                {sending ? "Sending…" : "Approve and send once"}
              </button>
            </div>
          ) : (
            <div className="mt-3 flex justify-end">
              <button type="button" onClick={() => void prepareReply()} disabled={!reply.trim() || sending} className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-2.5 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/[0.1] disabled:opacity-40">
                <Send size={13} />{sending ? "Preparing…" : "Prepare reply"}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
