"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Search,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Lock,
  Zap,
  X,
  ChevronRight,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import IntegrationBrandLogo from "@/components/integrations/IntegrationBrandLogo";
import { ALL_42_INTEGRATIONS, type IntegrationDrawerData } from "@/lib/integrations/catalog-data";

const CATEGORIES = [
  "All",
  "Messaging",
  "Voice & SMS",
  "Email",
  "Scheduling",
  "Payments",
  "CRM",
  "Commerce",
  "Accounting",
  "Marketing & Leads",
  "Reviews",
  "Files & Data",
  "Team",
  "Automation",
  "Field Services",
];

export default function PublicIntegrationsCatalogPage() {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [activeDrawer, setActiveDrawer] = useState<IntegrationDrawerData | null>(null);
  const [requestedAccess, setRequestedAccess] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    return ALL_42_INTEGRATIONS.filter((item) => {
      const matchesCategory =
        selectedCategory === "All" || item.category === selectedCategory;
      const matchesSearch =
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.description.toLowerCase().includes(search.toLowerCase()) ||
        item.category.toLowerCase().includes(search.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [search, selectedCategory]);

  return (
    <main className="j10-canvas min-h-screen text-white">
      <Navbar />

      {/* Hero Header */}
      <section className="relative overflow-hidden pt-12 pb-16 sm:pt-20 sm:pb-20">
        <div className="pointer-events-none absolute left-1/2 top-0 h-96 w-[55rem] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(112,64,170,0.22),transparent_70%)] blur-3xl" />
        <div className="pointer-events-none absolute right-[10%] top-[30%] h-80 w-80 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(215,179,92,0.12),transparent_65%)] blur-3xl" />

        <div className="relative mx-auto max-w-[1380px] px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#d7b35c]/30 bg-[#d7b35c]/10 px-3.5 py-1.5 text-xs font-bold uppercase tracking-[0.2em] text-[#d7b35c]">
              <Sparkles size={13} className="text-[#d7b35c]" />
              Ecosystem Architecture · 42 Connectors
            </div>

            <h1 className="mt-5 text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white">
              Everything Your Business{" "}
              <span className="bg-gradient-to-r from-[#d7b35c] via-[#f7d988] to-[#ad71ff] bg-clip-text text-transparent">
                Connects To.
              </span>
            </h1>

            <p className="mt-5 text-base sm:text-lg text-white/70 leading-relaxed">
              One connected AI operator for WhatsApp, Telegram, Stripe, your CRM, calendar, and marketing tools.
              Real-time synchronization with zero developer friction.
            </p>

            {/* Quick Metrics Bar */}
            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 max-w-2xl mx-auto">
              <div className="rounded-xl border border-white/[0.08] bg-[#100e14] p-3 text-center">
                <span className="text-2xl font-extrabold text-[#d7b35c]">42</span>
                <p className="text-[11px] font-medium text-white/50">Total Connectors</p>
              </div>
              <div className="rounded-xl border border-white/[0.08] bg-[#100e14] p-3 text-center">
                <span className="text-2xl font-extrabold text-emerald-400">4</span>
                <p className="text-[11px] font-medium text-white/50">Live Available</p>
              </div>
              <div className="rounded-xl border border-white/[0.08] bg-[#100e14] p-3 text-center">
                <span className="text-2xl font-extrabold text-[#e2a842]">22</span>
                <p className="text-[11px] font-medium text-white/50">Next Release</p>
              </div>
              <div className="rounded-xl border border-white/[0.08] bg-[#100e14] p-3 text-center">
                <span className="text-2xl font-extrabold text-purple-400">16</span>
                <p className="text-[11px] font-medium text-white/50">In Development</p>
              </div>
            </div>
          </div>

          {/* Search & Category Filter */}
          <div className="mt-12 space-y-4">
            <div className="relative max-w-md mx-auto">
              <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by provider name, capability, or category..."
                className="w-full rounded-xl border border-white/[0.1] bg-[#100e14] py-3 pl-11 pr-4 text-xs font-medium text-white placeholder-white/40 outline-none focus:border-[#d7b35c]/50"
              />
            </div>

            {/* Category Pills */}
            <div className="flex flex-wrap items-center justify-center gap-1.5 pt-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`rounded-full px-3.5 py-1 text-xs font-semibold transition ${
                    selectedCategory === cat
                      ? "border border-[#d7b35c]/40 bg-[#d7b35c]/20 text-[#f7d988]"
                      : "border border-white/[0.06] bg-white/[0.02] text-white/60 hover:bg-white/[0.05] hover:text-white"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 42 Integrations Grid */}
      <section className="mx-auto max-w-[1380px] px-4 sm:px-6 lg:px-8 pb-24">
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {filtered.map((item) => (
            <div
              key={item.id}
              onClick={() => setActiveDrawer(item)}
              className="group relative cursor-pointer overflow-hidden rounded-2xl border border-white/[0.07] bg-[#100e14] p-5 transition-all duration-200 hover:-translate-y-1 hover:border-[#d7b35c]/35 hover:shadow-xl hover:shadow-purple-950/20"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/[0.09] bg-[#0b0a0d] p-2.5">
                  <IntegrationBrandLogo
                    slug={item.slug}
                    name={item.name}
                    category={item.category}
                    className="h-full w-full object-contain opacity-90 group-hover:opacity-100 group-hover:scale-105 transition"
                  />
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    item.status === "Available"
                      ? "border border-[#d7b35c]/30 bg-[#d7b35c]/10 text-[#d7b35c]"
                      : item.status === "Next"
                      ? "border border-amber-500/30 bg-amber-500/10 text-amber-300"
                      : "border border-purple-500/20 bg-purple-500/10 text-purple-300"
                  }`}
                >
                  {item.status}
                </span>
              </div>

              <div className="mt-4">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-sm font-bold text-white group-hover:text-[#d7b35c] transition">
                    {item.name}
                  </h3>
                </div>
                <p className="mt-1 text-[11px] text-white/50">{item.category}</p>
                <p className="mt-2 text-xs text-white/70 line-clamp-2 leading-relaxed">
                  {item.description}
                </p>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-3 text-[11px] font-semibold text-[#d7b35c] group-hover:text-[#f7d988]">
                <span>View Triggers & Actions</span>
                <ChevronRight size={14} className="group-hover:translate-x-1 transition" />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Slide-over Specification Drawer */}
      {activeDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/80 backdrop-blur-sm">
          <div className="relative flex h-full w-full max-w-xl flex-col bg-[#0d0c11] border-l border-white/[0.1] p-6 sm:p-8 overflow-y-auto shadow-2xl">
            {/* Drawer Header */}
            <div className="flex items-start justify-between border-b border-white/[0.08] pb-5">
              <div className="flex items-center gap-3.5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-[#14121a] p-2.5">
                  <IntegrationBrandLogo
                    slug={activeDrawer.slug}
                    name={activeDrawer.name}
                    category={activeDrawer.category}
                    className="h-full w-full object-contain"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-white">{activeDrawer.name}</h3>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        activeDrawer.status === "Available"
                          ? "border border-[#d7b35c]/30 bg-[#d7b35c]/10 text-[#d7b35c]"
                          : activeDrawer.status === "Next"
                          ? "border border-amber-500/30 bg-amber-500/10 text-amber-300"
                          : "border border-purple-500/20 bg-purple-500/10 text-purple-300"
                      }`}
                    >
                      {activeDrawer.status}
                    </span>
                  </div>
                  <p className="text-xs text-[#d7b35c]/80 font-medium mt-0.5">{activeDrawer.category} Integration</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveDrawer(null)}
                className="rounded-lg border border-white/10 p-2 text-white/60 hover:bg-white/10 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="mt-6 space-y-6 flex-1 text-xs">
              {/* Overview */}
              <div>
                <h4 className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#d7b35c]">Overview</h4>
                <p className="mt-2 text-white/80 text-sm leading-relaxed">{activeDrawer.howItWorks}</p>
              </div>

              {/* Authentication Protocol */}
              <div className="rounded-xl border border-white/[0.08] bg-[#14121a] p-4">
                <div className="flex items-center gap-2 text-white/80 font-semibold">
                  <Lock size={15} className="text-[#d7b35c]" />
                  <span>Authentication & Security Protocol</span>
                </div>
                <p className="mt-1.5 text-white/60 font-mono text-[11px]">{activeDrawer.authMethod}</p>
              </div>

              {/* Inbound Triggers */}
              <div>
                <h4 className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#d7b35c]">Supported Inbound Triggers</h4>
                <ul className="mt-2.5 space-y-2">
                  {activeDrawer.triggers.map((trigger, i) => (
                    <li key={i} className="flex items-center gap-2 rounded-lg bg-white/[0.02] border border-white/[0.04] px-3 py-2 text-white/80">
                      <Zap size={14} className="text-emerald-400 shrink-0" />
                      <span>{trigger}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Outbound Actions */}
              <div>
                <h4 className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#d7b35c]">Automated J10 Actions</h4>
                <ul className="mt-2.5 space-y-2">
                  {activeDrawer.actions.map((act, i) => (
                    <li key={i} className="flex items-center gap-2 rounded-lg bg-white/[0.02] border border-white/[0.04] px-3 py-2 text-white/80">
                      <CheckCircle2 size={14} className="text-cyan-400 shrink-0" />
                      <span>{act}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Plain English Scopes */}
              <div>
                <h4 className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#d7b35c]">Required Permissions (Plain English)</h4>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {activeDrawer.scopes.map((scope, i) => (
                    <span key={i} className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] font-mono text-white/70">
                      {scope}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Drawer Footer Actions */}
            <div className="mt-8 pt-6 border-t border-white/[0.08]">
              {activeDrawer.status === "Available" ? (
                <Link
                  href="/dashboard/connections"
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#e2c16c] to-[#a97a27] py-3.5 text-xs font-bold text-[#160f05] shadow-lg shadow-amber-900/30 transition hover:brightness-110"
                >
                  <span>Connect in Dashboard</span>
                  <ArrowRight size={15} />
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    setRequestedAccess((prev) => ({
                      ...prev,
                      [activeDrawer.id]: !prev[activeDrawer.id],
                    }))
                  }
                  className={`flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-xs font-bold transition ${
                    requestedAccess[activeDrawer.id]
                      ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                      : "border border-[#d7b35c]/30 bg-[#d7b35c]/10 text-[#d7b35c] hover:bg-[#d7b35c]/20"
                  }`}
                >
                  <Sparkles size={15} />
                  <span>
                    {requestedAccess[activeDrawer.id]
                      ? "Priority Access Requested ✓"
                      : `Notify Me When ${activeDrawer.name} Launches`}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <Footer />
    </main>
  );
}
