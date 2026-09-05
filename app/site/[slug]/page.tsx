"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Brain,
  CheckCircle2,
  ChevronDown,
  DollarSign,
  Globe,
  Layers,
  Loader2,
  MessageSquare,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
  Zap,
} from "lucide-react";
import type { WebsiteFunnel, WebsiteFeature, WebsiteTestimonial, WebsiteFAQ } from "@/types/website";
import { buildWhatsAppClickToChatLink, getDefaultWebsiteFunnel, stripEmojis } from "@/lib/website/service";

const ICON_MAP: Record<string, any> = {
  Zap,
  Brain,
  ShieldCheck,
  Layers,
  DollarSign,
  MessageSquare,
  Bot,
  Globe,
  TrendingUp,
  Star,
};

export default function PublicFunnelPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const resolvedParams = use(params);
  const [funnel, setFunnel] = useState<WebsiteFunnel | null>(null);
  const [loading, setLoading] = useState(true);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  // Inbound lead form state
  const [leadName, setLeadName] = useState("");
  const [leadPhone, setLeadPhone] = useState("");
  const [leadEmail, setLeadEmail] = useState("");
  const [leadMessage, setLeadMessage] = useState("");
  const [leadSubmitting, setLeadSubmitting] = useState(false);
  const [leadSuccess, setLeadSuccess] = useState(false);
  const [leadError, setLeadError] = useState<string | null>(null);

  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function fetchFunnel() {
      try {
        setLoading(true);
        setNotFound(false);
        const res = await fetch(`/api/website/funnel?slug=${encodeURIComponent(resolvedParams.slug)}`);
        const data = await res.json();
        if (res.ok && data.success && data.funnel) {
          setFunnel(data.funnel);
        } else {
          setNotFound(true);
          setFunnel(null);
        }
      } catch (err) {
        console.error("Failed to load public funnel:", err);
        setNotFound(true);
        setFunnel(null);
      } finally {
        setLoading(false);
      }
    }

    void fetchFunnel();
  }, [resolvedParams.slug]);

  async function handleLeadSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLeadSubmitting(true);
    setLeadError(null);

    try {
      const res = await fetch("/api/website/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: leadName,
          phone: leadPhone,
          email: leadEmail,
          message: leadMessage || `Inquiry from ${funnel?.title || "landing page"}`,
          sourceFunnel: resolvedParams.slug,
          honeypot: "",
        }),
      });

      const data = await res.json();
      if (data.success) {
        setLeadSuccess(true);
        if (data.whatsappLink) {
          window.open(data.whatsappLink, "_blank");
        }
      } else {
        setLeadError(data.error || "Failed to submit inquiry. Please try again.");
      }
    } catch (err) {
      console.error("Lead submission error:", err);
      setLeadError("Network error. Please try again or message directly.");
    } finally {
      setLeadSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#09090C] text-white">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={24} className="animate-spin text-violet-500" />
          <p className="text-xs text-zinc-500 tracking-wider uppercase font-semibold">
            Loading Landing Experience...
          </p>
        </div>
      </div>
    );
  }

  if (notFound || !funnel) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#08090C] px-4 text-center text-white">
        <div className="max-w-md rounded-2xl border border-white/[0.08] bg-[#111216] p-8 shadow-2xl">
          <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 mb-4">
            <Globe size={24} />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Landing Page Not Found</h1>
          <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
            The page <span className="text-violet-400 font-mono">/site/{resolvedParams.slug}</span> is unpublished or does not exist.
          </p>
          <div className="mt-6">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-xl bg-white/[0.08] px-4 py-2.5 text-xs font-semibold text-white hover:bg-white/[0.12] transition"
            >
              Return to J10 NEXUS Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const f = funnel || {
    ...getDefaultWebsiteFunnel(),
    id: "default-funnel",
    userId: "demo-user",
    createdAt: "",
    updatedAt: "",
  };

  const whatsappHref =
    f.primaryCtaLink ||
    buildWhatsAppClickToChatLink("+15550192834", `Hello! I would like to learn more about ${f.title}.`);

  return (
    <div className="min-h-screen bg-[#08090C] text-zinc-100 selection:bg-violet-600 selection:text-white">
      {/* Top Glass Navbar */}
      <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#08090C]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-600 text-sm font-bold text-white shadow-md shadow-violet-600/30">
              J10
            </div>
            <span className="text-sm font-bold tracking-tight text-white">
              {f.title?.replace("Official Landing Page", "").trim() || "J10 NEXUS"}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/20 active:scale-95"
            >
              <MessageSquare size={13} />
              <span>WhatsApp Direct</span>
            </a>
          </div>
        </div>
      </header>

      <main>
        {/* HERO SECTION */}
        <section className="relative overflow-hidden px-4 pt-16 pb-20 sm:px-6 lg:pt-24 lg:pb-28">
          {/* Subtle Ambient Background Gradients */}
          <div className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-gradient-to-tr from-violet-600/15 to-indigo-600/10 blur-[120px]" />

          <div className="mx-auto max-w-4xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-3.5 py-1 text-xs font-medium text-violet-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Autonomous Business Systems</span>
            </div>

            <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl lg:leading-[1.15]">
              {f.heroHeadline}
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-base text-zinc-400 sm:text-lg sm:leading-relaxed">
              {f.heroSubheadline}
            </p>

            {/* CTA Buttons */}
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-3.5 text-sm font-semibold text-white shadow-xl shadow-violet-600/25 transition hover:brightness-110 active:scale-95 sm:w-auto"
              >
                <MessageSquare size={16} />
                <span>{f.primaryCtaText || "Message Us on WhatsApp"}</span>
                <ArrowRight size={14} />
              </a>

              <a
                href="#lead-form"
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-6 py-3.5 text-sm font-semibold text-zinc-300 transition hover:bg-white/[0.08] hover:text-white active:scale-95 sm:w-auto"
              >
                <span>Request Detailed Quote</span>
              </a>
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-xs text-zinc-500">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 size={13} className="text-emerald-400" />
                Sub-Second Response Time
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 size={13} className="text-emerald-400" />
                Verified Pricing & Grounding
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 size={13} className="text-emerald-400" />
                Direct WhatsApp CRM Sync
              </span>
            </div>
          </div>
        </section>

        {/* FEATURES GRID */}
        {f.features && f.features.length > 0 && (
          <section className="border-t border-white/[0.06] bg-[#0A0B0F]/60 px-4 py-16 sm:px-6 lg:py-20">
            <div className="mx-auto max-w-5xl">
              <div className="text-center">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
                  Engineered for Performance
                </p>
                <h2 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  Enterprise Capabilities Built In
                </h2>
              </div>

              <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {f.features.map((feature: WebsiteFeature, idx: number) => {
                  const IconComponent = ICON_MAP[feature.icon] || Zap;
                  return (
                    <div
                      key={idx}
                      className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6 transition duration-200 hover:border-violet-500/30 hover:bg-violet-500/[0.03]"
                    >
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-violet-500/20 bg-violet-500/10 text-violet-400">
                        <IconComponent size={20} />
                      </div>
                      <h3 className="mt-4 text-base font-semibold text-white">
                        {feature.title}
                      </h3>
                      <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                        {feature.description}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* TESTIMONIALS */}
        {f.testimonials && f.testimonials.length > 0 && (
          <section className="border-t border-white/[0.06] px-4 py-16 sm:px-6 lg:py-20">
            <div className="mx-auto max-w-5xl">
              <div className="text-center">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
                  Verified Client Results
                </p>
                <h2 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  Trusted by Forward-Thinking Leaders
                </h2>
              </div>

              <div className="mt-12 grid gap-6 sm:grid-cols-2">
                {f.testimonials.map((t: WebsiteTestimonial, idx: number) => (
                  <div
                    key={idx}
                    className="flex flex-col justify-between rounded-2xl border border-white/[0.08] bg-[#0E0F14] p-6"
                  >
                    <div>
                      <div className="flex items-center gap-1 text-amber-400">
                        {Array.from({ length: t.rating || 5 }).map((_, sIdx) => (
                          <Star key={sIdx} size={14} className="fill-amber-400" />
                        ))}
                      </div>
                      <p className="mt-4 text-sm leading-relaxed text-zinc-300">
                        &ldquo;{t.quote}&rdquo;
                      </p>
                    </div>

                    <div className="mt-6 border-t border-white/[0.06] pt-4">
                      <p className="text-sm font-semibold text-white">{t.name}</p>
                      <p className="text-xs text-zinc-500">{t.company}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* LEAD CAPTURE SECTION */}
        <section id="lead-form" className="border-t border-white/[0.06] bg-[#0B0C10] px-4 py-16 sm:px-6 lg:py-20">
          <div className="mx-auto max-w-2xl rounded-2xl border border-violet-500/20 bg-gradient-to-b from-violet-600/10 via-transparent to-transparent p-6 sm:p-10">
            <div className="text-center">
              <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-violet-400">
                <Sparkles size={13} />
                Instant Inquiry Routing
              </div>
              <h2 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
                Connect Directly with Our Team
              </h2>
              <p className="mt-2 text-xs text-zinc-400">
                Submit your details below to receive an automated introduction and direct WhatsApp priority response.
              </p>
            </div>

            {leadSuccess ? (
              <div className="mt-8 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center">
                <CheckCircle2 size={24} className="mx-auto text-emerald-400" />
                <h3 className="mt-3 text-base font-semibold text-white">
                  Inquiry Received Successfully
                </h3>
                <p className="mt-1 text-xs text-emerald-200">
                  Your details have been logged. A WhatsApp chat session has opened in your browser.
                </p>
                <div className="mt-5">
                  <a
                    href={whatsappHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white shadow-md transition hover:bg-emerald-500"
                  >
                    <MessageSquare size={14} />
                    Open WhatsApp Chat
                  </a>
                </div>
              </div>
            ) : (
              <form onSubmit={handleLeadSubmit} className="mt-8 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-zinc-400">
                      Full Name
                    </label>
                    <input
                      type="text"
                      required
                      value={leadName}
                      onChange={(e) => setLeadName(e.target.value)}
                      placeholder="e.g. Alex Henderson"
                      className="mt-1 w-full rounded-xl border border-white/10 bg-[#12141A] px-3.5 py-2.5 text-xs text-white placeholder:text-zinc-600 focus:border-violet-500/50 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-400">
                      WhatsApp Phone Number
                    </label>
                    <input
                      type="tel"
                      required
                      value={leadPhone}
                      onChange={(e) => setLeadPhone(e.target.value)}
                      placeholder="+1 (555) 000-0000"
                      className="mt-1 w-full rounded-xl border border-white/10 bg-[#12141A] px-3.5 py-2.5 text-xs text-white placeholder:text-zinc-600 focus:border-violet-500/50 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-400">
                    Business Email (Optional)
                  </label>
                  <input
                    type="email"
                    value={leadEmail}
                    onChange={(e) => setLeadEmail(e.target.value)}
                    placeholder="alex@company.com"
                    className="mt-1 w-full rounded-xl border border-white/10 bg-[#12141A] px-3.5 py-2.5 text-xs text-white placeholder:text-zinc-600 focus:border-violet-500/50 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-400">
                    Project Requirements or Question
                  </label>
                  <textarea
                    rows={3}
                    value={leadMessage}
                    onChange={(e) => setLeadMessage(e.target.value)}
                    placeholder="Tell us about your requirements or desired timeline..."
                    className="mt-1 w-full rounded-xl border border-white/10 bg-[#12141A] p-3 text-xs text-white placeholder:text-zinc-600 focus:border-violet-500/50 focus:outline-none"
                  />
                </div>

                {leadError && (
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                    {leadError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={leadSubmitting}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 py-3 text-xs font-semibold text-white shadow-lg shadow-violet-600/25 transition hover:brightness-110 active:scale-[0.99] disabled:opacity-50"
                >
                  {leadSubmitting ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Routing to Sales Agent...
                    </>
                  ) : (
                    <>
                      <Send size={14} />
                      Submit & Open WhatsApp Chat
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </section>

        {/* FAQS */}
        {f.faqs && f.faqs.length > 0 && (
          <section className="border-t border-white/[0.06] px-4 py-16 sm:px-6 lg:py-20">
            <div className="mx-auto max-w-3xl">
              <div className="text-center">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
                  Questions & Answers
                </p>
                <h2 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  Frequently Asked Questions
                </h2>
              </div>

              <div className="mt-10 space-y-3">
                {f.faqs.map((faq: WebsiteFAQ, idx: number) => {
                  const isOpen = openFaq === idx;
                  return (
                    <div
                      key={idx}
                      className="rounded-xl border border-white/[0.08] bg-[#0E0F14] transition"
                    >
                      <button
                        type="button"
                        onClick={() => setOpenFaq(isOpen ? null : idx)}
                        className="flex w-full items-center justify-between p-4 text-left text-sm font-semibold text-white"
                      >
                        <span>{faq.question}</span>
                        <ChevronDown
                          size={16}
                          className={`text-zinc-500 transition-transform ${isOpen ? "rotate-180 text-violet-400" : ""}`}
                        />
                      </button>
                      {isOpen && (
                        <div className="border-t border-white/[0.06] px-4 pt-2 pb-4 text-xs leading-relaxed text-zinc-400">
                          {faq.answer}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}
      </main>

      {/* FOOTER */}
      <footer className="border-t border-white/[0.06] bg-[#050608] px-4 py-10 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-xs text-zinc-500 sm:flex-row">
          <p>© {new Date().getFullYear()} {f.title?.replace("Official Landing Page", "").trim() || "J10 NEXUS"}. All rights reserved.</p>
          <p className="flex items-center gap-1">
            <span>Powered by</span>
            <span className="font-semibold text-zinc-300">J10 NEXUS Autonomous OS</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
