import { ArrowUpRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

const columns = [
  [
    "Product",
    [
      ["Product Overview", "/#product"],
      ["Pricing Plans", "/pricing"],
    ],
  ],
  [
    "Trust & Operations",
    [
      ["Security Architecture", "/security"],
      ["System Status", "/status"],
      ["Contact Team", "/contact"],
    ],
  ],
  [
    "Legal & Privacy",
    [
      ["Privacy Policy", "/privacy"],
      ["Terms of Service", "/terms"],
      ["Responsible Disclosure", "/security#disclosure"],
    ],
  ],
] as const;

export default function Footer() {
  return (
    <footer className="border-t border-white/[0.08] bg-[#07090f] text-white">
      <div className="mx-auto max-w-[1240px] px-5 py-16 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[1.8fr_repeat(3,0.7fr)]">
          <div>
            <Link href="/" className="flex items-center gap-3">
              <span className="j10-gradient flex h-10 w-10 items-center justify-center rounded-xl p-1.5 shadow-[0_8px_24px_rgba(47,107,255,0.28)]">
                <Image
                  src="/brand/j10-logo.png"
                  alt="J10 monogram"
                  width={30}
                  height={30}
                  className="h-full w-full object-contain"
                />
              </span>
              <span className="text-lg font-bold tracking-tight text-white">
                J10 <span className="font-normal text-[#8d96a8]">NEXUS</span>
              </span>
            </Link>

            <p className="mt-5 max-w-sm text-sm leading-7 text-[#8d96a8]">
              The AI Revenue &amp; Operations System for service businesses. Never miss another lead—answering, qualifying, following up, booking, and collecting payment automatically.
            </p>

            <div className="mt-6">
              <Link
                href="/login?intent=signup&plan=growth&trial=1"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-300 transition hover:text-cyan-200"
              >
                Start Free 14-Day Trial <ArrowUpRight size={14} />
              </Link>
            </div>
          </div>

          {columns.map(([title, links]) => (
            <div key={title}>
              <p className="text-xs font-bold uppercase tracking-wider text-white/90">
                {title}
              </p>
              <ul className="mt-5 space-y-3 text-sm text-[#8d96a8]">
                {links.map(([label, href]) => (
                  <li key={label}>
                    <Link
                      href={href}
                      className="transition-colors hover:text-white"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-16 flex flex-col gap-3 border-t border-white/[0.08] pt-8 text-xs text-[#5f697d] sm:flex-row sm:items-center sm:justify-between">
          <span>© 2026 J10 NEXUS. All rights reserved.</span>
          <span>Conversations → Revenue. One connected operating system.</span>
        </div>
      </div>
    </footer>
  );
}
