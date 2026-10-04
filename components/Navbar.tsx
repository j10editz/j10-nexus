"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Menu, X, Sun, Moon } from "lucide-react";

const links = [
  { label: "Product", href: "/#product" },
  { label: "Services", href: "/#services" },
  { label: "Integrations", href: "/#integrations" },
  { label: "Docs", href: "/#docs" },
  { label: "Pricing", href: "/pricing" },
  { label: "FAQ", href: "/#faq" },
  { label: "Contact", href: "/contact", hiddenOnDesktop: true },
] as const;

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isLightMode, setIsLightMode] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.08] bg-[#07060f]/85 backdrop-blur-xl transition-all duration-200">
      <nav className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-3.5 lg:px-10">
        {/* Brand Logo & Wordmark */}
        <Link href="/" className="group flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#7c3aed] to-[#4f46e5] p-1.5 shadow-[0_0_20px_rgba(124,58,237,0.5)] transition-transform duration-200 group-hover:scale-105">
            <Image
              src="/brand/j10-logo.png"
              alt="J10 Monogram"
              width={24}
              height={24}
              className="h-full w-full object-contain filter brightness-110 drop-shadow-[0_0_8px_rgba(255,255,255,0.6)]"
              priority
            />
          </span>
          <span className="text-lg font-bold tracking-tight text-white flex items-center gap-1.5">
            J10 <span className="font-semibold text-white/90">NEXUS</span>
          </span>
        </Link>

        {/* Center Links */}
        <div className="hidden items-center gap-8 text-[14px] font-medium text-[#9da5b5] lg:flex">
          {links
            .filter((item) => !("hiddenOnDesktop" in item && item.hiddenOnDesktop))
            .map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="transition-colors hover:text-white"
              >
                {item.label}
              </Link>
            ))}
        </div>

        {/* Right Action Area: Theme Switch + Sign In + Start Free */}
        <div className="hidden items-center gap-4 sm:flex">
          {/* Theme Switcher Toggle */}
          <button
            type="button"
            onClick={() => setIsLightMode(!isLightMode)}
            className="flex items-center gap-1.5 rounded-full p-1 text-[#8d96a8] hover:text-white transition-colors"
            title="Toggle theme"
            aria-label="Toggle theme"
          >
            <Sun size={15} className={isLightMode ? "text-amber-400" : "text-[#717a8c]"} />
            <div className="relative h-5 w-9 rounded-full bg-[#181a28] p-0.5 border border-white/10 shadow-inner">
              <div
                className={`h-4 w-4 rounded-full bg-gradient-to-r from-[#7c3aed] to-[#9061f9] shadow-sm transition-transform duration-200 ${
                  isLightMode ? "translate-x-0" : "translate-x-4"
                }`}
              />
            </div>
            <Moon size={14} className={!isLightMode ? "text-violet-400" : "text-[#717a8c]"} />
          </button>

          {/* Sign In Button */}
          <Link
            href="/login"
            className="rounded-lg px-4 py-2 text-[14px] font-medium text-[#c4cdd5] transition hover:text-white hover:bg-white/[0.04]"
          >
            Sign in
          </Link>

          {/* Start Free Button */}
          <Link
            href="/login?intent=signup&plan=growth&trial=1"
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[#6347e8] via-[#7042f4] to-[#7c3aed] px-6 py-2 text-[14px] font-semibold text-white shadow-[0_0_25px_rgba(124,58,237,0.55)] transition-all duration-200 hover:shadow-[0_0_35px_rgba(124,58,237,0.85)] hover:scale-[1.02]"
          >
            Start Free
          </Link>
        </div>

        {/* Mobile Hamburger Menu */}
        <div className="flex items-center gap-2 sm:hidden">
          <Link
            href="/login?intent=signup&plan=growth&trial=1"
            className="rounded-full bg-gradient-to-r from-[#6347e8] to-[#7c3aed] px-3.5 py-1.5 text-xs font-semibold text-white shadow-[0_0_15px_rgba(124,58,237,0.4)]"
          >
            Start Free
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="rounded-lg p-2 text-[#8d96a8] hover:bg-white/5 hover:text-white"
            aria-label="Toggle Navigation Menu"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </nav>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="border-t border-white/[0.08] bg-[#07060f]/95 px-6 py-5 backdrop-blur-2xl sm:hidden">
          <div className="flex flex-col space-y-3">
            {links.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className="text-sm font-medium text-[#c4cdd5] transition hover:text-white"
              >
                {item.label}
              </Link>
            ))}
            <div className="pt-4 border-t border-white/10 flex flex-col gap-2">
              <Link
                href="/login"
                onClick={() => setMobileOpen(false)}
                className="w-full text-center py-2 text-sm font-medium text-[#c4cdd5] border border-white/10 rounded-lg hover:text-white"
              >
                Sign in
              </Link>
              <Link
                href="/login?intent=signup&plan=growth&trial=1"
                onClick={() => setMobileOpen(false)}
                className="w-full text-center py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-[#6347e8] to-[#7c3aed] rounded-full shadow-[0_0_20px_rgba(124,58,237,0.5)]"
              >
                Start Free
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
