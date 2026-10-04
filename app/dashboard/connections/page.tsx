"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Lock,
  MessageSquare,
  Plus,
  RefreshCw,
  Send,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Trash2,
  Users,
  X,
  Calendar,
  Mail,
  PhoneCall,
  Globe,
  Camera,
  MessageCircle,
} from "lucide-react";

import {
  DashboardPageHeader,
  DashboardButton,
  DashboardStatusBadge,
} from "@/components/dashboard/DashboardPrimitives";
import { WhatsAppConnectionChoice } from "@/components/whatsapp/WhatsAppConnectionChoice";
import { getOfficialTelegramBindingLink } from "@/lib/telegram/official-binding-link";

interface ConnectionItem {
  id: string;
  channel: string;
  purpose: string;
  provider: "whatsapp" | "telegram" | "website" | "gmail" | "google_calendar" | "phone" | "instagram" | "messenger";
  connectionStatus: "connected" | "not_connected" | "pending" | "action_required" | "coming_soon";
  connectionStatusLabel: string;
  aiHandlingStatus: string;
  primaryActionLabel: string;
  primaryActionType: "connect_whatsapp" | "connect_telegram" | "view_funnel" | "configure_whatsapp" | "configure_telegram" | "coming_soon";
  shareUrl?: string;
  rawItem?: any;
}

interface TelegramBusinessSessionData {
  sessionId: string;
  token: string;
  shareLink: string;
  expiresAt: string;
  consentVersion: string;
}

interface OfficialTelegramBindingData {
  shareLink: string;
}

