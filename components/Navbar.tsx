"use client";

import { ArrowRight, Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

const links = [
  ["Product", "/#product"],
  ["Pricing", "/pricing"],
  ["Security", "/security"],
  ["Contact", "/contact"],
] as const;

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.08] bg-[#07090f]/85 backdrop-blur-xl transition-all duration-200">
      <nav className="mx-auto flex max-w-[1240px] items-center justify-between px-5 py-3.5 lg:px-8">
        {/* Brand Logo & Wordmark */}
        <Link href="/" className="group flex items-center gap-2.5">
          <span className="j10-gradient flex h-8 w-8 items-center justify-center rounded-xl p-1.5 shadow-[0_4px_16px_rgba(0,217,255,0.22)] transition-transform duration-200 group-hover:scale-105">
            <Image
              src="/brand/j10-logo.png"
              alt="J10 Monogram"
              width={22}
              height={22}
              className="h-full w-full object-contain"
              priority
            />
          </span>
          <span className="text-[17px] font-bold tracking-tight text-white">
            J10 <span className="font-medium text-[#8d96a8]">NEXUS</span>
          </span>
        </Link>

        {/* Center Links */}
        <div className="hidden items-center gap-7 text-[13.5px] font-medium text-[#8d96a8] md:flex">
          {links.map(([label, href]) => (
            <Link
              key={label}
              href={href}
              className="transition-colors hover:text-white"
            >
              {label}
            </Link>
          ))}
        </div>

        {/* Action CTAs */}
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="hidden px-3.5 py-2 text-[13.5px] font-medium text-[#cbd3e3] transition hover:text-white sm:block"
          >
            Sign In
          </Link>

          <Link
            href="/login?intent=signup&plan=growth&trial=1"
            className="j10-btn-primary !px-4 !py-2 !text-xs font-semibold"
          >
            Start Free
            <ArrowRight size={13} className="transition-transform duration-150 group-hover:translate-x-0.5" />
          </Link>

          {/* Mobile Menu Button */}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle navigation"
            aria-expanded={open}
            className="rounded-lg border border-white/[0.1] bg-white/[0.04] p-2 text-zinc-300 transition hover:bg-white/[0.08] hover:text-white md:hidden"
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </nav>

      {/* Mobile Drawer */}
      {open && (
        <div className="border-t border-white/[0.08] bg-[#07090f]/98 px-5 py-4 backdrop-blur-2xl md:hidden">
          <div className="mx-auto grid max-w-[1240px] gap-1">
            {links.map(([label, href]) => (
              <Link
                key={label}
                onClick={() => setOpen(false)}
                href={href}
                className="rounded-lg px-3.5 py-2.5 text-sm font-medium text-[#cbd3e3] transition hover:bg-white/[0.06] hover:text-white"
              >
                {label}
              </Link>
            ))}
            <div className="mt-2 border-t border-white/[0.06] pt-2">
              <Link
                onClick={() => setOpen(false)}
                href="/login"
                className="block rounded-lg px-3.5 py-2.5 text-sm font-medium text-[#cbd3e3]"
              >
                Sign In
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
