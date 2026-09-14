"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Bot,
  CheckCircle2,
  Copy,
  ExternalLink,
  Lock,
  MessageSquare,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";

interface ConnectionItem {
  id: string;
  provider: string;
  name: string;
  identifier: string;
  type: string;
  status: "live" | "sandbox" | "disconnected";
  shareUrl?: string;
  vipGroup?: string;
  isOfficial?: boolean;
}

export default function ConnectionsDashboardPage() {
  const [connections, setConnections] = useState<ConnectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterPlatform, setFilterPlatform] = useState("all");
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [connectTab, setConnectTab] = useState<"official" | "custom">("official");
  const [customToken, setCustomToken] = useState("");
  const [vipGroupInput, setVipGroupInput] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function loadConnections() {
    setLoading(true);
    try {
      const res = await fetch("/api/integrations");
      if (res.ok) {
        const data = await res.json();
        const items: ConnectionItem[] = [];

        // Check telegram
        const tg = (data.integrations || []).find((i: any) => i.provider === "telegram");
        if (tg) {
          const cfg = { ...(tg.metadata || {}), ...(tg.public_configuration || {}) };
          items.push({
            id: tg.id,
            provider: "telegram",
            name: cfg.bot_name || "J10 Lead Assistant",
            identifier: `@${cfg.bot_username || "j10_nexus_leads_bot"}`,
            type: "Telegram 24/7 AI Lead Bot",
            status: tg.status === "connected" ? "live" : "disconnected",
            shareUrl: `https://t.me/${cfg.bot_username || "j10_nexus_leads_bot"}`,
            vipGroup: cfg.vip_group_chat_id ? "Active (Stripe Gated)" : "Configured",
            isOfficial: cfg.is_official ?? true,
          });
        } else {
          // Default available official bot
          items.push({
            id: "tg-official",
            provider: "telegram",
            name: "J10 Lead Assistant (Official)",
            identifier: "@j10_nexus_leads_bot",
            type: "Telegram 24/7 AI Lead Bot",
            status: "live",
            shareUrl: "https://t.me/j10_nexus_leads_bot",
            vipGroup: "Active (Stripe Gated)",
            isOfficial: true,
          });
        }

        // Check whatsapp
        const wa = (data.integrations || []).find((i: any) =>
          ["whatsapp-business", "whatsapp"].includes(i.provider)
        );
        if (wa) {
          items.push({
            id: wa.id,
            provider: "whatsapp",
            name: "WhatsApp Business Cloud",
            identifier: wa.public_configuration?.phone_number_id || "+1 (555) 677-1423",
            type: "WhatsApp Meta Cloud API",
            status: wa.status === "connected" ? "live" : "sandbox",
            shareUrl: "https://wa.me/15556771423",
          });
        }

        // Paid VIP Client Community
        items.push({
          id: "vip-group",
          provider: "telegram_group",
          name: "J10 VIP Client Group",
          identifier: "Private Mastermind Community",
          type: "Paid Membership Gating (Stripe Auto-Join)",
          status: "live",
          shareUrl: "https://t.me/+J10_VIP_COMMUNITY_LIVE",
        });

        setConnections(items);
      }
    } catch {
      // Fallback display
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadConnections();
  }, []);

  async function handleConnectTelegram() {
    setConnecting(true);
    setStatusMessage("");
    try {
      const res = await fetch("/api/integrations/telegram/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: connectTab === "official" ? "activate_official" : "custom_token",
          token: connectTab === "custom" ? customToken : undefined,
          vipGroupChatId: vipGroupInput.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setStatusMessage(data.message || "Connected successfully!");
        setTimeout(() => {
          setShowConnectModal(false);
          setStatusMessage("");
          void loadConnections();
        }, 1500);
      } else {
        setStatusMessage(data.error || "Failed to connect bot.");
      }
    } catch (err: any) {
      setStatusMessage(err.message || "Connection failed.");
    } finally {
      setConnecting(false);
    }
  }

  function copyToClipboard(text: string, id: string) {
    void navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  const filteredConnections = connections.filter((c) => {
    if (filterPlatform === "all") return true;
    return c.provider.includes(filterPlatform);
  });

  return (
    <div className="min-h-[calc(100dvh-72px)] bg-[#09090B] px-6 py-8 text-white sm:px-10">
      {/* Top Header matching Zernio Design */}
      <div className="flex flex-col justify-between gap-4 border-b border-white/[0.08] pb-6 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Connections
          </h1>
          <p className="mt-1 text-sm text-white/50">
            Manage profiles, Telegram bots, WhatsApp numbers, and automated customer touchpoints.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void loadConnections()}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-xs font-medium text-white/70 transition hover:bg-white/[0.08] hover:text-white"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Re-sync
          </button>

          <button
            type="button"
            onClick={() => setShowConnectModal(true)}
            className="flex h-9 items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-4 text-xs font-semibold text-white shadow-lg shadow-blue-600/25 transition hover:from-blue-500 hover:to-indigo-500"
          >
            <Plus size={15} />
            + Connect Telegram
          </button>
        </div>
      </div>

      {/* Filter Toolbar matching Zernio */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <label className="text-xs font-semibold text-white/60">Platforms</label>
          <select
            value={filterPlatform}
            onChange={(e) => setFilterPlatform(e.target.value)}
            className="rounded-lg border border-white/[0.08] bg-[#14151B] px-3 py-1.5 text-xs font-medium text-white/90 focus:border-blue-500 focus:outline-none"
          >
            <option value="all">All profiles</option>
            <option value="telegram">Telegram</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
        </div>

        <div className="text-xs text-white/40">
          Showing <span className="font-semibold text-white">{filteredConnections.length}</span> connected channels
        </div>
      </div>

      {/* Zernio-Style Clean Table View */}
      <div className="mt-6 overflow-hidden rounded-xl border border-white/[0.08] bg-[#0E0F12]">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-white/[0.08] bg-white/[0.02] text-[11px] font-semibold uppercase tracking-wider text-white/40">
              <tr>
                <th className="px-5 py-3.5">Sender / Bot</th>
                <th className="px-5 py-3.5">Identifier / ID</th>
                <th className="px-5 py-3.5">Channel Type</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-white/40">
                    <RefreshCw size={18} className="mx-auto mb-2 animate-spin text-blue-400" />
                    Synchronizing live connections...
                  </td>
                </tr>
              ) : filteredConnections.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-white/40">
                    No active connections found for this filter.
                  </td>
                </tr>
              ) : (
                filteredConnections.map((conn) => (
                  <tr key={conn.id} className="transition hover:bg-white/[0.02]">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          {conn.provider === "telegram" ? (
                            <Send size={16} />
                          ) : conn.provider === "whatsapp" ? (
                            <Smartphone size={16} />
                          ) : (
                            <Users size={16} />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-white">{conn.name}</span>
                            {conn.isOfficial && (
                              <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-blue-300">
                                J10 LEAD BOT
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-white/40">{conn.identifier}</p>
                        </div>
                      </div>
                    </td>

                    <td className="px-5 py-4 font-mono text-[11px] text-white/70">
                      {conn.identifier}
                    </td>

                    <td className="px-5 py-4">
                      <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] font-medium text-white/70">
                        {conn.type}
                      </span>
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <span className="relative flex h-2 w-2">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                        </span>
                        <span className="font-semibold capitalize text-emerald-400">
                          Live
                        </span>
                      </div>
                    </td>

                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {conn.shareUrl && (
                          <button
                            type="button"
                            onClick={() => copyToClipboard(conn.shareUrl!, conn.id)}
                            className="flex h-7 items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.03] px-2 text-[11px] text-white/70 transition hover:bg-white/[0.08] hover:text-white"
                          >
                            <Copy size={12} />
                            {copiedId === conn.id ? "Copied!" : "Copy Link"}
                          </button>
                        )}

                        <a
                          href={conn.shareUrl || "https://t.me/j10_nexus_leads_bot"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex h-7 items-center gap-1 rounded-md bg-blue-600/20 border border-blue-500/30 px-2.5 text-[11px] font-medium text-blue-300 transition hover:bg-blue-600/30"
                        >
                          Open
                          <ExternalLink size={11} />
                        </a>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* VIP Paid Group & AI Lead Capture Callout Banner */}
      <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-950/30 to-black/60 p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400">
              <Users size={20} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">
                Paid VIP Telegram Community Gating
              </h3>
              <p className="text-xs text-white/50">
                Automatically invite customers to your exclusive client group upon successful Stripe checkout.
              </p>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between rounded-xl border border-white/[0.06] bg-black/40 p-3">
            <div className="text-xs">
              <span className="text-white/40">Gating Rule:</span>{" "}
              <span className="font-semibold text-emerald-400">Stripe Subscription Active</span>
            </div>
            <Link
              href="/dashboard/inbox"
              className="flex items-center gap-1 text-xs font-medium text-indigo-400 hover:text-indigo-300"
            >
              Test from Unified Inbox →
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-950/30 to-black/60 p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/20 text-blue-400">
              <Sparkles size={20} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">
                24/7 Autopilot AI Lead Qualification
              </h3>
              <p className="text-xs text-white/50">
                Powered by Google Gemini. All customer replies, bookings, and inquiries stream live into your Unified Inbox.
              </p>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between rounded-xl border border-white/[0.06] bg-black/40 p-3">
            <div className="text-xs">
              <span className="text-white/40">Active Bot:</span>{" "}
              <span className="font-semibold text-blue-300">@j10_nexus_leads_bot</span>
            </div>
            <Link
              href="/dashboard/inbox"
              className="flex items-center gap-1 text-xs font-medium text-blue-400 hover:text-blue-300"
            >
              Go to Unified Inbox →
            </Link>
          </div>
        </div>
      </div>

      {/* 1-Click Connection Modal */}
      {showConnectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-white/[0.12] bg-[#0E0F14] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/20 text-blue-400">
                  <Send size={16} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">
                    Connect Telegram to Workspace
                  </h3>
                  <p className="text-xs text-white/40">
                    Instant 1-click activation or bring your own branded bot token.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowConnectModal(false)}
                className="rounded-lg p-1 text-white/40 hover:bg-white/[0.06] hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Tabs */}
            <div className="mt-5 flex rounded-xl bg-white/[0.04] p-1">
              <button
                type="button"
                onClick={() => setConnectTab("official")}
                className={`flex-1 rounded-lg py-2 text-xs font-semibold transition ${
                  connectTab === "official"
                    ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                    : "text-white/50 hover:text-white"
                }`}
              >
                ⚡ 1-Click Official J10 Bot (No Headache)
              </button>
              <button
                type="button"
                onClick={() => setConnectTab("custom")}
                className={`flex-1 rounded-lg py-2 text-xs font-semibold transition ${
                  connectTab === "custom"
                    ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                    : "text-white/50 hover:text-white"
                }`}
              >
                🔑 Custom Bot Token (BYO)
              </button>
            </div>

            {/* Tab 1: Official Bot */}
            {connectTab === "official" ? (
              <div className="mt-5 space-y-4">
                <div className="rounded-xl border border-blue-500/30 bg-blue-950/20 p-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-blue-400" />
                    <span className="text-xs font-semibold text-white">
                      Zero Configuration Required
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-white/70">
                    Connect the official pre-verified J10 Lead Bot (<span className="font-mono text-blue-300">@j10_nexus_leads_bot</span>) directly to your workspace. Customers who message the bot are immediately routed into your J10 Unified Inbox.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-white/70">
                    Optional: VIP Telegram Group Chat ID (for Paid Join Gating)
                  </label>
                  <input
                    type="text"
                    value={vipGroupInput}
                    onChange={(e) => setVipGroupInput(e.target.value)}
                    placeholder="e.g. -1001234567890"
                    className="mt-1.5 w-full rounded-lg border border-white/[0.08] bg-black/60 px-3 py-2 text-xs text-white placeholder:text-white/30 focus:border-blue-500 focus:outline-none"
                  />
                  <p className="mt-1 text-[10px] text-white/40">
                    Leave blank to use default J10 VIP community invitation links.
                  </p>
                </div>
              </div>
            ) : (
              /* Tab 2: Custom Token */
              <div className="mt-5 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-white/70">
                    Telegram Bot API Token (from @BotFather)
                  </label>
                  <input
                    type="password"
                    value={customToken}
                    onChange={(e) => setCustomToken(e.target.value)}
                    placeholder="123456789:ABCdefGHIjklMNOpqrs..."
                    className="mt-1.5 w-full rounded-lg border border-white/[0.08] bg-black/60 px-3 py-2 font-mono text-xs text-white placeholder:text-white/30 focus:border-blue-500 focus:outline-none"
                  />
                  <p className="mt-1 text-[10px] text-white/40">
                    We automatically verify the token and register the webhook to your J10 NEXUS instance.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-white/70">
                    VIP Telegram Group Chat ID
                  </label>
                  <input
                    type="text"
                    value={vipGroupInput}
                    onChange={(e) => setVipGroupInput(e.target.value)}
                    placeholder="e.g. -1001234567890"
                    className="mt-1.5 w-full rounded-lg border border-white/[0.08] bg-black/60 px-3 py-2 text-xs text-white placeholder:text-white/30 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            )}

            {statusMessage && (
              <div
                className={`mt-4 rounded-lg p-3 text-xs ${
                  statusMessage.includes("success") || statusMessage.includes("connected")
                    ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                    : "border border-rose-500/30 bg-rose-500/10 text-rose-300"
                }`}
              >
                {statusMessage}
              </div>
            )}

            <div className="mt-6 flex items-center justify-end gap-3 border-t border-white/[0.08] pt-4">
              <button
                type="button"
                onClick={() => setShowConnectModal(false)}
                className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-xs text-white/70 hover:bg-white/[0.08] hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConnectTelegram}
                disabled={connecting || (connectTab === "custom" && !customToken.trim())}
                className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2 text-xs font-semibold text-white shadow-lg shadow-blue-600/30 transition hover:from-blue-500 hover:to-indigo-500 disabled:opacity-40"
              >
                {connecting ? (
                  <>
                    <RefreshCw size={13} className="animate-spin" />
                    Connecting...
                  </>
                ) : (
                  "Activate & Connect"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
