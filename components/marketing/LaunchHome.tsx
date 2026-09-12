"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Calendar,
  CalendarCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  Headphones,
  Link as LinkIcon,
  MessageCircle,
  MessageSquare,
  PhoneCall,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Target,
  TrendingUp,
  User,
  Users,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { J10Mascot } from "@/components/brand/J10Mascot";

interface SlideData {
  num: string;
  title: string;
  subtitle: string;
  benefit: string;
  image: string;
  alias?: string;
}

const slides: SlideData[] = [
  {
    num: "01",
    title: "Lead Received",
    subtitle: "Capture leads from website, ads, calls, forms, and chat.",
    benefit: "24/7 Inbound Ingestion",
    image: "/brand/slide-01-lead-received.png",
  },
  {
    num: "02",
    title: "J10 Answers",
    subtitle: "J10 responds instantly across messages and conversations.",
    benefit: "Sub-Second Response",
    image: "/brand/slide-02-j10-answers.png",
    alias: "J10 Receptionist",
  },
  {
    num: "03",
    title: "Lead Qualification",
    subtitle: "J10 asks smart questions and identifies real opportunities.",
    benefit: "Autonomous Intent Scoring",
    image: "/brand/slide-03-lead-qualification.png",
    alias: "Revenue Agent",
  },
  {
    num: "04",
    title: "Appointment Booking",
    subtitle: "J10 books appointments directly into the calendar.",
    benefit: "Zero Scheduling Conflicts",
    image: "/brand/slide-04-appointment-booking.png",
  },
  {
    num: "05",
    title: "Missed Call Text Back",
    subtitle: "J10 automatically responds to missed calls and recovers opportunities.",
    benefit: "15-Second Lead Recovery",
    image: "/brand/slide-05-missed-call-text-back.png",
    alias: "Recovery Agent",
  },
  {
    num: "06",
    title: "Support + Unified Inbox + CRM",
    subtitle: "Bring messages, leads, customer history, and team context into one place.",
    benefit: "Full Context Continuity",
    image: "/brand/slide-06-support-inbox-crm.png",
    alias: "Unified Inbox + CRM",
  },
  {
    num: "07",
    title: "Revenue & Payments",
    subtitle: "Collect deposits, send payment links, and automate follow-up to close revenue.",
    benefit: "Automated Checkout Flow",
    image: "/brand/slide-07-revenue-payments.png",
  },
  {
    num: "08",
    title: "Integrations",
    subtitle: "Connect with external tools and workflows for end-to-end operations.",
    benefit: "Native 2-Way Sync",
    image: "/brand/slide-08-integrations.png",
  },
];

const expressions = [
  { name: "Friendly", image: "/brand/j10-expression-friendly.png", role: "Inbound Welcome" },
  { name: "Confident", image: "/brand/j10-expression-confident.png", role: "Authoritative Guidance" },
  { name: "Focused", image: "/brand/j10-expression-focused.png", role: "Qualification & Booking" },
  { name: "Excited", image: "/brand/j10-expression-excited.png", role: "Payment & Closure" },
];

