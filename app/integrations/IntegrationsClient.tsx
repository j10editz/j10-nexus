"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, Search } from "lucide-react";
import IntegrationLogo from "@/components/integrations/IntegrationLogo";
import { INTEGRATION_CATEGORIES, INTEGRATION_STATUS_LABEL, J10_INTEGRATIONS, type IntegrationStatus } from "@/lib/integrations/catalog";

const statusStyle: Record<IntegrationStatus,string> = {
  available:"border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
  next:"border-[#d9b85f]/25 bg-[#d9b85f]/10 text-[#efc76b]",
  roadmap:"border-white/10 bg-white/[.035] text-white/38",
};

export default function IntegrationsClient() {
  const [category,setCategory] = useState("All");
  const [query,setQuery] = useState("");
  const filtered = useMemo(()=>J10_INTEGRATIONS.filter(item => (category === "All" || item.category === category) && `${item.name} ${item.category} ${item.description}`.toLowerCase().includes(query.toLowerCase())),[category,query]);
  const available = J10_INTEGRATIONS.filter(x=>x.status==="available").length;
  const next = J10_INTEGRATIONS.filter(x=>x.status==="next").length;

  return <>
    <section className="relative overflow-hidden border-b border-[#d9b85f]/12 px-5 pb-14 pt-16 sm:pb-20 sm:pt-24">
      <div className="pointer-events-none absolute left-1/2 top-0 h-[430px] w-[900px] -translate-x-1/2 bg-[radial-gradient(ellipse,rgba(105,43,195,.32),transparent_67%)]" />
      <div className="pointer-events-none absolute right-[8%] top-[20%] h-64 w-64 bg-[radial-gradient(circle,rgba(217,184,95,.12),transparent_67%)]" />
      <div className="relative mx-auto max-w-[1180px]">
        <p className="text-xs font-extrabold uppercase tracking-[.24em] text-[#efc76b]">J10 connection ecosystem</p>
        <div className="mt-5 grid gap-8 lg:grid-cols-[1fr_360px] lg:items-end">
          <div><h1 className="max-w-4xl text-4xl font-extrabold leading-[1.04] tracking-[-.05em] sm:text-6xl">Your business tools. <span className="text-[#b77cff]">One operator.</span></h1><p className="mt-5 max-w-2xl text-base leading-7 text-white/58">J10 brings customer conversations, appointments, payments, leads, reviews, and daily operations into one workspace. Connect what you use today and expand as new connections become available.</p></div>
          <div className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-[#d9b85f]/15 bg-[#d9b85f]/12"><Stat value={`${J10_INTEGRATIONS.length}`} label="Catalog"/><Stat value={`${available}`} label="Available"/><Stat value={`${next}`} label="Next"/></div>
        </div>
      </div>
    </section>

    <section className="mx-auto max-w-[1380px] px-5 py-12 lg:px-8">
      <div className="grid gap-4 rounded-2xl border border-[#d9b85f]/16 bg-[linear-gradient(135deg,rgba(68,29,116,.18),rgba(15,11,20,.92))] p-5 sm:grid-cols-3 sm:p-6">
        {["A lead arrives from a message, call, form, or ad.","J10 qualifies, books, collects, and updates the right system.","Your team sees the customer history and the next action in one place."].map((x,i)=><div key={x} className="flex gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[#d9b85f]/25 text-xs font-extrabold text-[#efc76b]">0{i+1}</span><p className="text-sm leading-6 text-white/62">{x}</p></div>)}
      </div>

      <div className="mt-10 flex flex-col gap-4 border-b border-[#d9b85f]/12 pb-7 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-2 overflow-x-auto pb-1">{["All",...INTEGRATION_CATEGORIES].map(item=><button key={item} type="button" onClick={()=>setCategory(item)} className={`shrink-0 rounded-lg border px-3.5 py-2 text-xs font-bold transition ${category===item?"border-[#d9b85f]/45 bg-[#d9b85f]/12 text-[#efc76b]":"border-white/8 bg-white/[.025] text-white/44 hover:text-white"}`}>{item}</button>)}</div>
        <label className="relative block min-w-[250px]"><Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#efc76b]"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search integrations" className="w-full rounded-xl border border-[#d9b85f]/15 bg-[#0c0911] py-3 pl-10 pr-4 text-sm outline-none placeholder:text-white/30 focus:border-[#d9b85f]/45"/></label>
      </div>

      <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{filtered.map(item=><article key={item.id} className="group min-h-[158px] rounded-2xl border border-white/[.07] bg-[#0c0a10] p-5 transition hover:-translate-y-0.5 hover:border-[#d9b85f]/27"><div className="flex items-start justify-between gap-3"><IntegrationLogo name={item.name} domain={item.domain} size={42}/><span className={`rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider ${statusStyle[item.status]}`}>{INTEGRATION_STATUS_LABEL[item.status]}</span></div><h2 className="mt-4 text-sm font-bold text-white">{item.name}</h2><p className="mt-1 text-xs leading-5 text-white/40">{item.description}</p><span className="mt-3 block text-[10px] font-bold uppercase tracking-[.16em] text-[#efc76b]/65">{item.category}</span></article>)}</div>
      {filtered.length===0&&<div className="py-20 text-center text-sm text-white/45">No integration matches this search.</div>}

      <div className="mt-14 grid gap-7 rounded-[26px] border border-[#d9b85f]/20 bg-[radial-gradient(circle_at_80%_0%,rgba(113,56,190,.25),transparent_42%),#0d0912] p-7 sm:p-10 lg:grid-cols-[1fr_auto] lg:items-center"><div><p className="text-xs font-extrabold uppercase tracking-[.2em] text-[#efc76b]">One connection center</p><h2 className="mt-3 text-3xl font-extrabold tracking-[-.035em]">Connect once. Let J10 coordinate the work.</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-white/50">Available means a working J10 connection today. Next identifies the launch priority. Roadmap integrations are planned and will be added based on customer demand and provider access.</p></div><Link href="/login?intent=signup&plan=growth&trial=1" className="rounded-xl bg-[linear-gradient(115deg,#4f18a6,#8248e1)] px-6 py-3.5 text-center text-sm font-bold text-white">Start Free</Link></div>
    </section>
  </>;
}

function Stat({value,label}:{value:string;label:string}) { return <div className="bg-[#0c0911] p-4 text-center"><strong className="block text-xl text-white">{value}</strong><span className="mt-1 block text-[10px] font-bold uppercase tracking-wider text-white/35">{label}</span></div>; }
