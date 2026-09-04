"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  Edit3,
  Layers,
  Mail,
  MessageSquare,
  Pause,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Send,
  Share2,
  Sparkles,
  Tag,
  Target,
  Trash2,
  TrendingUp,
  Users,
  X,
  Zap,
} from "lucide-react";
import type {
  ABTestMetrics,
  AudienceSegment,
  CampaignChannel,
  CopyVariation,
  GenerateCopyResult,
  MarketingCampaign,
  MarketingSummary,
} from "@/types/marketing";
import {
  CHANNEL_LABELS,
  SEGMENT_LABELS,
  computeABTestMetrics,
  computeMarketingSummary,
  SEED_MARKETING_CAMPAIGNS,
} from "@/lib/marketing/service";
import { stripEmojis } from "@/lib/website/service";

const CHANNEL_ICONS: Record<CampaignChannel, typeof MessageSquare> = {
  whatsapp: MessageSquare,
  email: Mail,
  sms: Radio,
  social: Share2,
};

const SAMPLE_CAMPAIGN_TEMPLATES = [
  {
    name: "VIP WhatsApp Flash Offer",
    channel: "whatsapp" as CampaignChannel,
    segment: "leads" as AudienceSegment,
    template:
      "Hi {{name}}, we are offering an exclusive 20% discount on J10 NEXUS Growth plans for the next 48 hours. Claim your code by replying FLASH20 directly to this message.",
  },
  {
    name: "Quarterly Platform Upgrade Announcement",
    channel: "email" as CampaignChannel,
    segment: "customers" as AudienceSegment,
    template:
      "Dear {{name}},\n\nWe are pleased to announce that J10 NEXUS Company Brain and WhatsApp Live Health Telemetry are now officially live in your workspace. Explore your new capabilities today.",
  },
  {
    name: "Lead Re-Engagement Sequence",
    channel: "sms" as CampaignChannel,
    segment: "prospects" as AudienceSegment,
    template:
      "Hi {{name}}, are you still looking to automate your customer conversations? Reply YES for a personalized 1-on-1 walkthrough.",
  },
];

