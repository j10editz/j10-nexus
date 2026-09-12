import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Mail, MessageSquare, ShieldAlert, Sparkles, Zap } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const supportEmail = "contact@j10-nexus.com";

export const metadata: Metadata = {
  title: "Contact Team",
  description: "Contact J10 NEXUS about product, workspace, billing, capacity, or security questions.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <main className="j10-canvas min-h-screen text-white">
      <Navbar />

      <section className="relative mx-auto max-w-[960px] px-5 py-16 sm:py-24 lg:px-8">
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">
            Contact J10 NEXUS
          </p>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
            Talk with our engineering team.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-[#a9b1c0]">
            For product questions, workspace setup, billing support, enterprise capacity, or security disclosures, reach us directly by email.
          </p>
        </div>

        <div className="mt-14 grid gap-6 sm:grid-cols-2">
          {/* General Inquiries */}
          <div className="j10-surface rounded-2xl p-6 sm:p-7 border border-white/[0.08] flex flex-col justify-between">
            <div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-cyan-300">
                <Mail size={20} />
              </div>
              <h2 className="mt-4 text-lg font-bold text-white">Support &amp; Workspace Setup</h2>
              <p className="mt-2 text-xs leading-5 text-[#8d96a8]">
                Need help with channel connections, WhatsApp Cloud setup, or workspace configuration? Email our support team.
              </p>
            </div>
            <a
              href={`mailto:${supportEmail}?subject=J10%20NEXUS%20Workspace%20Support`}
              className="j10-gradient mt-6 inline-flex items-center justify-center gap-2 rounded-xl py-3 text-xs font-semibold text-white shadow-md transition hover:brightness-110"
            >
              {supportEmail} <ArrowUpRight size={13} />
            </a>
          </div>

          {/* Scale Capacity */}
          <div className="j10-surface rounded-2xl p-6 sm:p-7 border border-white/[0.08] flex flex-col justify-between">
            <div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300">
                <Zap size={20} />
              </div>
              <h2 className="mt-4 text-lg font-bold text-white">High-Volume &amp; Scale Plans</h2>
              <p className="mt-2 text-xs leading-5 text-[#8d96a8]">
                Operating high message volume across multiple locations, franchises, or agencies? Speak with us about custom capacity.
              </p>
            </div>
            <a
              href={`mailto:${supportEmail}?subject=J10%20Scale%20Capacity%20Inquiry`}
              className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl border border-white/[0.15] bg-white/[0.04] py-3 text-xs font-semibold text-white transition hover:bg-white/[0.08]"
            >
              Request Scale Capacity <ArrowUpRight size={13} />
            </a>
          </div>
        </div>

        {/* Security & Trust Notice */}
        <div className="j10-surface mt-8 rounded-2xl p-6 border border-white/[0.08]">
          <div className="flex items-start gap-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-400">
              <ShieldAlert size={18} />
            </div>
            <div className="text-xs leading-6 text-[#8d96a8]">
              <strong className="text-white">Security Disclosures:</strong> If you are reporting a security issue or vulnerability, please review our{" "}
              <Link href="/security" className="text-cyan-300 hover:underline">
                security architecture overview
              </Link>{" "}
              and email us with concise reproduction steps.
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
