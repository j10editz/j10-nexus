"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight, Bot, CalendarDays, Check, ChevronDown, CircleDollarSign,
  CreditCard, Headphones, Inbox, LockKeyhole, MessageCircle, Send,
  ShieldCheck, Sparkles, UserRoundCheck, Users, Workflow,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

const workflow = [
  { label: "Lead captured", icon: MessageCircle },
  { label: "J10 answers", icon: Headphones },
  { label: "Lead qualified", icon: UserRoundCheck },
  { label: "Appointment booked", icon: CalendarDays },
  { label: "Deposit collected", icon: CreditCard },
  { label: "Follow-up sent", icon: Send },
];

const products = [
  { name: "J10 Lead Center", copy: "Capture, qualify, and organize every real lead in one workspace.", icon: Users, href: "/dashboard/crm" },
  { name: "J10 Inbox", copy: "Handle connected customer conversations with shared context.", icon: Inbox, href: "/dashboard/inbox" },
  { name: "J10 Booking", copy: "Schedule appointments and track the work that is actually booked.", icon: CalendarDays, href: "/dashboard/booking" },
  { name: "J10 Growth", copy: "Run lead capture and follow-up workflows from verified customer data.", icon: Sparkles, href: "/dashboard/growth" },
  { name: "J10 AI Operator", copy: "Ground replies in your knowledge, rules, and escalation boundaries.", icon: Bot, href: "/dashboard/ai-operator" },
  { name: "J10 Pay", copy: "Create invoices, track deposits, and keep payment status visible.", icon: CircleDollarSign, href: "/dashboard/pay" },
];

const plans = [
  { name: "Starter", monthly: 19, copy: "For owner-operated businesses beginning to automate.", features: ["AI receptionist", "Unified inbox", "Appointment booking", "Core integrations"] },
  { name: "Growth", monthly: 49, copy: "For growing service businesses that need more automation.", features: ["Everything in Starter", "Advanced workflows", "More integrations", "Priority support"], featured: true },
  { name: "Business", monthly: 99, copy: "For established businesses with higher volume and control.", features: ["Everything in Growth", "Advanced customization", "Dedicated support", "Higher usage limits"] },
];

const questions = [
  ["How does the 72-hour trial work?", "The trial begins only after Outcome Onboarding is completed and approved."],
  ["Which channels work today?", "J10 currently supports verified WhatsApp, Telegram, website lead, and authenticated workspace flows. Availability depends on connected accounts."],
  ["Can J10 collect deposits?", "J10 can create invoices and payment requests through configured billing providers without inventing payment status."],
  ["Is my workspace isolated?", "Workspace data is scoped by authenticated membership and protected through database policies and server-side authorization."],
];

type ChatLine = { role: "assistant" | "user"; text: string };

function GlassPanel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-[22px] border border-[#6f4b9a]/45 bg-[#0d0918]/90 shadow-[0_22px_70px_rgba(0,0,0,.52)] backdrop-blur-xl ${className}`}>{children}</div>;
}

