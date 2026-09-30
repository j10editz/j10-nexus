"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Send,
  Star,
  ArrowRight,
} from "lucide-react";
import {
  DashboardPageHeader,
  DashboardButton,
} from "../../../components/dashboard/DashboardPrimitives";

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
    <div className="min-h-[calc(100dvh-56px)] bg-[#090B10] px-4 py-6 sm:px-6 lg:px-8 text-[#F5F7FA]">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Page Header */}
        <DashboardPageHeader
          title="J10 Growth"
          subtitle="Automate customer reviews, promotional campaigns, reactivation sequences, and inbound lead forms."
          actions={
            <Link
              href="/dashboard/marketing"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#242A35] bg-[#101319] px-3 py-1.5 text-xs font-medium text-[#98A2B3] transition hover:bg-[#151922] hover:text-[#F5F7FA]"
            >
              <span>Broadcast Center</span>
              <ArrowRight size={12} />
            </Link>
          }
        />

        {/* Tab Controls */}
        <div className="flex items-center gap-1 border-b border-[#242A35] pb-2 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("campaigns")}
            className={`rounded-md px-3 py-1.5 font-medium transition ${
              activeTab === "campaigns"
                ? "bg-[#151922] text-[#F5F7FA] border border-[#242A35]"
                : "text-[#98A2B3] hover:text-[#F5F7FA]"
            }`}
          >
            Campaigns ({campaigns.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("reviews")}
            className={`rounded-md px-3 py-1.5 font-medium transition ${
              activeTab === "reviews"
                ? "bg-[#151922] text-[#F5F7FA] border border-[#242A35]"
                : "text-[#98A2B3] hover:text-[#F5F7FA]"
            }`}
          >
            Customer Reviews
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("followups")}
            className={`rounded-md px-3 py-1.5 font-medium transition ${
              activeTab === "followups"
                ? "bg-[#151922] text-[#F5F7FA] border border-[#242A35]"
                : "text-[#98A2B3] hover:text-[#F5F7FA]"
            }`}
          >
            Reactivation Sequences
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("forms")}
            className={`rounded-md px-3 py-1.5 font-medium transition ${
              activeTab === "forms"
                ? "bg-[#151922] text-[#F5F7FA] border border-[#242A35]"
                : "text-[#98A2B3] hover:text-[#F5F7FA]"
            }`}
          >
            Lead Forms
          </button>
        </div>

        {/* Tab 1: Campaigns */}
        {activeTab === "campaigns" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[#98A2B3]">
                Outbound Campaigns
              </h2>
              <Link
                href="/dashboard/marketing"
                className="rounded-lg bg-[#4F7CFF] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#4F7CFF]/90"
              >
                Create Campaign
              </Link>
            </div>

            {campaigns.length === 0 ? (
              <div className="rounded-xl border border-[#242A35] bg-[#101319] p-8 text-center">
                <Send className="mx-auto h-7 w-7 text-[#667085]" />
                <h3 className="mt-3 text-sm font-semibold text-[#F5F7FA]">No Campaigns Created Yet</h3>
                <p className="mt-1 max-w-sm mx-auto text-xs text-[#98A2B3]">
                  Launch automated promotional broadcasts or reactivation messages across WhatsApp and Telegram.
                </p>
                <div className="mt-4">
                  <Link
                    href="/dashboard/marketing"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#242A35] bg-[#151922] px-3.5 py-1.5 text-xs font-medium text-[#F5F7FA] transition hover:bg-[#242A35]"
                  >
                    <span>Launch First Campaign</span>
                    <ArrowRight size={12} />
                  </Link>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-[#242A35] rounded-xl border border-[#242A35] bg-[#101319]">
                {campaigns.map((c) => (
                  <div key={c.id} className="flex items-center justify-between p-4">
                    <div>
                      <div className="text-xs font-semibold text-[#F5F7FA]">{c.name || "Campaign"}</div>
                      <div className="text-[11px] text-[#98A2B3]">{c.channel || "Omnichannel"}</div>
                    </div>
                    <span className="rounded border border-[#242A35] bg-[#151922] px-2 py-0.5 text-[10px] font-medium text-[#98A2B3]">
                      {c.status || "Draft"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Reviews */}
        {activeTab === "reviews" && (
          <div className="rounded-xl border border-[#242A35] bg-[#101319] p-8 text-center space-y-3">
            <Star className="mx-auto h-8 w-8 text-amber-400" />
            <h2 className="text-sm font-semibold text-[#F5F7FA]">Automated Review Collection</h2>
            <p className="max-w-md mx-auto text-xs text-[#98A2B3]">
              Automated post-service review collection workflow. When a booking or payment completes, J10 AI sends a polite review request via WhatsApp or SMS and routes satisfied customers to your Google Business Profile.
            </p>
            <div className="inline-flex items-center gap-1.5 rounded border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-300">
              <span>Available in Phase 3B</span>
            </div>
          </div>
        )}

        {/* Tab 3: Follow-Up & Reactivation */}
        {activeTab === "followups" && (
          <div className="rounded-xl border border-[#242A35] bg-[#101319] p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-[#F5F7FA]">Reactivation Sequences</h2>
              <p className="mt-0.5 text-xs text-[#98A2B3]">
                Automatically re-engage leads who did not book or customers who have not visited in 60+ days.
              </p>
            </div>
            <div className="rounded-lg border border-[#242A35] bg-[#151922] p-4 text-xs space-y-2">
              <div className="font-semibold text-[#F5F7FA]">Stale Lead Recovery</div>
              <p className="text-[11px] text-[#98A2B3]">
                Targets leads with no contact in 14 days with an automated check-in and special offer.
              </p>
              <Link
                href="/dashboard/crm?status=Contacted"
                className="inline-flex items-center gap-1 text-xs font-medium text-[#4F7CFF] hover:underline"
              >
                <span>Review Inactive Contacts in J10 Lead Center</span>
                <ArrowRight size={12} />
              </Link>
            </div>
          </div>
        )}

        {/* Tab 4: Forms */}
        {activeTab === "forms" && (
          <div className="rounded-xl border border-[#242A35] bg-[#101319] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-[#F5F7FA]">Website Lead Funnels & Forms</h2>
                <p className="mt-0.5 text-xs text-[#98A2B3]">
                  Embeddable lead intake forms and hosted landing pages connecting directly into J10 Lead Center.
                </p>
              </div>
              <Link
                href="/dashboard/website"
                className="rounded-lg border border-[#242A35] bg-[#151922] px-3.5 py-2 text-xs font-medium text-[#F5F7FA] transition hover:bg-[#242A35]"
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
