import { ArrowUpRight, CalendarCheck, Inbox, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

const columns = [
  { title: "Platform", links: [["Product Overview", "/#product"], ["AI Receptionist", "/#services"], ["Integrations", "/integrations"], ["Unified Inbox", "/#j10-products"], ["Automations", "/#j10-workflow"], ["Pricing", "/pricing"]] },
  { title: "Company", links: [["Security", "/security"], ["System Status", "/status"], ["Contact", "/contact"], ["Sign In", "/login"]] },
  { title: "Legal", links: [["Privacy Policy", "/privacy"], ["Terms of Service", "/terms"], ["Data Deletion", "/data-deletion"], ["Responsible Disclosure", "/security#disclosure"]] },
] as const;

const outcomes = [
  { label: "Answer every lead", icon: Sparkles },
  { label: "Keep conversations together", icon: Inbox },
  { label: "Book without the back-and-forth", icon: CalendarCheck },
] as const;

export default function Footer() {
  return (
    <footer className="relative overflow-hidden bg-[#03030a] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_58%_50%_at_15%_55%,rgba(95,38,204,0.14),transparent_72%)]" />
      <div className="relative mx-auto max-w-[1280px] px-5 pb-8 pt-10 lg:px-8 lg:pt-14">
        <div className="grid gap-14 lg:grid-cols-[1.25fr_1fr] lg:gap-20">
          <div>
            <Link href="/" className="inline-flex items-center gap-3" aria-label="J10 NEXUS home">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#7c3aed,#3b1a8f)] p-2 shadow-[0_0_28px_rgba(124,58,237,0.3)]">
                <Image src="/brand/j10-logo.png" alt="" width={30} height={30} className="h-full w-full object-contain" />
              </span>
              <span className="text-lg font-extrabold tracking-[-0.03em]">J10 <span className="font-medium text-white/55">NEXUS</span></span>
            </Link>
            <h2 className="mt-7 max-w-xl text-[clamp(2rem,4vw,3.6rem)] font-extrabold leading-[1.02] tracking-[-0.055em]">
              Turn conversations into <span className="text-[#ad71ff]">revenue.</span>
            </h2>
            <p className="mt-5 max-w-xl text-base leading-7 text-[#aaa4ba]">One connected AI operator for leads, follow-up, appointments and customer operations.</p>
            <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3 text-sm text-white/70">
              {outcomes.map(({ label, icon: Icon }) => <span key={label} className="inline-flex items-center gap-2"><Icon size={16} className="text-[#efc76b]" />{label}</span>)}
            </div>
            <Link href="/login?intent=signup&plan=growth&trial=1" className="mt-8 inline-flex items-center gap-2 rounded-xl border border-[#a676ff] bg-[linear-gradient(115deg,#4111bb,#7d41f6)] px-5 py-3.5 text-sm font-bold shadow-[0_0_26px_rgba(100,49,187,0.28)] transition hover:brightness-110">
              Start Free 72-Hour Trial <ArrowUpRight size={16} />
            </Link>
          </div>
          <nav aria-label="Footer navigation" className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3">
            {columns.map(({ title, links }) => (
              <div key={title}>
                <p className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-[#efc76b]">{title}</p>
                <ul className="mt-5 space-y-3.5 text-sm text-[#9c94aa]">
                  {links.map(([label, href]) => <li key={label}><Link href={href} className="transition-colors hover:text-white">{label}</Link></li>)}
                </ul>
              </div>
            ))}
          </nav>
        </div>
        <div className="mt-16 flex flex-col gap-2 text-xs text-white/35 sm:flex-row sm:items-center sm:justify-between">
          <span>© 2026 J10 NEXUS. All rights reserved. • <a href="https://www.linkedin.com/in/jeefthe-osne-143a9126b/" target="_blank" rel="noopener noreferrer" className="hover:text-white transition">Founded by Jeefthe Richeder Osne</a></span>
          <span>AI Revenue &amp; Operations System</span>
        </div>
      </div>
    </footer>
  );
}