export default function LaunchHome() {
  const [activeFlow, setActiveFlow] = useState(0);
  const [openFaq, setOpenFaq] = useState(0);
  const [chatInput, setChatInput] = useState("");
  const [chat, setChat] = useState<ChatLine[]>([
    { role: "assistant", text: "Hi. I can explain J10, pricing, setup, and what happens after signup." },
  ]);
  const activeStep = workflow[activeFlow];

  const chatbotReply = useMemo(() => {
    const q = chatInput.toLowerCase();
    if (q.includes("price") || q.includes("cost")) return "J10 starts at $19 per month. Growth is $49 and Business is $99. Provider usage fees are separate.";
    if (q.includes("trial")) return "The 72-hour trial starts after you complete and approve Outcome Onboarding.";
    if (q.includes("whatsapp") || q.includes("telegram")) return "J10 supports verified WhatsApp and Telegram connection flows. Your dashboard shows the real connection status.";
    if (q.includes("book") || q.includes("appointment")) return "J10 Booking can create and track appointments inside the authenticated workspace.";
    return "J10 helps service businesses capture leads, answer conversations, book work, follow up, and track payments from one workspace.";
  }, [chatInput]);

  function submitChat(event: FormEvent) {
    event.preventDefault();
    const question = chatInput.trim();
    if (!question) return;
    setChat((lines) => [...lines, { role: "user", text: question }, { role: "assistant", text: chatbotReply }]);
    setChatInput("");
  }

  return (
    <main className="relative overflow-hidden bg-[#05030a] text-white selection:bg-violet-500/40">
      <div className="pointer-events-none absolute inset-0 opacity-65 [background:radial-gradient(circle_at_72%_12%,rgba(124,58,237,.25),transparent_24%),radial-gradient(circle_at_16%_38%,rgba(216,181,101,.12),transparent_22%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[780px] opacity-75">
        <Image src="/brand/j10-official-bg.png" alt="" fill priority className="object-cover object-top mix-blend-screen" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#05030a]/35 via-[#05030a]/75 to-[#05030a]" />
      </div>

      <section className="relative mx-auto grid min-h-[690px] max-w-[1320px] items-center gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[.92fr_1.08fr] lg:px-10">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[.32em] text-[#d8b565]">J10 AI business operator</p>
          <h1 className="mt-5 max-w-[720px] text-5xl font-black leading-[.98] tracking-[-.055em] sm:text-6xl lg:text-[78px]">
            Turn every conversation into <span className="bg-gradient-to-r from-[#a78bfa] via-[#7c3aed] to-[#e1bd6b] bg-clip-text text-transparent">revenue.</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-[#b8aec9] sm:text-lg">J10 answers customers, qualifies leads, books appointments, creates payment requests, and shows the owner exactly what happened.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/signup" className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#6d28d9] to-[#8b5cf6] px-6 py-3.5 text-sm font-bold shadow-[0_0_34px_rgba(124,58,237,.45)] transition hover:-translate-y-0.5">Start free <ArrowRight size={16} /></Link>
            <a href="#money-workflow" className="rounded-xl border border-[#d8b565]/45 bg-black/20 px-6 py-3.5 text-sm font-semibold text-[#f1ddb0] transition hover:border-[#d8b565]">See the revenue workflow</a>
          </div>
          <p className="mt-4 text-xs text-[#8f849f]">Your 72-hour trial starts after Outcome Onboarding approval.</p>
        </div>

        <GlassPanel className="relative p-4 sm:p-6">
          <div className="absolute -right-10 -top-28 hidden w-[250px] lg:block"><Image src="/brand/j10-hero-mascot.png" alt="J10 AI operator mascot" width={420} height={520} className="h-auto w-full object-contain drop-shadow-[0_0_35px_rgba(124,58,237,.65)]" /></div>
          <div className="flex items-center justify-between border-b border-white/10 pb-4"><div><p className="text-sm font-bold">J10 Command Center</p><p className="mt-1 text-xs text-[#9388a5]">Conversations, bookings, and money</p></div><span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-[10px] font-bold text-emerald-300">Workspace ready</span></div>
          <p className="mt-5 text-[10px] font-bold uppercase tracking-[.22em] text-[#d8b565]">Illustrative workspace preview</p>
          <div className="mt-3 grid grid-cols-2 gap-3">{[["New leads", "24"], ["Unanswered", "3"], ["Booked", "6"], ["Pending", "$2,450"]].map(([label, value]) => <div key={label} className="rounded-xl border border-white/8 bg-[#151025] p-4"><p className="text-xs text-[#978da8]">{label}</p><p className="mt-2 text-2xl font-black">{value}</p></div>)}</div>
          <div className="mt-4 rounded-xl border border-[#d8b565]/30 bg-[#120d1e] p-4"><div className="flex items-center justify-between"><p className="text-sm font-bold">Needs your attention</p><span className="text-xs text-[#d8b565]">6 items</span></div><div className="mt-3 space-y-2 text-xs text-[#b8aec9]"><p className="flex justify-between rounded-lg bg-white/[.035] px-3 py-2"><span>3 unanswered conversations</span><span>High</span></p><p className="flex justify-between rounded-lg bg-white/[.035] px-3 py-2"><span>2 leads waiting for follow-up</span><span>Medium</span></p><p className="flex justify-between rounded-lg bg-white/[.035] px-3 py-2"><span>1 blocked automation</span><span>Review</span></p></div></div>
        </GlassPanel>
      </section>

      <section id="money-workflow" className="relative mx-auto max-w-[1320px] px-5 py-20 sm:px-8 lg:px-10">
        <SectionHeading eyebrow="The money workflow" title="One conversation." accent="One complete path to revenue." copy="J10 connects the customer journey from the first message to booked work and a tracked payment." />
        <div className="relative mt-14 grid gap-3 sm:grid-cols-3 lg:grid-cols-6"><div className="absolute left-[8%] right-[8%] top-8 hidden h-px bg-gradient-to-r from-transparent via-[#d8b565] to-transparent lg:block" />{workflow.map((step, index) => { const Icon = step.icon; return <button key={step.label} onClick={() => setActiveFlow(index)} className="relative z-10 flex flex-col items-center rounded-xl p-3 text-center"><span className={`grid h-16 w-16 place-items-center rounded-full border bg-[#0b0713] transition ${activeFlow === index ? "border-[#9a63ff] text-white shadow-[0_0_28px_rgba(124,58,237,.75)]" : "border-[#d8b565]/60 text-[#e7c878]"}`}><Icon size={22} /></span><span className="mt-3 text-xs font-semibold">{step.label}</span></button>; })}</div>
        <GlassPanel className="mt-8 grid gap-7 p-6 lg:grid-cols-[1.15fr_.85fr]">
          <div className="rounded-2xl border border-white/8 bg-[#090611] p-5"><p className="text-[10px] font-bold uppercase tracking-[.25em] text-[#a78bfa]">Step {String(activeFlow + 1).padStart(2, "0")}</p><h3 className="mt-3 text-2xl font-black">{activeStep.label}</h3><div className="mt-5 space-y-3"><p className="max-w-[78%] rounded-2xl rounded-tl-sm bg-white/[.06] p-4 text-sm text-[#c8bed4]">I need help with my service. What happens next?</p><p className="ml-auto max-w-[82%] rounded-2xl rounded-tr-sm bg-gradient-to-br from-[#6d28d9] to-[#3b176f] p-4 text-sm">J10 uses business rules and connected workspace data to guide the next verified step.</p></div></div>
          <div className="flex items-center gap-6"><div className="w-[150px] shrink-0"><Image src="/brand/j10-mascot-standing.png" alt="J10 operator" width={320} height={400} className="h-auto w-full" /></div><div><p className="text-xs font-bold uppercase tracking-[.2em] text-[#d8b565]">Result</p><ul className="mt-4 space-y-3 text-sm text-[#c8bed4]">{["Lead saved to the workspace", "Conversation history preserved", "Owner can review the next action"].map(item => <li key={item} className="flex gap-2"><Check size={16} className="mt-0.5 text-[#9a63ff]" />{item}</li>)}</ul><Link href="/signup" className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[#6d28d9] px-4 py-2.5 text-sm font-bold">Open J10 <ArrowRight size={14} /></Link></div></div>
        </GlassPanel>
      </section>

      <section className="relative border-y border-white/[.06] bg-[#08050f]/75 py-24"><div className="mx-auto max-w-[1320px] px-5 sm:px-8 lg:px-10">
        <SectionHeading eyebrow="The J10 product system" title="Seven J10 products." accent="One business operator." copy="Every product works from the same authenticated workspace." />
        <div className="mt-12 grid gap-4 lg:grid-cols-[1fr_1.25fr_1fr]"><div className="space-y-4">{products.slice(0,3).map((product) => <ProductCard key={product.name} {...product} />)}</div><CommandCard /><div className="space-y-4">{products.slice(3).map((product) => <ProductCard key={product.name} {...product} />)}</div></div>
      </div></section>

      <section className="relative mx-auto max-w-[1320px] px-5 py-24 sm:px-8 lg:px-10">
        <SectionHeading eyebrow="Built for trust" title="Built for small businesses." accent="Engineered like serious infrastructure." />
        <div className="mt-12 grid gap-5 lg:grid-cols-[1.35fr_.65fr]"><GlassPanel className="grid gap-4 p-5 sm:grid-cols-2">{[[LockKeyhole,"Encrypted credentials","Connected account secrets stay server-side."],[ShieldCheck,"Tenant-isolated data","Workspace authorization protects customer records."],[Workflow,"Protected webhooks","Inbound providers are authenticated and validated."],[UserRoundCheck,"Human escalation controls","Sensitive situations can require owner approval."]].map(([Icon,title,copy]) => { const I=Icon as typeof LockKeyhole; return <div key={String(title)} className="rounded-2xl border border-[#7c3aed]/25 bg-[#100a1b] p-5"><I className="text-[#d8b565]" size={23}/><h3 className="mt-4 font-bold">{String(title)}</h3><p className="mt-2 text-sm leading-6 text-[#9e93ae]">{String(copy)}</p></div>;})}</GlassPanel><FounderCard /></div>
      </section>

      <section className="relative border-y border-white/[.06] bg-[#08050f] py-24"><div className="mx-auto max-w-[1320px] px-5 sm:px-8 lg:px-10"><div className="grid gap-10 lg:grid-cols-[.7fr_1.3fr]"><div><p className="text-[10px] font-bold uppercase tracking-[.34em] text-[#d8b565]">Simple pricing</p><h2 className="mt-4 text-5xl font-black tracking-[-.05em]">Choose the plan <span className="text-[#9a63ff]">for your business.</span></h2><p className="mt-4 text-[#a99fb9]">Start with the operations you need and upgrade as your business grows.</p></div><div className="grid gap-4 md:grid-cols-3">{plans.map(plan=><PlanCard key={plan.name} {...plan}/>)}</div></div><div className="mt-14 grid gap-3 md:grid-cols-2">{questions.map(([q,a],index)=><button key={q} onClick={()=>setOpenFaq(openFaq===index?-1:index)} className="rounded-xl border border-white/8 bg-[#0d0916] p-5 text-left"><span className="flex items-center justify-between font-semibold"><span>{q}</span><ChevronDown size={16} className={`transition ${openFaq===index?"rotate-180":""}`}/></span>{openFaq===index&&<span className="mt-3 block text-sm leading-6 text-[#a99fb9]">{a}</span>}</button>)}</div></div></section>

      <section className="relative mx-auto max-w-[1320px] px-5 py-24 sm:px-8 lg:px-10"><div className="grid items-center gap-10 lg:grid-cols-[1.15fr_.85fr]">
        <GlassPanel className="overflow-hidden"><div className="border-b border-white/10 p-5"><p className="text-xs font-bold text-[#d8b565]">ASK J10 LIVE</p><h2 className="mt-2 text-3xl font-black">Experience J10 before you sign up.</h2></div><div className="h-[330px] space-y-3 overflow-y-auto p-5">{chat.map((line,index)=><p key={`${line.role}-${index}`} className={`max-w-[82%] rounded-2xl p-3 text-sm leading-6 ${line.role==="user"?"ml-auto rounded-tr-sm bg-[#6d28d9]":"rounded-tl-sm border border-white/8 bg-white/[.045] text-[#c8bed4]"}`}>{line.text}</p>)}</div><form onSubmit={submitChat} className="flex gap-2 border-t border-white/10 p-4"><input value={chatInput} onChange={e=>setChatInput(e.target.value)} placeholder="Ask about J10, pricing, or setup" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/25 px-4 text-sm outline-none focus:border-[#8b5cf6]"/><button aria-label="Send question" className="grid h-11 w-11 place-items-center rounded-xl bg-[#6d28d9]"><Send size={17}/></button></form></GlassPanel>
        <div><p className="text-[10px] font-bold uppercase tracking-[.34em] text-[#d8b565]">Ask J10 live</p><h2 className="mt-4 text-5xl font-black tracking-[-.05em]">Get answers before creating your workspace.</h2><p className="mt-5 text-[#a99fb9]">The public assistant answers product questions and signup guidance. Account changes and privileged actions require authentication.</p><div className="mt-8 flex gap-4"><div className="w-[190px]"><Image src="/brand/j10-mascot-standing.png" alt="Ask J10 assistant" width={320} height={400} className="h-auto w-full"/></div><div className="space-y-3 pt-6 text-sm text-[#c3b8ce]"><p>Answers product questions</p><p>Explains setup and pricing</p><p>Guides visitors to signup</p><p className="text-[#d8b565]">Never performs privileged account actions</p></div></div></div>
      </div></section>
    </main>
  );
}

function SectionHeading({ eyebrow, title, accent, copy }: { eyebrow: string; title: string; accent: string; copy?: string }) {
  return <div className="text-center"><p className="text-[10px] font-bold uppercase tracking-[.34em] text-[#d8b565]">{eyebrow}</p><h2 className="mt-4 text-4xl font-black tracking-[-.04em] sm:text-6xl">{title} <span className="text-[#9a63ff]">{accent}</span></h2>{copy&&<p className="mx-auto mt-4 max-w-3xl text-[#a99fb9]">{copy}</p>}</div>;
}

function ProductCard({ name, copy, icon: Icon, href }: (typeof products)[number]) {
  return <Link href={href} className="group block rounded-2xl border border-[#604181]/45 bg-[#0d0917] p-5 transition hover:-translate-y-0.5 hover:border-[#9a63ff]"><div className="flex items-center justify-between"><span className="grid h-9 w-9 place-items-center rounded-full border border-[#d8b565]/45 text-[#d8b565]"><Icon size={17}/></span><ArrowRight size={15} className="text-[#766c83] transition group-hover:text-white"/></div><h3 className="mt-5 font-black">{name}</h3><p className="mt-2 text-sm leading-6 text-[#9f94ae]">{copy}</p></Link>;
}

function CommandCard() {
  return <GlassPanel className="relative flex min-h-[500px] flex-col justify-between overflow-hidden p-6"><div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_48%,rgba(124,58,237,.34),transparent_42%)]"/><div className="relative flex items-center justify-between"><div><p className="text-xs text-[#9d92ae]">Illustrative workspace</p><h3 className="mt-1 text-2xl font-black">Command Center</h3></div><span className="rounded-full border border-[#d8b565]/35 px-3 py-1 text-[10px] text-[#e8ca82]">Sample view</span></div><div className="relative grid grid-cols-2 gap-3">{[["New leads","24"],["Follow-ups","8"],["Appointments","6"],["Payments","$2.4k"]].map(([k,v])=><div key={k} className="rounded-xl border border-white/8 bg-black/25 p-4"><p className="text-xs text-[#9489a4]">{k}</p><p className="mt-2 text-xl font-black">{v}</p></div>)}</div><div className="relative rounded-xl border border-white/8 bg-black/25 p-4"><p className="text-xs font-bold text-[#d8b565]">Example activity</p><div className="mt-3 space-y-2 text-xs text-[#aea4bd]"><p>New lead entered the workspace</p><p>Appointment status updated</p><p>Invoice created for review</p></div></div><div className="relative text-center"><span className="inline-flex rounded-full border border-[#9a63ff]/45 bg-[#6d28d9]/15 px-5 py-2 text-xs font-bold text-[#cbb8ff]">J10 Command Center</span></div></GlassPanel>;
}

function FounderCard() {
  return <GlassPanel className="p-5"><div className="flex gap-4"><Image src="/images/founder/jeefthe-osne-founder-ceo.png" alt="Jeefthe Richeder Osne, Founder and CEO of J10 NEXUS" width={160} height={160} className="h-28 w-28 rounded-xl object-cover"/><div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#d8b565]">From the founder</p><h3 className="mt-2 text-xl font-black">Jeefthe Richeder Osne</h3><p className="text-xs text-[#a69bae]">Founder & CEO, J10 NEXUS</p></div></div><p className="mt-5 text-sm leading-6 text-[#b8aec9]">I built J10 because service businesses should not need five expensive tools to answer customers, book work, and stay organized.</p><a href="https://www.linkedin.com/in/jeefthe-osne-143a9126b/" target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex items-center gap-2 rounded-lg border border-[#7c3aed]/50 px-4 py-2 text-sm font-semibold">Connect on LinkedIn <ArrowRight size={14}/></a></GlassPanel>;
}

function PlanCard(plan: (typeof plans)[number]) {
  return <div className={`rounded-2xl border p-5 ${plan.featured ? "border-[#9a63ff] bg-[#160d29] shadow-[0_0_32px_rgba(124,58,237,.25)]" : "border-white/10 bg-[#0d0916]"}`}><p className="font-bold">{plan.name}</p><p className="mt-1 text-xs text-[#9d92ab]">{plan.copy}</p><p className="mt-5 text-4xl font-black">${plan.monthly}<span className="text-xs font-medium text-[#9d92ab]">/mo</span></p><ul className="mt-5 space-y-2 text-xs text-[#c5bacf]">{plan.features.map(feature=><li key={feature} className="flex gap-2"><Check size={14} className="text-[#d8b565]"/>{feature}</li>)}</ul><Link href="/signup" className={`mt-6 flex justify-center rounded-lg px-4 py-2.5 text-sm font-bold ${plan.featured ? "bg-[#6d28d9]" : "border border-[#d8b565]/35 text-[#e6c97f]"}`}>Start free</Link></div>;
}
