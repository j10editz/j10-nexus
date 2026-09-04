"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Copy,
  Edit3,
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
  Trash2,
  Users,
  X,
  Zap,
} from "lucide-react";
import type {
  AudienceSegment,
  CampaignChannel,
  CopyVariation,
  GenerateCopyResult,
  MarketingCampaign,
  MarketingSummary,
} from "@/types/marketing";
import { CHANNEL_LABELS, SEGMENT_LABELS } from "@/lib/marketing/service";

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
      "Hi {{name}}! We are offering an exclusive 20% discount on J10 NEXUS Growth plans for the next 48 hours. Claim your code by replying FLASH20 directly to this message!",
  },
  {
    name: "Quarterly Platform Upgrade Announcement",
    channel: "email" as CampaignChannel,
    segment: "customers" as AudienceSegment,
    template:
      "Dear {{name}},\n\nWe are thrilled to announce that J10 NEXUS Company Brain and WhatsApp Live Health Telemetry are now officially live in your workspace. Explore your new capabilities today!",
  },
  {
    name: "Lead Re-Engagement Sequence",
    channel: "sms" as CampaignChannel,
    segment: "prospects" as AudienceSegment,
    template:
      "Hi {{name}}, are you still looking to automate your business customer conversations? Reply YES for a personalized 1-on-1 walkthrough.",
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
  const [activeTab, setActiveTab] = useState<"campaigns" | "copy_studio" | "segments">("campaigns");
  const [channelFilter, setChannelFilter] = useState<CampaignChannel | "all">("all");
  const [search, setSearch] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Create / Edit modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<MarketingCampaign | null>(null);
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<CampaignChannel>("whatsapp");
  const [segment, setSegment] = useState<AudienceSegment>("leads");
  const [messageTemplate, setMessageTemplate] = useState("");
  const [saving, setSaving] = useState(false);

  // Copy Studio state
  const [copyObjective, setCopyObjective] = useState("");
  const [copyChannel, setCopyChannel] = useState<CampaignChannel>("whatsapp");
  const [copyTone, setCopyTone] = useState("High Conversion & Direct");
  const [copySegment, setCopySegment] = useState<AudienceSegment>("leads");
  const [generatingCopy, setGeneratingCopy] = useState(false);
  const [copyResult, setCopyResult] = useState<GenerateCopyResult | null>(null);

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
      setCampaigns(data.campaigns ?? []);
      if (data.summary) {
        setSummary(data.summary);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Load failed.");
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

  function openCreateModal(template?: (typeof SAMPLE_CAMPAIGN_TEMPLATES)[number]) {
    setEditingCampaign(null);
    setName(template?.name ?? "");
    setChannel(template?.channel ?? "whatsapp");
    setSegment(template?.segment ?? "leads");
    setMessageTemplate(template?.template ?? "");
    setModalOpen(true);
  }

  function openEditModal(c: MarketingCampaign) {
    setEditingCampaign(c);
    setName(c.name);
    setChannel(c.channel);
    setSegment(c.audience_segment);
    setMessageTemplate(c.message_template);
    setModalOpen(true);
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
            name: name.trim(),
            message_template: messageTemplate.trim(),
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
            name: name.trim(),
            channel,
            audience_segment: segment,
            message_template: messageTemplate.trim(),
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

  async function handleSimulateSend(id: string) {
    setErrorMessage("");
    try {
      const response = await fetch(`/api/marketing/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ simulate_send: true }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Could not execute broadcast.");
      }
      setSuccessMessage("Broadcast simulated: Messages dispatched to recipient list.");
      await loadData();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Send failed.");
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
          objective: copyObjective.trim(),
          channel: copyChannel,
          tone: copyTone,
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

  function applyVariationToCampaign(variation: CopyVariation) {
    setName(`${copyObjective.slice(0, 30)} - ${variation.title}`);
    setChannel(copyChannel);
    setSegment(copySegment);
    setMessageTemplate(variation.fullCopy);
    setModalOpen(true);
  }

  return (
    <div className="min-h-full bg-[#09090B] text-white">
      <div className="mx-auto max-w-[1500px] px-6 py-8 lg:px-8">
        {/* HEADER */}
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
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
              Launch high-conversion broadcasts, generate grounded copywriting with Gemini, and engage
              verified CRM audience segments across WhatsApp, Email, and SMS.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void loadData()}
              disabled={loading}
              className="flex items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-[#111216] px-4 py-2.5 text-sm text-zinc-300 transition hover:bg-white/[0.05] disabled:opacity-40"
            >
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
              Sync
            </button>

            <button
              type="button"
              onClick={() => openCreateModal()}
              className="flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-zinc-200"
            >
              <Plus size={16} />
              New Campaign
            </button>
          </div>
        </div>

        {/* ALERTS */}
        {errorMessage && (
          <div className="mt-6 flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            <AlertTriangle size={16} />
            {errorMessage}
          </div>
        )}

        {successMessage && (
          <div className="mt-6 flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
            <CheckCircle2 size={16} />
            {successMessage}
          </div>
        )}

        {/* METRICS */}
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-white/[0.07] bg-[#111216] p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10">
              <Send size={18} className="text-violet-400" />
            </div>
            <p className="mt-5 text-sm text-zinc-400">Total Campaigns</p>
            <p className="mt-1 text-2xl font-semibold">{summary.totalCampaigns}</p>
          </div>

          <div className="rounded-2xl border border-white/[0.07] bg-[#111216] p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
              <Users size={18} className="text-blue-400" />
            </div>
            <p className="mt-5 text-sm text-zinc-400">Audience Reached</p>
            <p className="mt-1 text-2xl font-semibold text-blue-400">
              {summary.totalAudienceReached.toLocaleString()} recipients
            </p>
          </div>

          <div className="rounded-2xl border border-white/[0.07] bg-[#111216] p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
              <Radio size={18} className="text-emerald-400" />
            </div>
            <p className="mt-5 text-sm text-zinc-400">Active Broadcasts</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-400">
              {summary.activeBroadcasts}
            </p>
          </div>

          <div className="rounded-2xl border border-white/[0.07] bg-[#111216] p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10">
              <BarChart3 size={18} className="text-amber-400" />
            </div>
            <p className="mt-5 text-sm text-zinc-400">Avg Engagement Rate</p>
            <p className="mt-1 text-2xl font-semibold text-amber-300">
              {summary.avgEngagementRate}%
            </p>
          </div>
        </div>

        {/* TABS */}
        <div className="mt-8 flex items-center justify-between border-b border-white/[0.08] pb-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("campaigns")}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${
                activeTab === "campaigns"
                  ? "bg-white/[0.08] text-white shadow-sm"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <Send size={16} />
              Broadcast Campaigns ({campaigns.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("copy_studio")}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${
                activeTab === "copy_studio"
                  ? "bg-violet-500/20 text-violet-300 shadow-sm border border-violet-500/30"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <Sparkles size={16} className="text-violet-400" />
              AI Copy Studio
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("segments")}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${
                activeTab === "segments"
                  ? "bg-white/[0.08] text-white shadow-sm"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <Users size={16} />
              CRM Audience Segments
            </button>
          </div>
        </div>

        {/* TAB 1: CAMPAIGNS */}
        {activeTab === "campaigns" && (
          <div className="mt-6 space-y-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative w-full max-w-md">
                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search campaigns..."
                  className="w-full rounded-xl border border-white/[0.08] bg-[#111216] py-2.5 pl-11 pr-4 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-violet-500/40"
                />
              </div>

              <div className="flex flex-wrap gap-1.5">
                {(["all", "whatsapp", "email", "sms", "social"] as const).map((ch) => (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => setChannelFilter(ch)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-medium transition ${
                      channelFilter === ch
                        ? "bg-white text-black font-semibold"
                        : "border border-white/[0.06] bg-[#111216] text-zinc-400 hover:text-white"
                    }`}
                  >
                    {ch === "all" ? "All Channels" : CHANNEL_LABELS[ch]}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-56 animate-pulse rounded-2xl border border-white/[0.06] bg-[#111216]" />
                ))}
              </div>
            ) : filteredCampaigns.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/[0.1] bg-[#111216]/50 p-12 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-400">
                  <Send size={24} />
                </div>
                <h3 className="mt-4 text-lg font-semibold">No marketing campaigns created yet</h3>
                <p className="mx-auto mt-2 max-w-md text-sm text-zinc-400">
                  Engage your CRM leads with broadcast announcements and flash offers. Choose a ready-made template to launch in seconds.
                </p>

                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  {SAMPLE_CAMPAIGN_TEMPLATES.map((tpl) => (
                    <button
                      key={tpl.name}
                      type="button"
                      onClick={() => openCreateModal(tpl)}
                      className="rounded-xl border border-white/[0.08] bg-[#111216] px-3.5 py-2 text-xs text-zinc-300 transition hover:border-violet-500/30 hover:text-white"
                    >
                      + {tpl.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredCampaigns.map((c) => {
                  const Icon = CHANNEL_ICONS[c.channel] || MessageSquare;
                  return (
                    <div
                      key={c.id}
                      className="flex flex-col justify-between rounded-2xl border border-white/[0.07] bg-[#111216] p-5 transition hover:border-white/[0.12]"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400">
                              <Icon size={15} />
                            </div>
                            <span className="text-xs font-semibold text-zinc-300">
                              {CHANNEL_LABELS[c.channel] || c.channel}
                            </span>
                          </div>

                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                              c.status === "completed"
                                ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                                : c.status === "scheduled"
                                  ? "border border-blue-500/20 bg-blue-500/10 text-blue-300"
                                  : "border border-zinc-700 bg-zinc-800 text-zinc-400"
                            }`}
                          >
                            {c.status}
                          </span>
                        </div>

                        <h3 className="mt-4 text-base font-semibold text-white">{c.name}</h3>

                        <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
                          <span>Target: {SEGMENT_LABELS[c.audience_segment] || c.audience_segment}</span>
                          <span>·</span>
                          <span>{c.target_count} recipients</span>
                        </div>

                        <p className="mt-3 line-clamp-3 rounded-xl border border-white/[0.05] bg-black/20 p-3 text-xs leading-5 text-zinc-400">
                          {c.message_template}
                        </p>
                      </div>

                      <div className="mt-5 border-t border-white/[0.06] pt-4">
                        <div className="grid grid-cols-4 gap-1 text-center text-xs">
                          <div className="rounded-lg bg-black/30 p-1.5">
                            <span className="text-[10px] text-zinc-500">Sent</span>
                            <p className="font-semibold text-white">{c.sent_count}</p>
                          </div>
                          <div className="rounded-lg bg-black/30 p-1.5">
                            <span className="text-[10px] text-zinc-500">Delivered</span>
                            <p className="font-semibold text-blue-400">{c.delivered_count}</p>
                          </div>
                          <div className="rounded-lg bg-black/30 p-1.5">
                            <span className="text-[10px] text-zinc-500">Read</span>
                            <p className="font-semibold text-emerald-400">{c.read_count}</p>
                          </div>
                          <div className="rounded-lg bg-black/30 p-1.5">
                            <span className="text-[10px] text-zinc-500">Replied</span>
                            <p className="font-semibold text-amber-300">{c.replied_count}</p>
                          </div>
                        </div>

                        <div className="mt-4 flex items-center justify-between">
                          {c.status === "draft" ? (
                            <button
                              type="button"
                              onClick={() => void handleSimulateSend(c.id)}
                              className="flex items-center gap-1.5 rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-xs font-semibold text-violet-300 transition hover:bg-violet-500/20"
                            >
                              <Play size={12} />
                              Dispatch Broadcast
                            </button>
                          ) : (
                            <span className="text-[11px] text-zinc-500">
                              Completed {c.completed_at ? new Date(c.completed_at).toLocaleDateString() : ""}
                            </span>
                          )}

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEditModal(c)}
                              className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/[0.05] hover:text-white"
                              title="Edit"
                            >
                              <Edit3 size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteCampaign(c.id)}
                              className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-500/10 hover:text-red-400"
                              title="Delete"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: AI COPY STUDIO */}
        {activeTab === "copy_studio" && (
          <div className="mt-6 grid gap-6 lg:grid-cols-12">
            <div className="space-y-4 lg:col-span-5">
              <form
                onSubmit={handleGenerateCopy}
                className="rounded-2xl border border-white/[0.07] bg-[#111216] p-6 space-y-4"
              >
                <div className="flex items-center gap-2">
                  <Sparkles size={18} className="text-violet-400" />
                  <h2 className="text-base font-semibold">Gemini Copywriting Engine</h2>
                </div>
                <p className="text-xs text-zinc-400">
                  Generate 3 variations grounded in your Company Brain products, prices, and policies.
                </p>

                <div>
                  <label className="block text-xs font-medium text-zinc-400">Campaign Objective *</label>
                  <textarea
                    value={copyObjective}
                    onChange={(e) => setCopyObjective(e.target.value)}
                    placeholder="e.g. Announce 20% discount on Starter plan or re-engage leads who haven't responded..."
                    rows={3}
                    required
                    className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-[#090a0d] p-3 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-violet-500/40"
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-zinc-400">Channel</label>
                    <select
                      value={copyChannel}
                      onChange={(e) => setCopyChannel(e.target.value as CampaignChannel)}
                      className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-[#090a0d] px-3 py-2 text-xs text-white outline-none"
                    >
                      <option value="whatsapp">WhatsApp</option>
                      <option value="email">Email</option>
                      <option value="sms">SMS</option>
                      <option value="social">Social</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-400">Target Segment</label>
                    <select
                      value={copySegment}
                      onChange={(e) => setCopySegment(e.target.value as AudienceSegment)}
                      className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-[#090a0d] px-3 py-2 text-xs text-white outline-none"
                    >
                      <option value="leads">New Leads</option>
                      <option value="prospects">Prospects</option>
                      <option value="customers">Customers</option>
                      <option value="all">All Contacts</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-400">Tone of Voice</label>
                  <input
                    value={copyTone}
                    onChange={(e) => setCopyTone(e.target.value)}
                    placeholder="e.g. Urgent, High ROI, Warm & Friendly"
                    className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-[#090a0d] px-3 py-2 text-xs text-white outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={generatingCopy || !copyObjective.trim()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-white py-2.5 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:opacity-40"
                >
                  {generatingCopy ? (
                    <>
                      <RefreshCw size={15} className="animate-spin" />
                      Generating with Gemini...
                    </>
                  ) : (
                    <>
                      <Sparkles size={15} />
                      Generate 3 Copy Variations
                    </>
                  )}
                </button>
              </form>
            </div>

            <div className="space-y-4 lg:col-span-7">
              {copyResult ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-violet-400">
                      Grounded Copy Variations
                    </span>
                    <span className="text-[11px] text-zinc-500">
                      {copyResult.model} · {copyResult.latencyMs}ms
                    </span>
                  </div>

                  {copyResult.variations.map((variation, idx) => (
                    <div
                      key={variation.id}
                      className="rounded-2xl border border-white/[0.07] bg-[#111216] p-5 transition hover:border-violet-500/30"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="rounded-lg border border-violet-500/20 bg-violet-500/10 px-2.5 py-0.5 text-xs font-semibold text-violet-300">
                          Variation {idx + 1}: {variation.title}
                        </span>

                        <button
                          type="button"
                          onClick={() => applyVariationToCampaign(variation)}
                          className="flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-black hover:bg-zinc-200"
                        >
                          <Plus size={13} />
                          Use in Campaign
                        </button>
                      </div>

                      <div className="mt-3 rounded-xl border border-white/[0.06] bg-[#090a0d] p-4 text-xs leading-relaxed text-zinc-200 whitespace-pre-wrap">
                        {variation.fullCopy}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.08] bg-[#111216]/30 p-12 text-center text-zinc-500">
                  <Sparkles size={32} className="text-zinc-600" />
                  <p className="mt-3 text-sm">Generated marketing copy will appear here.</p>
                  <p className="mt-1 text-xs text-zinc-600">
                    Grounded in your Company Knowledge with zero hallucination.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: CRM SEGMENTS */}
        {activeTab === "segments" && (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-white/[0.07] bg-[#111216] p-5 flex flex-col justify-between">
              <div>
                <span className="text-xs font-semibold text-zinc-400">Total CRM Contacts</span>
                <p className="mt-2 text-3xl font-bold">{summary.audienceCounts.all}</p>
                <p className="mt-1 text-xs text-zinc-500">Every verified contact in CRM</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSegment("all");
                  openCreateModal();
                }}
                className="mt-6 flex items-center justify-between rounded-xl border border-white/[0.08] bg-[#090a0d] p-3 text-xs text-zinc-300 hover:border-violet-500/30 hover:text-white"
              >
                <span>Broadcast to All</span>
                <ArrowUpRight size={14} />
              </button>
            </div>

            <div className="rounded-2xl border border-white/[0.07] bg-[#111216] p-5 flex flex-col justify-between">
              <div>
                <span className="text-xs font-semibold text-violet-400">New Leads</span>
                <p className="mt-2 text-3xl font-bold text-violet-300">{summary.audienceCounts.leads}</p>
                <p className="mt-1 text-xs text-zinc-500">Uncontacted & top-of-funnel</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSegment("leads");
                  openCreateModal();
                }}
                className="mt-6 flex items-center justify-between rounded-xl border border-violet-500/20 bg-violet-500/10 p-3 text-xs text-violet-300 hover:bg-violet-500/15"
              >
                <span>Campaign for Leads</span>
                <ArrowUpRight size={14} />
              </button>
            </div>

            <div className="rounded-2xl border border-white/[0.07] bg-[#111216] p-5 flex flex-col justify-between">
              <div>
                <span className="text-xs font-semibold text-blue-400">Qualified Prospects</span>
                <p className="mt-2 text-3xl font-bold text-blue-300">{summary.audienceCounts.prospects}</p>
                <p className="mt-1 text-xs text-zinc-500">Engaged with clear buying intent</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSegment("prospects");
                  openCreateModal();
                }}
                className="mt-6 flex items-center justify-between rounded-xl border border-blue-500/20 bg-blue-500/10 p-3 text-xs text-blue-300 hover:bg-blue-500/15"
              >
                <span>Campaign for Prospects</span>
                <ArrowUpRight size={14} />
              </button>
            </div>

            <div className="rounded-2xl border border-white/[0.07] bg-[#111216] p-5 flex flex-col justify-between">
              <div>
                <span className="text-xs font-semibold text-emerald-400">Active Customers</span>
                <p className="mt-2 text-3xl font-bold text-emerald-400">{summary.audienceCounts.customers}</p>
                <p className="mt-1 text-xs text-zinc-500">Deals won & existing clients</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSegment("customers");
                  openCreateModal();
                }}
                className="mt-6 flex items-center justify-between rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-300 hover:bg-emerald-500/15"
              >
                <span>Upsell / Retention Blast</span>
                <ArrowUpRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* CREATE / EDIT MODAL */}
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <div className="w-full max-w-xl rounded-2xl border border-white/[0.08] bg-[#111216] p-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-4">
                <div className="flex items-center gap-2">
                  <Send size={18} className="text-violet-400" />
                  <h3 className="text-lg font-semibold">
                    {editingCampaign ? "Edit Campaign" : "New Marketing Campaign"}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg p-1.5 text-zinc-400 hover:text-white"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSaveCampaign} className="mt-5 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-400">Campaign Name *</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. VIP Re-Engagement Offer"
                    required
                    className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-[#090a0d] px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-violet-500/40"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-zinc-400">Channel</label>
                    <select
                      value={channel}
                      onChange={(e) => setChannel(e.target.value as CampaignChannel)}
                      className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-[#090a0d] px-3.5 py-2.5 text-sm text-white outline-none"
                    >
                      <option value="whatsapp">WhatsApp Broadcast</option>
                      <option value="email">Email Campaign</option>
                      <option value="sms">Direct SMS</option>
                      <option value="social">Social Post</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-400">Target Segment</label>
                    <select
                      value={segment}
                      onChange={(e) => setSegment(e.target.value as AudienceSegment)}
                      className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-[#090a0d] px-3.5 py-2.5 text-sm text-white outline-none"
                    >
                      <option value="leads">New Leads ({summary.audienceCounts.leads})</option>
                      <option value="prospects">Qualified Prospects ({summary.audienceCounts.prospects})</option>
                      <option value="customers">Active Customers ({summary.audienceCounts.customers})</option>
                      <option value="all">All Contacts ({summary.audienceCounts.all})</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-400">Message Template *</label>
                  <textarea
                    value={messageTemplate}
                    onChange={(e) => setMessageTemplate(e.target.value)}
                    placeholder="Write your broadcast copy here. Supports {{name}} token replacement..."
                    rows={6}
                    required
                    className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-[#090a0d] p-3.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-violet-500/40"
                  />
                </div>

                <div className="flex justify-end gap-3 border-t border-white/[0.06] pt-4">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="rounded-xl border border-white/[0.08] px-4 py-2 text-sm text-zinc-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex items-center gap-2 rounded-xl bg-white px-5 py-2 text-sm font-semibold text-black hover:bg-zinc-200 disabled:opacity-40"
                  >
                    {saving && <RefreshCw size={14} className="animate-spin" />}
                    {editingCampaign ? "Save Changes" : "Create Campaign"}
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