export default function ConnectionsDashboardPage() {
  const [connections, setConnections] = useState<ConnectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterChannel, setFilterChannel] = useState("all");
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
  const [officialBinding, setOfficialBinding] = useState<OfficialTelegramBindingData | null>(null);
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

      // Row 1: WhatsApp
      const isWaConnected = waData?.data && waData.data.status === "active";
      items.push({
        id: "conn-whatsapp",
        channel: "WhatsApp",
        purpose: "Customer messages",
        provider: "whatsapp",
        connectionStatus: isWaConnected ? "connected" : "not_connected",
        connectionStatusLabel: isWaConnected ? "Connected" : "Not connected",
        aiHandlingStatus: isWaConnected ? "AI replies enabled" : "Ready to enable",
        primaryActionLabel: isWaConnected ? "Configure" : "Connect WhatsApp",
        primaryActionType: isWaConnected ? "configure_whatsapp" : "connect_whatsapp",
        rawItem: waData?.data,
      });

      // Row 2: Telegram
      const isTgConnected = Boolean(bizData?.connection || (data.integrations || []).some((i: any) => i.provider === "telegram" && i.status === "connected"));
      const tgUsername = bizData?.connection?.telegram_username || "j10_nexus_leads_bot";
      items.push({
        id: "conn-telegram",
        channel: "Telegram",
        purpose: "Customer and group messages",
        provider: "telegram",
        connectionStatus: isTgConnected ? "connected" : "not_connected",
        connectionStatusLabel: isTgConnected ? "Connected" : "Not connected",
        aiHandlingStatus: isTgConnected ? "AI replies enabled" : "Ready to enable",
        primaryActionLabel: isTgConnected ? "Configure" : "Connect Telegram",
        primaryActionType: isTgConnected ? "configure_telegram" : "connect_telegram",
        shareUrl: `https://t.me/${tgUsername}`,
        rawItem: bizData?.connection,
      });

      // Row 3: Website Forms
      items.push({
        id: "conn-website-forms",
        channel: "Website Forms",
        purpose: "Lead capture",
        provider: "website",
        connectionStatus: "connected",
        connectionStatusLabel: "Active",
        aiHandlingStatus: "Follow-up enabled",
        primaryActionLabel: "View Lead Funnel",
        primaryActionType: "view_funnel",
      });

      // Row 4: Gmail
      items.push({
        id: "gmail",
        channel: "Email & Gmail",
        purpose: "Email conversations",
        provider: "gmail",
        connectionStatus: "coming_soon",
        connectionStatusLabel: "Coming soon",
        aiHandlingStatus: "Coming soon",
        primaryActionLabel: "Coming soon",
        primaryActionType: "coming_soon",
      });

      // Row 5: Google Calendar
      items.push({
        id: "google-calendar",
        channel: "Google Calendar",
        purpose: "Booking synchronization",
        provider: "google_calendar",
        connectionStatus: "coming_soon",
        connectionStatusLabel: "Coming soon",
        aiHandlingStatus: "Coming soon",
        primaryActionLabel: "Coming soon",
        primaryActionType: "coming_soon",
      });

      // Row 6: Phone & SMS
      items.push({
        id: "phone-sms",
        channel: "Phone / SMS / Missed-Call",
        purpose: "Calls and missed-call recovery",
        provider: "phone",
        connectionStatus: "coming_soon",
        connectionStatusLabel: "Coming soon",
        aiHandlingStatus: "Coming soon",
        primaryActionLabel: "Coming soon",
        primaryActionType: "coming_soon",
      });

      // Row 7: Instagram Direct
      items.push({
        id: "instagram-direct",
        channel: "Instagram Direct",
        purpose: "Direct messages & story mentions",
        provider: "instagram",
        connectionStatus: "coming_soon",
        connectionStatusLabel: "Coming soon",
        aiHandlingStatus: "Coming soon",
        primaryActionLabel: "Coming soon",
        primaryActionType: "coming_soon",
      });

      // Row 8: Facebook Messenger
      items.push({
        id: "facebook-messenger",
        channel: "Facebook Messenger",
        purpose: "Business page inbound messages",
        provider: "messenger",
        connectionStatus: "coming_soon",
        connectionStatusLabel: "Coming soon",
        aiHandlingStatus: "Coming soon",
        primaryActionLabel: "Coming soon",
        primaryActionType: "coming_soon",
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

  // Poll server for Telegram Business verification
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
            setStatusMessage("Telegram Business connected successfully!");
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
        if (connectTab === "official") {
          const shareLink = getOfficialTelegramBindingLink(data);
          if (!shareLink) {
            setStatusMessage("The secure Telegram binding link could not be verified. No link was opened.");
            return;
          }

          setOfficialBinding({ shareLink });
          setStatusMessage("Secure Telegram link ready. Open it, then press Start in Telegram.");
          void loadConnections();
          return;
        }

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

  // Fetch deletion intent when disconnect modal opens
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
          `/api/integrations/telegram/disconnect?businessConnectionId=${encodeURIComponent(disconnectingConnection!.rawItem?.id || "")}`
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

  // Disconnect handler
  async function handleConfirmDisconnect() {
    if (!disconnectingConnection) return;

    if (disconnectingConnection.provider === "whatsapp") {
      setDisconnectLoading(true);
      try {
        const res = await fetch("/api/integrations/whatsapp/disconnect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
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
          businessConnectionId: disconnectingConnection.rawItem?.id,
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
    if (filterChannel === "all") return true;
    return c.provider.includes(filterChannel);
  });

  return (
    <div className="min-h-[calc(100dvh-56px)] bg-[#F8F7FC] px-4 py-6 sm:px-6 lg:px-8 text-[#17151F] space-y-6">
      {/* Top Header */}
      <DashboardPageHeader
        title="J10 Connections"
        subtitle="Manage your business communication channels with verified live connectivity."
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            <DashboardButton
              variant="secondary"
              onClick={() => void loadConnections()}
              disabled={loading}
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
              <span>Sync</span>
            </DashboardButton>

            <DashboardButton
              variant="primary"
              onClick={() => setShowWhatsAppModal(true)}
            >
              <Smartphone size={13} />
              <span>Connect WhatsApp</span>
            </DashboardButton>

            <DashboardButton
              variant="secondary"
              onClick={() => {
                setShowConnectModal(true);
                setConnectTab("business");
              }}
            >
              <Plus size={13} />
              <span>Connect Telegram</span>
            </DashboardButton>
          </div>
        }
      />

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <label className="text-xs font-medium text-[#6F687A]">Filter:</label>
          <select
            value={filterChannel}
            onChange={(e) => setFilterChannel(e.target.value)}
            className="rounded-lg border border-[#E2DEEA] bg-[#FFFFFF] px-3 py-1.5 text-xs font-medium text-[#17151F] shadow-sm focus:border-[#6347E8] focus:outline-none"
          >
            <option value="all">All Channels</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="telegram">Telegram</option>
            <option value="website">Website Forms</option>
          </select>
        </div>

        <div className="text-xs text-[#6F687A]">
          Showing <span className="font-semibold text-[#17151F]">{filteredConnections.length}</span> channels
        </div>
      </div>

      {/* Canonical Table Structure: Channel | Purpose | Connection status | AI handling status | Primary action */}
      <div className="overflow-hidden rounded-xl border border-[#E2DEEA] bg-[#FFFFFF] shadow-[0_4px_16px_rgba(49,32,92,0.06)]">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#E2DEEA] bg-[#F8F7FC] text-[11px] font-semibold uppercase tracking-wider text-[#6F687A]">
              <tr>
                <th className="px-5 py-3.5">Channel</th>
                <th className="px-5 py-3.5">Purpose</th>
                <th className="px-5 py-3.5">Connection status</th>
                <th className="px-5 py-3.5">AI handling status</th>
                <th className="px-5 py-3.5 text-right">Primary action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2DEEA]">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-[#6F687A]">
                    <RefreshCw size={18} className="mx-auto mb-2 animate-spin text-[#6347E8]" />
                    Checking live channel connectivity...
                  </td>
                </tr>
              ) : filteredConnections.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-[#6F687A]">
                    No channels found for this filter.
                  </td>
                </tr>
              ) : (
                filteredConnections.map((conn) => (
                  <tr key={conn.id} className="transition hover:bg-[#F3F1F8]">
                    {/* 1. Channel */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#E2DEEA] bg-[#F3F1F8] text-[#17151F]">
                          {conn.provider === "whatsapp" ? (
                            <Smartphone size={15} className="text-[#168A65]" />
                          ) : conn.provider === "telegram" ? (
                            <Send size={15} className="text-[#6347E8]" />
                          ) : conn.provider === "website" ? (
                            <Globe size={15} className="text-[#6347E8]" />
                          ) : conn.provider === "gmail" ? (
                            <Mail size={15} className="text-[#6F687A]" />
                          ) : conn.provider === "google_calendar" ? (
                            <Calendar size={15} className="text-[#6F687A]" />
                          ) : conn.provider === "phone" ? (
                            <PhoneCall size={15} className="text-[#6F687A]" />
                          ) : conn.provider === "instagram" ? (
                            <Camera size={15} className="text-[#6F687A]" />
                          ) : (
                            <MessageCircle size={15} className="text-[#6F687A]" />
                          )}
                        </div>
                        <span className="font-semibold text-[#17151F] text-xs">
                          {conn.channel}
                        </span>
                      </div>
                    </td>

                    {/* 2. Purpose */}
                    <td className="px-5 py-4 text-[#6F687A] text-xs">
                      {conn.purpose}
                    </td>

                    {/* 3. Connection status */}
                    <td className="px-5 py-4">
                      <DashboardStatusBadge
                        status={
                          conn.connectionStatus === "connected"
                            ? "connected"
                            : conn.connectionStatus === "coming_soon"
                            ? "coming_soon"
                            : "setup_incomplete"
                        }
                        label={conn.connectionStatusLabel}
                      />
                    </td>

                    {/* 4. AI handling status (Strictly no repeated sparkle icons) */}
                    <td className="px-5 py-4">
                      <span className="text-xs text-[#17151F] font-medium">
                        {conn.aiHandlingStatus}
                      </span>
                    </td>

                    {/* 5. Primary action */}
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {conn.primaryActionType === "coming_soon" ? (
                          <span className="text-[11px] text-[#918A9D] font-medium">
                            Coming soon
                          </span>
                        ) : conn.primaryActionType === "view_funnel" ? (
                          <Link
                            href="/dashboard/growth"
                            className="inline-flex h-7 items-center rounded-lg border border-[#E2DEEA] bg-[#FFFFFF] px-2.5 text-[11px] font-medium text-[#17151F] hover:bg-[#F3F1F8] transition shadow-sm"
                          >
                            View Lead Funnel
                          </Link>
                        ) : conn.primaryActionType === "connect_whatsapp" ? (
                          <button
                            type="button"
                            onClick={() => setShowWhatsAppModal(true)}
                            className="inline-flex h-7 items-center rounded-lg bg-[#6347E8] px-2.5 text-[11px] font-semibold text-white hover:bg-[#5136D6] transition shadow-sm"
                          >
                            Connect WhatsApp
                          </button>
                        ) : conn.primaryActionType === "connect_telegram" ? (
                          <button
                            type="button"
                            onClick={() => {
                              setShowConnectModal(true);
                              setConnectTab("business");
                            }}
                            className="inline-flex h-7 items-center rounded-lg bg-[#6347E8] px-2.5 text-[11px] font-semibold text-white hover:bg-[#5136D6] transition shadow-sm"
                          >
                            Connect Telegram
                          </button>
                        ) : conn.primaryActionType === "configure_whatsapp" ? (
                          <div className="flex items-center gap-1.5">
                            <Link
                              href="/dashboard/ai-operator"
                              className="inline-flex h-7 items-center rounded-lg border border-[#E2DEEA] bg-[#FFFFFF] px-2.5 text-[11px] font-medium text-[#17151F] hover:bg-[#F3F1F8] transition shadow-sm"
                            >
                              Configure
                            </Link>
                            <button
                              type="button"
                              onClick={() => setDisconnectingConnection(conn)}
                              className="inline-flex h-7 items-center rounded-lg border border-[#FECDD3] bg-[#FFE4E8] px-2 text-[11px] font-medium text-[#E11D48] hover:bg-[#FFE4E8]/80 transition"
                            >
                              Disconnect
                            </button>
                          </div>
                        ) : conn.primaryActionType === "configure_telegram" ? (
                          <div className="flex items-center gap-1.5">
                            <Link
                              href="/dashboard/ai-operator"
                              className="inline-flex h-7 items-center rounded-lg border border-[#E2DEEA] bg-[#FFFFFF] px-2.5 text-[11px] font-medium text-[#17151F] hover:bg-[#F3F1F8] transition shadow-sm"
                            >
                              Configure
                            </Link>
                            <button
                              type="button"
                              onClick={() => setDisconnectingConnection(conn)}
                              className="inline-flex h-7 items-center rounded-lg border border-[#FECDD3] bg-[#FFE4E8] px-2 text-[11px] font-medium text-[#E11D48] hover:bg-[#FFE4E8]/80 transition"
                            >
                              Disconnect
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Telegram Connection Modal */}
      {showConnectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-xl border border-[#E2DEEA] bg-[#FFFFFF] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#E2DEEA] pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F0ECFF] text-[#6347E8]">
                  <Send size={16} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-[#17151F]">
                    Connect Telegram
                  </h3>
                  <p className="text-xs text-[#6F687A]">
                    Enable automated 24/7 client communication via Telegram.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowConnectModal(false);
                  setOfficialBinding(null);
                  if (pollTimerRef.current) clearInterval(pollTimerRef.current);
                }}
                className="rounded-lg p-1 text-[#6F687A] hover:bg-[#F3F1F8] hover:text-[#17151F]"
              >
                <X size={15} />
              </button>
            </div>

            {/* Connection Mode Selection Tabs */}
            <div className="mt-5 grid grid-cols-3 gap-1 rounded-lg border border-[#E2DEEA] bg-[#F3F1F8] p-1 text-center">
              <button
                type="button"
                onClick={() => setConnectTab("business")}
                className={`rounded-md py-1.5 text-xs font-medium transition ${
                  connectTab === "business"
                    ? "bg-[#6347E8] text-white shadow-sm"
                    : "text-[#6F687A] hover:text-[#17151F]"
                }`}
              >
                Telegram Business
              </button>
              <button
                type="button"
                onClick={() => setConnectTab("official")}
                className={`rounded-md py-1.5 text-xs font-medium transition ${
                  connectTab === "official"
                    ? "bg-[#6347E8] text-white shadow-sm"
                    : "text-[#6F687A] hover:text-[#17151F]"
                }`}
              >
                Shared Bot DM
              </button>
              <button
                type="button"
                onClick={() => setConnectTab("custom")}
                className={`rounded-md py-1.5 text-xs font-medium transition ${
                  connectTab === "custom"
                    ? "bg-[#6347E8] text-white shadow-sm"
                    : "text-[#6F687A] hover:text-[#17151F]"
                }`}
              >
                Custom Bot
              </button>
            </div>

            {/* Tab A: Telegram Business Secretary Mode */}
            {connectTab === "business" && (
              <div className="mt-5 space-y-4">
                <div className="rounded-lg border border-[#E2DEEA] bg-[#F8F7FC] p-3">
                  <div className="grid grid-cols-4 gap-2 text-center text-[10px]">
                    <div className={`p-1.5 rounded-lg ${connectionStep >= 1 ? "bg-[#F0ECFF] text-[#6347E8] font-semibold" : "text-[#918A9D]"}`}>
                      1. Prepare Session
                    </div>
                    <div className={`p-1.5 rounded-lg ${connectionStep >= 2 ? "bg-[#F0ECFF] text-[#6347E8] font-semibold" : "text-[#918A9D]"}`}>
                      2. Open Telegram
                    </div>
                    <div className={`p-1.5 rounded-lg ${connectionStep >= 3 ? "bg-[#F0ECFF] text-[#6347E8] font-semibold" : "text-[#918A9D]"}`}>
                      3. Verify Rights
                    </div>
                    <div className={`p-1.5 rounded-lg ${connectionStep === 4 ? "bg-[#E8F8F2] text-[#168A65] font-semibold" : "text-[#918A9D]"}`}>
                      4. Connected
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-[#E2DEEA] bg-[#F8F7FC] p-4 text-xs space-y-2">
                  <div className="flex items-center gap-2 text-[#6347E8] font-semibold">
                    <Shield size={15} />
                    <span>External AI Processing Consent</span>
                  </div>
                  <p className="text-[#6F687A] leading-relaxed">
                    By connecting, you authorize J10 NEXUS to act as your Secretary Bot on Telegram. Inbound messages will receive 24/7 customer service responses based strictly on your workspace settings.
                  </p>
                  <label className="flex items-start gap-2 pt-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={businessConsentAccepted}
                      onChange={(e) => setBusinessConsentAccepted(e.target.checked)}
                      className="mt-0.5 rounded border-[#E2DEEA] text-[#6347E8] focus:ring-0"
                    />
                    <span className="text-[11px] text-[#17151F]">
                      I authorize automated AI messaging on this Telegram channel.
                    </span>
                  </label>
                </div>

                {connectionStep === 1 && (
                  <button
                    type="button"
                    onClick={handleStartBusinessSession}
                    disabled={!businessConsentAccepted || connecting}
                    className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#6347E8] py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#5136D6] disabled:opacity-40"
                  >
                    {connecting ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                    Initialize Telegram Business Session
                  </button>
                )}

                {connectionStep >= 2 && businessSession && (
                  <div className="space-y-3 rounded-lg border border-[#E2DEEA] bg-[#F8F7FC] p-4 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[#6F687A]">Session Handshake:</span>
                      <span className="font-mono text-[#168A65]">Active (Single-Use)</span>
                    </div>

                    <a
                      href={businessSession.shareLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full rounded-lg bg-[#6347E8] py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#5136D6]"
                    >
                      <Send size={14} />
                      Open Telegram
                      <ExternalLink size={12} />
                    </a>

                    {sessionPolling && (
                      <div className="flex items-center justify-center gap-2 pt-1 text-[11px] text-[#6347E8] animate-pulse">
                        <RefreshCw size={12} className="animate-spin" />
                        Waiting for Telegram confirmation...
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Tab B: Shared Bot DM */}
            {connectTab === "official" && (
              <div className="mt-5 space-y-4">
                <div className="rounded-lg border border-[#E2DEEA] bg-[#F8F7FC] p-4 text-xs">
                  <p className="text-[#6F687A] leading-relaxed">
                    Connect the official pre-verified J10 Lead Bot directly to your workspace. Customers message the bot and messages stream live into your Unified Inbox.
                  </p>
                </div>

                {!officialBinding ? (
                  <button
                    type="button"
                    onClick={handleConnectLegacyTelegram}
                    disabled={connecting}
                    className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#6347E8] py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#5136D6]"
                  >
                    {connecting ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                    Generate secure Telegram link
                  </button>
                ) : (
                  <div className="space-y-3 rounded-lg border border-[#A3E6D0] bg-[#E8F8F2] p-4 text-xs">
                    <p className="font-semibold text-[#168A65]">Your single-use Telegram link is ready.</p>
                    <a
                      href={officialBinding.shareLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#6347E8] py-2.5 font-semibold text-white shadow-sm transition hover:bg-[#5136D6]"
                    >
                      <Send size={14} />
                      Open Telegram
                      <ExternalLink size={12} />
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* Tab C: Custom Dedicated Bot */}
            {connectTab === "custom" && (
              <div className="mt-5 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[#6F687A]">
                    Telegram Bot API Token (from @BotFather)
                  </label>
                  <input
                    type="password"
                    value={customToken}
                    onChange={(e) => setCustomToken(e.target.value)}
                    placeholder="123456789:ABCdefGHIjklMNOpqrs..."
                    className="mt-1.5 w-full rounded-lg border border-[#E2DEEA] bg-[#FFFFFF] px-3 py-2 font-mono text-xs text-[#17151F] placeholder:text-[#918A9D] focus:border-[#6347E8] focus:outline-none"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleConnectLegacyTelegram}
                  disabled={connecting || !customToken.trim()}
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#6347E8] py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#5136D6] disabled:opacity-40"
                >
                  {connecting ? <RefreshCw size={14} className="animate-spin" /> : <Lock size={14} />}
                  Verify & Store Token
                </button>
              </div>
            )}

            {statusMessage && (
              <div
                className={`mt-4 rounded-lg p-3 text-xs ${
                  statusMessage.includes("success") || statusMessage.includes("connected")
                    ? "border border-[#A3E6D0] bg-[#E8F8F2] text-[#168A65]"
                    : "border border-[#FECDD3] bg-[#FFE4E8] text-[#E11D48]"
                }`}
              >
                {statusMessage}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Disconnect Modal */}
      {disconnectingConnection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-[#E2DEEA] bg-[#FFFFFF] p-6 shadow-2xl">
            <div className="flex items-center gap-3 border-b border-[#E2DEEA] pb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#FFE4E8] text-[#E11D48]">
                <Trash2 size={18} />
              </div>
              <div>
                <h3 className="text-base font-semibold text-[#17151F]">
                  Disconnect {disconnectingConnection.channel}
                </h3>
                <p className="text-xs text-[#6F687A]">
                  Channel disconnection and state preservation.
                </p>
              </div>
            </div>

            {disconnectDoneMessage ? (
              <div className="mt-4 space-y-4">
                <div className="rounded-lg border border-[#FDE68A] bg-[#FEF3C7] p-4 text-xs text-[#D97706]">
                  <p className="leading-relaxed font-medium">
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
                    className="rounded-lg bg-[#F3F1F8] border border-[#E2DEEA] px-4 py-2 text-xs font-semibold text-[#17151F] hover:bg-[#E2DEEA]"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="mt-4 space-y-3 text-xs text-[#6F687A]">
                  <p>
                    Disconnecting will immediately stop automated AI replies for this channel.
                  </p>
                  <div className="rounded-lg border border-[#A3E6D0] bg-[#E8F8F2] p-3 text-[11px] text-[#168A65]">
                    <div className="flex items-center gap-1.5 font-semibold">
                      <ShieldCheck size={14} />
                      <span>Historical Records Preserved</span>
                    </div>
                    <p className="mt-1 leading-relaxed">
                      All Unified Inbox conversations, customer message history, CRM contacts, and leads are permanently preserved.
                    </p>
                  </div>
                </div>

                <div className="mt-6 flex items-center justify-end gap-3 border-t border-[#E2DEEA] pt-4">
                  <button
                    type="button"
                    onClick={() => setDisconnectingConnection(null)}
                    className="rounded-lg border border-[#E2DEEA] bg-[#FFFFFF] px-4 py-2 text-xs font-medium text-[#6F687A] hover:bg-[#F3F1F8]"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={handleConfirmDisconnect}
                    disabled={disconnectLoading || !deletionIntentToken}
                    className="flex items-center gap-1.5 rounded-lg bg-[#E11D48] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#BE123C] disabled:opacity-50"
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

      {/* WhatsApp Modal */}
      {showWhatsAppModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl border border-[#E2DEEA] bg-[#FFFFFF] p-6 shadow-2xl">
            <WhatsAppConnectionChoice
              onMetaSuccess={() => {
                setShowWhatsAppModal(false);
                void loadConnections();
              }}
              onDialog360Connected={() => {
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
