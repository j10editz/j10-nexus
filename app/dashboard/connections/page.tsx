"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  HelpCircle,
  Lock,
  MessageSquare,
  Plus,
  RefreshCw,
  Send,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trash2,
  Users,
  Zap,
} from "lucide-react";

import { WhatsAppEmbeddedSignup } from "@/components/whatsapp/WhatsAppEmbeddedSignup";

interface ConnectionItem {
  id: string;
  provider: string;
  name: string;
  identifier: string;
  type: string;
  status: "active" | "pending" | "action_required" | "degraded" | "local_disabled" | "disconnected" | "not_connected" | "connecting";
  mode: "telegram_business" | "shared_bot" | "custom_bot" | "whatsapp_cloud";
  canReply?: boolean;
  isEnabled?: boolean;
  aiState?: string;
  verificationState?: string;
  webhookState?: string;
  lastVerifiedAt?: string;
  lastEventAt?: string;
  shareUrl?: string;
  vipGroup?: string;
  isOfficial?: boolean;
}

interface TelegramBusinessSessionData {
  sessionId: string;
  token: string;
  shareLink: string;
  expiresAt: string;
  consentVersion: string;
}

export default function ConnectionsDashboardPage() {
  const [connections, setConnections] = useState<ConnectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterPlatform, setFilterPlatform] = useState("all");
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [connectTab, setConnectTab] = useState<"business" | "official" | "custom">("business");

  // Telegram Business Secretary Mode state
  const [businessConsentAccepted, setBusinessConsentAccepted] = useState(false);
  const [businessSession, setBusinessSession] = useState<TelegramBusinessSessionData | null>(null);
  const [connectionStep, setConnectionStep] = useState<1 | 2 | 3 | 4>(1);
  const [sessionPolling, setSessionPolling] = useState(false);

  // Custom & Official Bot state
  const [customToken, setCustomToken] = useState("");
  const [vipGroupInput, setVipGroupInput] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Disconnect modal state
  const [disconnectingConnection, setDisconnectingConnection] = useState<ConnectionItem | null>(null);
  const [deleteDataOnDisconnect, setDeleteDataOnDisconnect] = useState(false);
  const [disconnectLoading, setDisconnectLoading] = useState(false);
  const [deletionIntentToken, setDeletionIntentToken] = useState<string | null>(null);
  const [deletionPreview, setDeletionPreview] = useState<{
    connectionsCount: number;
    messagesCount: number;
    threadsCount: number;
    jobsCount: number;
    sharedContactsPreserved: number;
  } | null>(null);
  const [disconnectDoneMessage, setDisconnectDoneMessage] = useState<string | null>(null);

  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  async function loadConnections() {
    setLoading(true);
    try {
      // 1. Fetch integrations list
      const res = await fetch("/api/integrations");
      const data = res.ok ? await res.json() : { integrations: [] };

      // 2. Fetch active Telegram Business connection if any
      const bizRes = await fetch("/api/integrations/telegram/session");
      const bizData = bizRes.ok ? await bizRes.json() : { connected: false, connection: null };

      // 3. Fetch real WhatsApp connection status
      const waRes = await fetch("/api/integrations/whatsapp/status");
      const waData = waRes.ok ? await waRes.json() : { success: false, data: null };

      const items: ConnectionItem[] = [];

      // Telegram Business Connection (Primary / Recommended)
      if (bizData.connection) {
        const bc = bizData.connection;
        const statusMap: Record<string, ConnectionItem["status"]> = {
          active: bc.can_reply ? "active" : "degraded",
          degraded: "degraded",
          disabled: "action_required",
          local_disabled: "local_disabled",
          disconnected: "disconnected",
        };

        items.push({
          id: bc.id,
          provider: "telegram",
          name: bc.telegram_username ? `@${bc.telegram_username} (Business)` : "Telegram Business",
          identifier: `BC: ${bc.business_connection_id.slice(0, 14)}...`,
          type: "Telegram Business Secretary Mode",
          status: statusMap[bc.status] || "active",
          mode: "telegram_business",
          canReply: bc.can_reply,
          isEnabled: bc.is_enabled,
          aiState: bc.can_reply ? "Autopilot (Gemini 3.8 Flash)" : "Reply Disabled by Telegram",
          lastVerifiedAt: bc.last_verified_at,
          lastEventAt: bc.last_event_at,
          shareUrl: `https://t.me/${bc.telegram_username || "j10_nexus_leads_bot"}`,
          isOfficial: true,
        });
      }

      // Check standard Telegram Bot integration
      const tg = (data.integrations || []).find((i: any) => i.provider === "telegram");
      if (tg) {
        const cfg = { ...(tg.metadata || {}), ...(tg.public_configuration || {}) };
        items.push({
          id: tg.id,
          provider: "telegram",
          name: cfg.bot_name || "J10 Lead Assistant",
          identifier: `@${cfg.bot_username || "j10_nexus_leads_bot"}`,
          type: cfg.is_official ? "Shared Official Bot DM" : "Custom Dedicated Bot",
          status: tg.status === "connected" ? "active" : "disconnected",
          mode: cfg.is_official ? "shared_bot" : "custom_bot",
          aiState: "Autopilot (Gemini 3.8 Flash)",
          shareUrl: `https://t.me/${cfg.bot_username || "j10_nexus_leads_bot"}`,
          vipGroup: cfg.vip_group_chat_id ? "Active (Stripe Gated)" : "Configured",
          isOfficial: cfg.is_official ?? true,
        });
      } else if (!bizData.connection) {
        // Ready to connect Telegram card
        items.push({
          id: "tg-business-ready",
          provider: "telegram",
          name: "Telegram Business Assistant",
          identifier: "Secretary Mode (Recommended)",
          type: "AI Receptionist for Private Business Chats",
          status: "pending",
          mode: "telegram_business",
          aiState: "Ready to Connect",
          shareUrl: "https://t.me/j10_nexus_leads_bot",
          isOfficial: true,
        });
      }

      // WhatsApp Cloud API Integration (Meta Embedded Signup)
      if (waData?.data && waData.data.status !== "not_connected") {
        const wa = waData.data;
        items.push({
          id: wa.id || "whatsapp-business-cloud",
          provider: "whatsapp",
          name: wa.wabaName || "WhatsApp Business Cloud",
          identifier: wa.maskedPhone || (wa.phoneNumberId ? `ID: ${wa.phoneNumberId}` : "Not configured"),
          type: "WhatsApp Business Cloud API (Official)",
          status: wa.status,
          mode: "whatsapp_cloud",
          aiState: wa.aiReceptionistEnabled ? "Autopilot (Gemini 3.8 Flash)" : "AI Disabled",
          verificationState: wa.verificationStatus || "VERIFIED",
          webhookState: wa.webhookSubscribed ? "Subscribed" : "Pending Webhook",
          lastVerifiedAt: wa.lastConnectedAt,
        });
      } else {
        // Distinguish not-connected state from active; eliminate demo placeholder
        items.push({
          id: "whatsapp-not-connected",
          provider: "whatsapp",
          name: "WhatsApp Business Assistant",
          identifier: "Embedded Signup Available",
          type: "WhatsApp Meta Cloud API",
          status: "not_connected",
          mode: "whatsapp_cloud",
          aiState: "Ready to Connect",
          verificationState: "Unregistered",
          webhookState: "Inactive",
        });
      }

      // Paid VIP Client Community
      items.push({
        id: "vip-group",
        provider: "telegram_group",
        name: "J10 VIP Client Community",
        identifier: "Private Mastermind Channel",
        type: "Paid Membership Gating (Stripe Auto-Join)",
        status: "active",
        mode: "shared_bot",
        shareUrl: "https://t.me/+J10_VIP_COMMUNITY_LIVE",
      });

      setConnections(items);
    } catch {
      // Keep existing list on transient failure
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadConnections();
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  // Initialize Telegram Business Session
  async function handleStartBusinessSession() {
    setConnecting(true);
    setStatusMessage("");
    setConnectionStep(1);

    try {
      const res = await fetch("/api/integrations/telegram/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consentVersion: "2026.1",
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setBusinessSession({
          sessionId: data.sessionId,
          token: data.token,
          shareLink: data.shareLink,
          expiresAt: data.expiresAt,
          consentVersion: data.consentVersion,
        });
        setConnectionStep(2);
        startSessionPolling();
      } else {
        setStatusMessage(data.error || "Failed to initialize connection session.");
      }
    } catch (err: any) {
      setStatusMessage(err.message || "Failed to start session.");
    } finally {
      setConnecting(false);
    }
  }

  // Poll server for Telegram Business verification (never mark Connected from browser alone!)
  function startSessionPolling() {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    setSessionPolling(true);

    pollTimerRef.current = setInterval(async () => {
      try {
        const res = await fetch("/api/integrations/telegram/session");
        if (res.ok) {
          const data = await res.json();
          if (data.connected && data.connection) {
            setConnectionStep(4);
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            setSessionPolling(false);
            setStatusMessage("Telegram Business Secretary Mode successfully connected!");
            setTimeout(() => {
              setShowConnectModal(false);
              setBusinessSession(null);
              setConnectionStep(1);
              void loadConnections();
            }, 2000);
          } else if (data.connection && !data.connection.can_reply) {
            setConnectionStep(3);
          }
        }
      } catch {
        // Retry silently
      }
    }, 3000);
  }

  // Connect Official Shared Bot or Custom Token
  async function handleConnectLegacyTelegram() {
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

  // Fetch cryptographic single-use deletion intent when disconnect modal opens (for Telegram)
  useEffect(() => {
    if (!disconnectingConnection) {
      setDeletionIntentToken(null);
      setDeletionPreview(null);
      setDisconnectDoneMessage(null);
      return;
    }

    if (disconnectingConnection.provider === "whatsapp") {
      setDeletionIntentToken("whatsapp-disconnect-ready");
      setDeletionPreview(null);
      setDisconnectDoneMessage(null);
      return;
    }

    async function fetchPreviewAndIntent() {
      try {
        const res = await fetch(
          `/api/integrations/telegram/disconnect?businessConnectionId=${encodeURIComponent(disconnectingConnection!.id)}`
        );
        if (res.ok) {
          const data = await res.json();
          setDeletionIntentToken(data.token || null);
          setDeletionPreview(data.preview || null);
        }
      } catch (err) {
        console.error("[Connections Page] Failed to fetch deletion intent:", err);
      }
    }

    void fetchPreviewAndIntent();
  }, [disconnectingConnection]);

  // Disconnect handler supporting both WhatsApp and Telegram
  async function handleConfirmDisconnect() {
    if (!disconnectingConnection) return;

    if (disconnectingConnection.provider === "whatsapp") {
      setDisconnectLoading(true);
      try {
        const res = await fetch("/api/integrations/whatsapp/disconnect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            integrationId: disconnectingConnection.id === "whatsapp-not-connected" ? undefined : disconnectingConnection.id,
            reason: "User initiated disconnect from Connections Center",
          }),
        });

        const data = await res.json();
        if (res.ok && data.success) {
          setDisconnectDoneMessage(
            "WhatsApp Business connection has been safely disconnected. Automated AI replies have stopped. All message history, Unified Inbox conversations, CRM contacts, and lead records are permanently preserved."
          );
          void loadConnections();
        } else {
          setStatusMessage(data.error || "Failed to disconnect WhatsApp.");
        }
      } catch (err: any) {
        setStatusMessage(err.message || "WhatsApp disconnect error.");
      } finally {
        setDisconnectLoading(false);
      }
      return;
    }

    if (!deletionIntentToken) return;
    setDisconnectLoading(true);

    try {
      const res = await fetch("/api/integrations/telegram/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deleteMessages: deleteDataOnDisconnect,
          token: deletionIntentToken,
          businessConnectionId: disconnectingConnection.id,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setDisconnectDoneMessage(
          data.instruction ||
            "To complete disconnection on Telegram: Open Telegram Settings → Telegram Business → Chatbots, and remove the bot."
        );
        void loadConnections();
      } else {
        setStatusMessage(data.error || "Failed to disconnect.");
      }
    } catch (err: any) {
      setStatusMessage(err.message || "Disconnect error.");
    } finally {
      setDisconnectLoading(false);
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
      {/* Top Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-white/[0.08] pb-6 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Connections Center
            </h1>
            <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-0.5 text-xs font-semibold text-blue-400">
              Secretary Mode Certified
            </span>
          </div>
          <p className="mt-1 text-sm text-white/50">
            Manage your Telegram Business accounts, customer channels, and AI Receptionist permissions.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void loadConnections()}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-xs font-medium text-white/70 transition hover:bg-white/[0.08] hover:text-white"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Sync Status
          </button>

          <button
            type="button"
            onClick={() => setShowWhatsAppModal(true)}
            className="flex h-9 items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-4 text-xs font-semibold text-white shadow-lg shadow-emerald-600/25 transition hover:from-emerald-500 hover:to-teal-500"
          >
            <Smartphone size={15} />
            + Connect WhatsApp
          </button>

          <button
            type="button"
            onClick={() => {
              setShowConnectModal(true);
              setConnectTab("business");
            }}
            className="flex h-9 items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-4 text-xs font-semibold text-white shadow-lg shadow-blue-600/25 transition hover:from-blue-500 hover:to-indigo-500"
          >
            <Plus size={15} />
            + Connect Telegram
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <label className="text-xs font-semibold text-white/60">Platform Filter:</label>
          <select
            value={filterPlatform}
            onChange={(e) => setFilterPlatform(e.target.value)}
            className="rounded-lg border border-white/[0.08] bg-[#14151B] px-3 py-1.5 text-xs font-medium text-white/90 focus:border-blue-500 focus:outline-none"
          >
            <option value="all">All Channels & Bots</option>
            <option value="telegram">Telegram (Business & Bot)</option>
            <option value="whatsapp">WhatsApp Business</option>
          </select>
        </div>

        <div className="text-xs text-white/40">
          Showing <span className="font-semibold text-white">{filteredConnections.length}</span> live touchpoints
        </div>
      </div>

      {/* Clean Zernio-Style Connection Table */}
      <div className="mt-6 overflow-hidden rounded-xl border border-white/[0.08] bg-[#0E0F12]">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-white/[0.08] bg-white/[0.02] text-[11px] font-semibold uppercase tracking-wider text-white/40">
              <tr>
                <th className="px-5 py-3.5">Connection Identity</th>
                <th className="px-5 py-3.5">Mode & Channel</th>
                <th className="px-5 py-3.5">Permissions & Rights</th>
                <th className="px-5 py-3.5">AI Receptionist</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-white/40">
                    <RefreshCw size={18} className="mx-auto mb-2 animate-spin text-blue-400" />
                    Synchronizing live provider credentials...
                  </td>
                </tr>
              ) : filteredConnections.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-white/40">
                    No active channels found for this filter.
                  </td>
                </tr>
              ) : (
                filteredConnections.map((conn) => (
                  <tr key={conn.id} className="transition hover:bg-white/[0.02]">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
                            conn.provider === "whatsapp"
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                              : conn.provider === "telegram"
                              ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                              : "bg-purple-500/10 text-purple-400 border-purple-500/20"
                          }`}
                        >
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
                            {conn.mode === "telegram_business" && (
                              <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-indigo-300">
                                SECRETARY MODE
                              </span>
                            )}
                          </div>
                          <p className="font-mono text-[11px] text-white/40">{conn.identifier}</p>
                        </div>
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] font-medium text-white/70">
                        {conn.type}
                      </span>
                    </td>

                    <td className="px-5 py-4">
                      {conn.provider === "whatsapp" ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <span className={`h-1.5 w-1.5 rounded-full ${conn.verificationState === "VERIFIED" ? "bg-emerald-400" : "bg-amber-400"}`} />
                            <span className="text-[11px] text-white/80">
                              Verification: {conn.verificationState || "Unregistered"}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className={`h-1.5 w-1.5 rounded-full ${conn.webhookState === "Subscribed" ? "bg-emerald-400" : "bg-white/30"}`} />
                            <span className="text-[10px] text-white/50">
                              Webhook: {conn.webhookState || "Inactive"}
                            </span>
                          </div>
                        </div>
                      ) : conn.mode === "telegram_business" ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <span className={`h-1.5 w-1.5 rounded-full ${conn.canReply ? "bg-emerald-400" : "bg-rose-400"}`} />
                            <span className="text-[11px] text-white/80">
                              {conn.canReply ? "Can Reply (24h Window)" : "Reply Permission Revoked"}
                            </span>
                          </div>
                          {conn.lastVerifiedAt && (
                            <p className="text-[10px] text-white/40">
                              Verified: {new Date(conn.lastVerifiedAt).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] text-white/50">Full Bot Privileges</span>
                      )}
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <Sparkles size={13} className={conn.provider === "whatsapp" ? "text-emerald-400" : "text-blue-400"} />
                        <span className="text-white/80">{conn.aiState || "Active"}</span>
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <span className="relative flex h-2 w-2">
                          <span
                            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${
                              conn.status === "active"
                                ? "bg-emerald-400"
                                : conn.status === "connecting" || conn.status === "pending"
                                ? "bg-blue-400"
                                : conn.status === "action_required" || conn.status === "degraded" || conn.status === "local_disabled"
                                ? "bg-amber-400"
                                : conn.status === "not_connected"
                                ? "bg-zinc-500"
                                : "bg-rose-400"
                            }`}
                          />
                          <span
                            className={`relative inline-flex h-2 w-2 rounded-full ${
                              conn.status === "active"
                                ? "bg-emerald-500"
                                : conn.status === "connecting" || conn.status === "pending"
                                ? "bg-blue-500"
                                : conn.status === "action_required" || conn.status === "degraded" || conn.status === "local_disabled"
                                ? "bg-amber-500"
                                : conn.status === "not_connected"
                                ? "bg-zinc-500"
                                : "bg-rose-500"
                            }`}
                          />
                        </span>
                        <span
                          className={`font-semibold capitalize text-[11px] ${
                            conn.status === "active"
                              ? "text-emerald-400"
                              : conn.status === "connecting" || conn.status === "pending"
                              ? "text-blue-400"
                              : conn.status === "action_required" || conn.status === "degraded" || conn.status === "local_disabled"
                              ? "text-amber-400"
                              : conn.status === "not_connected"
                              ? "text-zinc-400"
                              : "text-rose-400"
                          }`}
                        >
                          {conn.status === "local_disabled"
                            ? "Disabled Locally (Remove in Telegram)"
                            : conn.status === "not_connected"
                            ? "Not connected"
                            : conn.status === "action_required"
                            ? "Action required"
                            : conn.status === "connecting"
                            ? "Connecting"
                            : conn.status}
                        </span>
                      </div>
                    </td>

                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {conn.provider === "whatsapp" ? (
                          conn.status === "not_connected" ? (
                            <button
                              type="button"
                              onClick={() => setShowWhatsAppModal(true)}
                              className="flex h-7 items-center gap-1 rounded-md bg-emerald-600 px-2.5 text-[11px] font-semibold text-white transition hover:bg-emerald-500 shadow-md shadow-emerald-600/20"
                            >
                              <Smartphone size={12} />
                              Connect WhatsApp
                            </button>
                          ) : conn.status === "connecting" ? (
                            <button
                              type="button"
                              disabled
                              className="flex h-7 items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 text-[11px] text-white/50 cursor-not-allowed"
                            >
                              <RefreshCw size={12} className="animate-spin text-blue-400" />
                              Connecting...
                            </button>
                          ) : (
                            <>
                              <Link
                                href="/dashboard/bot-setup"
                                className="flex h-7 items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 text-[11px] font-medium text-white/80 transition hover:bg-white/[0.08] hover:text-white"
                              >
                                Configure
                              </Link>
                              <button
                                type="button"
                                onClick={() => setShowWhatsAppModal(true)}
                                className="flex h-7 items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 text-[11px] font-medium text-emerald-300 transition hover:bg-emerald-500/20"
                              >
                                Reconnect
                              </button>
                              <button
                                type="button"
                                onClick={() => setDisconnectingConnection(conn)}
                                className="flex h-7 items-center gap-1 rounded-md border border-rose-500/20 bg-rose-500/10 px-2 text-[11px] font-medium text-rose-300 transition hover:bg-rose-500/20"
                              >
                                Disconnect
                              </button>
                            </>
                          )
                        ) : conn.status === "pending" ? (
                          <button
                            type="button"
                            onClick={() => {
                              setShowConnectModal(true);
                              setConnectTab("business");
                            }}
                            className="flex h-7 items-center gap-1 rounded-md bg-blue-600 px-2.5 text-[11px] font-semibold text-white transition hover:bg-blue-500"
                          >
                            Connect Now
                          </button>
                        ) : (
                          <>
                            {conn.shareUrl && (
                              <button
                                type="button"
                                onClick={() => copyToClipboard(conn.shareUrl!, conn.id)}
                                className="flex h-7 items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.03] px-2 text-[11px] text-white/70 transition hover:bg-white/[0.08] hover:text-white"
                              >
                                <Copy size={12} />
                                {copiedId === conn.id ? "Copied!" : "Copy"}
                              </button>
                            )}

                            <Link
                              href="/dashboard/bot-setup"
                              className="flex h-7 items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 text-[11px] font-medium text-white/80 transition hover:bg-white/[0.08] hover:text-white"
                            >
                              Configure
                            </Link>

                            <button
                              type="button"
                              onClick={() => {
                                window.open(`/api/integrations/telegram/export`);
                              }}
                              className="flex h-7 items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.03] px-2 text-[11px] font-medium text-white/80 transition hover:bg-white/[0.08] hover:text-white"
                              title="Export all Telegram data as JSON"
                            >
                              <Download size={12} />
                              Export
                            </button>

                            <button
                              type="button"
                              onClick={() => setDisconnectingConnection(conn)}
                              className="flex h-7 items-center gap-1 rounded-md border border-rose-500/20 bg-rose-500/10 px-2 text-[11px] font-medium text-rose-300 transition hover:bg-rose-500/20"
                            >
                              Disconnect
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Feature Architecture Cards */}
      <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-950/30 to-black/60 p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">
                Telegram Business Secretary Mode
              </h3>
              <p className="text-xs text-white/50">
                Connect directly to your private business chats with automatic 24/7 AI Receptionist response.
              </p>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between rounded-xl border border-white/[0.06] bg-black/40 p-3">
            <div className="text-xs text-white/60">
              Permissions: <span className="font-semibold text-emerald-400">Least Privilege (can_reply enforced)</span>
            </div>
            <span className="text-[11px] text-indigo-400 font-medium">Consent v2026.1 Active</span>
          </div>
        </div>

        <div className="rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-950/30 to-black/60 p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/20 text-blue-400">
              <Sparkles size={20} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">
                Multi-Tenant Grounded AI Autopilot
              </h3>
              <p className="text-xs text-white/50">
                Powered by Gemini. Tailored exclusively to your workspace services, hours, pricing, and FAQs.
              </p>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between rounded-xl border border-white/[0.06] bg-black/40 p-3">
            <div className="text-xs text-white/60">
              Takeover: <span className="font-semibold text-blue-300">Operator-Only Resume (/human)</span>
            </div>
            <Link
              href="/dashboard/inbox"
              className="flex items-center gap-1 text-xs font-medium text-blue-400 hover:text-blue-300"
            >
              Unified Inbox →
            </Link>
          </div>
        </div>
      </div>

      {/* Connection Modal (Secretary Mode + Shared Bot + Custom Bot) */}
      {showConnectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md">
          <div className="w-full max-w-xl rounded-2xl border border-white/[0.12] bg-[#0E0F14] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/20 text-blue-400">
                  <Send size={16} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">
                    Connect Telegram to J10 NEXUS
                  </h3>
                  <p className="text-xs text-white/40">
                    Choose your connection mode to enable automated 24/7 client communication.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowConnectModal(false);
                  if (pollTimerRef.current) clearInterval(pollTimerRef.current);
                }}
                className="rounded-lg p-1 text-white/40 hover:bg-white/[0.06] hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Connection Mode Selection Tabs */}
            <div className="mt-5 grid grid-cols-3 gap-1 rounded-xl bg-white/[0.04] p-1 text-center">
              <button
                type="button"
                onClick={() => setConnectTab("business")}
                className={`rounded-lg py-2 text-xs font-semibold transition ${
                  connectTab === "business"
                    ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/30"
                    : "text-white/50 hover:text-white"
                }`}
              >
                Telegram Business ⭐
              </button>
              <button
                type="button"
                onClick={() => setConnectTab("official")}
                className={`rounded-lg py-2 text-xs font-semibold transition ${
                  connectTab === "official"
                    ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                    : "text-white/50 hover:text-white"
                }`}
              >
                Shared Bot DM
              </button>
              <button
                type="button"
                onClick={() => setConnectTab("custom")}
                className={`rounded-lg py-2 text-xs font-semibold transition ${
                  connectTab === "custom"
                    ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                    : "text-white/50 hover:text-white"
                }`}
              >
                Custom Bot (Advanced)
              </button>
            </div>

            {/* MODE A: Telegram Business Secretary Mode (Recommended) */}
            {connectTab === "business" && (
              <div className="mt-5 space-y-4">
                {/* 4-Step Connection Progress */}
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
                  <div className="grid grid-cols-4 gap-2 text-center text-[10px]">
                    <div className={`p-1.5 rounded-lg ${connectionStep >= 1 ? "bg-blue-500/20 text-blue-300 font-semibold" : "text-white/30"}`}>
                      1. Prepare Session
                    </div>
                    <div className={`p-1.5 rounded-lg ${connectionStep >= 2 ? "bg-blue-500/20 text-blue-300 font-semibold" : "text-white/30"}`}>
                      2. Open Telegram
                    </div>
                    <div className={`p-1.5 rounded-lg ${connectionStep >= 3 ? "bg-blue-500/20 text-blue-300 font-semibold" : "text-white/30"}`}>
                      3. Verify Rights
                    </div>
                    <div className={`p-1.5 rounded-lg ${connectionStep === 4 ? "bg-emerald-500/20 text-emerald-300 font-semibold" : "text-white/30"}`}>
                      4. Connected
                    </div>
                  </div>
                </div>

                {/* Consent & Privacy Disclosure Box */}
                <div className="rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-4 text-xs space-y-2">
                  <div className="flex items-center gap-2 text-indigo-300 font-semibold">
                    <Shield size={15} />
                    <span>External AI Processing Consent (Version 2026.1)</span>
                  </div>
                  <p className="text-white/70 leading-relaxed">
                    By connecting, you authorize J10 NEXUS to act as your Secretary Bot on Telegram. Inbound messages from your designated private conversations will be processed by Google Gemini to provide 24/7 customer service grounded strictly in your workspace knowledge base.
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-white/60 text-[11px]">
                    <li><b>Scope:</b> Private business conversations active in the last 24 hours.</li>
                    <li><b>Privacy:</b> Phone numbers, emails, and payment card numbers are automatically redacted before AI inference.</li>
                    <li><b>Human Takeover:</b> Sending <code className="text-blue-300">/human</code> instantly halts all automated replies.</li>
                    <li><b>Data Retention:</b> 90-day retention with instant one-click deletion and export path.</li>
                  </ul>
                  <label className="flex items-start gap-2 pt-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={businessConsentAccepted}
                      onChange={(e) => setBusinessConsentAccepted(e.target.checked)}
                      className="mt-0.5 rounded border-white/20 bg-black/60 text-blue-600 focus:ring-0"
                    />
                    <span className="text-[11px] text-white/90">
                      I am the workspace owner/admin and explicitly consent to external AI processing for Telegram Business under these disclosed terms.
                    </span>
                  </label>
                </div>

                {/* Connection Action */}
                {connectionStep === 1 && (
                  <button
                    type="button"
                    onClick={handleStartBusinessSession}
                    disabled={!businessConsentAccepted || connecting}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 py-3 text-xs font-semibold text-white shadow-lg shadow-blue-600/30 transition hover:from-blue-500 hover:to-indigo-500 disabled:opacity-40"
                  >
                    {connecting ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                    Initialize Telegram Business Session
                  </button>
                )}

                {connectionStep >= 2 && businessSession && (
                  <div className="space-y-3 rounded-xl border border-white/[0.08] bg-black/40 p-4 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-white/60">Session Handshake:</span>
                      <span className="font-mono text-emerald-400">Active (Single-Use)</span>
                    </div>

                    <p className="text-white/70 leading-relaxed text-[11px]">
                      Click below to open Telegram and start the verified bot. Then add it in your Telegram Business Chatbots settings:
                    </p>

                    <a
                      href={businessSession.shareLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full rounded-lg bg-blue-600 py-2.5 text-xs font-semibold text-white shadow-md shadow-blue-600/30 transition hover:bg-blue-500"
                    >
                      <Send size={14} />
                      Open Telegram
                      <ExternalLink size={12} />
                    </a>

                    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5 text-[11px] text-white/50 space-y-1">
                      <p className="font-semibold text-white/70">In Telegram:</p>
                      <p>1. Tap <b>Start</b> in the chat with @j10_nexus_leads_bot.</p>
                      <p>2. Open <b>Settings → Telegram Business → Chatbots</b>.</p>
                      <p>3. Add @j10_nexus_leads_bot and enable <b>Reply to messages</b>.</p>
                    </div>

                    {sessionPolling && (
                      <div className="flex items-center justify-center gap-2 pt-1 text-[11px] text-blue-400 animate-pulse">
                        <RefreshCw size={12} className="animate-spin" />
                        Waiting for Telegram confirmation...
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* MODE B: Shared Bot Lead Intake (Preserve) */}
            {connectTab === "official" && (
              <div className="mt-5 space-y-4">
                <div className="rounded-xl border border-blue-500/30 bg-blue-950/20 p-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-blue-400" />
                    <span className="text-xs font-semibold text-white">
                      Zero Configuration Required
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-white/70">
                    Connect the official pre-verified J10 Lead Bot (<span className="font-mono text-blue-300">@j10_nexus_leads_bot</span>) directly to your workspace. Customers message the bot via an expiring cryptographic link and stream live into your Unified Inbox.
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
                </div>

                <button
                  type="button"
                  onClick={handleConnectLegacyTelegram}
                  disabled={connecting}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-xs font-semibold text-white shadow-lg shadow-blue-600/30 transition hover:bg-blue-500"
                >
                  {connecting ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} />}
                  Activate Official Bot DM
                </button>
              </div>
            )}

            {/* MODE C: Custom Dedicated Bot Token (Advanced) */}
            {connectTab === "custom" && (
              <div className="mt-5 space-y-4">
                <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3 text-xs text-amber-300/80">
                  <div className="flex items-center gap-1.5 font-semibold text-amber-300">
                    <AlertTriangle size={14} />
                    <span>Advanced Client Bot Provisioning</span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed">
                    Use this option only if your client requires their own branded @BotName in BotFather. The token is encrypted in our AES-256-GCM vault with a dedicated webhook endpoint.
                  </p>
                </div>

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
                </div>

                <button
                  type="button"
                  onClick={handleConnectLegacyTelegram}
                  disabled={connecting || !customToken.trim()}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-xs font-semibold text-white shadow-lg shadow-blue-600/30 transition hover:bg-blue-500 disabled:opacity-40"
                >
                  {connecting ? <RefreshCw size={14} className="animate-spin" /> : <Lock size={14} />}
                  Verify & Store in Vault
                </button>
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
          </div>
        </div>
      )}

      {/* Disconnect & Certified Data Deletion Modal */}
      {disconnectingConnection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md">
          <div className="w-full max-w-md rounded-2xl border border-rose-500/30 bg-[#0E0F14] p-6 shadow-2xl">
            <div className="flex items-center gap-3 border-b border-white/[0.08] pb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/20 text-rose-400">
                <Trash2 size={18} />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">
                  Disconnect {disconnectingConnection.name}
                </h3>
                <p className="text-xs text-white/40">
                  Cryptographic intent verification & scoped tenant deletion.
                </p>
              </div>
            </div>

            {disconnectDoneMessage ? (
              <div className="mt-4 space-y-4">
                <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 text-xs text-amber-200">
                  <div className="flex items-center gap-1.5 font-semibold text-amber-300">
                    <AlertTriangle size={15} />
                    <span>Local Processing Disabled Immediately</span>
                  </div>
                  <p className="mt-2 leading-relaxed">
                    {disconnectDoneMessage}
                  </p>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setDisconnectingConnection(null);
                      setDisconnectDoneMessage(null);
                    }}
                    className="rounded-lg bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/20"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <>
                {disconnectingConnection.provider === "whatsapp" ? (
                  <div className="mt-4 space-y-3 text-xs text-white/70">
                    <p>
                      Disconnecting will immediately deactivate the WhatsApp Cloud API integration and stop automated AI Receptionist replies.
                    </p>
                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-3.5 text-[11px] space-y-1.5 text-emerald-300">
                      <div className="flex items-center gap-1.5 font-semibold text-emerald-400">
                        <ShieldCheck size={14} />
                        <span>Historical Records Preserved</span>
                      </div>
                      <p className="text-white/70 leading-relaxed">
                        All Unified Inbox conversations, customer message history, CRM contacts, leads, and automation jobs are permanently preserved and will not be deleted.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 space-y-3 text-xs text-white/70">
                    <p>
                      Disconnecting will immediately stop all automated AI Receptionist replies and revoke Telegram webhook permissions locally.
                    </p>

                    {deletionPreview && (
                      <div className="rounded-xl border border-white/[0.08] bg-black/30 p-3 text-[11px] space-y-1">
                        <div className="text-white/50">Deletion Scope Snapshot:</div>
                        <div className="flex justify-between text-white/80">
                          <span>Messages in connection:</span>
                          <span className="font-mono">{deletionPreview.messagesCount}</span>
                        </div>
                        <div className="flex justify-between text-emerald-400">
                          <span>Shared CRM Contacts preserved:</span>
                          <span className="font-mono">{deletionPreview.sharedContactsPreserved}</span>
                        </div>
                      </div>
                    )}

                    <div className="rounded-xl border border-white/[0.08] bg-black/40 p-3">
                      <label className="flex items-start gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={deleteDataOnDisconnect}
                          onChange={(e) => setDeleteDataOnDisconnect(e.target.checked)}
                          className="mt-0.5 rounded border-rose-500/40 bg-black/60 text-rose-600 focus:ring-0"
                        />
                        <div>
                          <span className="font-semibold text-rose-300">
                            Permanently purge message history
                          </span>
                          <p className="text-[11px] text-white/40 mt-0.5">
                            Check this box to delete stored Telegram messages for this connection. Shared CRM contacts and other channel histories are strictly preserved.
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>
                )}

                <div className="mt-6 flex items-center justify-end gap-3 border-t border-white/[0.08] pt-4">
                  <button
                    type="button"
                    onClick={() => setDisconnectingConnection(null)}
                    className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-xs text-white/70 hover:bg-white/[0.08] hover:text-white"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={handleConfirmDisconnect}
                    disabled={disconnectLoading || !deletionIntentToken}
                    className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-rose-600/30 transition hover:bg-rose-500 disabled:opacity-50"
                  >
                    {disconnectLoading ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    Confirm Disconnect
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* WhatsApp Embedded Signup Modal */}
      {showWhatsAppModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-2xl border border-white/[0.12] bg-[#0E0F14] p-6 shadow-2xl">
            <WhatsAppEmbeddedSignup
              onSuccess={() => {
                setShowWhatsAppModal(false);
                void loadConnections();
              }}
              onCancel={() => {
                setShowWhatsAppModal(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
