"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Headphones,
  MessageSquare,
  UserCheck,
  Zap,
  Calendar,
  Inbox,
  Database,
  CreditCard,
  Star,
  Megaphone,
  BookOpen,
  Settings2,
  Lock,
  Network,
  Shield,
  Check,
  Send,
  Paperclip,
  CheckCircle2,
  ChevronDown,
  Sparkles,
  Bot,
  User,
  Clock,
  PlayCircle,
  HelpCircle,
  Phone,
  Layers,
  Search,
  Bell,
} from "lucide-react";

export default function LaunchHome() {
  // Billing cycle toggle
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");

  // Ask J10 Live Interactive Simulation State
  const [activeTab, setActiveTab] = useState<"ask" | "demo" | "start">("ask");
  const [emailInput, setEmailInput] = useState("");
  const [emailSubmitted, setEmailSubmitted] = useState(false);
  const [customQuestion, setCustomQuestion] = useState("");
  const [conversation, setConversation] = useState<
    Array<{ sender: "user" | "j10"; text: string; time: string; type?: string }>
  >([
    {
      sender: "user",
      text: "Can J10 help when I miss a call?",
      time: "10:24 AM",
    },
    {
      sender: "j10",
      text: "Yes. J10 answers missed calls, captures the caller's details, understands their needs, and follows up automatically. Would you like to tell me what type of business you run so I can show you the most relevant features?",
      time: "10:24 AM",
    },
    {
      sender: "user",
      text: "I run a home cleaning service.",
      time: "10:25 AM",
    },
    {
      sender: "j10",
      text: "Great! I can show you how J10 handles missed calls, books appointments, and helps you get paid for a home cleaning service. To create a personalized walkthrough, may I have your email?",
      time: "10:25 AM",
      type: "email_prompt",
    },
  ]);

  // FAQ Accordion State (all open by default or collapsible)
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  const toggleFaq = (idx: number) => {
    setExpandedFaq(expandedFaq === idx ? null : idx);
  };

  // Submit email in chat simulator
  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim()) return;
    setEmailSubmitted(true);
    setConversation((prev) => [
      ...prev,
      {
        sender: "user",
        text: emailInput.trim(),
        time: "10:26 AM",
      },
      {
        sender: "j10",
        text: "Perfect! I've prepared a personalized workspace for your home cleaning service. Click below to create your workspace and explore J10 with sample data.",
        time: "10:26 AM",
        type: "workspace_card",
      },
    ]);
  };

  // Handle custom question input in simulator
  const handleQuestionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customQuestion.trim()) return;

    const q = customQuestion.trim();
    setCustomQuestion("");

    // Add user question
    setConversation((prev) => [
      ...prev,
      { sender: "user", text: q, time: "10:27 AM" },
    ]);

    // Intelligent immediate J10 response
    setTimeout(() => {
      let reply = "J10 automates your customer operations seamlessly—handling incoming calls, instant texting, appointment scheduling, and Stripe payments 24/7.";
      const lower = q.toLowerCase();
      if (lower.includes("price") || lower.includes("cost") || lower.includes("plan")) {
        reply = "Our plans start at $19/mo for Starter, $49/mo for Growth (most popular), and $99/mo for Business. Plus, a 72-hour trial begins after onboarding approval!";
      } else if (lower.includes("stripe") || lower.includes("pay") || lower.includes("deposit")) {
        reply = "J10 creates instant, secure Stripe payment links directly in SMS, WhatsApp, and chat conversations so you collect deposits before confirming bookings.";
      } else if (lower.includes("calendar") || lower.includes("book") || lower.includes("schedule")) {
        reply = "J10 syncs with Google Calendar and Outlook to offer qualified callers real-time availability and confirm appointments with zero double-booking.";
      } else if (lower.includes("missed call") || lower.includes("phone")) {
        reply = "When you miss a call, J10 texts back within 15 seconds, greets the caller politely, answers their questions, and secures their appointment on autopilot.";
      }

      setConversation((prev) => [
        ...prev,
        { sender: "j10", text: reply, time: "10:27 AM" },
      ]);
    }, 600);
  };

  const askJ10Ref = useRef<HTMLDivElement>(null);
  const scrollToAskJ10 = () => {
    askJ10Ref.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="relative overflow-hidden bg-[#07060f] text-white">
      {/* Dynamic Cosmic Background Elements */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* Soft violet/purple nebula bloom */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1200px] h-[600px] bg-gradient-to-b from-[#7c3aed]/25 via-[#6347e8]/10 to-transparent blur-[120px] rounded-full" />
        <div className="absolute top-[1800px] right-0 w-[800px] h-[800px] bg-[#7c3aed]/15 blur-[160px] rounded-full" />
        <div className="absolute top-[3200px] left-0 w-[900px] h-[700px] bg-[#6347e8]/15 blur-[160px] rounded-full" />
      </div>

      {/* ========================================================================= */}
      {/* 1. HERO SECTION (REFERENCE IMAGE 1) */}
      {/* ========================================================================= */}
      <section className="relative pt-12 pb-20 lg:pt-16 lg:pb-28">
        <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[1.1fr_1.1fr_1fr] xl:gap-12">
            {/* Left Column: Headline & Value Proposition */}
            <div className="flex flex-col space-y-6">
              <span className="inline-flex items-center text-xs font-bold uppercase tracking-[0.22em] text-[#d8b565]">
                AI FOR SERVICE BUSINESSES
              </span>

              <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl leading-[1.08]">
                Your AI operator <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#a855f7] via-[#c084fc] to-[#818cf8] drop-shadow-[0_0_30px_rgba(168,85,247,0.45)]">
                  is already on it.
                </span>
              </h1>

              <p className="max-w-md text-base leading-relaxed text-[#a1a1aa] sm:text-lg">
                Answers leads. Follows up. Books appointments. <br />
                Helps collect payments. All on autopilot.
              </p>

              {/* Primary Action Button & Free Trial Note */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 pt-2">
                <Link
                  href="/login?intent=signup&plan=growth&trial=1"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#6347e8] via-[#7042f4] to-[#7c3aed] px-8 py-3.5 text-base font-semibold text-white shadow-[0_0_30px_rgba(124,58,237,0.6)] transition-all duration-200 hover:shadow-[0_0_45px_rgba(124,58,237,0.9)] hover:scale-[1.02]"
                >
                  <span>Start Free</span>
                  <ArrowRight size={18} />
                </Link>

                <div className="hidden h-9 w-[1px] bg-white/15 sm:block" />

                <p className="max-w-[210px] text-xs text-[#8d96a8] leading-tight">
                  72-hour free trial starts after Outcome Onboarding approval.
                </p>
              </div>
            </div>

            {/* Center Column: 3D Mascot with Gold Orbital Ring HUD */}
            <div className="relative flex items-center justify-center my-6 lg:my-0">
              {/* Planetary Horizon Glow under Mascot */}
              <div className="pointer-events-none absolute -bottom-10 h-32 w-full bg-gradient-to-t from-[#7c3aed]/30 to-transparent blur-2xl" />

              {/* Orbital Ring Diagram */}
              <div className="relative w-[340px] h-[340px] sm:w-[380px] sm:h-[380px] flex items-center justify-center">
                {/* SVG Golden Orbital Circuit Rings */}
                <svg
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  viewBox="0 0 380 380"
                  fill="none"
                >
                  <circle
                    cx="190"
                    cy="190"
                    r="150"
                    stroke="#d8b565"
                    strokeWidth="1.2"
                    strokeDasharray="4 4"
                    opacity="0.6"
                  />
                  <circle
                    cx="190"
                    cy="190"
                    r="175"
                    stroke="#8b5cf6"
                    strokeWidth="1"
                    opacity="0.3"
                  />
                  {/* Subtle connection glow wires */}
                  <line x1="190" y1="50" x2="190" y2="100" stroke="#d8b565" strokeWidth="1" opacity="0.7" />
                  <line x1="330" y1="190" x2="280" y2="190" stroke="#d8b565" strokeWidth="1" opacity="0.7" />
                  <line x1="90" y1="300" x2="135" y2="255" stroke="#d8b565" strokeWidth="1" opacity="0.7" />
                  <line x1="290" y1="300" x2="245" y2="255" stroke="#d8b565" strokeWidth="1" opacity="0.7" />
                </svg>

                {/* 3D Mascot Center Image */}
                <div className="relative z-10 w-[240px] sm:w-[270px] drop-shadow-[0_0_35px_rgba(124,58,237,0.45)]">
                  <Image
                    src="/brand/j10-mascot-hero.jpg"
                    alt="J10 AI Operator Mascot"
                    width={320}
                    height={320}
                    priority
                    className="w-full h-auto object-contain rounded-2xl filter brightness-105"
                  />
                </div>

                {/* Top HUD Node: Answered */}
                <div className="absolute top-0 flex flex-col items-center text-center z-20">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#121324] border border-[#d8b565]/80 shadow-[0_0_15px_rgba(216,181,101,0.3)]">
                    <MessageSquare size={16} className="text-[#d8b565]" />
                  </div>
                  <span className="mt-1 text-xs font-bold text-white tracking-wide">Answered</span>
                  <span className="text-[10px] text-[#a1a1aa]">AI responds instantly</span>
                </div>

                {/* Right HUD Node: Qualified */}
                <div className="absolute right-0 flex flex-col items-center text-center z-20 translate-x-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#121324] border border-[#d8b565]/80 shadow-[0_0_15px_rgba(216,181,101,0.3)]">
                    <UserCheck size={16} className="text-[#d8b565]" />
                  </div>
                  <span className="mt-1 text-xs font-bold text-white tracking-wide">Qualified</span>
                  <span className="text-[10px] text-[#a1a1aa]">Finds the right leads</span>
                </div>

                {/* Bottom Left HUD Node: Booked */}
                <div className="absolute bottom-2 left-2 flex flex-col items-center text-center z-20">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#121324] border border-[#d8b565]/80 shadow-[0_0_15px_rgba(216,181,101,0.3)]">
                    <Calendar size={16} className="text-[#d8b565]" />
                  </div>
                  <span className="mt-1 text-xs font-bold text-white tracking-wide">Booked</span>
                  <span className="text-[10px] text-[#a1a1aa]">Schedules appointments</span>
                </div>

                {/* Bottom Right HUD Node: Paid */}
                <div className="absolute bottom-2 right-2 flex flex-col items-center text-center z-20">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#121324] border border-[#d8b565]/80 shadow-[0_0_15px_rgba(216,181,101,0.3)]">
                    <CreditCard size={16} className="text-[#d8b565]" />
                  </div>
                  <span className="mt-1 text-xs font-bold text-white tracking-wide">Paid</span>
                  <span className="text-[10px] text-[#a1a1aa]">Helps collect payments</span>
                </div>
              </div>
            </div>

            {/* Right Column: Live Customer Journey Timeline Stream */}
            <div className="rounded-2xl border border-white/10 bg-[#0d0f1e]/80 p-5 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.6)]">
              <div className="relative pl-6 space-y-5 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-[2px] before:bg-gradient-to-b before:from-[#7c3aed] before:via-[#4f46e5] before:to-white/20">
                {/* Step 1: New Lead */}
                <div className="relative">
                  <div className="absolute -left-[27px] top-1 flex h-6 w-6 items-center justify-center rounded-full bg-[#1c1d33] border border-white/20 text-[#c4cdd5]">
                    <User size={13} />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-white">New lead</span>
                    <span className="text-[#717a8c]">10:14 AM</span>
                  </div>
                  <div className="mt-1.5 rounded-xl bg-[#141628] p-3 text-xs leading-relaxed text-[#c4cdd5] border border-white/5">
                    Hi! Do you offer house cleaning service? I&apos;d like a quote.
                  </div>
                </div>

                {/* Step 2: J10 NEXUS Response */}
                <div className="relative">
                  <div className="absolute -left-[27px] top-1 flex h-6 w-6 items-center justify-center rounded-full bg-[#7c3aed] border border-[#a855f7] shadow-[0_0_10px_rgba(124,58,237,0.8)] text-white">
                    <Bot size={13} />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-violet-300">J10 NEXUS</span>
                    <span className="text-[#717a8c]">10:15 AM</span>
                  </div>
                  <div className="mt-1.5 rounded-xl bg-[#1d1738] p-3 text-xs leading-relaxed text-[#e2d9f3] border border-[#7c3aed]/30 shadow-[0_0_15px_rgba(124,58,237,0.15)]">
                    Hi! Yes, we do. I can help with a quote. What&apos;s your address and preferred cleaning date?
                  </div>
                </div>

                {/* Step 3: Appointment booked */}
                <div className="relative">
                  <div className="absolute -left-[27px] top-1 flex h-6 w-6 items-center justify-center rounded-full bg-[#1c1d33] border border-white/20 text-[#c4cdd5]">
                    <Calendar size={13} />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-white">Appointment booked</span>
                    <span className="text-[#717a8c]">10:18 AM</span>
                  </div>
                  <div className="mt-1.5 rounded-xl bg-[#141628] p-3 text-xs leading-relaxed text-[#c4cdd5] border border-white/5">
                    Great! You&apos;re confirmed for Sat, Apr 26 at 10:00 AM. We&apos;ll send a reminder the day before.
                  </div>
                </div>

                {/* Step 4: Deposit request & Pay Button */}
                <div className="relative">
                  <div className="absolute -left-[27px] top-1 flex h-6 w-6 items-center justify-center rounded-full bg-[#1c1d33] border border-[#d8b565] text-[#d8b565]">
                    <CreditCard size={13} />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-white">Deposit request</span>
                    <span className="text-[#717a8c]">10:18 AM</span>
                  </div>
                  <div className="mt-1.5 rounded-xl bg-[#141628] p-3 text-xs leading-relaxed text-[#c4cdd5] border border-white/5 space-y-2">
                    <p>To secure your booking, you can pay a deposit here:</p>
                    <Link
                      href="/pricing"
                      className="inline-flex items-center justify-center gap-1.5 w-full rounded-lg bg-gradient-to-r from-[#6347e8] to-[#7c3aed] py-2 text-xs font-semibold text-white shadow-[0_0_15px_rgba(124,58,237,0.4)] hover:brightness-110 transition-all"
                    >
                      <span>Pay deposit with Stripe</span>
                      <ArrowRight size={13} />
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* Bottom Feature Dock ("WHAT J10 CAN DO") */}
          {/* ========================================================================= */}
          <div className="mt-14 w-full rounded-full border border-[#7c3aed]/50 bg-[#0d0f22]/90 px-6 py-4 backdrop-blur-2xl shadow-[0_0_35px_rgba(124,58,237,0.25)]">
            <div className="flex flex-col lg:flex-row items-center justify-between gap-4 overflow-x-auto no-scrollbar">
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#d8b565] whitespace-nowrap pr-4 border-b lg:border-b-0 lg:border-r border-white/10 pb-2 lg:pb-0">
                WHAT J10 CAN DO
              </span>

              <div className="flex items-center gap-6 sm:gap-7 overflow-x-auto w-full py-1 text-[#a1a1aa] text-xs font-medium">
                <div className="flex items-center gap-2 hover:text-white transition-colors whitespace-nowrap">
                  <Headphones size={15} className="text-violet-400" />
                  <span>AI Receptionist (J10 Receptionist)</span>
                </div>
                <div className="flex items-center gap-2 hover:text-white transition-colors whitespace-nowrap">
                  <MessageSquare size={15} className="text-violet-400" />
                  <span>Missed Call Text Back (Recovery Agent)</span>
                </div>
                <div className="flex items-center gap-2 hover:text-white transition-colors whitespace-nowrap">
                  <UserCheck size={15} className="text-violet-400" />
                  <span>Lead Qualification</span>
                </div>
                <div className="flex items-center gap-2 hover:text-white transition-colors whitespace-nowrap">
                  <Zap size={15} className="text-violet-400" />
                  <span>Instant Follow Up (Revenue Agent)</span>
                </div>
                <div className="flex items-center gap-2 hover:text-white transition-colors whitespace-nowrap">
                  <Calendar size={15} className="text-violet-400" />
                  <span>Appointment Booking</span>
                </div>
                <div className="flex items-center gap-2 hover:text-white transition-colors whitespace-nowrap">
                  <Inbox size={15} className="text-violet-400" />
                  <span>Unified Inbox + CRM</span>
                </div>
                <div className="flex items-center gap-2 hover:text-white transition-colors whitespace-nowrap">
                  <Database size={15} className="text-violet-400" />
                  <span>CRM</span>
                </div>
                <div className="flex items-center gap-2 hover:text-white transition-colors whitespace-nowrap">
                  <CreditCard size={15} className="text-violet-400" />
                  <span>Payment Links</span>
                </div>
                <div className="flex items-center gap-2 hover:text-white transition-colors whitespace-nowrap">
                  <Star size={15} className="text-violet-400" />
                  <span>Review Requests</span>
                </div>
                <div className="flex items-center gap-2 hover:text-white transition-colors whitespace-nowrap">
                  <Megaphone size={15} className="text-violet-400" />
                  <span>Campaigns</span>
                </div>
                <div className="flex items-center gap-2 hover:text-white transition-colors whitespace-nowrap">
                  <BookOpen size={15} className="text-violet-400" />
                  <span>Knowledge Base</span>
                </div>
                <div className="flex items-center gap-2 hover:text-white transition-colors whitespace-nowrap">
                  <Settings2 size={15} className="text-violet-400" />
                  <span>Automations</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 2. THE J10 PRODUCT SYSTEM (REFERENCE IMAGE 4 / PRODUCTS.JPG) */}
      {/* ========================================================================= */}
      <section id="product" className="relative py-20 lg:py-28 border-t border-white/[0.06]">
        <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
          {/* Header */}
          <div className="text-center max-w-3xl mx-auto space-y-3 mb-16">
            <span className="text-xs font-bold uppercase tracking-[0.22em] text-[#d8b565]">
              THE J10 PRODUCT SYSTEM
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white">
              Seven J10 products.{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#a855f7] to-[#c084fc]">
                One business operator.
              </span>
            </h2>
            <p className="text-base text-[#a1a1aa]">
              Everything works from one workspace.
            </p>
          </div>

          {/* Connected Topology Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
            {/* Left 3 Product Cards */}
            <div className="flex flex-col space-y-6">
              {/* Card 1: J10 Lead Center */}
              <div className="group rounded-2xl border border-white/10 bg-[#0d0f22]/90 p-5 backdrop-blur-xl transition-all duration-300 hover:border-[#7c3aed]/50 hover:shadow-[0_0_25px_rgba(124,58,237,0.2)]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#7c3aed] to-[#4f46e5] text-white">
                      <User size={18} />
                    </div>
                    <h3 className="font-bold text-white text-base">J10 Lead Center</h3>
                  </div>
                  <ArrowRight size={16} className="text-[#717a8c] group-hover:text-white group-hover:translate-x-1 transition-all" />
                </div>
                <p className="mt-2 text-xs text-[#a1a1aa] leading-relaxed">
                  Capture, organize and qualify every lead from all your channels.
                </p>
                {/* Mini Preview UI */}
                <div className="mt-3 rounded-xl bg-[#12142a] p-3 text-[11px] border border-white/5 space-y-1.5">
                  <div className="flex justify-between items-center text-white/90">
                    <span>Website lead</span>
                    <span className="text-[10px] text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full">New</span>
                  </div>
                  <div className="flex justify-between items-center text-[#8d96a8]">
                    <span>Facebook Lead</span>
                    <span className="text-[10px] text-violet-400 bg-violet-950/60 px-2 py-0.5 rounded-full">In conversation</span>
                  </div>
                  <div className="flex justify-between items-center text-[#8d96a8]">
                    <span>Call from (415) 555-0123</span>
                    <span className="text-[10px] text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded-full">Qualified</span>
                  </div>
                </div>
              </div>

              {/* Card 2: J10 Inbox */}
              <div className="group rounded-2xl border border-white/10 bg-[#0d0f22]/90 p-5 backdrop-blur-xl transition-all duration-300 hover:border-[#7c3aed]/50 hover:shadow-[0_0_25px_rgba(124,58,237,0.2)]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#7c3aed] to-[#4f46e5] text-white">
                      <Inbox size={18} />
                    </div>
                    <h3 className="font-bold text-white text-base">J10 Inbox</h3>
                  </div>
                  <ArrowRight size={16} className="text-[#717a8c] group-hover:text-white group-hover:translate-x-1 transition-all" />
                </div>
                <p className="mt-2 text-xs text-[#a1a1aa] leading-relaxed">
                  All calls, texts, emails and DMs in one unified inbox with AI responses.
                </p>
                {/* Mini Preview UI */}
                <div className="mt-3 rounded-xl bg-[#12142a] p-3 text-[11px] border border-white/5 space-y-1.5">
                  <div className="flex items-center gap-2 text-[10px] text-[#8d96a8] border-b border-white/5 pb-1">
                    <span className="text-white font-semibold">All 12</span>
                    <span>Calls</span>
                    <span>Texts</span>
                    <span>Emails</span>
                  </div>
                  <div className="flex justify-between items-center text-white/90">
                    <span>Sarah Kim</span>
                    <span className="text-[#717a8c]">10:14 AM</span>
                  </div>
                  <div className="flex justify-between items-center text-[#8d96a8]">
                    <span>(415) 555-0123</span>
                    <span className="text-rose-400">Missed call</span>
                  </div>
                </div>
              </div>

              {/* Card 3: J10 Booking */}
              <div className="group rounded-2xl border border-white/10 bg-[#0d0f22]/90 p-5 backdrop-blur-xl transition-all duration-300 hover:border-[#7c3aed]/50 hover:shadow-[0_0_25px_rgba(124,58,237,0.2)]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#7c3aed] to-[#4f46e5] text-white">
                      <Calendar size={18} />
                    </div>
                    <h3 className="font-bold text-white text-base">J10 Booking</h3>
                  </div>
                  <ArrowRight size={16} className="text-[#717a8c] group-hover:text-white group-hover:translate-x-1 transition-all" />
                </div>
                <p className="mt-2 text-xs text-[#a1a1aa] leading-relaxed">
                  Turn qualified leads into scheduled appointments automatically.
                </p>
                {/* Mini Preview UI */}
                <div className="mt-3 rounded-xl bg-[#12142a] p-3 text-[11px] border border-white/5 space-y-1.5">
                  <div className="flex justify-between items-center text-white/90">
                    <span>Buyer consultation</span>
                    <span className="text-[10px] text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full">Confirmed</span>
                  </div>
                  <div className="flex justify-between items-center text-[#8d96a8]">
                    <span>Property showing</span>
                    <span className="text-[10px] text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full">Confirmed</span>
                  </div>
                  <div className="flex justify-between items-center text-[#8d96a8]">
                    <span>Listing appointment</span>
                    <span className="text-[10px] text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded-full">Pending</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Center: Command Center Window */}
            <div className="relative flex flex-col items-center">
              <div className="w-full rounded-2xl border border-[#7c3aed]/50 bg-[#0c0d1e] p-5 shadow-[0_0_40px_rgba(124,58,237,0.3)] backdrop-blur-2xl">
                {/* Window Topbar */}
                <div className="flex items-center justify-between border-b border-white/10 pb-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white tracking-wide">J10 NEXUS</span>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg bg-white/5 px-2.5 py-1 text-[11px] text-[#717a8c] w-1/2">
                    <Search size={12} />
                    <span className="truncate">Search leads, bookings...</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Bell size={13} className="text-[#8d96a8]" />
                    <div className="h-5 w-5 rounded-full bg-violet-600 flex items-center justify-center text-[10px] font-bold text-white">
                      J
                    </div>
                  </div>
                </div>

                {/* Command Center View Preview */}
                <div className="mt-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-sm text-white">Command Center</h4>
                      <p className="text-[10px] text-[#717a8c]">Your day at a glance</p>
                    </div>
                    <span className="rounded bg-white/5 px-2 py-0.5 text-[10px] text-[#c4cdd5]">Today ⌄</span>
                  </div>

                  {/* 4 Metric Tiles */}
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="rounded-lg bg-white/5 p-2">
                      <span className="block text-xs font-bold text-violet-300">14</span>
                      <span className="text-[9px] text-[#8d96a8]">New leads</span>
                    </div>
                    <div className="rounded-lg bg-white/5 p-2">
                      <span className="block text-xs font-bold text-amber-300">8</span>
                      <span className="text-[9px] text-[#8d96a8]">Follow ups</span>
                    </div>
                    <div className="rounded-lg bg-white/5 p-2">
                      <span className="block text-xs font-bold text-blue-300">6</span>
                      <span className="text-[9px] text-[#8d96a8]">Bookings</span>
                    </div>
                    <div className="rounded-lg bg-white/5 p-2">
                      <span className="block text-xs font-bold text-emerald-300">$1,850</span>
                      <span className="text-[9px] text-[#8d96a8]">Payments</span>
                    </div>
                  </div>

                  {/* Recent Activity Feed */}
                  <div className="space-y-1.5 text-[10px] rounded-xl bg-white/[0.02] p-2.5 border border-white/5">
                    <div className="flex items-center justify-between text-[#c4cdd5]">
                      <span>● New lead from website</span>
                      <span className="text-[#717a8c]">2m ago</span>
                    </div>
                    <div className="flex items-center justify-between text-[#c4cdd5]">
                      <span>● Appointment booked</span>
                      <span className="text-[#717a8c]">14m ago</span>
                    </div>
                    <div className="flex items-center justify-between text-[#c4cdd5]">
                      <span>● Payment received ($250 deposit)</span>
                      <span className="text-[#717a8c]">1h ago</span>
                    </div>
                  </div>
                </div>
              </div>

                {/* Subtitle Badge */}
                <div className="mt-6 flex flex-col items-center text-center">
                  <div className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#6347e8] to-[#7c3aed] px-5 py-2 text-xs font-bold text-white shadow-[0_0_20px_rgba(124,58,237,0.4)]">
                    <Layers size={14} />
                    <span>J10 Command Center</span>
                  </div>
                  <p className="mt-3 max-w-sm text-xs text-[#a1a1aa] leading-relaxed">
                    See your entire business in one place. Leads, conversations, bookings, payments and AI activity — all in real time.
                  </p>
                </div>
            </div>

            {/* Right 3 Product Cards */}
            <div className="flex flex-col space-y-6">
              {/* Card 4: J10 Growth */}
              <div className="group rounded-2xl border border-white/10 bg-[#0d0f22]/90 p-5 backdrop-blur-xl transition-all duration-300 hover:border-[#7c3aed]/50 hover:shadow-[0_0_25px_rgba(124,58,237,0.2)]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#7c3aed] to-[#4f46e5] text-white">
                      <Zap size={18} />
                    </div>
                    <h3 className="font-bold text-white text-base">J10 Growth</h3>
                  </div>
                  <ArrowRight size={16} className="text-[#717a8c] group-hover:text-white group-hover:translate-x-1 transition-all" />
                </div>
                <p className="mt-2 text-xs text-[#a1a1aa] leading-relaxed">
                  Launch automated follow ups, campaigns and nurture sequences.
                </p>
                {/* Mini Preview UI */}
                <div className="mt-3 rounded-xl bg-[#12142a] p-3 text-[11px] border border-white/5 space-y-1.5">
                  <div className="flex justify-between items-center text-white/90">
                    <span>New Lead Nurture</span>
                    <span className="text-[10px] text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full">Active</span>
                  </div>
                  <div className="flex justify-between items-center text-[#8d96a8]">
                    <span>Showing Follow Up</span>
                    <span className="text-[10px] text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full">Active</span>
                  </div>
                  <div className="flex justify-between items-center text-[#8d96a8]">
                    <span>Market Update</span>
                    <span className="text-[10px] text-slate-400 bg-slate-900/60 px-2 py-0.5 rounded-full">Draft</span>
                  </div>
                </div>
              </div>

              {/* Card 5: J10 AI Operator */}
              <div className="group rounded-2xl border border-white/10 bg-[#0d0f22]/90 p-5 backdrop-blur-xl transition-all duration-300 hover:border-[#7c3aed]/50 hover:shadow-[0_0_25px_rgba(124,58,237,0.2)]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#7c3aed] to-[#4f46e5] text-white">
                      <Bot size={18} />
                    </div>
                    <h3 className="font-bold text-white text-base">J10 AI Operator</h3>
                  </div>
                  <ArrowRight size={16} className="text-[#717a8c] group-hover:text-white group-hover:translate-x-1 transition-all" />
                </div>
                <p className="mt-2 text-xs text-[#a1a1aa] leading-relaxed">
                  Answers, follows up, books appointments and handles daily work.
                </p>
                {/* Mini Preview UI */}
                <div className="mt-3 rounded-xl bg-[#1d1738] p-3 text-[11px] border border-[#7c3aed]/30 space-y-1.5">
                  <div className="flex items-center justify-between text-violet-300 font-semibold text-[10px]">
                    <span>AI Operator</span>
                    <span className="text-emerald-400">● Active</span>
                  </div>
                  <p className="text-white/90 leading-tight">
                    A new lead just came in. I&apos;ve replied, qualified them, and scheduled a viewing for Saturday at 10:00 AM.
                  </p>
                </div>
              </div>

              {/* Card 6: J10 Pay */}
              <div className="group rounded-2xl border border-white/10 bg-[#0d0f22]/90 p-5 backdrop-blur-xl transition-all duration-300 hover:border-[#7c3aed]/50 hover:shadow-[0_0_25px_rgba(124,58,237,0.2)]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#7c3aed] to-[#4f46e5] text-white">
                      <CreditCard size={18} />
                    </div>
                    <h3 className="font-bold text-white text-base">J10 Pay</h3>
                  </div>
                  <ArrowRight size={16} className="text-[#717a8c] group-hover:text-white group-hover:translate-x-1 transition-all" />
                </div>
                <p className="mt-2 text-xs text-[#a1a1aa] leading-relaxed">
                  Collect payments, deposits and fees securely and automatically.
                </p>
                {/* Mini Preview UI */}
                <div className="mt-3 rounded-xl bg-[#12142a] p-3 text-[11px] border border-white/5 space-y-1.5">
                  <div className="flex justify-between items-center text-white/90">
                    <span>Booking deposit</span>
                    <span className="text-[10px] text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full">Paid</span>
                  </div>
                  <div className="flex justify-between items-center text-[#8d96a8]">
                    <span>Consultation fee</span>
                    <span className="text-[10px] text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full">Paid</span>
                  </div>
                  <div className="flex justify-between items-center text-[#8d96a8]">
                    <span>Commission invoice</span>
                    <span className="text-[10px] text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded-full">Pending</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 3. ASK J10 LIVE INTERACTIVE EXPERIENCE (REFERENCE IMAGE 2) */}
      {/* ========================================================================= */}
      <section ref={askJ10Ref} id="services" className="relative py-20 lg:py-28 border-t border-white/[0.06]">
        <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
          {/* Header */}
          <div className="text-center max-w-3xl mx-auto space-y-3 mb-16">
            <span className="text-xs font-bold uppercase tracking-[0.22em] text-[#d8b565]">
              ASK J10 LIVE
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white">
              Let visitors experience J10{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#a855f7] to-[#c084fc]">
                before they sign up.
              </span>
            </h2>
            <p className="text-base text-[#a1a1aa]">
              Ask questions, see how it works, and get a feel for J10. Our AI will guide you through your use case and show you what&apos;s possible for your business.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_0.9fr] gap-8 items-start">
            {/* Left Column: Interactive Chat Terminal */}
            <div className="rounded-2xl border border-white/10 bg-[#0d0f22]/95 backdrop-blur-2xl shadow-[0_0_40px_rgba(0,0,0,0.7)] p-6">
              {/* Tabs */}
              <div className="flex items-center gap-2 border-b border-white/10 pb-4 mb-6">
                <button
                  type="button"
                  onClick={() => setActiveTab("ask")}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-all ${
                    activeTab === "ask"
                      ? "bg-gradient-to-r from-[#6347e8] to-[#7c3aed] text-white shadow-[0_0_15px_rgba(124,58,237,0.5)]"
                      : "text-[#8d96a8] hover:text-white hover:bg-white/5"
                  }`}
                >
                  <MessageSquare size={14} />
                  <span>Ask a question</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("demo")}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-all ${
                    activeTab === "demo"
                      ? "bg-gradient-to-r from-[#6347e8] to-[#7c3aed] text-white shadow-[0_0_15px_rgba(124,58,237,0.5)]"
                      : "text-[#8d96a8] hover:text-white hover:bg-white/5"
                  }`}
                >
                  <PlayCircle size={14} />
                  <span>See how it works</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("start")}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-all ${
                    activeTab === "start"
                      ? "bg-gradient-to-r from-[#6347e8] to-[#7c3aed] text-white shadow-[0_0_15px_rgba(124,58,237,0.5)]"
                      : "text-[#8d96a8] hover:text-white hover:bg-white/5"
                  }`}
                >
                  <User size={14} />
                  <span>Get started</span>
                </button>
              </div>

              {/* Chat Conversation Thread */}
              <div className="space-y-4 max-h-[460px] overflow-y-auto pr-2">
                {conversation.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-3 ${
                      msg.sender === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    {msg.sender === "j10" && (
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#7c3aed] to-[#4f46e5] text-white shadow-[0_0_10px_rgba(124,58,237,0.5)]">
                        <Bot size={16} />
                      </div>
                    )}

                    <div className="flex flex-col max-w-[85%] space-y-2">
                      <div className="flex items-center gap-2 text-[10px] text-[#717a8c]">
                        <span className="font-semibold text-white/80">
                          {msg.sender === "user" ? "You" : "J10 NEXUS"}
                        </span>
                        <span>{msg.time}</span>
                      </div>

                      <div
                        className={`rounded-2xl p-4 text-xs sm:text-sm leading-relaxed ${
                          msg.sender === "user"
                            ? "bg-[#181a30] text-white border border-white/10 rounded-tr-none"
                            : "bg-[#1d1738] text-[#e2d9f3] border border-[#7c3aed]/30 shadow-[0_0_15px_rgba(124,58,237,0.1)] rounded-tl-none"
                        }`}
                      >
                        {msg.text}

                        {/* Interactive Email Form inside message */}
                        {msg.type === "email_prompt" && !emailSubmitted && (
                          <form
                            onSubmit={handleEmailSubmit}
                            className="mt-3 flex items-center gap-2 rounded-xl bg-[#121324] p-1.5 border border-white/10"
                          >
                            <input
                              type="email"
                              value={emailInput}
                              onChange={(e) => setEmailInput(e.target.value)}
                              placeholder="you@yourbusiness.com"
                              className="w-full bg-transparent px-3 text-xs text-white placeholder-[#717a8c] focus:outline-none"
                              required
                            />
                            <button
                              type="submit"
                              className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-r from-[#6347e8] to-[#7c3aed] text-white shadow hover:brightness-110"
                            >
                              <Check size={14} />
                            </button>
                          </form>
                        )}

                        {/* Interactive Workspace Creation Card */}
                        {msg.type === "workspace_card" && (
                          <div className="mt-3">
                            <Link
                              href="/login?intent=signup&plan=growth&trial=1"
                              className="inline-flex items-center justify-center gap-2 w-full rounded-xl bg-gradient-to-r from-[#6347e8] to-[#7c3aed] py-2.5 text-xs font-bold text-white shadow-[0_0_20px_rgba(124,58,237,0.5)] hover:brightness-110 transition-all"
                            >
                              <span>Create my workspace</span>
                              <ArrowRight size={14} />
                            </Link>
                          </div>
                        )}
                      </div>

                      {/* Confirmation Status Banner */}
                      {msg.type === "workspace_card" && (
                        <div className="rounded-xl border border-white/10 bg-[#121324] p-3 text-xs text-[#c4cdd5] space-y-2">
                          <div className="flex items-center gap-2 text-emerald-400 font-semibold text-[11px]">
                            <CheckCircle2 size={14} />
                            <span>Your information has been received.</span>
                          </div>
                          <p className="text-[11px] text-[#8d96a8]">
                            We&apos;ll send your personalized walkthrough to your email and keep you updated. You can create your workspace anytime in just a few clicks.
                          </p>
                          <Link
                            href="/login?intent=signup&plan=growth&trial=1"
                            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#d8b565] hover:underline"
                          >
                            <span>Explore more with J10</span>
                            <ArrowRight size={12} />
                          </Link>
                        </div>
                      )}
                    </div>

                    {msg.sender === "user" && (
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-[#1c1d33] border border-white/20 text-[#c4cdd5]">
                        <User size={16} />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Bottom Interactive Input Bar */}
              <form onSubmit={handleQuestionSubmit} className="mt-6 flex items-center gap-3">
                <div className="relative flex flex-1 items-center rounded-full border border-white/15 bg-[#121326] px-4 py-2.5">
                  <Paperclip size={16} className="text-[#717a8c] mr-2" />
                  <input
                    type="text"
                    value={customQuestion}
                    onChange={(e) => setCustomQuestion(e.target.value)}
                    placeholder="Ask J10 anything..."
                    className="w-full bg-transparent text-xs sm:text-sm text-white placeholder-[#717a8c] focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-r from-[#6347e8] to-[#7c3aed] text-white shadow-[0_0_15px_rgba(124,58,237,0.5)] hover:scale-105 transition-transform"
                >
                  <Send size={15} />
                </button>
              </form>
            </div>

            {/* Right Column: Key Value Pillars & Security Callout */}
            <div className="flex flex-col space-y-6">
              {/* Pillar 1 */}
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-[#d8b565]/80 bg-[#121324] text-[#d8b565] shadow-[0_0_15px_rgba(216,181,101,0.2)]">
                  <MessageSquare size={18} />
                </div>
                <div>
                  <h4 className="font-bold text-white text-base">Answers product questions</h4>
                  <p className="mt-1 text-xs sm:text-sm text-[#a1a1aa] leading-relaxed">
                    Get clear, accurate answers about features, pricing, and how J10 works.
                  </p>
                </div>
              </div>

              {/* Pillar 2 */}
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-[#d8b565]/80 bg-[#121324] text-[#d8b565] shadow-[0_0_15px_rgba(216,181,101,0.2)]">
                  <UserCheck size={18} />
                </div>
                <div>
                  <h4 className="font-bold text-white text-base">Qualifies interested visitors</h4>
                  <p className="mt-1 text-xs sm:text-sm text-[#a1a1aa] leading-relaxed">
                    J10 asks the right questions to understand your business and guide you to the best next step.
                  </p>
                </div>
              </div>

              {/* Pillar 3 */}
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-[#d8b565]/80 bg-[#121324] text-[#d8b565] shadow-[0_0_15px_rgba(216,181,101,0.2)]">
                  <BookOpen size={18} />
                </div>
                <div>
                  <h4 className="font-bold text-white text-base">Helps with signup</h4>
                  <p className="mt-1 text-xs sm:text-sm text-[#a1a1aa] leading-relaxed">
                    Creates a personalized workspace and walks you through the next steps.
                  </p>
                </div>
              </div>

              {/* Security Callout Box */}
              <div className="rounded-2xl border border-[#d8b565]/40 bg-[#121322] p-5 shadow-[0_0_20px_rgba(216,181,101,0.15)] flex items-start gap-4">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[#d8b565]/10 text-[#d8b565]">
                  <Lock size={18} />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-[#d8b565]">Account changes require sign-in.</h4>
                  <p className="mt-1 text-xs text-[#8d96a8] leading-relaxed">
                    For security, J10 can&apos;t access or modify your account without you signing in.
                  </p>
                </div>
              </div>

              {/* Waving Mascot Visual */}
              <div className="relative pt-4 flex justify-end">
                <div className="w-[180px] drop-shadow-[0_0_25px_rgba(124,58,237,0.4)]">
                  <Image
                    src="/brand/j10-mascot-peek.jpg"
                    alt="J10 AI Mascot Assistant"
                    width={200}
                    height={160}
                    className="w-full h-auto object-contain rounded-xl"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 4. BUILT FOR TRUST & FROM THE FOUNDER (REFERENCE IMAGE 5 / TRUST-FOUNDER) */}
      {/* ========================================================================= */}
      <section id="trust" className="relative py-20 lg:py-28 border-t border-white/[0.06]">
        <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
          {/* Header */}
          <div className="text-center max-w-3xl mx-auto space-y-3 mb-16">
            <span className="text-xs font-bold uppercase tracking-[0.22em] text-[#d8b565]">
              BUILT FOR TRUST
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white">
              Built for small businesses. <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#a855f7] to-[#c084fc]">
                Engineered like serious infrastructure.
              </span>
            </h2>
            <p className="text-base text-[#a1a1aa]">
              Your customer conversations, bookings, and payments deserve real protection. J10 NEXUS is built with enterprise-grade foundations, designed for everyday service businesses.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_0.9fr] gap-8 items-stretch">
            {/* Left Column: Security Architecture Hub Diagram */}
            <div className="relative rounded-2xl border border-[#7c3aed]/50 bg-[#0d0f22]/90 p-8 backdrop-blur-2xl shadow-[0_0_35px_rgba(124,58,237,0.2)] flex flex-col justify-center">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 relative">
                {/* Center Node (Absolute in center of grid on sm screens) */}
                <div className="hidden sm:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-16 w-16 items-center justify-center rounded-full bg-[#15132d] border-2 border-[#d8b565] shadow-[0_0_25px_rgba(216,181,101,0.5)] z-20">
                  <Image
                    src="/brand/j10-logo.png"
                    alt="J10 Shield"
                    width={28}
                    height={28}
                    className="object-contain filter brightness-125"
                  />
                </div>

                {/* Node 1: Encrypted credentials */}
                <div className="rounded-xl border border-white/10 bg-[#12142a] p-5 space-y-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[#d8b565] bg-[#1a1b32] text-[#d8b565]">
                    <Lock size={16} />
                  </div>
                  <h4 className="font-bold text-sm text-white">Encrypted credentials</h4>
                  <p className="text-xs text-[#8d96a8] leading-relaxed">
                    Your connected accounts and API keys are encrypted and stored securely.
                  </p>
                </div>

                {/* Node 2: Tenant-isolated data */}
                <div className="rounded-xl border border-white/10 bg-[#12142a] p-5 space-y-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[#d8b565] bg-[#1a1b32] text-[#d8b565]">
                    <Database size={16} />
                  </div>
                  <h4 className="font-bold text-sm text-white">Tenant-isolated data</h4>
                  <p className="text-xs text-[#8d96a8] leading-relaxed">
                    Your business data stays separated and isolated from other businesses on the platform.
                  </p>
                </div>

                {/* Node 3: Protected webhooks */}
                <div className="rounded-xl border border-white/10 bg-[#12142a] p-5 space-y-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[#d8b565] bg-[#1a1b32] text-[#d8b565]">
                    <Network size={16} />
                  </div>
                  <h4 className="font-bold text-sm text-white">Protected webhooks</h4>
                  <p className="text-xs text-[#8d96a8] leading-relaxed">
                    Incoming and outgoing webhooks are authenticated, validated, and rate-limited to prevent abuse.
                  </p>
                </div>

                {/* Node 4: Human escalation controls */}
                <div className="rounded-xl border border-white/10 bg-[#12142a] p-5 space-y-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[#d8b565] bg-[#1a1b32] text-[#d8b565]">
                    <User size={16} />
                  </div>
                  <h4 className="font-bold text-sm text-white">Human escalation controls</h4>
                  <p className="text-xs text-[#8d96a8] leading-relaxed">
                    You stay in control. Sensitive situations can be escalated to your team with full conversation context.
                  </p>
                </div>
              </div>
            </div>

            {/* Right Column: "FROM THE FOUNDER" Card */}
            <div className="rounded-2xl border border-[#d8b565]/40 bg-[#0d0f22]/95 p-8 backdrop-blur-2xl shadow-[0_0_35px_rgba(216,181,101,0.15)] flex flex-col justify-between">
              <div className="space-y-6">
                {/* Header Tag */}
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold uppercase tracking-[0.22em] text-[#d8b565]">
                    FROM THE FOUNDER
                  </span>
                  <div className="h-px flex-1 bg-[#d8b565]/30" />
                </div>

                {/* Founder Profile Details with Real Photo */}
                <div className="flex items-center gap-5">
                  <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl border-2 border-[#d8b565] shadow-[0_0_20px_rgba(216,181,101,0.3)]">
                    <Image
                      src="/brand/founder-richie.jpg"
                      alt="Jeefthe Richeder Osne, Founder & CEO"
                      width={120}
                      height={120}
                      className="h-full w-full object-cover object-top filter brightness-105"
                    />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white tracking-tight">
                      Jeefthe Richeder Osne
                    </h3>
                    <p className="text-xs text-[#d8b565] font-medium mt-0.5">
                      Founder &amp; CEO, J10 NEXUS
                    </p>
                  </div>
                </div>

                {/* Personal Message */}
                <div className="space-y-3 text-xs sm:text-sm leading-relaxed text-[#c4cdd5]">
                  <p>
                    I built J10 NEXUS because I saw how often small service businesses lose customers to missed calls, slow follow ups, and disconnected tools.
                  </p>
                  <p>
                    My goal is simple: give owners an affordable AI operator that actually works for real service businesses, so you can focus on what you do best.
                  </p>
                </div>
              </div>

              {/* LinkedIn Button */}
              <div className="pt-6">
                <a
                  href="https://www.linkedin.com/in/jeefthe-osne-143a9126b/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2.5 w-full rounded-xl border border-[#7c3aed]/50 bg-[#6347e8]/20 py-3 text-xs font-semibold text-white shadow-[0_0_15px_rgba(124,58,237,0.3)] transition-all hover:bg-[#6347e8]/40 hover:border-[#7c3aed]"
                >
                  <svg className="h-4 w-4 fill-current text-[#38bdf8]" viewBox="0 0 24 24">
                    <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 8.76a1.44 1.44 0 0 0 1.44-1.44 1.44 1.44 0 0 0-1.44-1.45 1.45 1.45 0 0 0-1.45 1.45 1.44 1.44 0 0 0 1.45 1.44m1.39 9.74v-8.37H5.07v8.37h2.78z" />
                  </svg>
                  <span>Connect on LinkedIn</span>
                  <ArrowRight size={13} className="-rotate-45" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 5. PRICING & FAQ & FINAL BANNER (REFERENCE IMAGE 3 / PRICING-FAQ) */}
      {/* ========================================================================= */}
      <section id="pricing" className="relative py-20 lg:py-28 border-t border-white/[0.06]">
        <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
          {/* Header */}
          <div className="text-center max-w-3xl mx-auto space-y-4 mb-16">
            <span className="text-xs font-bold uppercase tracking-[0.22em] text-[#d8b565]">
              SIMPLE, TRANSPARENT PRICING
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white">
              Choose the plan <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#a855f7] to-[#c084fc]">
                for your business.
              </span>
            </h2>
            <p className="text-base text-[#a1a1aa]">
              All the core features you need to automate customer operations. Upgrade as you grow.
            </p>

            {/* Monthly / Yearly Toggle */}
            <div className="inline-flex items-center rounded-full bg-[#121326] p-1 border border-white/10 shadow-inner mt-4">
              <button
                type="button"
                onClick={() => setBillingCycle("monthly")}
                className={`rounded-full px-5 py-2 text-xs font-semibold transition-all ${
                  billingCycle === "monthly"
                    ? "bg-gradient-to-r from-[#6347e8] to-[#7c3aed] text-white shadow-[0_0_15px_rgba(124,58,237,0.5)]"
                    : "text-[#8d96a8] hover:text-white"
                }`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setBillingCycle("yearly")}
                className={`flex items-center gap-1.5 rounded-full px-5 py-2 text-xs font-semibold transition-all ${
                  billingCycle === "yearly"
                    ? "bg-gradient-to-r from-[#6347e8] to-[#7c3aed] text-white shadow-[0_0_15px_rgba(124,58,237,0.5)]"
                    : "text-[#8d96a8] hover:text-white"
                }`}
              >
                <span>Yearly</span>
                <span className="rounded-full bg-[#d8b565]/20 border border-[#d8b565]/40 px-2 py-0.5 text-[10px] text-[#d8b565] font-bold">
                  Save 20%
                </span>
              </button>
            </div>
          </div>

          {/* 3 Pricing Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch mb-12">
            {/* Starter Plan */}
            <div className="rounded-2xl border border-white/10 bg-[#0d0f22]/90 p-8 backdrop-blur-xl flex flex-col justify-between transition-all hover:border-white/20">
              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-bold text-white">Starter</h3>
                  <p className="mt-1 text-xs text-[#8d96a8] leading-relaxed">
                    Get started with AI-powered customer operations.
                  </p>
                </div>

                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-white">
                    ${billingCycle === "monthly" ? "19" : "15"}
                  </span>
                  <span className="text-xs text-[#8d96a8]">/mo</span>
                </div>

                <ul className="space-y-3 text-xs text-[#c4cdd5]">
                  <li className="flex items-center gap-2.5">
                    <Check size={14} className="text-[#d8b565]" />
                    <span>AI receptionist</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check size={14} className="text-[#d8b565]" />
                    <span>Unified inbox</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check size={14} className="text-[#d8b565]" />
                    <span>Appointment booking</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check size={14} className="text-[#d8b565]" />
                    <span>Basic integrations</span>
                  </li>
                </ul>
              </div>

              <div className="pt-8">
                <Link
                  href="/login?intent=signup&plan=starter&trial=1"
                  className="inline-flex items-center justify-center gap-2 w-full rounded-xl border border-white/15 bg-white/5 py-3 text-xs font-semibold text-white transition hover:bg-white/10 hover:border-white/30"
                >
                  <span>Start Free</span>
                  <ArrowRight size={14} />
                </Link>
              </div>
            </div>

            {/* Growth Plan (Most Popular Highlighted) */}
            <div className="relative rounded-2xl border-2 border-[#7c3aed] bg-[#0f1128] p-8 shadow-[0_0_50px_rgba(124,58,237,0.35)] backdrop-blur-2xl flex flex-col justify-between scale-105 z-10">
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-[#6347e8] to-[#7c3aed] px-4 py-1 text-[10px] font-extrabold tracking-wider uppercase text-white shadow-[0_0_15px_rgba(124,58,237,0.7)]">
                MOST POPULAR
              </div>

              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-bold text-white">Growth</h3>
                  <p className="mt-1 text-xs text-[#8d96a8] leading-relaxed">
                    For growing service businesses that need more automation.
                  </p>
                </div>

                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-white">
                    ${billingCycle === "monthly" ? "49" : "39"}
                  </span>
                  <span className="text-xs text-[#8d96a8]">/mo</span>
                </div>

                <ul className="space-y-3 text-xs text-[#c4cdd5]">
                  <li className="flex items-center gap-2.5">
                    <Check size={14} className="text-[#d8b565]" />
                    <span>Everything in Starter</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check size={14} className="text-[#d8b565]" />
                    <span>Advanced AI workflows</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check size={14} className="text-[#d8b565]" />
                    <span>More integrations</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check size={14} className="text-[#d8b565]" />
                    <span>Priority support</span>
                  </li>
                </ul>
              </div>

              <div className="pt-8">
                <Link
                  href="/login?intent=signup&plan=growth&trial=1"
                  className="inline-flex items-center justify-center gap-2 w-full rounded-xl bg-gradient-to-r from-[#6347e8] via-[#7042f4] to-[#7c3aed] py-3 text-xs font-bold text-white shadow-[0_0_25px_rgba(124,58,237,0.6)] hover:brightness-110 hover:shadow-[0_0_35px_rgba(124,58,237,0.85)] transition-all"
                >
                  <span>Start Free</span>
                  <ArrowRight size={14} />
                </Link>
              </div>
            </div>

            {/* Business Plan */}
            <div className="rounded-2xl border border-white/10 bg-[#0d0f22]/90 p-8 backdrop-blur-xl flex flex-col justify-between transition-all hover:border-white/20">
              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-bold text-white">Business</h3>
                  <p className="mt-1 text-xs text-[#8d96a8] leading-relaxed">
                    For established businesses with higher volume and control.
                  </p>
                </div>

                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-white">
                    ${billingCycle === "monthly" ? "99" : "79"}
                  </span>
                  <span className="text-xs text-[#8d96a8]">/mo</span>
                </div>

                <ul className="space-y-3 text-xs text-[#c4cdd5]">
                  <li className="flex items-center gap-2.5">
                    <Check size={14} className="text-[#d8b565]" />
                    <span>Everything in Growth</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check size={14} className="text-[#d8b565]" />
                    <span>Advanced customization</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check size={14} className="text-[#d8b565]" />
                    <span>Dedicated support</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check size={14} className="text-[#d8b565]" />
                    <span>Higher usage limits</span>
                  </li>
                </ul>
              </div>

              <div className="pt-8">
                <Link
                  href="/login?intent=signup&plan=business&trial=1"
                  className="inline-flex items-center justify-center gap-2 w-full rounded-xl border border-white/15 bg-white/5 py-3 text-xs font-semibold text-white transition hover:bg-white/10 hover:border-white/30"
                >
                  <span>Start Free</span>
                  <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          </div>

          <div className="text-center space-y-1 text-xs text-[#717a8c] mb-20">
            <p>Provider usage fees billed separately.</p>
            <p>72-hour trial starts after Outcome Onboarding approval.</p>
          </div>

          {/* ========================================================================= */}
          {/* Frequently Asked Questions */}
          {/* ========================================================================= */}
          <div id="faq" className="mt-12 space-y-6">
            <div className="text-center">
              <span className="text-xs font-bold uppercase tracking-[0.22em] text-[#d8b565]">
                FREQUENTLY ASKED QUESTIONS
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {/* FAQ 1 */}
              <div
                onClick={() => toggleFaq(0)}
                className="cursor-pointer rounded-2xl border border-white/10 bg-[#0d0f22]/90 p-5 transition-all hover:border-[#7c3aed]/40"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[#d8b565] bg-[#1a1b32] text-[#d8b565] mb-3">
                  <PlayCircle size={16} />
                </div>
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-xs text-white">How does the 72-hour trial work?</h4>
                  <ChevronDown
                    size={14}
                    className={`text-[#717a8c] transition-transform ${
                      expandedFaq === 0 ? "rotate-180" : ""
                    }`}
                  />
                </div>
                <p className="mt-2 text-xs text-[#8d96a8] leading-relaxed">
                  Start after your Outcome Onboarding approval.
                </p>
              </div>

              {/* FAQ 2 */}
              <div
                onClick={() => toggleFaq(1)}
                className="cursor-pointer rounded-2xl border border-white/10 bg-[#0d0f22]/90 p-5 transition-all hover:border-[#7c3aed]/40"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[#d8b565] bg-[#1a1b32] text-[#d8b565] mb-3">
                  <Settings2 size={16} />
                </div>
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-xs text-white">How quickly can we get set up?</h4>
                  <ChevronDown
                    size={14}
                    className={`text-[#717a8c] transition-transform ${
                      expandedFaq === 1 ? "rotate-180" : ""
                    }`}
                  />
                </div>
                <p className="mt-2 text-xs text-[#8d96a8] leading-relaxed">
                  Most businesses are live in a few days.
                </p>
              </div>

              {/* FAQ 3 */}
              <div
                onClick={() => toggleFaq(2)}
                className="cursor-pointer rounded-2xl border border-white/10 bg-[#0d0f22]/90 p-5 transition-all hover:border-[#7c3aed]/40"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[#d8b565] bg-[#1a1b32] text-[#d8b565] mb-3">
                  <Network size={16} />
                </div>
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-xs text-white">What channels are supported?</h4>
                  <ChevronDown
                    size={14}
                    className={`text-[#717a8c] transition-transform ${
                      expandedFaq === 2 ? "rotate-180" : ""
                    }`}
                  />
                </div>
                <p className="mt-2 text-xs text-[#8d96a8] leading-relaxed">
                  Calls, text, website, forms and 30+ integrations.
                </p>
              </div>

              {/* FAQ 4 */}
              <div
                onClick={() => toggleFaq(3)}
                className="cursor-pointer rounded-2xl border border-white/10 bg-[#0d0f22]/90 p-5 transition-all hover:border-[#7c3aed]/40"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[#d8b565] bg-[#1a1b32] text-[#d8b565] mb-3">
                  <CreditCard size={16} />
                </div>
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-xs text-white">Can I cancel anytime?</h4>
                  <ChevronDown
                    size={14}
                    className={`text-[#717a8c] transition-transform ${
                      expandedFaq === 3 ? "rotate-180" : ""
                    }`}
                  />
                </div>
                <p className="mt-2 text-xs text-[#8d96a8] leading-relaxed">
                  Yes. No long-term contracts or hidden fees.
                </p>
              </div>

              {/* FAQ 5 */}
              <div
                onClick={() => toggleFaq(4)}
                className="cursor-pointer rounded-2xl border border-white/10 bg-[#0d0f22]/90 p-5 transition-all hover:border-[#7c3aed]/40"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[#d8b565] bg-[#1a1b32] text-[#d8b565] mb-3">
                  <Shield size={16} />
                </div>
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-xs text-white">How is my data kept secure?</h4>
                  <ChevronDown
                    size={14}
                    className={`text-[#717a8c] transition-transform ${
                      expandedFaq === 4 ? "rotate-180" : ""
                    }`}
                  />
                </div>
                <p className="mt-2 text-xs text-[#8d96a8] leading-relaxed">
                  Enterprise-grade security and data protection.
                </p>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* Final Call to Action Banner */}
          {/* ========================================================================= */}
          <div className="relative mt-24 rounded-3xl border border-[#7c3aed]/40 bg-gradient-to-r from-[#0d0f24] via-[#141233] to-[#1a113d] p-8 sm:p-12 overflow-hidden shadow-[0_0_50px_rgba(124,58,237,0.35)]">
            {/* Horizon Glow background */}
            <div className="pointer-events-none absolute -bottom-16 left-0 right-0 h-36 bg-gradient-to-t from-[#7c3aed]/40 to-transparent blur-3xl" />

            <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-8">
              <div className="space-y-4 max-w-xl text-center lg:text-left">
                <span className="text-xs font-bold uppercase tracking-[0.22em] text-[#d8b565]">
                  READY WHEN YOU ARE
                </span>
                <h3 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
                  Put J10 to work <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#a855f7] to-[#c084fc]">
                    for your business.
                  </span>
                </h3>
                <p className="text-sm text-[#a1a1aa] leading-relaxed">
                  Automate your customer operations, book more business and get back your time — all with J10.
                </p>

                <div className="flex flex-col sm:flex-row items-center gap-4 pt-2">
                  <Link
                    href="/login?intent=signup&plan=growth&trial=1"
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#6347e8] via-[#7042f4] to-[#7c3aed] px-8 py-3.5 text-sm font-semibold text-white shadow-[0_0_30px_rgba(124,58,237,0.6)] hover:brightness-110 hover:scale-[1.02] transition-all"
                  >
                    <span>Start Free</span>
                    <ArrowRight size={16} />
                  </Link>
                  <button
                    type="button"
                    onClick={scrollToAskJ10}
                    className="inline-flex items-center justify-center rounded-full border border-white/20 bg-white/5 px-8 py-3.5 text-sm font-semibold text-white transition hover:bg-white/10"
                  >
                    Talk to J10
                  </button>
                </div>

                <p className="text-xs text-[#717a8c]">
                  72-hour trial starts after Outcome Onboarding approval.
                </p>
              </div>

              {/* Peeking Mascot on right */}
              <div className="relative w-[240px] sm:w-[280px] drop-shadow-[0_0_30px_rgba(124,58,237,0.5)]">
                <Image
                  src="/brand/j10-mascot-peek.jpg"
                  alt="J10 Robot Mascot"
                  width={300}
                  height={240}
                  className="w-full h-auto object-contain rounded-2xl filter brightness-110"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* Floating Bottom Right Badge ("Ask J10") */}
      {/* ========================================================================= */}
      <div className="fixed bottom-6 right-6 z-50">
        <button
          type="button"
          onClick={scrollToAskJ10}
          className="group flex items-center gap-3 rounded-full border border-[#7c3aed]/50 bg-[#0d0f22]/95 px-4 py-2.5 backdrop-blur-xl shadow-[0_0_25px_rgba(124,58,237,0.4)] hover:shadow-[0_0_35px_rgba(124,58,237,0.7)] transition-all"
        >
          <div className="relative h-8 w-8 overflow-hidden rounded-full border border-[#7c3aed] bg-[#1a1738]">
            <Image
              src="/brand/j10-mascot-peek.jpg"
              alt="Ask J10"
              width={32}
              height={32}
              className="h-full w-full object-cover"
            />
          </div>
          <div className="text-left text-xs">
            <span className="font-bold text-white block">Ask J10</span>
            <span className="text-[10px] text-[#8d96a8]">Questions &amp; signup help</span>
          </div>
          <ArrowRight size={14} className="text-[#8d96a8] group-hover:text-white group-hover:translate-x-0.5 transition-all" />
        </button>
      </div>
    </div>
  );
}
