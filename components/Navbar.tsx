import { ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.08] bg-[#09090B]/80 backdrop-blur-xl">
      <nav className="mx-auto flex max-w-[1500px] items-center justify-between px-6 py-4 lg:px-8">
        {/* BRAND IDENTITY */}
        <Link href="/" className="group flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 shadow-md shadow-blue-500/20 ring-1 ring-white/20 transition-transform group-hover:scale-105">
            <Sparkles size={16} className="text-white" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-lg font-bold tracking-tight text-white">J10</span>
            <span className="rounded-md bg-blue-500/10 px-1.5 py-0.5 text-xs font-bold tracking-wider text-blue-400 border border-blue-500/20">
              NEXUS
            </span>
          </div>
        </Link>

        {/* CENTER LINKS */}
        <div className="hidden items-center gap-8 text-xs font-medium text-zinc-400 md:flex">
          <a href="#features" className="transition-colors hover:text-white">
            Features
          </a>
          <Link href="/login" className="transition-colors hover:text-white">
            Pricing
          </Link>
          <Link href="/login" className="transition-colors hover:text-white">
            Marketplace
          </Link>
          <a href="mailto:contact@j10-nexus.com" className="transition-colors hover:text-white">
            Contact
          </a>
        </div>

        {/* ACTIONS */}
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/[0.06] px-2.5 py-1 text-[10px] font-semibold text-emerald-400 sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>CORE v2.4 LIVE</span>
          </div>

          <Link
            href="/login"
            className="hidden rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-2 text-xs font-semibold text-zinc-300 transition hover:border-white/[0.15] hover:bg-white/[0.06] hover:text-white sm:inline-flex"
          >
            Sign In
          </Link>

          <Link
            href="/login"
            className="group inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-blue-600/25 transition-all hover:bg-blue-500 hover:shadow-blue-500/35"
          >
            <span>Start Free</span>
            <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </nav>
    </header>
  );
}
