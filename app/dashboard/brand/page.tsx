"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Palette,
  Building2,
  User,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  FileCode,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import type { WorkspaceBranding } from "@/lib/agency/branding";

export default function J10BrandPage() {
  const [branding, setBranding] = useState<WorkspaceBranding | null>(null);
  const [brandName, setBrandName] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#10B981");
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
          setPrimaryColor(json.branding.primaryColor || "#10B981");
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
    <div className="min-h-[calc(100dvh-72px)] bg-[#07090f] p-4 sm:p-6 lg:p-8 text-white">
      <div className="mx-auto max-w-[1360px] space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 border-b border-white/[0.08] pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-cyan-400">
              <span>J10 NEXUS</span>
              <span className="text-white/20">/</span>
              <span className="text-[#8d96a8]">Brand Identity</span>
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              J10 Brand
            </h1>
            <p className="mt-1 text-xs text-[#8d96a8]">
              Configure your workspace business identity, customer-facing themes, and brand assets.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/settings/agency"
              className="text-xs text-[#8d96a8] hover:text-white transition"
            >
              Agency Domains & Templates &rarr;
            </Link>
          </div>
        </div>

        {notice && (
          <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-3.5 text-xs text-cyan-300">
            {notice}
          </div>
        )}

        {/* Identity Boundary Separation Card */}
        <section className="rounded-2xl border border-white/[0.07] bg-[#111216] p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/10 text-violet-400">
              <ShieldCheck size={18} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">
                Identity Boundary: Personal Avatar vs. Workspace Logo
              </h2>
              <p className="text-xs text-[#8d96a8]">
                J10 enforces strict separation between who you are and the business you operate.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-xs">
              <div className="flex items-center justify-between text-white font-semibold">
                <span className="flex items-center gap-1.5">
                  <User size={14} className="text-cyan-400" />
                  Personal User Avatar
                </span>
                <Link
                  href="/dashboard/settings/account"
                  className="text-cyan-400 hover:text-cyan-300 font-normal"
                >
                  Manage Profile &rarr;
                </Link>
              </div>
              <p className="mt-1 text-[#8d96a8]">
                Belongs to your personal login account. Resolution order: 1) uploaded profile photo, 2) Google OAuth avatar, 3) generic user icon fallback.
              </p>
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-xs">
              <div className="flex items-center justify-between text-white font-semibold">
                <span className="flex items-center gap-1.5">
                  <Building2 size={14} className="text-violet-400" />
                  Business Workspace Identity
                </span>
                <span className="text-[10px] uppercase font-bold text-violet-300 bg-violet-400/10 px-2 py-0.5 rounded">
                  Tenant Scoped
                </span>
              </div>
              <p className="mt-1 text-[#8d96a8]">
                Belongs to this business organization. Displayed on public booking links, invoices, and the workspace switcher. Never replaces personal avatars.
              </p>
            </div>
          </div>
        </section>

        {/* Workspace Brand Configuration Form */}
        <form onSubmit={handleSave} className="space-y-6">
          <section className="rounded-2xl border border-white/[0.07] bg-[#111216] p-5 sm:p-6 space-y-5">
            <h2 className="text-sm font-semibold text-white">Workspace Business Identity</h2>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-[#8d96a8]">
                  Business / Brand Name
                </label>
                <input
                  type="text"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  placeholder="Apex Commercial & Home Services"
                  className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 text-xs text-white placeholder-white/20 focus:border-cyan-400/40 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#8d96a8]">
                  Primary Brand Color
                </label>
                <div className="mt-1.5 flex items-center gap-2">
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="h-9 w-9 rounded-lg border border-white/[0.08] bg-transparent cursor-pointer"
                  />
                  <input
                    type="text"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-2 text-xs text-white focus:border-cyan-400/40 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Workspace Logo State (Truthful representation) */}
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-white">Workspace Brand Logo</div>
                  <p className="text-[11px] text-[#8d96a8]">
                    Rendered in workspace header, customer-facing receipts, and client booking.
                  </p>
                </div>
                <span className="rounded-full bg-amber-400/10 border border-amber-400/20 px-2.5 py-0.5 text-[10px] font-bold uppercase text-amber-300">
                  Storage Migration Required
                </span>
              </div>

              <div className="flex items-center gap-4 pt-1">
                <div className="j10-gradient flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-lg font-bold text-white shadow-lg">
                  {monogram}
                </div>
                <div className="text-xs text-[#8d96a8] space-y-1">
                  <div className="text-white font-medium">Current Monogram Active</div>
                  <p>
                    Supabase Storage bucket for multi-tenant image files is pending migration.
                    Direct file upload controls will be enabled once tenant RLS policies are applied.
                  </p>
                  <div className="flex items-center gap-1.5 text-cyan-400 text-[11px]">
                    <FileCode size={13} />
                    <span>Contract: docs/architecture/WORKSPACE_LOGO_CONTRACT.md</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-cyan-400 px-5 py-2.5 text-xs font-semibold text-[#07090f] transition hover:bg-cyan-300 disabled:opacity-50"
              >
                {saving ? "Saving Changes..." : "Save Workspace Brand"}
              </button>
            </div>
          </section>
        </form>
      </div>
    </div>
  );
}
