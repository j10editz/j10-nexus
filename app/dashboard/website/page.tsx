"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  Bot,
  Brain,
  Check,
  CheckCircle2,
  DollarSign,
  ExternalLink,
  Eye,
  Globe,
  Layers,
  Laptop,
  MessageSquare,
  Moon,
  Palette,
  Plus,
  RefreshCw,
  Save,
  Send,
  Smartphone,
  Sparkles,
  Star,
  Tablet,
  X,
  Zap,
} from "lucide-react";
import type { WebsiteFAQ, WebsiteFeature, WebsiteFunnel, WebsiteTestimonial } from "@/types/website";
import { buildWhatsAppClickToChatLink } from "@/lib/website/service";

export default function WebsitePage() {
  const [funnel, setFunnel] = useState<WebsiteFunnel | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [viewport, setViewport] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [activeTab, setActiveTab] = useState<"hero" | "features" | "testimonials" | "domain">("hero");

  // Form states
  const [heroHeadline, setHeroHeadline] = useState("");
  const [heroSubheadline, setHeroSubheadline] = useState("");
  const [primaryCtaText, setPrimaryCtaText] = useState("");
  const [whatsappPhone, setWhatsappPhone] = useState("+15550192834");
  const [theme, setTheme] = useState<"obsidian" | "violet" | "emerald" | "slate">("obsidian");
  const [customDomain, setCustomDomain] = useState("");
  const [isPublished, setIsPublished] = useState(true);
  const [features, setFeatures] = useState<WebsiteFeature[]>([]);
  const [testimonials, setTestimonials] = useState<WebsiteTestimonial[]>([]);
  const [faqs, setFaqs] = useState<WebsiteFAQ[]>([]);

  async function loadFunnel() {
    try {
      setLoading(true);
      const res = await fetch("/api/website/funnel");
      const data = await res.json();
      if (data.success && data.funnel) {
        const f = data.funnel;
        setFunnel(f);
        setHeroHeadline(f.heroHeadline);
        setHeroSubheadline(f.heroSubheadline);
        setPrimaryCtaText(f.primaryCtaText);
        setTheme(f.theme || "obsidian");
        setCustomDomain(f.customDomain || "");
        setIsPublished(f.isPublished);
        setFeatures(f.features || []);
        setTestimonials(f.testimonials || []);
        setFaqs(f.faqs || []);
      }
    } catch (err) {
      console.error("Failed to load website funnel:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFunnel();
  }, []);

  async function handleSaveFunnel() {
    setSaving(true);
    setActionSuccess(null);

    const whatsappLink = buildWhatsAppClickToChatLink(
      whatsappPhone,
      `Hello! I saw your landing page "${heroHeadline}" and would like to learn more.`
    );

    try {
      const res = await fetch("/api/website/funnel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          heroHeadline,
          heroSubheadline,
          primaryCtaText,
          primaryCtaLink: whatsappLink,
          theme,
          customDomain,
          isPublished,
          features,
          testimonials,
          faqs,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setActionSuccess("Landing page saved & published to edge CDN!");
        if (data.funnel) setFunnel(data.funnel);
      }
    } catch (err) {
      console.error("Save funnel error:", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-[calc(100dvh-72px)] bg-[#09090B] px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1400px]">
        {/* Top Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-violet-400">
              J10 Funnel Studio
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              AI Website & Conversion Engine
            </h1>
            <p className="mt-1 text-sm text-white/50">
              Publish high-converting landing pages with instant WhatsApp lead capture and CRM pipeline ingestion.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Viewport Toggles */}
            <div className="flex items-center rounded-xl border border-white/10 bg-[#111216] p-1 text-white/60">
              <button
                onClick={() => setViewport("desktop")}
                className={`rounded-lg p-1.5 transition ${viewport === "desktop" ? "bg-white/10 text-white" : "hover:text-white"}`}
                title="Desktop View"
              >
                <Laptop size={16} />
              </button>
              <button
                onClick={() => setViewport("tablet")}
                className={`rounded-lg p-1.5 transition ${viewport === "tablet" ? "bg-white/10 text-white" : "hover:text-white"}`}
                title="Tablet View"
              >
                <Tablet size={16} />
              </button>
              <button
                onClick={() => setViewport("mobile")}
                className={`rounded-lg p-1.5 transition ${viewport === "mobile" ? "bg-white/10 text-white" : "hover:text-white"}`}
                title="Mobile View"
              >
                <Smartphone size={16} />
              </button>
            </div>

            {/* Save & Publish CTA */}
            <button
              onClick={handleSaveFunnel}
              disabled={saving}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-violet-600 px-5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:brightness-110"
            >
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
              <span>Save & Publish</span>
            </button>
          </div>
        </div>

        {/* Feedback Alert */}
        {actionSuccess && (
          <div className="mt-6 flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
            <div className="flex items-center gap-3">
              <CheckCircle2 size={18} className="text-emerald-400" />
              <span>{actionSuccess}</span>
            </div>
            <button onClick={() => setActionSuccess(null)} className="text-xs opacity-60 hover:opacity-100">
              Dismiss
            </button>
          </div>
        )}

        {/* Main Studio Grid: Editor Left (40%), Preview Right (60%) */}
        <div className="mt-8 grid gap-8 lg:grid-cols-[450px_1fr]">
          {/* Left: Customization Drawer */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
              <h2 className="text-base font-semibold text-white">Funnel Customizer</h2>
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live Edge CDN
              </span>
            </div>

            {/* Section Tabs */}
            <div className="flex rounded-xl border border-white/10 bg-[#0B0C0F] p-1 text-xs">
              {(["hero", "features", "testimonials", "domain"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 rounded-lg py-1.5 capitalize transition ${
                    activeTab === tab ? "bg-white/10 font-semibold text-white" : "text-white/40 hover:text-white/80"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Tab 1: Hero & Conversion Hook */}
            {activeTab === "hero" && (
              <div className="space-y-4 text-xs">
                <div>
                  <label className="block font-semibold text-white/60">Hero Headline</label>
                  <textarea
                    rows={2}
                    value={heroHeadline}
                    onChange={(e) => setHeroHeadline(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-[#0B0C0F] p-3 text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-white/60">Sub-headline / Value Proposition</label>
                  <textarea
                    rows={3}
                    value={heroSubheadline}
                    onChange={(e) => setHeroSubheadline(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-[#0B0C0F] p-3 text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-white/60">Primary WhatsApp CTA Button</label>
                  <input
                    type="text"
                    value={primaryCtaText}
                    onChange={(e) => setPrimaryCtaText(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-[#0B0C0F] px-3.5 py-2 text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-white/60">Target WhatsApp Number</label>
                  <input
                    type="text"
                    value={whatsappPhone}
                    onChange={(e) => setWhatsappPhone(e.target.value)}
                    placeholder="+1 (555) 019-2834"
                    className="mt-1 w-full rounded-xl border border-white/10 bg-[#0B0C0F] px-3.5 py-2 text-white focus:border-blue-500 focus:outline-none"
                  />
                  <p className="mt-1 text-[11px] text-white/40">
                    Visitors clicking the CTA immediately initiate a chat with your J10 AI Sales Agent.
                  </p>
                </div>

                <div>
                  <label className="block font-semibold text-white/60">Theme Palette</label>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {(
                      [
                        { id: "obsidian", label: "Cyber Obsidian", color: "bg-black border-blue-500/50" },
                        { id: "violet", label: "Neon Violet", color: "bg-[#10081d] border-violet-500/50" },
                        { id: "emerald", label: "Enterprise Mint", color: "bg-[#051610] border-emerald-500/50" },
                        { id: "slate", label: "Slate Minimal", color: "bg-[#0f172a] border-slate-500/50" },
                      ] as const
                    ).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTheme(t.id)}
                        className={`flex items-center gap-2 rounded-xl border p-2 text-left transition ${
                          theme === t.id ? `${t.color} text-white` : "border-white/10 bg-[#0B0C0F] text-white/50"
                        }`}
                      >
                        <span className="h-3 w-3 rounded-full bg-current" />
                        <span className="text-[11px] font-medium">{t.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Feature Value Props */}
            {activeTab === "features" && (
              <div className="space-y-4 text-xs">
                <p className="text-white/50">
                  Highlight key capabilities that convert visitors into active WhatsApp conversations.
                </p>
                {features.map((feat, idx) => (
                  <div key={idx} className="rounded-xl border border-white/10 bg-[#0B0C0F] p-3 space-y-2">
                    <div>
                      <label className="text-[10px] uppercase font-semibold text-white/40">Feature #{idx + 1} Title</label>
                      <input
                        type="text"
                        value={feat.title}
                        onChange={(e) => {
                          const updated = [...features];
                          updated[idx].title = e.target.value;
                          setFeatures(updated);
                        }}
                        className="mt-0.5 w-full rounded-lg border border-white/10 bg-[#111216] px-2.5 py-1.5 text-white focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-semibold text-white/40">Description</label>
                      <textarea
                        rows={2}
                        value={feat.description}
                        onChange={(e) => {
                          const updated = [...features];
                          updated[idx].description = e.target.value;
                          setFeatures(updated);
                        }}
                        className="mt-0.5 w-full rounded-lg border border-white/10 bg-[#111216] px-2.5 py-1.5 text-white focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Tab 3: Social Proof */}
            {activeTab === "testimonials" && (
              <div className="space-y-4 text-xs">
                <p className="text-white/50">
                  Build buyer trust with verified client testimonials and high ratings.
                </p>
                {testimonials.map((test, idx) => (
                  <div key={idx} className="rounded-xl border border-white/10 bg-[#0B0C0F] p-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] uppercase font-semibold text-white/40">Name</label>
                        <input
                          type="text"
                          value={test.name}
                          onChange={(e) => {
                            const updated = [...testimonials];
                            updated[idx].name = e.target.value;
                            setTestimonials(updated);
                          }}
                          className="mt-0.5 w-full rounded-lg border border-white/10 bg-[#111216] px-2.5 py-1.5 text-white focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase font-semibold text-white/40">Company</label>
                        <input
                          type="text"
                          value={test.company}
                          onChange={(e) => {
                            const updated = [...testimonials];
                            updated[idx].company = e.target.value;
                            setTestimonials(updated);
                          }}
                          className="mt-0.5 w-full rounded-lg border border-white/10 bg-[#111216] px-2.5 py-1.5 text-white focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-semibold text-white/40">Quote</label>
                      <textarea
                        rows={2}
                        value={test.quote}
                        onChange={(e) => {
                          const updated = [...testimonials];
                          updated[idx].quote = e.target.value;
                          setTestimonials(updated);
                        }}
                        className="mt-0.5 w-full rounded-lg border border-white/10 bg-[#111216] px-2.5 py-1.5 text-white focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Tab 4: Domain & Customization */}
            {activeTab === "domain" && (
              <div className="space-y-4 text-xs">
                <div>
                  <label className="block font-semibold text-white/60">Custom Domain / CNAME</label>
                  <input
                    type="text"
                    placeholder="e.g. go.yourcompany.com"
                    value={customDomain}
                    onChange={(e) => setCustomDomain(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-[#0B0C0F] px-3.5 py-2 text-white focus:border-blue-500 focus:outline-none"
                  />
                  <p className="mt-1.5 text-[11px] text-white/40">
                    Point your CNAME record to <code className="text-violet-300">cname.j10nexus.com</code> for automatic SSL.
                  </p>
                </div>

                <div className="rounded-xl border border-white/10 bg-[#0B0C0F] p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white">Publish Status</span>
                    <button
                      onClick={() => setIsPublished(!isPublished)}
                      className={`relative h-6 w-11 rounded-full transition ${isPublished ? "bg-emerald-500" : "bg-white/20"}`}
                    >
                      <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${isPublished ? "left-6" : "left-1"}`} />
                    </button>
                  </div>
                  <p className="text-[11px] text-white/40">
                    When active, your funnel is globally accelerated across 300+ edge edge locations.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Right: Live Interactive Funnel Preview */}
          <div className="flex flex-col items-center">
            <div
              className={`w-full overflow-hidden rounded-3xl border border-white/15 bg-black shadow-2xl transition-all duration-300 ${
                viewport === "mobile"
                  ? "max-w-[380px] min-h-[680px]"
                  : viewport === "tablet"
                  ? "max-w-[760px] min-h-[700px]"
                  : "max-w-full min-h-[700px]"
              }`}
            >
              {/* Browser chrome header mockup */}
              <div className="flex items-center justify-between border-b border-white/10 bg-[#121316] px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-rose-500/80" />
                  <span className="h-3 w-3 rounded-full bg-amber-500/80" />
                  <span className="h-3 w-3 rounded-full bg-emerald-500/80" />
                </div>
                <div className="rounded-lg bg-black/40 px-3 py-1 text-[11px] font-mono text-white/40">
                  {customDomain || "https://go.j10nexus.com/home"}
                </div>
                <div className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  SSL
                </div>
              </div>

              {/* Landing Page Body Preview */}
              <div
                className={`p-6 sm:p-10 ${
                  theme === "violet"
                    ? "bg-gradient-to-b from-[#110924] via-[#0b0616] to-black"
                    : theme === "emerald"
                    ? "bg-gradient-to-b from-[#061e14] via-[#03110b] to-black"
                    : theme === "slate"
                    ? "bg-gradient-to-b from-[#111827] via-[#090d15] to-black"
                    : "bg-gradient-to-b from-[#0d0e12] via-[#07080a] to-black"
                }`}
              >
                {/* Navbar */}
                <div className="flex items-center justify-between border-b border-white/[0.08] pb-5">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 font-bold text-white text-xs">
                      J10
                    </div>
                    <span className="font-bold text-sm tracking-tight text-white">
                      NEXUS
                    </span>
                  </div>

                  <a
                    href={buildWhatsAppClickToChatLink(whatsappPhone, "Hello, I am ready to get started!")}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/30"
                  >
                    <MessageSquare size={13} />
                    <span>WhatsApp</span>
                  </a>
                </div>

                {/* Hero Section */}
                <div className="mt-12 text-center max-w-2xl mx-auto space-y-4">
                  <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-3.5 py-1 text-[11px] font-semibold text-violet-300">
                    <Sparkles size={12} />
                    <span>Autonomous Operating System</span>
                  </div>

                  <h1 className="text-2xl font-extrabold tracking-tight sm:text-4xl text-white">
                    {heroHeadline || "Accelerate Growth with Autonomous AI Systems"}
                  </h1>

                  <p className="text-xs sm:text-sm text-white/60 leading-relaxed max-w-xl mx-auto">
                    {heroSubheadline || "Deploy 24/7 WhatsApp sales agents, qualified CRM lead capture, and intelligent billing."}
                  </p>

                  <div className="pt-3 flex flex-wrap items-center justify-center gap-3">
                    <a
                      href={buildWhatsAppClickToChatLink(whatsappPhone, "Hello, I'd like a demo!")}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-blue-500 to-violet-600 px-6 py-3 text-xs font-bold text-white shadow-xl shadow-blue-500/25 hover:brightness-110"
                    >
                      <MessageSquare size={15} />
                      <span>{primaryCtaText || "Chat on WhatsApp"}</span>
                      <ArrowRight size={14} />
                    </a>
                  </div>
                </div>

                {/* Feature Grid */}
                <div className="mt-16 grid gap-4 sm:grid-cols-3">
                  {features.map((feat, idx) => (
                    <div key={idx} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 text-left">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400 mb-3">
                        {idx === 0 ? <MessageSquare size={18} /> : idx === 1 ? <Brain size={18} /> : <DollarSign size={18} />}
                      </div>
                      <h3 className="font-semibold text-white text-xs">{feat.title}</h3>
                      <p className="mt-1 text-[11px] text-white/50 leading-relaxed">{feat.description}</p>
                    </div>
                  ))}
                </div>

                {/* Testimonial Quotes */}
                <div className="mt-14 border-t border-white/[0.08] pt-10">
                  <div className="text-center mb-6">
                    <p className="text-[10px] uppercase font-bold tracking-widest text-violet-400">Social Proof</p>
                    <h2 className="text-base font-bold text-white mt-1">Loved by Modern Founders</h2>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    {testimonials.map((test, idx) => (
                      <div key={idx} className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 text-left">
                        <div className="flex items-center gap-1 text-amber-400 mb-2">
                          {[...Array(test.rating || 5)].map((_, i) => (
                            <Star key={i} size={12} fill="currentColor" />
                          ))}
                        </div>
                        <p className="text-xs text-white/70 italic">&ldquo;{test.quote}&rdquo;</p>
                        <div className="mt-3 text-[11px]">
                          <span className="font-semibold text-white">{test.name}</span>
                          <span className="text-white/40"> &bull; {test.company}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Footer conversion CTA */}
                <div className="mt-14 rounded-2xl border border-violet-500/30 bg-gradient-to-r from-blue-950/40 via-violet-950/40 to-black p-6 text-center">
                  <h3 className="text-sm font-bold text-white">Start Automating Operations Today</h3>
                  <p className="text-xs text-white/50 mt-1">No lengthy onboarding. Connect your phone and deploy in minutes.</p>
                  <a
                    href={buildWhatsAppClickToChatLink(whatsappPhone, "Hello, let's start!")}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-white text-black px-4 py-2 text-xs font-bold hover:bg-white/90"
                  >
                    <span>Message Us Now</span>
                    <ArrowRight size={13} />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}