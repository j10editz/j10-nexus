import Image from "next/image";
import Link from "next/link";

const footerLinks = [
  { label: "Product", href: "/#product" },
  { label: "Services", href: "/#services" },
  { label: "Integrations", href: "/integrations" },
  { label: "Docs", href: "/#docs" },
  { label: "Pricing", href: "/pricing" },
  { label: "Security", href: "/security" },
  { label: "Status", href: "/status" },
  { label: "Contact", href: "/contact" },
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
];

export default function Footer() {
  return (
    <footer className="border-t border-white/[0.08] bg-[#06050b] text-white">
      <div className="mx-auto max-w-[1400px] px-6 py-8 lg:px-10">
        <div className="flex flex-col items-center justify-between gap-6 lg:flex-row">
          {/* Left Brand Identity */}
          <Link href="/" className="group flex items-center gap-3">
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

          {/* Center Navigation Links */}
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-medium text-[#8d96a8]">
            {footerLinks.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="transition-colors hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Right Founder Attribution & LinkedIn */}
          <div className="flex items-center gap-3 text-right">
            <div className="flex flex-col text-xs">
              <span className="text-white/90 font-medium">Built by Jeefthe Richeder Osne</span>
              <span className="text-[#8d96a8]">Founder &amp; CEO</span>
            </div>
            <a
              href="https://www.linkedin.com/in/jeefthe-osne-143a9126b/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#0077b5]/20 border border-[#0077b5]/40 text-[#38bdf8] hover:bg-[#0077b5]/40 hover:text-white transition-all"
              aria-label="Jeefthe Richeder Osne LinkedIn Profile"
            >
              <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24">
                <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 8.76a1.44 1.44 0 0 0 1.44-1.44 1.44 1.44 0 0 0-1.44-1.45 1.45 1.45 0 0 0-1.45 1.45 1.44 1.44 0 0 0 1.45 1.44m1.39 9.74v-8.37H5.07v8.37h2.78z" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
