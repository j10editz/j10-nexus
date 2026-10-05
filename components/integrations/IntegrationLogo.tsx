"use client";

import { useState } from "react";

export default function IntegrationLogo({ name, domain, size = 34 }: { name: string; domain: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (failed || domain === "j10-nexus.com") return <span aria-hidden="true" className="grid shrink-0 place-items-center rounded-xl bg-[linear-gradient(135deg,#7440d6,#b28b38)] font-extrabold text-white" style={{width:size,height:size,fontSize:Math.max(10,size*.3)}}>{name.split(/\s|&/).filter(Boolean).slice(0,2).map(x=>x[0]).join("")}</span>;
  return <span className="grid shrink-0 place-items-center rounded-xl bg-white p-1.5" style={{width:size,height:size}}><img src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`} alt={`${name} logo`} width={size-10} height={size-10} loading="lazy" onError={()=>setFailed(true)} className="h-full w-full object-contain" /></span>;
}