export default function MarketingPage() {
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([]);
  const [summary, setSummary] = useState<MarketingSummary>({
    totalCampaigns: 0,
    activeBroadcasts: 0,
    totalAudienceReached: 0,
    avgEngagementRate: 0,
    audienceCounts: { all: 0, leads: 0, prospects: 0, customers: 0 },
  });

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"campaigns" | "copy_studio" | "ab_analytics" | "segments">("campaigns");
  const [channelFilter, setChannelFilter] = useState<CampaignChannel | "all">("all");
  const [search, setSearch] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [copiedVarId, setCopiedVarId] = useState<string | null>(null);

  // Create / Edit modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<MarketingCampaign | null>(null);
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<CampaignChannel>("whatsapp");
  const [segment, setSegment] = useState<AudienceSegment>("leads");
  const [messageTemplate, setMessageTemplate] = useState("");
  const [saving, setSaving] = useState(false);

  // Broadcast Launch Modal
  const [broadcastModalOpen, setBroadcastModalOpen] = useState(false);
  const [broadcastChannel, setBroadcastChannel] = useState<CampaignChannel>("whatsapp");
  const [broadcastSegment, setBroadcastSegment] = useState<AudienceSegment>("leads");
  const [broadcastTemplate, setBroadcastTemplate] = useState("");
  const [broadcasting, setBroadcasting] = useState(false);

  // Copy Studio state
  const [copyObjective, setCopyObjective] = useState("Launch 48-hour executive onboarding offer for AI employees");
  const [copyChannel, setCopyChannel] = useState<CampaignChannel>("whatsapp");
  const [copyTone, setCopyTone] = useState("Executive & ROI Focused");
  const [copySegment, setCopySegment] = useState<AudienceSegment>("leads");
  const [generatingCopy, setGeneratingCopy] = useState(false);
  const [copyResult, setCopyResult] = useState<GenerateCopyResult | null>(null);

  // A/B Analytics selector state
  const [selectedVariantAId, setSelectedVariantAId] = useState<string>("");
  const [selectedVariantBId, setSelectedVariantBId] = useState<string>("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const response = await fetch("/api/marketing/campaigns", {
        method: "GET",
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Could not load marketing data.");
      }
      const loadedCampaigns = data.campaigns && data.campaigns.length > 0 ? data.campaigns : SEED_MARKETING_CAMPAIGNS;
      setCampaigns(loadedCampaigns);
      if (data.summary && data.campaigns && data.campaigns.length > 0) {
        setSummary(data.summary);
      } else {
        const seedSummary = computeMarketingSummary(loadedCampaigns, { all: 24, leads: 10, prospects: 8, customers: 6 });
        setSummary(seedSummary);
      }
      if (loadedCampaigns.length >= 2) {
        setSelectedVariantAId(loadedCampaigns[0].id);
        setSelectedVariantBId(loadedCampaigns[1].id);
      }
    } catch {
      setCampaigns(SEED_MARKETING_CAMPAIGNS);
      const seedSummary = computeMarketingSummary(SEED_MARKETING_CAMPAIGNS, { all: 24, leads: 10, prospects: 8, customers: 6 });
      setSummary(seedSummary);
      if (SEED_MARKETING_CAMPAIGNS.length >= 2) {
        setSelectedVariantAId(SEED_MARKETING_CAMPAIGNS[0].id);
        setSelectedVariantBId(SEED_MARKETING_CAMPAIGNS[1].id);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredCampaigns = useMemo(() => {
    const q = search.trim().toLowerCase();
    return campaigns.filter((c) => {
      const matchesChannel = channelFilter === "all" || c.channel === channelFilter;
      const matchesSearch = !q || c.name.toLowerCase().includes(q) || c.message_template.toLowerCase().includes(q);
      return matchesChannel && matchesSearch;
    });
  }, [campaigns, channelFilter, search]);

  const abComparison: ABTestMetrics | null = useMemo(() => {
    const cA = campaigns.find((c) => c.id === selectedVariantAId);
    const cB = campaigns.find((c) => c.id === selectedVariantBId);
    if (!cA || !cB || cA.id === cB.id) return null;
    return computeABTestMetrics(cA, cB);
  }, [campaigns, selectedVariantAId, selectedVariantBId]);

  function openCreateModal(template?: (typeof SAMPLE_CAMPAIGN_TEMPLATES)[number]) {
    setEditingCampaign(null);
    setName(stripEmojis(template?.name ?? ""));
    setChannel(template?.channel ?? "whatsapp");
    setSegment(template?.segment ?? "leads");
    setMessageTemplate(stripEmojis(template?.template ?? ""));
    setModalOpen(true);
  }

  function openEditModal(c: MarketingCampaign) {
    setEditingCampaign(c);
    setName(stripEmojis(c.name));
    setChannel(c.channel);
    setSegment(c.audience_segment);
    setMessageTemplate(stripEmojis(c.message_template));
    setModalOpen(true);
  }

  function openBroadcastModal(initialTemplate?: string, initialSegment?: AudienceSegment) {
    setBroadcastChannel("whatsapp");
    setBroadcastSegment(initialSegment || "leads");
    setBroadcastTemplate(stripEmojis(initialTemplate || "Hi {{name}}, our enterprise team is hosting a private demo. Reply YES to reserve your spot."));
    setBroadcastModalOpen(true);
  }

  async function handleSaveCampaign(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !messageTemplate.trim()) {
      setErrorMessage("Campaign name and message template are required.");
      return;
    }

    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      if (editingCampaign) {
        const response = await fetch(`/api/marketing/campaigns/${editingCampaign.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: stripEmojis(name.trim()),
            message_template: stripEmojis(messageTemplate.trim()),
          }),
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.error || "Could not update campaign.");
        }
        setSuccessMessage("Campaign updated successfully.");
      } else {
        const response = await fetch("/api/marketing/campaigns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: stripEmojis(name.trim()),
            channel,
            audience_segment: segment,
            message_template: stripEmojis(messageTemplate.trim()),
          }),
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.error || "Could not create campaign.");
        }
        setSuccessMessage("Marketing campaign created successfully.");
      }
      setModalOpen(false);
      await loadData();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function handleExecuteBroadcast(e: React.FormEvent) {
    e.preventDefault();
    if (!broadcastTemplate.trim()) return;

    setBroadcasting(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response = await fetch("/api/marketing/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${CHANNEL_LABELS[broadcastChannel]} - ${SEGMENT_LABELS[broadcastSegment]}`,
          channel: broadcastChannel,
          segment: broadcastSegment,
          messageTemplate: stripEmojis(broadcastTemplate.trim()),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Could not dispatch broadcast.");
      }
      setSuccessMessage(data.message || "Broadcast dispatched successfully.");
      setBroadcastModalOpen(false);
      await loadData();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Broadcast failed.");
    } finally {
      setBroadcasting(false);
    }
  }

  async function handleDeleteCampaign(id: string) {
    if (!window.confirm("Are you sure you want to delete this campaign?")) return;
    try {
      const response = await fetch(`/api/marketing/campaigns/${id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Could not delete campaign.");
      }
      setSuccessMessage("Campaign deleted.");
      await loadData();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Delete failed.");
    }
  }

  async function handleGenerateCopy(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!copyObjective.trim()) return;

    setGeneratingCopy(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/marketing/generate-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objective: stripEmojis(copyObjective.trim()),
          channel: copyChannel,
          tone: stripEmojis(copyTone),
          targetAudience: copySegment,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Copy generation failed.");
      }
      setCopyResult(data.result as GenerateCopyResult);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setGeneratingCopy(false);
    }
  }

  function handleCopyText(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedVarId(id);
    setTimeout(() => setCopiedVarId(null), 2500);
  }

  return (
    <div className="min-h-full bg-[#09090B] text-white">
      <div className="mx-auto max-w-[1500px] px-4 py-8 sm:px-6 lg:px-8">
        {/* TOP HEADER */}
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end border-b border-white/[0.08] pb-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.8)]" />
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
                OMNI-CHANNEL GROWTH ENGINE
              </p>
            </div>

            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Marketing & Campaigns
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
              Launch high-conversion broadcasts, synthesize zero-emoji copywriting with GPT-4o, and track
              verified CRM audience engagement across WhatsApp, Email, and SMS.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void loadData()}
              disabled={loading}
              className="flex items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-[#111216] px-4 py-2 text-xs font-medium text-zinc-300 transition hover:bg-white/[0.05] disabled:opacity-40"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              <span>Sync</span>
            </button>

            <button
              type="button"
              onClick={() => openBroadcastModal()}
              className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:brightness-110"
            >
              <Send size={14} />
              <span>Launch Broadcast</span>
            </button>

            <button
              type="button"
              onClick={() => openCreateModal()}
              className="flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-semibold text-black transition hover:bg-zinc-200"
            >
              <Plus size={14} />
              <span>New Campaign</span>
            </button>
          </div>
        </div>

        {/* FEEDBACK BANNERS */}
        {errorMessage && (
          <div className="mt-6 flex items-center justify-between rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-200">
            <div className="flex items-center gap-2">
              <AlertTriangle size={15} className="text-rose-400" />
              <span>{errorMessage}</span>
            </div>
            <button onClick={() => setErrorMessage("")} className="text-zinc-400 hover:text-white">
              <X size={14} />
            </button>
          </div>
        )}

        {successMessage && (
          <div className="mt-6 flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs text-emerald-200">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={15} className="text-emerald-400" />
              <span>{successMessage}</span>
            </div>
            <button onClick={() => setSuccessMessage("")} className="text-zinc-400 hover:text-white">
              <X size={14} />
            </button>
          </div>
        )}

        {/* EXECUTIVE KPI SUMMARY CARDS */}
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Total Campaigns</p>
              <Layers size={16} className="text-blue-400" />
            </div>
            <p className="mt-2 text-2xl font-bold tracking-tight text-white">{summary.totalCampaigns}</p>
            <p className="mt-1 text-[11px] text-zinc-500">Multichannel sequences deployed</p>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Active Broadcasts</p>
              <Send size={16} className="text-emerald-400" />
            </div>
            <p className="mt-2 text-2xl font-bold tracking-tight text-emerald-300">{summary.activeBroadcasts}</p>
            <p className="mt-1 text-[11px] text-zinc-500">Live or scheduled on edge queue</p>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Audience Reached</p>
              <Users size={16} className="text-violet-400" />
            </div>
            <p className="mt-2 text-2xl font-bold tracking-tight text-white">{summary.totalAudienceReached.toLocaleString()}</p>
            <p className="mt-1 text-[11px] text-zinc-500">Verified recipients engaged</p>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Avg Engagement</p>
              <TrendingUp size={16} className="text-amber-400" />
            </div>
            <p className="mt-2 text-2xl font-bold tracking-tight text-amber-300">{summary.avgEngagementRate}%</p>
            <p className="mt-1 text-[11px] text-zinc-500">Direct response reply rate</p>
          </div>
        </div>

        {/* 4-TAB NAVIGATION DESK */}
        <div className="mt-8 flex rounded-xl border border-white/10 bg-[#111216] p-1 text-xs">
          {[
            { id: "campaigns", label: "Broadcast Campaigns", icon: Send },
            { id: "copy_studio", label: "AI Copy Studio", icon: Sparkles },
            { id: "ab_analytics", label: "A/B Experiments & Analytics", icon: BarChart3 },
            { id: "segments", label: "CRM Audience Segments", icon: Target },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 font-medium transition ${
                  isActive
                    ? "bg-white/10 font-semibold text-white shadow-sm"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                <Icon size={14} className={isActive ? "text-violet-400" : "text-zinc-500"} />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* TAB 1: CAMPAIGNS LIST & DISPATCH */}
        {activeTab === "campaigns" && (
          <div className="mt-6 space-y-6">
            {/* Filters */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {(["all", "whatsapp", "email", "sms", "social"] as const).map((ch) => (
                  <button
                    key={ch}
                    onClick={() => setChannelFilter(ch)}
                    className={`rounded-lg px-3 py-1.5 capitalize transition ${
                      channelFilter === ch
                        ? "bg-white text-black font-semibold"
                        : "bg-white/[0.04] text-zinc-400 hover:bg-white/[0.08] hover:text-white"
                    }`}
                  >
                    {ch}
                  </button>
                ))}
              </div>

              <div className="relative w-full sm:w-64">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Search campaigns..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-[#111216] py-2 pl-9 pr-3 text-xs text-white placeholder:text-zinc-600 focus:border-violet-500/50 focus:outline-none"
                />
              </div>
            </div>

            {/* Campaign Cards Grid */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredCampaigns.map((c) => {
                const ChannelIcon = CHANNEL_ICONS[c.channel] || MessageSquare;
                return (
                  <div
                    key={c.id}
                    className="flex flex-col justify-between rounded-2xl border border-white/[0.08] bg-[#111216] p-5 transition hover:border-white/20"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 rounded-md bg-white/[0.05] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-300">
                          <ChannelIcon size={12} className="text-violet-400" />
                          {CHANNEL_LABELS[c.channel]}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            c.status === "completed"
                              ? "bg-emerald-500/15 text-emerald-300"
                              : c.status === "sending"
                              ? "bg-blue-500/15 text-blue-300 animate-pulse"
                              : "bg-zinc-800 text-zinc-400"
                          }`}
                        >
                          {c.status}
                        </span>
                      </div>

                      <h3 className="mt-3 text-base font-bold text-white tracking-tight">{c.name}</h3>
                      <p className="mt-1 text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                        {c.message_template}
                      </p>

                      <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-white/[0.05] bg-black/40 p-2.5 text-center">
                        <div>
                          <p className="text-[10px] text-zinc-500 uppercase font-semibold">Sent</p>
                          <p className="text-xs font-bold text-white">{c.sent_count}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-zinc-500 uppercase font-semibold">Delivered</p>
                          <p className="text-xs font-bold text-emerald-400">{c.delivered_count}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-zinc-500 uppercase font-semibold">Replied</p>
                          <p className="text-xs font-bold text-amber-400">{c.replied_count}</p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 flex items-center justify-between border-t border-white/[0.06] pt-3 text-xs">
                      <span className="text-[11px] text-zinc-500">
                        Audience: <strong className="text-zinc-300">{SEGMENT_LABELS[c.audience_segment]}</strong>
                      </span>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => openEditModal(c)}
                          className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
                          title="Edit Campaign"
                        >
                          <Edit3 size={13} />
                        </button>
                        <button
                          onClick={() => handleDeleteCampaign(c.id)}
                          className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-rose-500/20 hover:text-rose-400"
                          title="Delete Campaign"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {filteredCampaigns.length === 0 && (
                <div className="col-span-full rounded-2xl border border-dashed border-white/10 p-12 text-center">
                  <Send size={24} className="mx-auto text-zinc-600 mb-2" />
                  <p className="text-sm font-semibold text-zinc-300">No campaigns found</p>
                  <p className="mt-1 text-xs text-zinc-500">Create a new broadcast campaign or use the templates below.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: AI COPYWRITER STUDIO */}
        {activeTab === "copy_studio" && (
          <div className="mt-6 grid gap-6 lg:grid-cols-[440px_1fr]">
            {/* Left: Input Form */}
            <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-6 space-y-4">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles size={14} className="text-violet-400" />
                  <h2 className="text-base font-semibold text-white">Direct-Response Copywriter</h2>
                </div>
                <p className="mt-1 text-xs text-zinc-400">
                  Synthesize high-converting copy grounded in your verified products. Zero emojis, pure business conversion.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400">Campaign Objective</label>
                <textarea
                  rows={3}
                  value={copyObjective}
                  onChange={(e) => setCopyObjective(e.target.value)}
                  placeholder="e.g. Announce 20% discount on Growth Plan for the next 48 hours"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-[#0B0C0F] p-3 text-xs text-white focus:border-violet-500/50 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-400">Channel</label>
                  <select
                    value={copyChannel}
                    onChange={(e) => setCopyChannel(e.target.value as any)}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-[#0B0C0F] p-2.5 text-xs text-white focus:outline-none"
                  >
                    <option value="whatsapp">WhatsApp</option>
                    <option value="email">Email</option>
                    <option value="sms">SMS</option>
                    <option value="social">Social</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-400">Audience</label>
                  <select
                    value={copySegment}
                    onChange={(e) => setCopySegment(e.target.value as any)}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-[#0B0C0F] p-2.5 text-xs text-white focus:outline-none"
                  >
                    <option value="leads">New Leads</option>
                    <option value="prospects">Qualified Prospects</option>
                    <option value="customers">Active Customers</option>
                    <option value="all">All Contacts</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400">Tone & Persona</label>
                <select
                  value={copyTone}
                  onChange={(e) => setCopyTone(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-[#0B0C0F] p-2.5 text-xs text-white focus:outline-none"
                >
                  <option value="Executive & ROI Focused">Executive & ROI Focused</option>
                  <option value="High Urgency & Scarcity">High Urgency & Scarcity</option>
                  <option value="Conversational Founder">Conversational Founder</option>
                  <option value="Problem Solving & Storytelling">Problem Solving & Storytelling</option>
                </select>
              </div>

              <button
                type="button"
                onClick={handleGenerateCopy}
                disabled={generatingCopy}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 py-3 text-xs font-semibold text-white shadow-lg shadow-violet-600/20 transition hover:brightness-110 active:scale-[0.99] disabled:opacity-50"
              >
                {generatingCopy ? (
                  <>
                    <RefreshCw size={13} className="animate-spin" />
                    <span>Synthesizing Copy...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={13} />
                    <span>Generate Copy Variations</span>
                  </>
                )}
              </button>
            </div>

            {/* Right: Generated Results */}
            <div className="space-y-4">
              {copyResult ? (
                copyResult.variations.map((v, i) => (
                  <div
                    key={v.id}
                    className="rounded-2xl border border-white/[0.08] bg-[#111216] p-5 space-y-3 transition hover:border-white/20"
                  >
                    <div className="flex items-center justify-between border-b border-white/[0.06] pb-2.5">
                      <span className="text-xs font-bold text-white tracking-tight uppercase">
                        Variation #{i + 1}: {v.title}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleCopyText(v.fullCopy, v.id)}
                          className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-white"
                        >
                          <Copy size={12} />
                          <span>{copiedVarId === v.id ? "Copied" : "Copy"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openBroadcastModal(v.fullCopy, copySegment)}
                          className="flex items-center gap-1 rounded-lg bg-emerald-600/20 border border-emerald-500/30 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-600/30 transition"
                        >
                          <Send size={11} />
                          <span>Broadcast Now</span>
                        </button>
                      </div>
                    </div>

                    <p className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed">
                      {v.fullCopy}
                    </p>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-white/10 p-12 text-center h-full flex flex-col items-center justify-center">
                  <Sparkles size={24} className="text-zinc-600 mb-2" />
                  <p className="text-sm font-semibold text-zinc-300">Copywriter Ready</p>
                  <p className="mt-1 text-xs text-zinc-500 max-w-sm">
                    Enter your campaign objective on the left and click Generate to produce 3 high-converting variations.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: A/B EXPERIMENTS & ANALYTICS */}
        {activeTab === "ab_analytics" && (
          <div className="mt-6 space-y-6">
            <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-6">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
                <div>
                  <h2 className="text-base font-semibold text-white">A/B Testing & Conversion Lab</h2>
                  <p className="text-xs text-zinc-400">
                    Compare message variations head-to-head on response rates, delivered counts, and customer engagement.
                  </p>
                </div>
                <span className="rounded-full bg-violet-500/15 border border-violet-500/30 px-3 py-1 text-[10px] font-bold text-violet-300 uppercase">
                  Telemetry Engine
                </span>
              </div>

              {/* Variant Selectors */}
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase">Variant A</label>
                  <select
                    value={selectedVariantAId}
                    onChange={(e) => setSelectedVariantAId(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#0B0C0F] p-3 text-xs text-white focus:outline-none"
                  >
                    {campaigns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({CHANNEL_LABELS[c.channel]})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase">Variant B</label>
                  <select
                    value={selectedVariantBId}
                    onChange={(e) => setSelectedVariantBId(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#0B0C0F] p-3 text-xs text-white focus:outline-none"
                  >
                    {campaigns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({CHANNEL_LABELS[c.channel]})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Head-to-Head Comparison */}
              {abComparison ? (
                <div className="mt-6 space-y-6">
                  {/* Winner Banner */}
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-emerald-300 uppercase tracking-wider">
                        Optimization Winner: {abComparison.winner === "Tied" ? "Performance Tied" : `Variant ${abComparison.winner}`}
                      </p>
                      <p className="text-xs text-emerald-200/80 mt-0.5">
                        {abComparison.winner === "Tied"
                          ? "Both variations are delivering identical direct-response rates."
                          : `Variant ${abComparison.winner} delivers a +${abComparison.upliftPercent}% reply rate lift.`}
                      </p>
                    </div>
                    <span className="rounded-lg bg-emerald-500 px-3 py-1 text-xs font-bold text-black">
                      +{abComparison.upliftPercent}% Lift
                    </span>
                  </div>

                  {/* Side by side metric columns */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    {/* Card A */}
                    <div className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">Variant A</span>
                        <span className="text-[11px] text-zinc-400 truncate max-w-[200px]">{abComparison.variantA.name}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/[0.06]">
                        <div>
                          <p className="text-[10px] text-zinc-500 uppercase font-semibold">Delivered</p>
                          <p className="text-lg font-bold text-white">{abComparison.variantA.delivered}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-zinc-500 uppercase font-semibold">Replies</p>
                          <p className="text-lg font-bold text-white">{abComparison.variantA.replied}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-zinc-500 uppercase font-semibold">Read Rate</p>
                          <p className="text-lg font-bold text-blue-300">{abComparison.variantA.readRate}%</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-zinc-500 uppercase font-semibold">Reply Rate</p>
                          <p className="text-lg font-bold text-emerald-400">{abComparison.variantA.replyRate}%</p>
                        </div>
                      </div>
                    </div>

                    {/* Card B */}
                    <div className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-violet-400 uppercase tracking-wider">Variant B</span>
                        <span className="text-[11px] text-zinc-400 truncate max-w-[200px]">{abComparison.variantB.name}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/[0.06]">
                        <div>
                          <p className="text-[10px] text-zinc-500 uppercase font-semibold">Delivered</p>
                          <p className="text-lg font-bold text-white">{abComparison.variantB.delivered}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-zinc-500 uppercase font-semibold">Replies</p>
                          <p className="text-lg font-bold text-white">{abComparison.variantB.replied}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-zinc-500 uppercase font-semibold">Read Rate</p>
                          <p className="text-lg font-bold text-violet-300">{abComparison.variantB.readRate}%</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-zinc-500 uppercase font-semibold">Reply Rate</p>
                          <p className="text-lg font-bold text-emerald-400">{abComparison.variantB.replyRate}%</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-6 text-xs text-zinc-500 text-center py-6">
                  Select two different campaigns above to compare performance metrics.
                </p>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: CRM AUDIENCE SEGMENTS */}
        {activeTab === "segments" && (
          <div className="mt-6 space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { id: "all", label: "All CRM Contacts", count: summary.audienceCounts.all, desc: "Total unified contact database", color: "text-blue-400" },
                { id: "leads", label: "New Leads", count: summary.audienceCounts.leads, desc: "Inbound prospects awaiting qualification", color: "text-emerald-400" },
                { id: "prospects", label: "Qualified Prospects", count: summary.audienceCounts.prospects, desc: "High buying intent deals in pipeline", color: "text-violet-400" },
                { id: "customers", label: "Active Customers", count: summary.audienceCounts.customers, desc: "Retained accounts with active billing", color: "text-amber-400" },
              ].map((seg) => (
                <div key={seg.id} className="rounded-2xl border border-white/[0.08] bg-[#111216] p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase text-zinc-400">{seg.label}</p>
                    <Users size={16} className={seg.color} />
                  </div>
                  <p className="text-3xl font-bold text-white">{seg.count}</p>
                  <p className="text-[11px] text-zinc-500">{seg.desc}</p>
                  <button
                    type="button"
                    onClick={() => openBroadcastModal(undefined, seg.id as any)}
                    className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 py-2 text-xs font-semibold text-white hover:bg-white/10 transition"
                  >
                    <Send size={12} />
                    <span>Broadcast to Segment</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CREATE / EDIT MODAL */}
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0E0F14] p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                <h3 className="text-base font-semibold text-white">
                  {editingCampaign ? "Edit Campaign" : "New Marketing Campaign"}
                </h3>
                <button onClick={() => setModalOpen(false)} className="text-zinc-400 hover:text-white">
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSaveCampaign} className="space-y-4 text-xs">
                <div>
                  <label className="block font-medium text-zinc-400">Campaign Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. VIP Founder WhatsApp Invite"
                    className="mt-1 w-full rounded-xl border border-white/10 bg-[#12141A] p-2.5 text-white focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-zinc-400">Channel</label>
                    <select
                      value={channel}
                      onChange={(e) => setChannel(e.target.value as any)}
                      disabled={!!editingCampaign}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-[#12141A] p-2.5 text-white focus:outline-none"
                    >
                      <option value="whatsapp">WhatsApp Broadcast</option>
                      <option value="email">Email Campaign</option>
                      <option value="sms">Direct SMS</option>
                      <option value="social">Social Post</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-medium text-zinc-400">Target Segment</label>
                    <select
                      value={segment}
                      onChange={(e) => setSegment(e.target.value as any)}
                      disabled={!!editingCampaign}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-[#12141A] p-2.5 text-white focus:outline-none"
                    >
                      <option value="leads">New Leads</option>
                      <option value="prospects">Qualified Prospects</option>
                      <option value="customers">Active Customers</option>
                      <option value="all">All CRM Contacts</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block font-medium text-zinc-400">Message Template</label>
                  <textarea
                    rows={4}
                    value={messageTemplate}
                    onChange={(e) => setMessageTemplate(e.target.value)}
                    placeholder="Use {{name}} for customer personalization..."
                    className="mt-1 w-full rounded-xl border border-white/10 bg-[#12141A] p-3 text-white focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/[0.08]">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="rounded-xl border border-white/10 px-4 py-2 text-zinc-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-xl bg-white px-5 py-2 font-semibold text-black hover:bg-zinc-200"
                  >
                    {saving ? "Saving..." : "Save Campaign"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* BROADCAST LAUNCH MODAL */}
        {broadcastModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0E0F14] p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                <div className="flex items-center gap-2">
                  <Send size={15} className="text-violet-400" />
                  <h3 className="text-base font-semibold text-white">Direct Audience Broadcast</h3>
                </div>
                <button onClick={() => setBroadcastModalOpen(false)} className="text-zinc-400 hover:text-white">
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleExecuteBroadcast} className="space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-zinc-400">Delivery Channel</label>
                    <select
                      value={broadcastChannel}
                      onChange={(e) => setBroadcastChannel(e.target.value as any)}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-[#12141A] p-2.5 text-white focus:outline-none"
                    >
                      <option value="whatsapp">WhatsApp Cloud API</option>
                      <option value="email">Email Sequence</option>
                      <option value="sms">Direct SMS</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-medium text-zinc-400">Target Segment</label>
                    <select
                      value={broadcastSegment}
                      onChange={(e) => setBroadcastSegment(e.target.value as any)}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-[#12141A] p-2.5 text-white focus:outline-none"
                    >
                      <option value="leads">New Leads</option>
                      <option value="prospects">Qualified Prospects</option>
                      <option value="customers">Active Customers</option>
                      <option value="all">All CRM Contacts</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block font-medium text-zinc-400">Message Content</label>
                  <textarea
                    rows={4}
                    value={broadcastTemplate}
                    onChange={(e) => setBroadcastTemplate(e.target.value)}
                    placeholder="Broadcast text..."
                    className="mt-1 w-full rounded-xl border border-white/10 bg-[#12141A] p-3 text-white focus:outline-none"
                  />
                  <p className="mt-1 text-[11px] text-zinc-500">
                    Dispatches in batches with automatic throttling and latency management.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/[0.08]">
                  <button
                    type="button"
                    onClick={() => setBroadcastModalOpen(false)}
                    className="rounded-xl border border-white/10 px-4 py-2 text-zinc-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={broadcasting}
                    className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-violet-600 px-5 py-2 font-semibold text-white shadow-lg shadow-blue-500/20 hover:brightness-110 disabled:opacity-50"
                  >
                    {broadcasting ? <RefreshCw size={13} className="animate-spin" /> : <Send size={13} />}
                    <span>{broadcasting ? "Dispatching..." : "Launch Broadcast"}</span>
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