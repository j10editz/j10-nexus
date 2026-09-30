"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Building2,
  User,
  FileCode,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import type { WorkspaceBranding } from "@/lib/agency/branding";
import {
  DashboardPageHeader,
  DashboardButton,
} from "@/components/dashboard/DashboardPrimitives";

export default function J10BrandPage() {
  const [branding, setBranding] = useState<WorkspaceBranding | null>(null);
  const [brandName, setBrandName] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#4F7CFF");
  const [accentColor, setAccentColor] = useState("#3B82F6");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const fetchBranding = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/agency/branding");
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.branding) {
          setBranding(json.branding);
          setBrandName(json.branding.brandName || "");
          setPrimaryColor(json.branding.primaryColor || "#4F7CFF");
          setAccentColor(json.branding.accentColor || "#3B82F6");
        }
      }
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchBranding();
  }, [fetchBranding]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSaving(true);
      setNotice(null);
      const res = await fetch("/api/agency/branding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandName,
          primaryColor,
          accentColor,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setNotice("Workspace branding saved successfully.");
        setTimeout(() => setNotice(null), 4000);
      } else {
        setNotice(data.error || "Failed to update branding.");
      }
    } catch {
      setNotice("Network error while updating branding.");
    } finally {
      setSaving(false);
    }
  }

  const monogram = (brandName || "Workspace").slice(0, 1).toUpperCase();

  return (
    <div className="min-h-[calc(100dvh-56px)] bg-[#090B10] px-4 py-6 sm:px-6 lg:px-8 text-[#F5F7FA]">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Page Header */}
        <DashboardPageHeader
          title="J10 Brand"
          subtitle="Manage your personal account profile photo and workspace business identity."
          actions={
            <Link
              href="/dashboard/settings/agency"
              className="inline-flex items-center gap-1.5 text-xs text-[#98A2B3] hover:text-[#F5F7FA] transition"
            >
              <span>Agency Domains & Templates</span>
              <ArrowRight size={12} />
            </Link>
          }
        />

        {notice && (
          <div className="rounded-lg border border-[#4F7CFF]/30 bg-[#4F7CFF]/10 px-4 py-3 text-xs text-[#F5F7FA]">
            {notice}
          </div>
        )}

        {/* Identity Boundary Banner */}
        <div className="rounded-lg border border-[#242A35] bg-[#101319] px-4 py-3 text-xs text-[#98A2B3]">
          <span className="font-semibold text-[#F5F7FA]">Identity Boundary: Personal Avatar vs. Workspace Logo</span>
          <p className="mt-0.5 text-[11px] text-[#667085]">
            Strict separation enforced between your personal login identity and multi-tenant organization branding.
          </p>
        </div>

        {/* Compact Settings Surface with Two Clearly Separated Sections */}
        <div className="rounded-xl border border-[#242A35] bg-[#101319] p-5 sm:p-6 space-y-6">
          {/* Section 1: Personal User Avatar */}
          <section className="space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-sm font-semibold text-[#F5F7FA]">
                  1. Personal User Avatar
                </h2>
                <p className="mt-0.5 text-xs text-[#98A2B3]">
                  Belongs to your personal login account. Resolution order: uploaded profile photo, Google OAuth avatar, or default avatar.
                </p>
              </div>
              <Link
                href="/dashboard/settings/account"
                className="inline-flex items-center gap-1 text-xs text-[#4F7CFF] hover:underline"
              >
                <span>Account Profile</span>
                <ExternalLink size={12} />
              </Link>
            </div>

            <div className="flex items-center gap-4 rounded-lg border border-[#242A35] bg-[#151922] p-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#101319] border border-[#242A35] text-[#98A2B3]">
                <User size={20} />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-[#F5F7FA]">
                  Personal User Avatar
                </p>
                <p className="text-[11px] text-[#667085]">
                  Managed in Account Settings. Personal photos remain distinct from workspace organization logos.
                </p>
              </div>
            </div>
          </section>

          <hr className="border-[#242A35]" />

          {/* Section 2: Business Workspace Identity */}
          <section className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-[#F5F7FA]">
                2. Business Workspace Identity
              </h2>
              <p className="mt-0.5 text-xs text-[#98A2B3]">
                Scoped to this business tenant. Used across customer-facing receipts, booking links, and workspace switcher.
              </p>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-[#98A2B3]">
                    Business / Brand Name
                  </label>
                  <input
                    type="text"
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                    placeholder="Workspace Name"
                    className="mt-1.5 w-full rounded-lg border border-[#242A35] bg-[#151922] px-3.5 py-2 text-xs text-[#F5F7FA] placeholder:text-[#667085] focus:border-[#4F7CFF] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#98A2B3]">
                    Primary Brand Color
                  </label>
                  <div className="mt-1.5 flex items-center gap-2">
                    <input
                      type="color"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="h-8 w-8 rounded border border-[#242A35] bg-transparent cursor-pointer"
                    />
                    <input
                      type="text"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="w-full rounded-lg border border-[#242A35] bg-[#151922] px-3 py-1.5 text-xs text-[#F5F7FA] focus:border-[#4F7CFF] focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Truthful Workspace Logo State */}
              <div className="rounded-lg border border-[#242A35] bg-[#151922] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#F5F7FA]">
                    Workspace Brand Logo
                  </span>
                  <span className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                    Storage Migration Required
                  </span>
                </div>

                <div className="flex items-center gap-3.5">
                  <div className="j10-gradient flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-base font-bold text-white shadow-sm">
                    {monogram}
                  </div>
                  <div className="space-y-1 text-xs">
                    <p className="font-medium text-[#F5F7FA]">
                      Current Monogram Active
                    </p>
                    <p className="text-[11px] leading-relaxed text-[#98A2B3]">
                      Secure file storage for multi-tenant image uploads is pending storage migration.
                      Upload controls will be enabled once tenant RLS policies are applied.
                    </p>
                    <div className="flex items-center gap-1 text-[11px] text-[#667085]">
                      <FileCode size={12} />
                      <span>docs/architecture/WORKSPACE_LOGO_CONTRACT.md</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <DashboardButton
                  variant="primary"
                  type="submit"
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save Workspace Brand"}
                </DashboardButton>
              </div>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
