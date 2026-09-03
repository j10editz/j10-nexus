"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, CheckCircle2, FlaskConical, Loader2, LockKeyhole, Save, ShieldCheck, Sparkles } from "lucide-react";

type Config = {
  agentName: string; businessName: string; role: string; tone: string; languages: string;
  businessKnowledge: string; instructions: string; escalationRules: string; prohibitedTopics: string;
  mode: "suggestions" | "supervised"; active: boolean;
};

const empty: Config = { agentName: "J10 Assistant", businessName: "", role: "Customer support", tone: "Professional and friendly", languages: "Reply in the customer's language", businessKnowledge: "", instructions: "Be concise, helpful, and honest.", escalationRules: "Escalate requests involving refunds, legal issues, complaints, or account security.", prohibitedTopics: "Never invent prices, policies, availability, order status, or completed actions.", mode: "suggestions", active: false };

export function WhatsAppAgentStudio({ integrationId, connected }: { integrationId: string | null; connected: boolean }) {
  const [config, setConfig] = useState<Config>(empty);
  const [missing, setMissing] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [testMessage, setTestMessage] = useState("Hi, what services do you offer and how much do they cost?");
  const [testReply, setTestReply] = useState("");
  const [simulationLabel, setSimulationLabel] = useState("");

  const load = useCallback(async () => {
    if (!integrationId) return;
    const response = await fetch(`/api/integrations/${encodeURIComponent(integrationId)}/whatsapp/agent`, { cache: "no-store" });
    const data = await response.json();
    if (response.ok && data.success) { setConfig(data.config); setMissing(data.readiness?.missing ?? []); }
  }, [integrationId]);
  useEffect(() => { void load(); }, [load]);

  function field<K extends keyof Config>(key: K, value: Config[K]) { setConfig(current => ({ ...current, [key]: value })); setNotice(""); }

  async function save(active = config.active) {
    if (!integrationId || busy) return;
    setBusy(true); setNotice("");
    try {
      const response = await fetch(`/api/integrations/${encodeURIComponent(integrationId)}/whatsapp/agent`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...config, active }) });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Could not save agent.");
      setConfig(data.config); setMissing(data.readiness?.missing ?? []); setNotice(active ? "Agent profile activated for human-reviewed replies." : "Agent profile saved.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not save agent."); }
    finally { setBusy(false); }
  }

  async function simulate() {
    if (!integrationId || busy || !testMessage.trim()) return;
    setTestReply(""); setNotice("");
    try {
      await save(false);
      setBusy(true);
      const response = await fetch(`/api/integrations/${encodeURIComponent(integrationId)}/whatsapp/agent/simulate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: testMessage }) });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Could not run simulation.");
      setTestReply(data.reply); setSimulationLabel(data.ai?.simulated ? "Development simulation — $0 API usage" : `Live AI — ${data.ai?.model ?? "configured model"}`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not run simulation."); }
    finally { setBusy(false); }
  }

  const input = "mt-2 w-full rounded-xl border border-zinc-800 bg-[#09090B] px-4 py-3 text-sm text-white outline-none focus:border-violet-500";
  return <section className="mt-8 rounded-2xl border border-violet-500/25 bg-[#101014] p-6 lg:p-8">
    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
      <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">WhatsApp AI Agent Studio</p><h2 className="mt-2 text-2xl font-semibold">Build your business agent</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">Train J10 with approved business facts, define its voice and escalation policy, then test it without sending a message.</p></div>
      <div className={`rounded-full border px-4 py-2 text-xs font-medium ${config.active ? "border-emerald-500/30 text-emerald-300" : "border-zinc-700 text-zinc-400"}`}>{config.active ? "Active · Human reviewed" : "Draft"}</div>
    </div>
    {!connected && <div className="mt-5 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-200">Connect WhatsApp Business before activating this agent.</div>}
    <div className="mt-7 grid gap-5 lg:grid-cols-2">
      <label className="text-sm text-zinc-300">Agent name<input className={input} value={config.agentName} onChange={e => field("agentName", e.target.value)} /></label>
      <label className="text-sm text-zinc-300">Business name<input className={input} value={config.businessName} onChange={e => field("businessName", e.target.value)} placeholder="Your company" /></label>
      <label className="text-sm text-zinc-300">Primary role<select className={input} value={config.role} onChange={e => field("role", e.target.value)}><option>Customer support</option><option>Sales and lead capture</option><option>Bookings and qualification</option><option>Customer success</option></select></label>
      <label className="text-sm text-zinc-300">Brand voice<select className={input} value={config.tone} onChange={e => field("tone", e.target.value)}><option>Professional and friendly</option><option>Warm and conversational</option><option>Concise and direct</option><option>Premium and polished</option><option>Energetic and persuasive</option></select></label>
    </div>
    <div className="mt-5 grid gap-5">
      <label className="text-sm text-zinc-300">Languages<input className={input} value={config.languages} onChange={e => field("languages", e.target.value)} /></label>
      <label className="text-sm text-zinc-300">Verified business knowledge<textarea className={`${input} min-h-36`} value={config.businessKnowledge} maxLength={16000} onChange={e => field("businessKnowledge", e.target.value)} placeholder="Services, prices, hours, policies, locations, FAQs, booking rules…" /><span className="mt-1 block text-xs text-zinc-600">Only add facts the agent is allowed to use. {config.businessKnowledge.length}/16000</span></label>
      <label className="text-sm text-zinc-300">Agent instructions<textarea className={`${input} min-h-24`} value={config.instructions} onChange={e => field("instructions", e.target.value)} /></label>
      <div className="grid gap-5 lg:grid-cols-2"><label className="text-sm text-zinc-300">Escalation rules<textarea className={`${input} min-h-28`} value={config.escalationRules} onChange={e => field("escalationRules", e.target.value)} /></label><label className="text-sm text-zinc-300">Forbidden claims and topics<textarea className={`${input} min-h-28`} value={config.prohibitedTopics} onChange={e => field("prohibitedTopics", e.target.value)} /></label></div>
    </div>
    <div className="mt-7 grid gap-4 md:grid-cols-3">
      <button onClick={() => field("mode", "suggestions")} className={`rounded-xl border p-4 text-left ${config.mode === "suggestions" ? "border-violet-500 bg-violet-500/10" : "border-zinc-800"}`}><Sparkles className="h-5 w-5 text-violet-400"/><span className="mt-3 block font-medium">Suggestions</span><span className="mt-1 block text-xs text-zinc-500">AI drafts; a person edits and sends.</span></button>
      <button onClick={() => field("mode", "supervised")} className={`rounded-xl border p-4 text-left ${config.mode === "supervised" ? "border-violet-500 bg-violet-500/10" : "border-zinc-800"}`}><ShieldCheck className="h-5 w-5 text-cyan-400"/><span className="mt-3 block font-medium">Supervised</span><span className="mt-1 block text-xs text-zinc-500">Approval remains required before delivery.</span></button>
      <div className="rounded-xl border border-zinc-800 p-4 opacity-60"><LockKeyhole className="h-5 w-5 text-zinc-500"/><span className="mt-3 block font-medium">Autonomous</span><span className="mt-1 block text-xs text-zinc-500">Locked pending production safety approval.</span></div>
    </div>
    <div className="mt-7 rounded-xl border border-zinc-800 bg-[#09090B] p-5"><div className="flex items-center gap-2"><FlaskConical className="h-5 w-5 text-cyan-400"/><h3 className="font-medium">Safe simulator</h3></div><textarea className={`${input} min-h-24`} value={testMessage} onChange={e => setTestMessage(e.target.value)} /><button disabled={busy || !integrationId} onClick={simulate} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin"/> : <Bot className="h-4 w-4"/>} Test agent</button>{testReply && <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4"><p className="text-xs font-medium text-emerald-300">{simulationLabel} · Nothing was sent</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-200">{testReply}</p></div>}</div>
    {missing.length > 0 && <p className="mt-5 text-sm text-amber-300">Before activation: {missing.join(", ")}.</p>}
    {notice && <p className="mt-4 text-sm text-cyan-300">{notice}</p>}
    <div className="mt-6 flex flex-wrap gap-3"><button disabled={busy || !integrationId} onClick={() => void save(false)} className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 px-4 py-2.5 text-sm font-semibold disabled:opacity-40"><Save className="h-4 w-4"/> Save draft</button><button disabled={busy || !connected || missing.length > 0} onClick={() => void save(true)} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold disabled:opacity-40"><CheckCircle2 className="h-4 w-4"/> Activate for reviewed replies</button></div>
  </section>;
}
