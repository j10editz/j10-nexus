"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  X,
  Send,
  Sparkles,
} from "lucide-react";

export default function LaunchHome() {
  const [scrolled, setScrolled] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<
    Array<{ sender: "user" | "j10"; text: string; time: string }>
  >([
    {
      sender: "j10",
      text: "Hello! I'm your J10 AI Operator. I handle missed calls, follow up instantly, book appointments, and collect deposits 24/7. What type of service business do you run?",
      time: "Just now",
    },
  ]);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 400) {
        setScrolled(true);
      } else {
        setScrolled(false);
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const msg = chatInput.trim();
    setChatInput("");
    setChatMessages((prev) => [
      ...prev,
      { sender: "user", text: msg, time: "Just now" },
    ]);

    setTimeout(() => {
      let reply = "J10 handles your customer operations seamlessly—answering calls, qualifying leads, and syncing appointments directly to your calendar.";
      const lower = msg.toLowerCase();
      if (lower.includes("price") || lower.includes("cost") || lower.includes("plan")) {
        reply = "Our plans start at $19/mo for Starter, $49/mo for Growth (most popular), and $99/mo for Business, plus a 72-hour trial starting after onboarding approval!";
      } else if (lower.includes("clean") || lower.includes("quote") || lower.includes("service")) {
        reply = "Great! For cleaning services, J10 quotes square footage estimates, captures addresses, and sends a Stripe deposit link before locking in the booking!";
      } else if (lower.includes("missed call") || lower.includes("phone")) {
        reply = "When you miss a call, J10 texts back within 15 seconds: 'Hi, sorry we missed you! How can we help today?' and starts qualifying immediately.";
      }
      setChatMessages((prev) => [
        ...prev,
        { sender: "j10", text: reply, time: "Just now" },
      ]);
    }, 500);
  };

  const askSectionRef = useRef<HTMLDivElement>(null);
  const pricingSectionRef = useRef<HTMLDivElement>(null);

  const scrollToAsk = () => {
    askSectionRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const scrollToPricing = () => {
    pricingSectionRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="relative min-h-screen bg-[#07060f] text-white selection:bg-[#7c3aed] selection:text-white">
      {/* ========================================================================= */}
      {/* FLOATING STICKY NAVBAR (Appears only on scroll past hero for seamless navigation) */}
      {/* ========================================================================= */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? "translate-y-0 opacity-100 bg-[#07060f]/90 backdrop-blur-xl border-b border-white/[0.08] shadow-[0_4px_30px_rgba(0,0,0,0.8)]"
            : "-translate-y-full opacity-0 pointer-events-none"
        }`}
      >
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-3 lg:px-10">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-[#7c3aed] to-[#4f46e5] p-1.5 shadow-[0_0_15px_rgba(124,58,237,0.4)]">
              <Image
                src="/brand/j10-logo.png"
                alt="J10 Monogram"
                width={20}
                height={20}
                className="h-full w-full object-contain filter brightness-110"
              />
            </span>
            <span className="text-base font-bold tracking-tight text-white flex items-center gap-1.5">
              J10 <span className="font-semibold text-white/90">NEXUS</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-8 text-xs font-medium text-[#9da5b5] md:flex">
            <Link href="#product" className="transition-colors hover:text-white">
              Product
            </Link>
            <Link href="#services" className="transition-colors hover:text-white">
              Services
            </Link>
            <Link href="#product" className="transition-colors hover:text-white">
              Integrations
            </Link>
            <Link href="#trust" className="transition-colors hover:text-white">
              Docs
            </Link>
            <Link href="#pricing" className="transition-colors hover:text-white">
              Pricing
            </Link>
            <Link href="#pricing" className="transition-colors hover:text-white">
              FAQ
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-[#c4cdd5] transition hover:text-white hover:bg-white/5"
            >
              Sign in
            </Link>
            <Link
              href="/login?intent=signup&plan=growth&trial=1"
              className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[#6347e8] to-[#7c3aed] px-5 py-1.5 text-xs font-bold text-white shadow-[0_0_20px_rgba(124,58,237,0.6)] hover:brightness-110 transition-all"
            >
              Start Free
            </Link>
          </div>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* 1. HERO SECTION (REFERENCE IMAGE 1) */}
      {/* ========================================================================= */}
      <section className="relative w-full overflow-hidden bg-[#07060f]">
        <div className="relative mx-auto max-w-[1600px]">
          <div className="relative w-full aspect-[1024/576]">
            <Image
              src="/brand/reference/hero.jpg"
              alt="Your AI operator is already on it. Answers leads. Follows up. Books appointments. Helps collect payments. All on autopilot."
              fill
              priority
              quality={100}
              className="object-cover object-top select-none pointer-events-none"
            />

            {/* Navbar Clickable Hotspots inside Hero visual */}
            <Link
              href="/"
              aria-label="J10 NEXUS Home"
              className="absolute left-[2.2%] top-[2.5%] w-[14.5%] h-[6.5%] cursor-pointer hover:opacity-80 transition-opacity"
            />
            <Link
              href="#product"
              aria-label="Product"
              className="absolute left-[27%] top-[3.2%] w-[5.5%] h-[5%] cursor-pointer hover:bg-white/[0.06] rounded transition-colors"
            />
            <Link
              href="#services"
              aria-label="Services"
              className="absolute left-[33.5%] top-[3.2%] w-[5.5%] h-[5%] cursor-pointer hover:bg-white/[0.06] rounded transition-colors"
            />
            <Link
              href="#product"
              aria-label="Integrations"
              className="absolute left-[40%] top-[3.2%] w-[6.5%] h-[5%] cursor-pointer hover:bg-white/[0.06] rounded transition-colors"
            />
            <Link
              href="#trust"
              aria-label="Docs"
              className="absolute left-[48%] top-[3.2%] w-[4%] h-[5%] cursor-pointer hover:bg-white/[0.06] rounded transition-colors"
            />
            <Link
              href="#pricing"
              aria-label="Pricing"
              className="absolute left-[53%] top-[3.2%] w-[5%] h-[5%] cursor-pointer hover:bg-white/[0.06] rounded transition-colors"
            />
            <Link
              href="#pricing"
              aria-label="FAQ"
              className="absolute left-[59%] top-[3.2%] w-[4%] h-[5%] cursor-pointer hover:bg-white/[0.06] rounded transition-colors"
            />
            <Link
              href="/login"
              aria-label="Sign in"
              className="absolute left-[79.5%] top-[2.8%] w-[5.5%] h-[5.8%] rounded-lg cursor-pointer hover:bg-white/[0.08] transition-colors"
            />
            <Link
              href="/login?intent=signup&plan=growth&trial=1"
              aria-label="Start Free"
              className="absolute left-[86.5%] top-[2.8%] w-[10.5%] h-[5.8%] rounded-full cursor-pointer hover:ring-2 hover:ring-violet-400 active:scale-95 transition-all"
            />

            {/* Primary Hero 'Start Free' CTA */}
            <Link
              href="/login?intent=signup&plan=growth&trial=1"
              aria-label="Start Free 72-Hour Trial"
              className="absolute left-[2.8%] top-[54.5%] w-[16.5%] h-[9.5%] rounded-full cursor-pointer hover:ring-2 hover:ring-violet-300 active:scale-95 transition-all"
              title="Start Free 72-Hour Trial"
            />

            {/* Customer Journey Timeline 'Pay deposit with Stripe' Button */}
            <Link
              href="/pricing"
              aria-label="Pay deposit with Stripe demo"
              className="absolute right-[2.2%] top-[67%] w-[13.8%] h-[6.8%] rounded-lg cursor-pointer hover:ring-2 hover:ring-violet-400 active:scale-95 transition-all"
              title="Pay deposit with Stripe"
            />

            {/* Hero Dock Item Hotspots */}
            <Link
              href="#services"
              aria-label="AI Receptionist"
              className="absolute left-[13%] bottom-[3%] w-[7%] h-[8%] rounded-xl cursor-pointer hover:bg-white/[0.05] transition-colors"
            />
            <Link
              href="#services"
              aria-label="Missed Call Text Back"
              className="absolute left-[21%] bottom-[3%] w-[7%] h-[8%] rounded-xl cursor-pointer hover:bg-white/[0.05] transition-colors"
            />
            <Link
              href="#services"
              aria-label="Lead Qualification"
              className="absolute left-[28.5%] bottom-[3%] w-[7%] h-[8%] rounded-xl cursor-pointer hover:bg-white/[0.05] transition-colors"
            />
            <Link
              href="#services"
              aria-label="Instant Follow Up"
              className="absolute left-[36%] bottom-[3%] w-[7%] h-[8%] rounded-xl cursor-pointer hover:bg-white/[0.05] transition-colors"
            />
            <Link
              href="#product"
              aria-label="Appointment Booking"
              className="absolute left-[43.5%] bottom-[3%] w-[7%] h-[8%] rounded-xl cursor-pointer hover:bg-white/[0.05] transition-colors"
            />
            <Link
              href="#product"
              aria-label="Unified Inbox"
              className="absolute left-[51%] bottom-[3%] w-[7%] h-[8%] rounded-xl cursor-pointer hover:bg-white/[0.05] transition-colors"
            />

            {/* Floating 'Ask J10' pill badge in Hero */}
            <button
              type="button"
              onClick={scrollToAsk}
              aria-label="Ask J10 questions & signup help"
              className="absolute right-[2.2%] bottom-[1.8%] w-[14%] h-[8%] rounded-full cursor-pointer hover:ring-2 hover:ring-purple-400 active:scale-95 transition-all"
              title="Ask J10"
            />
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 2. THE J10 PRODUCT SYSTEM (REFERENCE IMAGE 4) */}
      {/* ========================================================================= */}
      <section id="product" className="relative w-full overflow-hidden bg-[#07060f]">
        <div className="relative mx-auto max-w-[1600px]">
          <div className="relative w-full aspect-[1024/576]">
            <Image
              src="/brand/reference/products.jpg"
              alt="Seven J10 products. One business operator. Everything works from one workspace."
              fill
              quality={100}
              className="object-cover object-center select-none pointer-events-none"
            />

            {/* Interactive Product Hotspots */}
            <Link
              href="/dashboard/crm"
              aria-label="J10 Lead Center"
              className="absolute left-[2%] top-[19%] w-[27%] h-[21%] rounded-2xl cursor-pointer hover:ring-2 hover:ring-[#a855f7]/60 active:scale-[0.99] transition-all"
            />
            <Link
              href="/dashboard/inbox"
              aria-label="J10 Inbox"
              className="absolute left-[2%] top-[43.5%] w-[27%] h-[21%] rounded-2xl cursor-pointer hover:ring-2 hover:ring-[#a855f7]/60 active:scale-[0.99] transition-all"
            />
            <Link
              href="/dashboard/booking"
              aria-label="J10 Booking"
              className="absolute left-[2%] top-[68%] w-[27%] h-[21%] rounded-2xl cursor-pointer hover:ring-2 hover:ring-[#a855f7]/60 active:scale-[0.99] transition-all"
            />
            <Link
              href="/dashboard"
              aria-label="J10 Command Center"
              className="absolute left-[31.5%] top-[29%] w-[37%] h-[49%] rounded-2xl cursor-pointer hover:ring-2 hover:ring-[#a855f7]/60 active:scale-[0.99] transition-all"
            />
            <Link
              href="/dashboard/growth"
              aria-label="J10 Growth"
              className="absolute right-[2%] top-[19%] w-[27%] h-[21%] rounded-2xl cursor-pointer hover:ring-2 hover:ring-[#a855f7]/60 active:scale-[0.99] transition-all"
            />
            <Link
              href="/dashboard/ai-operator"
              aria-label="J10 AI Operator"
              className="absolute right-[2%] top-[43.5%] w-[27%] h-[21%] rounded-2xl cursor-pointer hover:ring-2 hover:ring-[#a855f7]/60 active:scale-[0.99] transition-all"
            />
            <Link
              href="/dashboard/pay"
              aria-label="J10 Pay"
              className="absolute right-[2%] top-[68%] w-[27%] h-[21%] rounded-2xl cursor-pointer hover:ring-2 hover:ring-[#a855f7]/60 active:scale-[0.99] transition-all"
            />
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 3. ASK J10 LIVE (REFERENCE IMAGE 2) */}
      {/* ========================================================================= */}
      <section ref={askSectionRef} id="services" className="relative w-full overflow-hidden bg-[#07060f]">
        <div className="relative mx-auto max-w-[1600px]">
          <div className="relative w-full aspect-[1024/576]">
            <Image
              src="/brand/reference/ask-j10-live.jpg"
              alt="Let visitors experience J10 before they sign up. Ask questions, see how it works, and get a feel for J10."
              fill
              quality={100}
              className="object-cover object-center select-none pointer-events-none"
            />

            {/* Interactive Hotspots */}
            <button
              type="button"
              onClick={() => setChatOpen(true)}
              aria-label="Ask a question"
              className="absolute left-[4.5%] top-[27.5%] w-[16.5%] h-[6%] rounded-full cursor-pointer hover:ring-2 hover:ring-white/40 active:scale-95 transition-all"
            />
            <Link
              href="/login?intent=signup&plan=growth&trial=1"
              aria-label="Create my workspace"
              className="absolute left-[10.5%] top-[85.5%] w-[13.8%] h-[4.8%] rounded-full cursor-pointer hover:ring-2 hover:ring-white/60 active:scale-95 transition-all"
            />
            <Link
              href="/login?intent=signup&plan=growth&trial=1"
              aria-label="Explore more with J10"
              className="absolute left-[44.5%] top-[59%] w-[12.8%] h-[5.2%] rounded-xl cursor-pointer hover:ring-2 hover:ring-[#d8b565]/60 active:scale-95 transition-all"
            />
            <button
              type="button"
              onClick={() => setChatOpen(true)}
              aria-label="Type your message"
              className="absolute left-[4.5%] bottom-[3.5%] w-[54%] h-[6.5%] rounded-full cursor-pointer hover:bg-white/[0.05] transition-all"
            />
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 4. BUILT FOR TRUST & FROM THE FOUNDER (REFERENCE IMAGE 5) */}
      {/* ========================================================================= */}
      <section id="trust" className="relative w-full overflow-hidden bg-[#07060f]">
        <div className="relative mx-auto max-w-[1600px]">
          <div className="relative w-full aspect-[1024/576]">
            <Image
              src="/brand/reference/trust-founder.jpg"
              alt="Built for small businesses. Engineered like serious infrastructure. From the Founder Jeefthe Richeder Osne."
              fill
              quality={100}
              className="object-cover object-center select-none pointer-events-none"
            />

            {/* Connect on LinkedIn Button Hotspot */}
            <a
              href="https://www.linkedin.com/in/jeefthe-osne-143a9126b/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Connect with Jeefthe Richeder Osne on LinkedIn"
              className="absolute right-[17%] top-[76.2%] w-[17.5%] h-[6.2%] rounded-xl cursor-pointer hover:ring-2 hover:ring-violet-400 active:scale-95 transition-all"
              title="Connect on LinkedIn"
            />
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 5. PRICING, FAQ, FINAL BANNER & FOOTER (REFERENCE IMAGE 3) */}
      {/* ========================================================================= */}
      <section ref={pricingSectionRef} id="pricing" className="relative w-full overflow-hidden bg-[#07060f]">
        <div className="relative mx-auto max-w-[1600px]">
          <div className="relative w-full aspect-[1024/576]">
            <Image
              src="/brand/reference/pricing-faq.jpg"
              alt="Choose the plan for your business. Put J10 to work for your business. Built by Jeefthe Richeder Osne, Founder & CEO."
              fill
              quality={100}
              className="object-cover object-center select-none pointer-events-none"
            />

            {/* Monthly / Yearly Billing Toggle */}
            <button
              type="button"
              onClick={() => setBillingCycle("monthly")}
              aria-label="Monthly billing"
              className="absolute left-[3.9%] top-[33.8%] w-[8.2%] h-[5%] rounded-full cursor-pointer hover:bg-white/[0.08] transition-all"
            />
            <button
              type="button"
              onClick={() => setBillingCycle("yearly")}
              aria-label="Yearly billing"
              className="absolute left-[12.4%] top-[33.8%] w-[10.5%] h-[5%] rounded-full cursor-pointer hover:bg-white/[0.08] transition-all"
            />

            {/* Starter Plan 'Start Free' CTA */}
            <Link
              href="/login?intent=signup&plan=starter&trial=1"
              aria-label="Start Free Starter Plan"
              className="absolute left-[35.8%] top-[34.2%] w-[14.2%] h-[5.2%] rounded-xl cursor-pointer hover:ring-2 hover:ring-white/40 active:scale-95 transition-all"
            />

            {/* Growth Plan 'Start Free' CTA */}
            <Link
              href="/login?intent=signup&plan=growth&trial=1"
              aria-label="Start Free Growth Plan"
              className="absolute left-[53.5%] top-[33.8%] w-[16%] h-[5.8%] rounded-full cursor-pointer hover:ring-2 hover:ring-white/60 active:scale-95 transition-all"
            />

            {/* Business Plan 'Start Free' CTA */}
            <Link
              href="/login?intent=signup&plan=business&trial=1"
              aria-label="Start Free Business Plan"
              className="absolute right-[10.5%] top-[34.2%] w-[15.2%] h-[5.2%] rounded-xl cursor-pointer hover:ring-2 hover:ring-white/40 active:scale-95 transition-all"
            />

            {/* Final Banner 'Start Free' CTA */}
            <Link
              href="/login?intent=signup&plan=growth&trial=1"
              aria-label="Start Free from Final Banner"
              className="absolute left-[37.4%] top-[79.8%] w-[12.6%] h-[5.5%] rounded-full cursor-pointer hover:ring-2 hover:ring-white/60 active:scale-95 transition-all"
            />

            {/* Final Banner 'Talk to J10' CTA */}
            <button
              type="button"
              onClick={scrollToAsk}
              aria-label="Talk to J10"
              className="absolute left-[50.7%] top-[79.8%] w-[12.2%] h-[5.5%] rounded-full cursor-pointer hover:ring-2 hover:ring-white/40 active:scale-95 transition-all"
            />

            {/* Footer Navigation Hotspots */}
            <Link
              href="/"
              aria-label="J10 NEXUS Home"
              className="absolute left-[2.2%] bottom-[3.5%] w-[10%] h-[4.5%] cursor-pointer hover:opacity-80 transition-opacity"
            />
            <Link
              href="#product"
              aria-label="Product"
              className="absolute left-[15.5%] bottom-[3.5%] w-[4.5%] h-[4%] cursor-pointer hover:underline"
            />
            <Link
              href="#services"
              aria-label="Services"
              className="absolute left-[20.5%] bottom-[3.5%] w-[4.5%] h-[4%] cursor-pointer hover:underline"
            />
            <Link
              href="#product"
              aria-label="Integrations"
              className="absolute left-[25.5%] bottom-[3.5%] w-[5.5%] h-[4%] cursor-pointer hover:underline"
            />
            <Link
              href="#trust"
              aria-label="Docs"
              className="absolute left-[31.5%] bottom-[3.5%] w-[3.5%] h-[4%] cursor-pointer hover:underline"
            />
            <Link
              href="#pricing"
              aria-label="Pricing"
              className="absolute left-[35.5%] bottom-[3.5%] w-[4%] h-[4%] cursor-pointer hover:underline"
            />
            <Link
              href="/security"
              aria-label="Security"
              className="absolute left-[40%] bottom-[3.5%] w-[4.5%] h-[4%] cursor-pointer hover:underline"
            />
            <Link
              href="/status"
              aria-label="Status"
              className="absolute left-[45%] bottom-[3.5%] w-[3.5%] h-[4%] cursor-pointer hover:underline"
            />
            <Link
              href="/contact"
              aria-label="Contact"
              className="absolute left-[49%] bottom-[3.5%] w-[4%] h-[4%] cursor-pointer hover:underline"
            />
            <Link
              href="/privacy"
              aria-label="Privacy"
              className="absolute left-[53.5%] bottom-[3.5%] w-[4%] h-[4%] cursor-pointer hover:underline"
            />
            <Link
              href="/terms"
              aria-label="Terms"
              className="absolute left-[58%] bottom-[3.5%] w-[3.5%] h-[4%] cursor-pointer hover:underline"
            />

            {/* Footer LinkedIn Profile Hotspot */}
            <a
              href="https://www.linkedin.com/in/jeefthe-osne-143a9126b/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Jeefthe Richeder Osne LinkedIn Profile"
              className="absolute right-[24.5%] bottom-[3.5%] w-[2.5%] h-[4.5%] rounded cursor-pointer hover:ring-2 hover:ring-[#0077b5] transition-all"
            />

            {/* Bottom Right Floating Badge Hotspot */}
            <button
              type="button"
              onClick={() => setChatOpen(true)}
              aria-label="Ask J10"
              className="absolute right-[1.6%] bottom-[1.8%] w-[14.8%] h-[6.8%] rounded-full cursor-pointer hover:ring-2 hover:ring-purple-400 active:scale-95 transition-all"
            />
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SCREEN READER & SYSTEM CAPABILITIES DECLARATION */}
      {/* ========================================================================= */}
      <div className="sr-only">
        <h2>Approved J10 Capabilities</h2>
        <p>J10 Receptionist: 24/7 AI Receptionist answering all inbound customer inquiries.</p>
        <p>Revenue Agent: Instant follow up and lead qualification converting conversations to bookings.</p>
        <p>Recovery Agent: 15-second missed call text back recovering lost opportunities.</p>
        <p>Unified Inbox + CRM: All customer conversations, SMS, WhatsApp, and appointments in one place.</p>
        <Link href="/pricing">Pricing Plans</Link>
        <Link href="/login?intent=signup&plan=growth&trial=1">Start Free 72-Hour Trial</Link>
        <p>Built by Jeefthe Richeder Osne, Founder &amp; CEO, J10 NEXUS.</p>
      </div>

      {/* ========================================================================= */}
      {/* INTERACTIVE ASK J10 CHAT MODAL */}
      {/* ========================================================================= */}
      {chatOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
          <div className="relative w-full max-w-lg rounded-3xl border border-[#7c3aed]/50 bg-[#0d0f22] p-6 shadow-[0_0_60px_rgba(124,58,237,0.4)]">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-[#7c3aed] to-[#4f46e5] flex items-center justify-center text-white">
                  <Bot size={20} />
                </div>
                <div>
                  <h4 className="font-bold text-white text-base">Ask J10 Live</h4>
                  <p className="text-xs text-emerald-400">● Online • AI Operator</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setChatOpen(false)}
                className="rounded-full p-1.5 text-[#8d96a8] hover:bg-white/10 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="my-4 max-h-[350px] overflow-y-auto space-y-3 pr-2">
              {chatMessages.map((m, i) => (
                <div
                  key={i}
                  className={`flex flex-col ${
                    m.sender === "user" ? "items-end" : "items-start"
                  }`}
                >
                  <div
                    className={`rounded-2xl p-3.5 text-xs sm:text-sm leading-relaxed max-w-[85%] ${
                      m.sender === "user"
                        ? "bg-[#6347e8] text-white rounded-tr-none"
                        : "bg-[#1d1738] text-[#e2d9f3] border border-[#7c3aed]/30 rounded-tl-none"
                    }`}
                  >
                    {m.text}
                  </div>
                  <span className="text-[10px] text-[#717a8c] mt-1 px-1">
                    {m.time}
                  </span>
                </div>
              ))}
            </div>

            <form onSubmit={handleSendChat} className="flex items-center gap-2 pt-2 border-t border-white/10">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask about missed calls, pricing, bookings..."
                className="flex-1 rounded-full border border-white/15 bg-[#121326] px-4 py-2.5 text-xs sm:text-sm text-white focus:outline-none focus:border-[#7c3aed]"
                autoFocus
              />
              <button
                type="submit"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-r from-[#6347e8] to-[#7c3aed] text-white shadow hover:scale-105"
              >
                <Send size={15} />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Floating Bottom Right Badge */}
      <div className="fixed bottom-6 right-6 z-40">
        <button
          type="button"
          onClick={() => setChatOpen(true)}
          className="group flex items-center gap-3 rounded-full border border-[#7c3aed]/50 bg-[#0d0f22]/95 px-4 py-2.5 backdrop-blur-xl shadow-[0_0_25px_rgba(124,58,237,0.5)] hover:shadow-[0_0_35px_rgba(124,58,237,0.85)] hover:scale-105 transition-all"
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