export default function LaunchHome() {
  const [activeSlide, setActiveSlide] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);

  const nextSlide = useCallback(() => {
    setActiveSlide((prev) => (prev + 1) % slides.length);
  }, []);

  const prevSlide = useCallback(() => {
    setActiveSlide((prev) => (prev - 1 + slides.length) % slides.length);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") nextSlide();
      if (e.key === "ArrowLeft") prevSlide();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nextSlide, prevSlide]);

  // Touch handlers for mobile swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return;
    const distance = touchStartX.current - touchEndX.current;
    if (distance > 50) nextSlide();
    if (distance < -50) prevSlide();
    touchStartX.current = null;
    touchEndX.current = null;
  };

  return (
    <div className="relative min-h-screen bg-[#07090f] text-white selection:bg-cyan-500/30 selection:text-cyan-200 overflow-x-hidden font-sans">
      
      {/* ─────────────────────────────────────────────────────────────
          1. CLEAN MINIMAL BLACK + VIOLET BACKGROUND (No Grids, No Scene Art)
          ───────────────────────────────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[800px] z-0 overflow-hidden select-none">
        <Image
          src="/brand/j10-official-bg.png"
          alt="J10 Violet Space Texture"
          fill
          priority
          sizes="100vw"
          className="object-cover object-top opacity-60 mix-blend-screen"
        />
        {/* Soft vignette gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#07090f]/70 via-[#07090f]/85 to-[#07090f]" />
        
        {/* Subtle radial violet depth */}
        <div className="absolute top-[8%] left-1/2 -translate-x-1/2 h-[450px] w-[900px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(168,85,247,0.12),transparent_70%)] blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto max-w-[1240px] px-5 sm:px-6 lg:px-8">

        {/* ─────────────────────────────────────────────────────────────
            2. HERO SECTION: TIGHT, BALANCED LUXURY-TECH COMPOSITION
            ───────────────────────────────────────────────────────────── */}
        <section className="relative pt-8 pb-12 sm:pt-14 sm:pb-20 lg:pt-16 lg:pb-24">
          <div className="grid items-center gap-8 lg:grid-cols-[1.15fr_1fr] lg:gap-10">
            
            {/* Left Column: Commercial Positioning & Direct CTAs */}
            <div className="relative z-20 max-w-xl">
              
              {/* Category Pill */}
              <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/[0.08] px-3.5 py-1.5 text-xs font-semibold text-violet-200 backdrop-blur-md shadow-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#00d9ff]" />
                AI Revenue &amp; Operations System
              </div>

              {/* Main Headline */}
              <h1 className="mt-4 text-4xl sm:text-5xl lg:text-[58px] font-extrabold leading-[1.08] tracking-tight text-white">
                Never miss <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-sky-400 to-violet-400">
                  another lead.
                </span>
              </h1>

              {/* Supporting Copy */}
              <p className="mt-4 text-base sm:text-lg leading-relaxed text-[#c4cdd5]">
                J10 turns conversations into customers—answering, qualifying, following up, booking and collecting payment automatically.
              </p>

              {/* Action Buttons */}
              <div className="mt-7 flex flex-wrap items-center gap-3.5">
                <Link
                  href="/login?intent=signup&plan=growth&trial=1"
                  className="j10-btn-primary group inline-flex items-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold text-white shadow-[0_10px_25px_rgba(0,217,255,0.3)] hover:scale-[1.02] transition-all"
                >
                  Start Free
                  <ArrowRight size={14} className="transition-transform duration-200 group-hover:translate-x-1" />
                </Link>

                <a
                  href="#product"
                  className="j10-btn-secondary inline-flex items-center gap-2 rounded-xl px-5 py-3.5 text-sm font-semibold text-white transition-all"
                >
                  See how J10 works <span className="text-cyan-300">↓</span>
                </a>

                <Link
                  href="/pricing"
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-400 hover:text-white transition"
                >
                  View Plans &amp; Pricing <ArrowRight size={12} />
                </Link>
              </div>

              {/* Trust Copy */}
              <div className="mt-4 flex items-center gap-2 text-xs text-[#8d96a8]">
                <ShieldCheck size={14} className="text-cyan-400 shrink-0" />
                <span>14-day free trial · Instant setup · No credit card required</span>
              </div>
            </div>

            {/* Right Column: J10 Mascot + SaaS Operational Card (Tight Integration) */}
            <div className="relative flex flex-col items-center justify-center lg:items-end">
              <div className="relative w-full max-w-[480px]">
                
                {/* J10 Mascot in Hero (Transparent PNG, subtle parallax only) */}
                <div className="relative z-20 -mb-14 sm:-mb-18 flex justify-center">
                  <div className="w-[240px] sm:w-[290px]">
                    <J10Mascot
                      width={290}
                      height={340}
                      priority
                      glow
                    />
                  </div>
                </div>

                {/* SaaS Revenue Pipeline Card */}
                <div className="j10-surface-elevated relative z-10 w-full overflow-hidden rounded-[22px] border border-white/[0.1] bg-[#0b1020]/90 p-4 sm:p-5 shadow-[0_20px_50px_rgba(0,0,0,0.8)] backdrop-blur-xl">
                  
                  {/* Card Header */}
                  <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="j10-gradient flex h-7 w-7 items-center justify-center rounded-lg p-1 shadow-sm">
                        <Image
                          src="/brand/j10-logo.png"
                          alt="J10 Monogram"
                          width={18}
                          height={18}
                          className="h-full w-full object-contain"
                        />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-white tracking-tight">J10 Revenue Engine</p>
                        <p className="text-[10px] text-[#8d96a8]">Live Operating System</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2.5 py-0.5 border border-emerald-400/20">
                      <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-[10.5px] font-semibold text-emerald-300">Active</span>
                    </div>
                  </div>

                  {/* Pipeline Stream */}
                  <div className="mt-3 space-y-2">
                    {[
                      { state: "Received", title: "Lead Received", detail: "WhatsApp: 'Commercial consultation inquiry'", time: "Just now" },
                      { state: "Answered", title: "Conversation Answered", detail: "J10 Receptionist engaged with scheduling & pricing", time: "12s ago" },
                      { state: "Qualified", title: "Lead Qualified", detail: "Commercial scope and project budget verified", time: "25s ago" },
                      { state: "Booked", title: "Appointment Booked", detail: "Synced to calendar: Thursday 2:00 PM", time: "40s ago" },
                      { state: "Payment Ready", title: "Payment Ready", detail: "Deposit invoice & checkout link dispatched", time: "52s ago" },
                    ].map((step) => (
                      <div
                        key={step.title}
                        className="flex items-start gap-2.5 rounded-xl border border-white/[0.04] bg-white/[0.02] p-2 text-xs transition hover:border-cyan-400/25"
                      >
                        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold j10-gradient text-white shadow-sm">
                          <Check size={10} strokeWidth={3} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <p className="font-semibold text-white text-[11px]">{step.title}</p>
                              <span className="rounded bg-white/[0.06] px-1.5 py-0.2 text-[8.5px] font-medium text-cyan-200">
                                {step.state}
                              </span>
                            </div>
                            <span className="text-[9px] text-[#8d96a8]">{step.time}</span>
                          </div>
                          <p className="mt-0.5 truncate text-[10px] text-[#8d96a8]">{step.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Status Strip */}
                  <div className="mt-3 grid grid-cols-3 gap-2 border-t border-white/[0.08] pt-2.5 text-center">
                    <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-1.5">
                      <p className="text-[8.5px] uppercase tracking-wider text-[#8d96a8]">Pipeline</p>
                      <p className="text-[11px] font-bold text-white">Automated</p>
                    </div>
                    <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-1.5">
                      <p className="text-[8.5px] uppercase tracking-wider text-[#8d96a8]">Execution</p>
                      <p className="text-[11px] font-bold text-cyan-300">Continuous</p>
                    </div>
                    <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-1.5">
                      <p className="text-[8.5px] uppercase tracking-wider text-[#8d96a8]">Sync</p>
                      <p className="text-[11px] font-bold text-violet-300">Omnichannel</p>
                    </div>
                  </div>

                </div>

              </div>
            </div>

          </div>
        </section>

        {/* ─────────────────────────────────────────────────────────────
            3. A COMPLETE REVENUE ENGINE — RESPONSIVE SLIDE-BY-SLIDE EXPLAINER
            ───────────────────────────────────────────────────────────── */}
        <section id="product" className="relative py-14 sm:py-20 border-t border-white/[0.08] scroll-mt-16">
          
          <div className="mx-auto max-w-3xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/[0.08] px-3.5 py-1 text-xs font-semibold text-violet-200 mb-3">
              <span>EXPLORE THE 8 STAGES</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
              A COMPLETE REVENUE ENGINE FOR SERVICE BUSINESSES
            </h2>
            <p className="mt-3 text-sm sm:text-base text-[#8d96a8] max-w-2xl mx-auto">
              From first touch to settled payment—see how J10 automates and connects every step of your customer operations.
            </p>
          </div>

          {/* Slider Controls & Active Tab Pills */}
          <div className="mt-8">
            
            {/* Stage Selector Pills (Desktop / Tablet) */}
            <div className="hidden md:flex items-center justify-center gap-1.5 overflow-x-auto pb-2">
              {slides.map((s, idx) => (
                <button
                  key={s.num}
                  type="button"
                  onClick={() => setActiveSlide(idx)}
                  className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all ${
                    activeSlide === idx
                      ? "bg-gradient-to-r from-violet-600/50 to-cyan-500/50 text-white border border-cyan-400/40 shadow-[0_0_15px_rgba(0,217,255,0.2)]"
                      : "text-slate-400 hover:text-white hover:bg-white/[0.04] border border-transparent"
                  }`}
                >
                  <span className="font-mono text-[10px] opacity-75">{s.num}</span>
                  <span>{s.title}</span>
                </button>
              ))}
            </div>

            {/* Main Interactive Slide Display Card */}
            <div
              className="mt-6 relative overflow-hidden rounded-[26px] border border-white/[0.12] bg-[#0b1020]/95 p-5 sm:p-8 shadow-[0_25px_60px_rgba(0,0,0,0.85)]"
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              {/* Luminous Top Gradient */}
              <div className="absolute inset-x-0 top-0 h-1 j10-gradient" />

              <div className="grid items-center gap-6 lg:grid-cols-[1.2fr_0.9fr]">
                
                {/* Left Side: Slide Graphic Visual */}
                <div className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl border border-white/[0.1] bg-[#07090f] shadow-2xl">
                  <Image
                    src={slides[activeSlide].image}
                    alt={`${slides[activeSlide].num} - ${slides[activeSlide].title}`}
                    fill
                    priority
                    sizes="(max-width: 1024px) 100vw, 640px"
                    className="object-contain"
                  />
                </div>

                {/* Right Side: Slide Details & Stage Info */}
                <div className="flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-cyan-400 tracking-wider">
                        STAGE {slides[activeSlide].num} OF 08
                      </span>
                      <span className="rounded-full bg-cyan-400/10 px-2.5 py-0.5 text-[10.5px] font-semibold text-cyan-300 border border-cyan-400/20">
                        {slides[activeSlide].benefit}
                      </span>
                    </div>

                    <h3 className="mt-3 text-2xl sm:text-3xl font-bold text-white tracking-tight">
                      {slides[activeSlide].title}
                    </h3>

                    <p className="mt-3 text-sm sm:text-base leading-relaxed text-[#c4cdd5]">
                      {slides[activeSlide].subtitle}
                    </p>

                    {slides[activeSlide].alias && (
                      <p className="mt-2 text-xs font-mono text-slate-500">
                        Engine Module: {slides[activeSlide].alias}
                      </p>
                    )}
                  </div>

                  {/* Navigation Arrows & Progress Dots */}
                  <div className="pt-4 border-t border-white/[0.08] flex items-center justify-between">
                    
                    {/* Pagination Dots */}
                    <div className="flex items-center gap-1.5">
                      {slides.map((_, dotIdx) => (
                        <button
                          key={dotIdx}
                          type="button"
                          onClick={() => setActiveSlide(dotIdx)}
                          aria-label={`Go to slide ${dotIdx + 1}`}
                          className={`h-2 rounded-full transition-all duration-300 ${
                            activeSlide === dotIdx
                              ? "w-6 bg-cyan-400 shadow-[0_0_8px_#00d9ff]"
                              : "w-2 bg-white/20 hover:bg-white/40"
                          }`}
                        />
                      ))}
                    </div>

                    {/* Arrow Buttons */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={prevSlide}
                        aria-label="Previous capability"
                        className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.1] bg-white/[0.04] text-slate-300 hover:text-white hover:border-cyan-400/30 transition"
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <button
                        type="button"
                        onClick={nextSlide}
                        aria-label="Next capability"
                        className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.1] bg-white/[0.04] text-slate-300 hover:text-white hover:border-cyan-400/30 transition"
                      >
                        <ChevronRight size={18} />
                      </button>
                    </div>

                  </div>

                </div>

              </div>

            </div>

          </div>

        </section>

        {/* ─────────────────────────────────────────────────────────────
            4. MEET J10: EXPRESSION ICONS SECTION (Clean Brand Strip)
            ───────────────────────────────────────────────────────────── */}
        <section className="relative py-14 sm:py-20 border-t border-white/[0.08]">
          
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">
              Meet J10
            </p>
            <h2 className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              One assistant. Different states for different moments.
            </h2>
            <p className="mt-2 text-sm text-[#8d96a8]">
              J10 adapts its focus and tone to guide customers through each stage of the relationship.
            </p>
          </div>

          {/* 4 Clean Expression Cards Grid */}
          <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
            {expressions.map((exp) => (
              <div
                key={exp.name}
                className="group relative flex flex-col items-center text-center rounded-[20px] border border-white/[0.08] bg-[#0b1020]/75 p-5 shadow-sm backdrop-blur-md transition-all duration-300 hover:border-cyan-400/30 hover:bg-[#0f1424] hover:-translate-y-1"
              >
                {/* Expression Avatar Image */}
                <div className="relative h-28 w-28 sm:h-32 sm:w-32 overflow-hidden rounded-xl p-1.5 flex items-center justify-center">
                  <Image
                    src={exp.image}
                    alt={`J10 ${exp.name} Expression`}
                    width={130}
                    height={130}
                    className="object-contain drop-shadow-[0_10px_20px_rgba(0,217,255,0.2)] transition-transform duration-300 group-hover:scale-105"
                  />
                </div>

                {/* Expression Label */}
                <h4 className="mt-3 text-sm sm:text-base font-bold text-white group-hover:text-cyan-200 transition">
                  {exp.name}
                </h4>
                <p className="mt-0.5 text-xs text-[#8d96a8]">
                  {exp.role}
                </p>
              </div>
            ))}
          </div>

        </section>

        {/* ─────────────────────────────────────────────────────────────
            5. FINAL CALL TO ACTION STRIP
            ───────────────────────────────────────────────────────────── */}
        <section className="relative my-10 rounded-[24px] border border-violet-500/30 bg-gradient-to-r from-[#0b1020] via-[#121827] to-[#0b1020] p-7 sm:p-10 text-center shadow-[0_20px_50px_rgba(0,0,0,0.7)] backdrop-blur-xl">
          <div className="mx-auto max-w-2xl">
            <h3 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Ready to automate your revenue operations?
            </h3>
            <p className="mt-2.5 text-sm sm:text-base text-[#c4cdd5]">
              Deploy J10 in minutes. Never miss another customer conversation, booking, or payment.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3.5">
              <Link
                href="/login?intent=signup&plan=growth&trial=1"
                className="j10-btn-primary group inline-flex items-center gap-2 rounded-xl px-7 py-3.5 text-sm font-semibold text-white shadow-[0_10px_25px_rgba(0,217,255,0.3)] hover:scale-[1.02] transition-all"
              >
                Start Free 14-Day Trial
                <ArrowRight size={14} className="transition-transform duration-200 group-hover:translate-x-1" />
              </Link>
              <Link
                href="/contact"
                className="j10-btn-secondary rounded-xl px-6 py-3.5 text-sm font-semibold text-white transition-all"
              >
                Contact Sales
              </Link>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
