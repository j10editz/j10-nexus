"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Building2,
  User,
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
  const [primaryColor, setPrimaryColor] = useState("#6347E8");
  const [accentColor, setAccentColor] = useState("#5136D6");
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
          setPrimaryColor(json.branding.primaryColor || "#6347E8");
          setAccentColor(json.branding.accentColor || "#5136D6");
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
    <div className="min-h-[calc(100dvh-56px)] bg-[#F8F7FC] px-4 py-6 sm:px-6 lg:px-8 text-[#17151F]">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Page Header */}
        <DashboardPageHeader
          title="J10 Brand"
          subtitle="Manage your personal account profile photo and workspace business identity."
          actions={
            <Link
              href="/dashboard/settings/agency"
              className="inline-flex items-center gap-1.5 text-xs text-[#6F687A] hover:text-[#17151F] transition"
            >
              <span>Agency Domains & Templates</span>
              <ArrowRight size={12} />
            </Link>
          }
        />

        {notice && (
          <div className="rounded-lg border border-[#A3E6D0] bg-[#E8F8F2] px-4 py-3 text-xs text-[#168A65] font-medium shadow-sm">
            {notice}
          </div>
        )}

        {/* Identity Boundary Banner */}
        <div className="rounded-xl border border-[#E2DEEA] bg-[#FFFFFF] px-4 py-3 text-xs text-[#6F687A] shadow-[0_4px_16px_rgba(49,32,92,0.06)]">
          <span className="font-semibold text-[#17151F]">Identity Boundary: Personal Avatar vs Workspace Brand</span>
          <p className="mt-0.5 text-[11px] text-[#6F687A]">
            Your personal profile photo is separate from your organization&apos;s workspace brand.
          </p>
        </div>

        {/* Settings Surface with Two Clearly Separated Sections */}
        <div className="rounded-xl border border-[#E2DEEA] bg-[#FFFFFF] p-5 sm:p-6 space-y-6 shadow-[0_4px_16px_rgba(49,32,92,0.06)]">
          {/* Section 1: Personal Profile */}
          <section className="space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-sm font-semibold text-[#17151F]">
                  1. Personal User Avatar
                </h2>
                <p className="mt-0.5 text-xs text-[#6F687A]">
                  Belongs to your individual user account and appears in top navigation and team activity.
                </p>
              </div>
              <Link
                href="/dashboard/settings/account"
                className="inline-flex items-center gap-1 text-xs text-[#6347E8] font-medium hover:underline"
              >
                <span>Edit Account Profile</span>
                <ExternalLink size={12} />
              </Link>
            </div>

            <div className="flex items-center gap-4 rounded-lg border border-[#E2DEEA] bg-[#F8F7FC] p-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#FFFFFF] border border-[#E2DEEA] text-[#6F687A]">
                <User size={20} />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-[#17151F]">
                  Personal User Avatar
                </p>
                <p className="text-[11px] text-[#6F687A]">
                  Managed in Account Settings. Personal photos remain distinct from workspace organization logos.
                </p>
              </div>
            </div>
          </section>

          <hr className="border-[#E2DEEA]" />

          {/* Section 2: Business Workspace Identity */}
          <section className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-[#17151F]">
                2. Business Workspace Identity
              </h2>
              <p className="mt-0.5 text-xs text-[#6F687A]">
                Scoped to this business workspace. Displayed on client receipts, booking links, and communication channels.
              </p>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-[#6F687A]">
                    Business / Brand Name
                  </label>
                  <input
                    type="text"
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                    placeholder="Workspace Name"
                    className="mt-1.5 w-full rounded-lg border border-[#E2DEEA] bg-[#FFFFFF] px-3.5 py-2 text-xs text-[#17151F] placeholder:text-[#918A9D] focus:border-[#6347E8] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#6F687A]">
                    Primary Brand Color
                  </label>
                  <div className="mt-1.5 flex items-center gap-2">
                    <input
                      type="color"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="h-8 w-8 rounded border border-[#E2DEEA] bg-transparent cursor-pointer"
                    />
                    <input
                      type="text"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="w-full rounded-lg border border-[#E2DEEA] bg-[#FFFFFF] px-3 py-1.5 text-xs text-[#17151F] focus:border-[#6347E8] focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Workspace Brand Logo - Customer Truthful Message */}
              <div className="rounded-lg border border-[#E2DEEA] bg-[#F8F7FC] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#17151F]">
                    Workspace Brand Logo
                  </span>
                  <span className="rounded bg-[#F3F1F8] border border-[#E2DEEA] px-2 py-0.5 text-[10px] font-medium text-[#6F687A]">
                    Coming Soon
                  </span>
                </div>

                <div className="flex items-center gap-3.5">
                  <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-base font-bold text-white shadow-sm"
                    style={{ backgroundColor: primaryColor || "#6347E8" }}
                  >
                    {monogram}
                  </div>
                  <div className="space-y-1 text-xs">
                    <p className="font-semibold text-[#17151F]">
                      Current Monogram Active
                    </p>
                    <p className="text-[11px] leading-relaxed text-[#6F687A]">
                      Workspace logo upload is coming soon.
                    </p>
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
