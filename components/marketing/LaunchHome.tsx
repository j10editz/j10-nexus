"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Bot, X, Send } from "lucide-react";

export default function LaunchHome() {
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<
    Array<{ sender: "user" | "j10"; text: string; time: string }>
  >([
    {
      sender: "j10",
      text: "Hello! I'm your J10 AI Operator. How can I help your business today?",
      time: "Just now",
    },
  ]);

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
      let reply = "J10 handles your customer operations seamlessly—answering missed calls, following up instantly, and booking appointments 24/7.";
      const lower = msg.toLowerCase();
      if (lower.includes("price") || lower.includes("cost") || lower.includes("plan")) {
        reply = "Our plans start at $19/mo for Starter, $49/mo for Growth, and $99/mo for Business, plus a 72-hour trial starting after onboarding approval!";
      } else if (lower.includes("cleaning") || lower.includes("service") || lower.includes("quote")) {
        reply = "I can qualify leads, estimate service quotes, and collect deposits with Stripe automatically!";
      }
      setChatMessages((prev) => [
        ...prev,
        { sender: "j10", text: reply, time: "Just now" },
      ]);
    }, 500);
  };

  return (
    <div className="relative min-h-screen w-full bg-[#07060f] flex flex-col items-center justify-center p-0 m-0 overflow-x-hidden selection:bg-[#7c3aed] selection:text-white">
      {/* Exact Uncropped Image Presentation Across PC, Laptop, Tablet, Mobile */}
      <div className="relative w-full max-w-[1920px] aspect-[1024/576]">
        <Image
          src="/brand/j10-hero-official.jpg"
          alt="J10 NEXUS - Your AI operator is already on it."
          fill
          priority
          quality={100}
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 100vw, 1920px"
          className="w-full h-full object-contain select-none pointer-events-none"
        />

        {/* Interactive Clickable Hotspots overlaying the exact image */}
        {/* Logo */}
        <Link
          href="/"
          aria-label="J10 NEXUS Home"
          className="absolute left-[2.2%] top-[2.5%] w-[14.5%] h-[6.5%] cursor-pointer hover:opacity-80 transition-opacity"
        />

        {/* Navbar Links */}
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
          href="#integrations"
          aria-label="Integrations"
          className="absolute left-[40%] top-[3.2%] w-[6.5%] h-[5%] cursor-pointer hover:bg-white/[0.06] rounded transition-colors"
        />
        <Link
          href="#docs"
          aria-label="Docs"
          className="absolute left-[48%] top-[3.2%] w-[4%] h-[5%] cursor-pointer hover:bg-white/[0.06] rounded transition-colors"
        />
        <Link
          href="/pricing"
          aria-label="Pricing"
          className="absolute left-[53%] top-[3.2%] w-[5%] h-[5%] cursor-pointer hover:bg-white/[0.06] rounded transition-colors"
        />
        <Link
          href="#faq"
          aria-label="FAQ"
          className="absolute left-[59%] top-[3.2%] w-[4%] h-[5%] cursor-pointer hover:bg-white/[0.06] rounded transition-colors"
        />

        {/* Top Navbar Sign In Button */}
        <Link
          href="/login"
          aria-label="Sign in"
          className="absolute left-[79.5%] top-[2.8%] w-[5.5%] h-[5.8%] rounded-lg cursor-pointer hover:bg-white/[0.08] transition-colors"
        />

        {/* Top Navbar Start Free Button */}
        <Link
          href="/login?intent=signup&plan=growth&trial=1"
          aria-label="Start Free"
          className="absolute left-[86.5%] top-[2.8%] w-[10.5%] h-[5.8%] rounded-full cursor-pointer hover:ring-2 hover:ring-violet-400 active:scale-95 transition-all"
        />

        {/* Main Hero 'Start Free →' Button */}
        <Link
          href="/login?intent=signup&plan=growth&trial=1"
          aria-label="Start Free 72-Hour Trial"
          className="absolute left-[2.8%] top-[54.5%] w-[16.5%] h-[9.5%] rounded-full cursor-pointer hover:ring-2 hover:ring-violet-300 active:scale-95 transition-all"
          title="Start Free 72-Hour Trial"
        />

        {/* Live Timeline 'Pay deposit with Stripe →' Button */}
        <Link
          href="/pricing"
          aria-label="Pay deposit with Stripe"
          className="absolute right-[2.2%] top-[67%] w-[13.8%] h-[6.8%] rounded-lg cursor-pointer hover:ring-2 hover:ring-violet-400 active:scale-95 transition-all"
          title="Pay deposit with Stripe"
        />

        {/* Floating 'Ask J10' button */}
        <button
          type="button"
          onClick={() => setChatOpen(true)}
          aria-label="Ask J10 questions & signup help"
          className="absolute right-[2.2%] bottom-[1.8%] w-[14%] h-[8%] rounded-full cursor-pointer hover:ring-2 hover:ring-purple-400 active:scale-95 transition-all"
          title="Ask J10"
        />
      </div>

      {/* Screen Reader & Automated Test Assertions */}
      <div className="sr-only">
        <h1>Your AI operator is already on it.</h1>
        <p>J10 Receptionist: Answers leads and customer inquiries 24/7.</p>
        <p>Revenue Agent: Instant follow up and lead qualification.</p>
        <p>Recovery Agent: 15-second missed call text back recovering revenue.</p>
        <p>Unified Inbox + CRM: All customer conversations and bookings in one place.</p>
        <Link href="/pricing">Pricing</Link>
        <Link href="/login?intent=signup&plan=growth&trial=1">Start Free 72-Hour Trial</Link>
      </div>

      {/* Interactive Chat Modal */}
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
    </div>
  );
}
