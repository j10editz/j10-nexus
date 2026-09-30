"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Sparkles,
  Send,
  Star,
  Users,
  Layers,
  ArrowRight,
  RefreshCw,
  Plus,
  MessageSquare,
  Clock,
  CheckCircle2,
} from "lucide-react";

export default function J10GrowthPage() {
  const [activeTab, setActiveTab] = useState<"campaigns" | "reviews" | "followups" | "forms">("campaigns");
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCampaigns = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/marketing/campaigns");
      if (res.ok) {
        const json = await res.json();
        setCampaigns(json.campaigns || []);
      }
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCampaigns();
  }, [fetchCampaigns]);

  return (
    <div className="min-h-[calc(100dvh-72px)] bg-[#07090f] p-4 sm:p-6 lg:p-8 text-white">
      <div className="mx-auto max-w-[1360px] space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 border-b border-white/[0.08] pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-cyan-400">
              <span>J10 NEXUS</span>
              <span className="text-white/20">/</span>
              <span className="text-[#8d96a8]">Revenue Acceleration</span>
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              J10 Growth
            </h1>
            <p className="mt-1 text-xs text-[#8d96a8]">
              Automate customer reviews, promotional campaigns, reactivation sequences, and inbound lead forms.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/marketing"
              className="flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-2 text-xs font-medium text-[#8d96a8] transition hover:bg-white/[0.07] hover:text-white"
            >
              <span>Broadcast Center</span>
            </Link>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="flex items-center gap-2 border-b border-white/[0.06] pb-2">
          <button
            type="button"
            onClick={() => setActiveTab("campaigns")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              activeTab === "campaigns"
                ? "bg-white/10 text-white"
                : "text-[#8d96a8] hover:text-white"
            }`}
          >
            J10 Campaigns ({campaigns.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("reviews")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              activeTab === "reviews"
                ? "bg-white/10 text-white"
                : "text-[#8d96a8] hover:text-white"
            }`}
          >
            J10 Reviews
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("followups")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              activeTab === "followups"
                ? "bg-white/10 text-white"
                : "text-[#8d96a8] hover:text-white"
            }`}
          >
            Follow-Up & Reactivation
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("forms")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              activeTab === "forms"
                ? "bg-white/10 text-white"
                : "text-[#8d96a8] hover:text-white"
            }`}
          >
            Lead Forms
          </button>
        </div>

        {/* Tab 1: Campaigns */}
        {activeTab === "campaigns" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Outbound Campaigns</h2>
              <Link
                href="/dashboard/marketing"
                className="rounded-xl bg-cyan-500/10 border border-cyan-500/20 px-3 py-1.5 text-xs font-semibold text-cyan-300 transition hover:bg-cyan-500/15"
              >
                Create Campaign
              </Link>
            </div>

            {campaigns.length === 0 ? (
              <div className="rounded-2xl border border-white/[0.06] bg-[#111216] p-8 text-center">
                <Send className="mx-auto h-8 w-8 text-[#8d96a8]" />
                <h3 className="mt-3 text-sm font-semibold text-white">No Campaigns Created Yet</h3>
                <p className="mt-1 max-w-sm mx-auto text-xs text-[#8d96a8]">
                  Launch automated promotional broadcasts or reactivation messages across WhatsApp and Telegram.
                </p>
                <div className="mt-4">
                  <Link
                    href="/dashboard/marketing"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/15"
                  >
                    <span>Launch First Campaign</span>
                    <ArrowRight size={13} />
                  </Link>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.06] rounded-2xl border border-white/[0.07] bg-[#111216]">
                {campaigns.map((c) => (
                  <div key={c.id} className="flex items-center justify-between p-4">
                    <div>
                      <div className="text-xs font-semibold text-white">{c.name || "Campaign"}</div>
                      <div className="text-[11px] text-[#8d96a8]">{c.channel || "Omnichannel"}</div>
                    </div>
                    <span className="rounded-full bg-white/[0.06] px-2.5 py-0.5 text-[10px] font-semibold text-cyan-300">
                      {c.status || "Draft"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Reviews (Truthful Coming Soon with clear architecture) */}
        {activeTab === "reviews" && (
          <div className="rounded-2xl border border-white/[0.07] bg-[#111216] p-8 text-center space-y-4">
            <Star className="mx-auto h-10 w-10 text-amber-400" />
            <h2 className="text-base font-semibold text-white">J10 Reviews</h2>
            <p className="max-w-md mx-auto text-xs text-[#8d96a8]">
              Automated post-service review collection workflow. When a booking or payment completes, J10 AI sends a polite review request via WhatsApp or SMS and routes happy customers to your Google Business Profile.
            </p>
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-300">
              <span>Coming Soon in Phase 3B</span>
            </div>
          </div>
        )}

        {/* Tab 3: Follow-Up & Reactivation */}
        {activeTab === "followups" && (
          <div className="rounded-2xl border border-white/[0.07] bg-[#111216] p-6 space-y-4">
            <h2 className="text-sm font-semibold text-white">Reactivation Sequences</h2>
            <p className="text-xs text-[#8d96a8]">
              Automatically re-engage leads who did not book or customers who have not visited in 60+ days.
            </p>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-xs space-y-2">
              <div className="font-semibold text-white">Stale Lead Recovery</div>
              <p className="text-[#8d96a8]">
                Targets leads with no contact in 14 days with an automated check-in and special offer.
              </p>
              <Link
                href="/dashboard/crm?status=Contacted"
                className="inline-block mt-2 text-cyan-400 hover:text-cyan-300 font-semibold"
              >
                Review Inactive Contacts in J10 Lead Center &rarr;
              </Link>
            </div>
          </div>
        )}

        {/* Tab 4: Forms */}
        {activeTab === "forms" && (
          <div className="rounded-2xl border border-white/[0.07] bg-[#111216] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-white">Website Lead Funnels & Forms</h2>
                <p className="text-xs text-[#8d96a8]">
                  Embeddable lead intake forms and hosted landing pages connecting directly into J10 Lead Center.
                </p>
              </div>
              <Link
                href="/dashboard/website"
                className="rounded-xl bg-white/10 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-white/15"
              >
                Open Site & Form Builder
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
